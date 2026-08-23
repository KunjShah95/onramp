import json
import logging
from typing import Any, Dict, Optional, Union

from fastapi import APIRouter, HTTPException, Request, Depends, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from app.agents import RepoQA
from app.services.quota import enforce_quota
from app.services.conversation_service import ConversationService
from app.api.v1.auth import get_current_user
from app.api.v1.llm_route import (
    attach_served_route_header,
    primary_route_header,
    resolve_team_routing_mode,
    team_key_pool_ids,
    team_key_pools,
    team_provider_keys,
)

logger = logging.getLogger("onramp.ask")

router = APIRouter(prefix="/ask", tags=["qa"])

_conversation = ConversationService()

# In-memory cache for active repo_qa sessions per (user_id, index_id) -> session_id
_ASK_SESSIONS: Dict[str, str] = {}


class IndexRequest(BaseModel):
    repo_path: str = Field(..., max_length=500)


class QueryRequest(BaseModel):
    index_id: str = Field(..., max_length=100)
    question: str = Field(..., max_length=5000, min_length=1)
    use_memory: bool = True
    mode: str = Field(default="normal", max_length=20)
    # Optional explicit model id / query-type / provider name that wins over
    # the agent's default routing (e.g. "anthropic", "gpt-4o-mini", or any
    # OpenRouter-catalog "vendor/model" id). See LLMRouter.chat/provider_chain.
    model: Optional[str] = Field(default=None, max_length=100)
    # Optional per-request cost/quality dial ("cost"/"balanced"/"intelligence"
    # or int 0-10). Wins over the team's stored preference; falls back to the
    # team default, then RoutingMode.BALANCED. See app/llm.py RoutingMode.
    routing_mode: Optional[Union[int, str]] = None
    # Optional explicit team scope for routing settings (BYOK keys + routing
    # dial). When omitted, the user's primary team (most recently joined) is
    # used. Membership is verified server-side — a non-member gets 403.
    team_id: Optional[str] = Field(default=None, max_length=100)


# ── Team routing settings (BYOK keys + routing dial) ──────────────────────
#
# JWT sessions don't carry an org_name (only API-key callers do — see
# openai_gateway), so the org scope is resolved from the user's team
# membership, mirroring how the frontend derives activeTeamId. Every new
# account gets a personal team, so this resolves for normal users.
#
# A user in several teams defaults to their most recently joined team; an
# explicit ``team_id`` on the request (verified server-side) overrides that.
# Best-effort: any failure falls back to platform keys + RoutingMode.BALANCED.

# Short-TTL cache for uid -> primary org, so the chat hot path doesn't hit
# the team-membership store on every message. Same 30s shape as the key /
# routing-mode caches in the services.
_ORG_CACHE_TTL_SECONDS = 30.0
_ORG_CACHE: Dict[str, tuple] = {}


def _invalidate_org_cache(uid: str) -> None:
    _ORG_CACHE.pop(uid, None)


async def _user_primary_org(user: dict) -> Optional[str]:
    """Primary team (most recently joined) the user belongs to — the org
    scope for routing settings. None for teamless users / on failure."""
    uid = user.get("uid", "")
    if not uid or uid.startswith("api:"):
        return None
    import time as _time

    now = _time.monotonic()
    cached = _ORG_CACHE.get(uid)
    if cached is not None and cached[0] > now:
        return cached[1]
    org = None
    try:
        from app.services.team_service import get_user_teams

        teams = await get_user_teams(uid)
        if teams:
            teams.sort(key=lambda t: str(t.get("joined_at") or ""), reverse=True)
            org = teams[0].get("id") or teams[0].get("team_id")
    except Exception:
        logger.exception("Failed to resolve org for user %s", uid)
    _ORG_CACHE[uid] = (now + _ORG_CACHE_TTL_SECONDS, org)
    return org


