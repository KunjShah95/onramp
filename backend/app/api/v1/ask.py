import json
import logging
import re
from typing import Any, Dict, Optional, Union

from fastapi import APIRouter, HTTPException, Request, Depends, Response
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from app.agents import RepoQA
from app.services.quota import enforce_quota
from app.services.conversation_service import ConversationService
from app.services.repo_context import RepoContextService, index_id_for
from app.services.repo_index_access import (
    find_registered_repository,
    grant_index_access,
    get_index_job,
    list_index_grants,
    parse_github_repo,
    record_index_job,
)
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
_repo_context = RepoContextService()

# In-memory cache for active repo_qa sessions per (user_id, index_id) -> session_id
_ASK_SESSIONS: Dict[str, str] = {}


class IndexRequest(BaseModel):
    # ``repo_path`` is retained as a deprecated wire alias for older clients;
    # both fields now carry a repository URL, never a server filesystem path.
    repo_url: Optional[str] = Field(default=None, max_length=500)
    repo_path: Optional[str] = Field(default=None, max_length=500)
    branch: str = Field(default="main", min_length=1, max_length=255)
    team_id: Optional[str] = Field(default=None, max_length=100)
    async_build: bool = False

    def repository_url(self) -> str:
        return (self.repo_url or self.repo_path or "").strip()


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


async def _accessible_team_ids(user: dict) -> set[str]:
    """Resolve team memberships for repository/index authorization."""
    uid = user.get("uid", "")
    if not uid or uid.startswith("api:"):
        return {str(user["team_id"])} if user.get("team_id") else set()
    try:
        from app.services.team_service import get_user_teams
        teams = await get_user_teams(uid)
    except Exception:
        logger.exception("Failed to resolve teams for repository access")
        return set()
    return {
        str(team.get("id") or team.get("team_id"))
        for team in (teams or [])
        if team.get("id") or team.get("team_id")
    }


async def _resolve_user_team(user: dict, requested_team_id: Optional[str]) -> str:
    accessible = await _accessible_team_ids(user)
    if requested_team_id:
        if str(requested_team_id) not in accessible:
            raise HTTPException(status_code=403, detail="Not a member of this team")
        return str(requested_team_id)
    if not accessible:
        raise HTTPException(status_code=403, detail="A team membership is required")
    return sorted(accessible)[0]


async def _authorize_index(
    user: dict,
    index_id: str,
    requested_team_id: Optional[str] = None,
) -> str:
    """Return the team allowed to use an index, or reject the request."""
    accessible = await _accessible_team_ids(user)
    if requested_team_id and str(requested_team_id) not in accessible:
        # Do this before looking up the index so an explicit cross-team scope
        # gets a deterministic 403 without revealing whether the index exists.
        raise HTTPException(status_code=403, detail="Not a member of this team")
    grants = await list_index_grants(index_id)
    if grants:
        allowed = {
            str(grant.get("team_id"))
            for grant in grants
            if grant.get("team_id") and str(grant.get("team_id")) in accessible
        }
        if requested_team_id and str(requested_team_id) not in allowed:
            raise HTTPException(status_code=403, detail="Index belongs to another team")
        if allowed:
            return str(requested_team_id) if requested_team_id else sorted(allowed)[0]
        raise HTTPException(status_code=403, detail="Index belongs to another team")

    # Compatibility path for indexes created before durable grants existed:
    # only accept them when the repository registry independently proves the
    # caller owns the workspace.  Unknown/unregistered indexes stay private.
    doc = await _repo_context.get(index_id)
    repo_url = (doc or {}).get("repo_url", "")
    if not repo_url:
        raise HTTPException(status_code=404, detail="Index not found")
    repository = await find_registered_repository(repo_url)
    team_id = str(repository.get("team_id")) if repository and repository.get("team_id") else None
    if not team_id or team_id not in accessible:
        raise HTTPException(status_code=403, detail="Index belongs to another team")
    if requested_team_id and str(requested_team_id) != team_id:
        raise HTTPException(status_code=403, detail="Index belongs to another team")
    await grant_index_access(index_id, team_id, repo_url, (doc or {}).get("branch", "main"))
    return team_id