async def _is_team_member(user: dict, team_id: str) -> bool:
    """True when ``user`` is a member of ``team_id``.

    Mirrors ai_gateway's membership check. A nonexistent team (no members)
    is treated as non-membership so callers surface a clean 403.
    """
    uid = user.get("uid", "")
    if not uid or not team_id:
        return False
    try:
        from app.services.team_service import get_team_members

        members = await get_team_members(team_id)
        member_ids = {m.get("id") or m.get("user_id") for m in members}
        return uid in member_ids
    except Exception:
        logger.exception("Failed to verify membership for user %s in %s", uid, team_id)
        return False


async def _resolve_team_routing(
    user: dict, team_id: Optional[str] = None
) -> Dict[str, Any]:
    """One-shot resolution of the caller's team routing context.

    An explicit ``team_id`` is verified here (membership) — a non-member gets
    403, so a caller can never pull another team's BYOK keys or routing dial.
    Without a team_id, the user's primary team (most recently joined) is used.
    BYOK keys / key pools / routing-mode loaders are shared with the OpenAI
    gateway (app.api.v1.llm_route) so both paths resolve identically.
    """
    if team_id and not await _is_team_member(user, team_id):
        raise HTTPException(status_code=403, detail="Not a member of this team")
    org = team_id if team_id else await _user_primary_org(user)
    return {
        "org": org,
        "provider_keys": await team_provider_keys(org),
        "key_pools": await team_key_pools(org),
        "key_pool_ids": await team_key_pool_ids(org),
    }