@router.post("/index")
async def index_repo(
    request: IndexRequest,
    req: Request,
    user: dict = Depends(get_current_user),
    _q=enforce_quota("analyze"),
):
    repo_url = request.repository_url()
    if not repo_url:
        raise HTTPException(status_code=400, detail="repo_url is required")
    if not parse_github_repo(repo_url):
        raise HTTPException(
            status_code=400,
            detail="Only strict https://github.com/owner/repository URLs are supported",
        )

    repository = await find_registered_repository(repo_url)
    if not repository:
        raise HTTPException(status_code=404, detail="Repository is not registered for this workspace")
    repository_team_id = repository.get("team_id")
    if not repository_team_id:
        raise HTTPException(status_code=403, detail="Repository is not assigned to a team")

    team_id = await _resolve_user_team(user, request.team_id or str(repository_team_id))
    if str(repository_team_id) != team_id:
        raise HTTPException(status_code=403, detail="Repository belongs to another team")

    index_id = index_id_for(repo_url, request.branch)
    if request.async_build:
        from app.tasks.repo_index_tasks import build_ask_index

        try:
            task = build_ask_index.delay(
                repo_url,
                branch=request.branch,
                team_id=team_id,
            )
            task_id = str(getattr(task, "id", ""))
            if not task_id:
                raise RuntimeError("Index task did not return an id")
            await record_index_job(
                task_id=task_id,
                requested_by=user.get("uid", ""),
                team_id=team_id,
                index_id=index_id,
                repo_url=repo_url,
            )
        except Exception as exc:
            logger.exception("Failed to enqueue Ask index build for %s", repo_url)
            raise HTTPException(status_code=502, detail="Failed to enqueue repository indexing")
        return JSONResponse(
            status_code=202,
            content={
                "queued": True,
                "task_id": task_id,
                "index_id": index_id,
                "repo_url": repo_url,
                "branch": request.branch,
                "team_id": team_id,
            },
        )

    import shutil
    llm = getattr(req.app.state, "llm", None)
    qa = RepoQA(llm)
    cloned_path: str | None = None
    try:
        from app.services.github_service import GitHubService
        github = GitHubService()
        # Clone into an isolated temp dir; never walk a caller-supplied path.
        cloned_path = await github.clone_repo(repo_url, request.branch)
        await qa.index_repo(
            cloned_path,
            index_id=index_id,
            team_id=team_id,
            repo_url=repo_url,
            branch=request.branch,
        )
        await grant_index_access(index_id, team_id, repo_url, request.branch)
        return {
            "index_id": index_id,
            "repo_url": repo_url,
            "branch": request.branch,
            "team_id": team_id,
        }
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("Ask repository indexing failed for %s", repo_url)
        raise HTTPException(status_code=502, detail="Repository indexing failed")
    finally:
        if cloned_path:
            shutil.rmtree(cloned_path, ignore_errors=True)


@router.get("/jobs/{task_id}")
async def index_job_status(
    task_id: str,
    user: dict = Depends(get_current_user),
):
    """Return a redacted status for an asynchronous Ask index build."""
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", task_id):
        raise HTTPException(status_code=400, detail="Invalid task id")

    job = await get_index_job(task_id)
    if not job:
        raise HTTPException(status_code=404, detail="Index job not found")
    uid = user.get("uid", "")
    if job.get("requested_by") != uid:
        if not job.get("team_id") or str(job.get("team_id")) not in await _accessible_team_ids(user):
            raise HTTPException(status_code=403, detail="Index job belongs to another team")

    from celery.result import AsyncResult
    from app.tasks.celery_app import celery_app

    result = AsyncResult(task_id, app=celery_app)
    state = result.state
    response: Dict[str, Any] = {"task_id": task_id, "status": state}
    if state == "SUCCESS":
        payload = result.result if isinstance(result.result, dict) else {}
        team_id = payload.get("team_id")
        if team_id and str(team_id) not in await _accessible_team_ids(user):
            raise HTTPException(status_code=403, detail="Not a member of this team")
        response["result"] = {
            key: payload.get(key)
            for key in ("index_id", "repo_url", "branch", "team_id", "status")
            if key in payload
        }
    elif state == "FAILURE":
        # Do not return exception text: it can contain filesystem paths or
        # provider details. The server log remains the diagnostic source.
        response["error"] = "Indexing failed"
    return response


async def _get_memory(user_id: str, index_id: str, question: str, use_memory: bool) -> str:
    if not use_memory:
        return ""
    relevant = await _conversation.get_relevant(user_id, index_id, question, top_k=3)
    return ConversationService.format_memory(relevant)


async def _get_or_create_ask_session(user_id: str, index_id: str, team_id: Optional[str] = None) -> Optional[str]:
    """Resolve the active ask session for (user, index), shared across workers.

    The mapping lives in Redis (``ask:session:{user}:{index}``, 24h TTL) with
    the in-process dict as a fallback, so multiple API workers reuse the same
    session instead of creating one each. The session itself is durable in
    Postgres via ``agent_context``; this is only a lookup cache.
    """
    key = f"{user_id}:{index_id}"
    redis_key = f"ask:session:{user_id}:{index_id}"

    async def _active(sid: Optional[str]) -> Optional[str]:
        if not sid:
            return None
        try:
            from app.services.agent_context import agent_context
            sess = await agent_context.get_session(sid)
            if sess and sess.get("state") == "active":
                return sid
        except Exception:
            pass
        return None

    # 1. Redis (cross-worker) — best effort.
    try:
        from app.services.cache_service import get_client
        client = await get_client()
        if client is not None:
            cached = await client.get(redis_key)
            sid = cached.decode() if isinstance(cached, bytes) else cached
            active = await _active(sid)
            if active:
                _ASK_SESSIONS[key] = active
                return active
    except Exception:
        logger.debug("ask session redis lookup failed — in-process fallback", exc_info=True)
    # 2. In-process fallback.
    sid = _ASK_SESSIONS.get(key)
    active = await _active(sid)
    if active:
        return active
    try:
        from app.services.agent_context import agent_context
        sess = await agent_context.create_session(agent_type="repo_qa", team_id=team_id, user_id=user_id, index_id=index_id, scratchpad={"source": "ask"})
        _ASK_SESSIONS[key] = sess["id"]
        try:
            from app.services.cache_service import get_client
            client = await get_client()
            if client is not None:
                await client.setex(redis_key, 24 * 3600, sess["id"])
        except Exception:
            pass
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
    # Authorize the index before reading conversation memory or creating a
    # session.  The index grant, not a client-supplied team_id, is authoritative.
    index_team_id = await _authorize_index(user, request.index_id, request.team_id)
    team = await _resolve_team_routing(user, index_team_id)
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
    index_team_id = await _authorize_index(user, request.index_id, request.team_id)
    team = await _resolve_team_routing(user, index_team_id)
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