@router.post("/index")
async def index_repo(request: IndexRequest, req: Request, _q=enforce_quota("analyze")):
    llm = getattr(req.app.state, "llm", None)
    qa = RepoQA(llm)
    try:
        index_id = await qa.index_repo(request.repo_path)
        return {"index_id": index_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def _get_memory(user_id: str, index_id: str, question: str, use_memory: bool) -> str:
    if not use_memory:
        return ""
    relevant = await _conversation.get_relevant(user_id, index_id, question, top_k=3)
    return ConversationService.format_memory(relevant)


async def _get_or_create_ask_session(user_id: str, index_id: str, team_id: Optional[str] = None) -> Optional[str]:
    key = f"{user_id}:{index_id}"
    sid = _ASK_SESSIONS.get(key)
    if sid:
        try:
            from app.services.agent_context import agent_context
            sess = await agent_context.get_session(sid)
            if sess and sess.get("state") == "active":
                return sid
        except Exception:
            pass
    try:
        from app.services.agent_context import agent_context
        sess = await agent_context.create_session(agent_type="repo_qa", team_id=team_id, user_id=user_id, index_id=index_id, scratchpad={"source": "ask"})
        _ASK_SESSIONS[key] = sess["id"]
        return sess["id"]
    except Exception:
        logger.debug("ask session creation failed — stateless fallback", exc_info=True)
        return None


@router.post("/query")
async def query_repo(
    request: QueryRequest,
    req: Request,
    response: Response,
    user: dict = Depends(get_current_user),
    _q=enforce_quota("chat"),
):
    llm = getattr(req.app.state, "llm", None)
    # Session-aware: bind RepoQA to a persistent per-(user,index_id) session
    team = await _resolve_team_routing(user, request.team_id)
    routing_mode = await resolve_team_routing_mode(team["org"], request.routing_mode)
    ask_session_id = await _get_or_create_ask_session(user.get("uid", ""), request.index_id, team_id=team["org"])
    qa = RepoQA(llm, session_id=ask_session_id) if ask_session_id else RepoQA(llm)
    user_id = user.get("uid")

    memory = await _get_memory(user_id, request.index_id, request.question, request.use_memory)

    before_route = getattr(llm, "last_route", None)
    try:
        answer = await qa.ask(
            request.index_id, request.question, memory,
            mode=request.mode, model=request.model,
            routing_mode=routing_mode, provider_keys=team["provider_keys"],
            key_pools=team["key_pools"], key_pool_ids=team["key_pool_ids"],
        )
        await _conversation.add_turn(user_id, request.index_id, request.question, answer)
        # Mirror to agent session history + bus
        if ask_session_id:
            try:
                from app.services.agent_context import agent_context as _ac
                from app.services.agent_bus import agent_bus as _bus
                await _ac.append_message(ask_session_id, role="user", content=request.question[:4000], agent_type="repo_qa")
                await _ac.append_message(ask_session_id, role="assistant", content=answer[:4000], agent_type="repo_qa")
                await _bus.publish("ask.answered", payload={"index_id": request.index_id, "question": request.question[:200], "session_id": ask_session_id, "team_id": team["org"]}, source_session_id=ask_session_id, source_agent="repo_qa")
            except Exception:
                pass
        attach_served_route_header(llm, before_route, response)
        return {"answer": answer, "session_id": ask_session_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/query/stream")
async def query_repo_stream(
    request: QueryRequest,
    req: Request,
    user: dict = Depends(get_current_user),
    _q=enforce_quota("chat"),
):
    """Stream the answer as Server-Sent Events (text/event-stream)."""
    llm = getattr(req.app.state, "llm", None)
    team = await _resolve_team_routing(user, request.team_id)
    routing_mode = await resolve_team_routing_mode(team["org"], request.routing_mode)
    ask_session_id = await _get_or_create_ask_session(user.get("uid", ""), request.index_id, team_id=team["org"])
    qa = RepoQA(llm, session_id=ask_session_id) if ask_session_id else RepoQA(llm)
    user_id = user.get("uid")

    memory = await _get_memory(user_id, request.index_id, request.question, request.use_memory)

    # Headers must be fixed before the stream starts, so report the expected
    # primary provider (RepoQA routes via REASONING); the authoritative
    # served model is delivered as a ``route`` SSE event after the stream.
    route_header = primary_route_header(llm, getattr(qa, "query_type", None), request.question)
    # Snapshot before the call — the router assigns a fresh dict on every
    # completion, so an identity change below means THIS request ran the LLM.
    before_route = getattr(llm, "last_route", None)

    async def event_gen():
        full_answer = ""
        try:
            async for token in qa.ask_stream(
                request.index_id, request.question, memory,
                mode=request.mode, model=request.model,
                routing_mode=routing_mode, provider_keys=team["provider_keys"],
                key_pools=team["key_pools"], key_pool_ids=team["key_pool_ids"],
            ):
                full_answer += token
                yield f"data: {json.dumps({'token': token})}\n\n"
            # Authoritative served route (provider/model that actually answered),
            # reported only when this request really hit the router — the
            # fallback path (no docs / LLM failure) leaves last_route untouched.
            after = getattr(llm, "last_route", None)
            if after is not None and after is not before_route and after.get("served"):
                yield f"data: {json.dumps({'route': after['served']})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            if full_answer:
                await _conversation.add_turn(user_id, request.index_id, request.question, full_answer)
                if ask_session_id:
                    try:
                        from app.services.agent_context import agent_context as _ac2
                        from app.services.agent_bus import agent_bus as _bus2
                        await _ac2.append_message(ask_session_id, role="user", content=request.question[:4000], agent_type="repo_qa")
                        await _ac2.append_message(ask_session_id, role="assistant", content=full_answer[:4000], agent_type="repo_qa")
                        await _bus2.publish("ask.stream_completed", payload={"index_id": request.index_id, "session_id": ask_session_id, "team_id": team["org"]}, source_session_id=ask_session_id, source_agent="repo_qa")
                    except Exception:
                        pass

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-LLM-Route": route_header,
        },
    )


@router.get("/history/{index_id}")
async def get_history(
    index_id: str,
    limit: int = 10,
    user: dict = Depends(get_current_user),
):
    """Get conversation history for an index."""
    user_id = user.get("uid")
    turns = await _conversation.get_history(user_id, index_id, limit)
    return {"history": turns}


@router.delete("/history/{index_id}")
async def clear_history(
    index_id: str,
    user: dict = Depends(get_current_user),
):
    """Clear conversation history for an index."""
    user_id = user.get("uid")
    count = await _conversation.clear(user_id, index_id)
    return {"cleared": count}
