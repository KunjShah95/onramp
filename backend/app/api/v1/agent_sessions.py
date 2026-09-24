"""
Agent Sessions & Bus API — stateful inter-agent communication.

- POST   /api/v1/agent-sessions              — create a session for an agent type
- GET    /api/v1/agent-sessions              — list sessions (team-scoped)
- GET    /api/v1/agent-sessions/{id}         — get session + history
- POST   /api/v1/agent-sessions/{id}/messages — append a message (user/assistant/tool)
- POST   /api/v1/agent-sessions/{id}/handoff — hand off to another agent (creates child session)
- GET    /api/v1/agent-sessions/{id}/thread  — full parent→child chain
- GET    /api/v1/agent-bus/events            — list bus events
- POST   /api/v1/agent-bus/publish           — publish a bus event
- GET    /api/v1/agent-sessions/prompts/catalog — list all agent system prompts (for debugging)
"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.v1.auth import get_current_user
from app.agents.prompts import all_prompts, get_system_prompt, is_known_agent
from app.services.agent_context import agent_context
from app.services.agent_bus import agent_bus
from app.services.quota import enforce_quota

router = APIRouter(prefix="/agent-sessions", tags=["agent-sessions"])
bus_router = APIRouter(prefix="/agent-bus", tags=["agent-bus"])
logger = logging.getLogger(__name__)


# ── Schemas ──────────────────────────────────────────────────────────

class CreateSessionRequest(BaseModel):
    agent_type: str = Field(..., description="Registered agent type, e.g. repo_qa")
    team_id: Optional[str] = None
    index_id: Optional[str] = None
    root_task_id: Optional[str] = None
    parent_id: Optional[str] = None
    system_prompt: Optional[str] = Field(None, description="Override registry prompt for this session")
    scratchpad: Optional[Dict[str, Any]] = None


class AppendMessageRequest(BaseModel):
    role: str = Field(..., description="system|user|assistant|tool|handoff|event")
    content: str = Field(..., max_length=10000)
    agent_type: Optional[str] = Field(default=None, max_length=100)
    tool_calls: Optional[Any] = None
    handoff_to: Optional[str] = Field(default=None, max_length=100)
    handoff_payload: Optional[Dict[str, Any]] = None


class HandoffRequest(BaseModel):
    target_agent: str = Field(..., description="Agent type to hand off to", max_length=100)
    content: str = Field("", description="Handoff message", max_length=10000)
    payload: Optional[Dict[str, Any]] = None


class PublishEventRequest(BaseModel):
    event_type: str = Field(..., min_length=1, max_length=100)
    payload: Optional[Dict[str, Any]] = None
    source_session_id: Optional[str] = None
    source_agent: Optional[str] = None
    target_agent: Optional[str] = None
    team_id: Optional[str] = Field(default=None, max_length=100)


async def _require_team_member(user: dict, team_id: str) -> None:
    """Raise 403 unless ``user`` belongs to ``team_id``."""
    uid = user.get("uid", "")
    if not uid or not team_id:
        raise HTTPException(status_code=403, detail="team_id is required")
    try:
        from app.services.team_service import get_user_teams
        teams = await get_user_teams(uid)
        if any(t.get("id") == team_id or t.get("team_id") == team_id for t in (teams or [])):
            return
    except Exception:
        pass
    raise HTTPException(status_code=403, detail="Not a member of this team")


async def _assert_session_access(sess: dict, user: dict):
    """IDOR guard: only owner or team member may access session."""
    uid = user.get("uid", "")
    # Owner check (session stores user_id)
    if sess.get("user_id") == uid or sess.get("created_by") == uid:
        return
    team_id = sess.get("team_id")
    if team_id:
        try:
            from app.services.team_service import get_user_teams
            teams = await get_user_teams(uid)
            if any(t.get("id") == team_id or t.get("team_id") == team_id for t in (teams or [])):
                return
        except Exception:
            pass
        try:
            from app.services.team_service import get_team_members
            members = await get_team_members(team_id)
            if any(m.get("id") == uid or m.get("user_id") == uid for m in (members or [])):
                return
        except Exception:
            pass
    raise HTTPException(status_code=403, detail="Forbidden: not owner or team member")


async def _user_team_ids(user: dict) -> set[str]:
    """Return the caller's verified team memberships, failing closed."""
    uid = user.get("uid", "")
    if not uid or uid.startswith("api:"):
        return {str(user.get("team_id"))} if user.get("team_id") else set()

    try:
        from app.services.team_service import get_user_teams

        teams = await get_user_teams(uid)
    except Exception:
        logger.exception("Failed to resolve team memberships for user %s", uid)
        return set()

    return {
        str(team.get("id") or team.get("team_id"))
        for team in (teams or [])
        if team.get("id") or team.get("team_id")
    }


async def _require_team_access(user: dict, team_id: Optional[str]) -> set[str]:
    """Validate an optional team scope and return all accessible team IDs."""
    accessible = await _user_team_ids(user)
    if team_id and str(team_id) not in accessible:
        raise HTTPException(status_code=403, detail="Forbidden: not a team member")
    return accessible


async def _primary_team_id(user: dict) -> Optional[str]:
    """Choose a deterministic default scope for user-created resources."""
    accessible = await _user_team_ids(user)
    if not accessible:
        return None
    return sorted(accessible)[0]


# ── Session endpoints ────────────────────────────────────────────────

@router.post("")
async def create_session(body: CreateSessionRequest, user: dict = Depends(get_current_user), _q=enforce_quota("analyze")):
    if not is_known_agent(body.agent_type):
        raise HTTPException(status_code=400, detail=f"Unknown agent_type '{body.agent_type}'. Known: {sorted(all_prompts().keys())}")

    effective_team_id = body.team_id
    await _require_team_access(user, effective_team_id)

    # A child session must inherit/agree with its parent's tenant. This also
    # prevents a caller from attaching a new session to an arbitrary parent.
    if body.parent_id:
        parent = await agent_context.get_session(body.parent_id)
        if not parent:
            raise HTTPException(status_code=404, detail="Parent session not found")
        await _assert_session_access(parent, user)
        parent_team_id = parent.get("team_id")
        if effective_team_id and parent_team_id and str(effective_team_id) != str(parent_team_id):
            raise HTTPException(status_code=403, detail="Parent session belongs to another team")
        if not effective_team_id:
            effective_team_id = parent_team_id

    # User-created sessions are tenant-scoped whenever the user has a team.
    if not effective_team_id:
        effective_team_id = await _primary_team_id(user)

    if body.index_id:
        from app.api.v1.index_access import authorize_repo_index
        await authorize_repo_index(user, body.index_id, effective_team_id)

    sess = await agent_context.create_session(
        agent_type=body.agent_type,
        team_id=effective_team_id,
        user_id=user.get("uid"),
        index_id=body.index_id,
        parent_id=body.parent_id,
        root_task_id=body.root_task_id,
        system_prompt=body.system_prompt,
        scratchpad=body.scratchpad,
    )
    await agent_bus.publish(
        "agent.session.created",
        payload={"session_id": sess["id"], "agent_type": body.agent_type},
        source_session_id=sess["id"],
        source_agent=body.agent_type,
        team_id=effective_team_id,
    )
    return sess


@router.get("")
async def list_sessions(
    team_id: Optional[str] = Query(None),
    agent_type: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
):
    if team_id:
        await _require_team_member(user, team_id)
        sessions = await agent_context.list_sessions(
            team_id=team_id,
            agent_type=agent_type,
            state=state,
            limit=limit,
            offset=offset,
        )
    else:
        # Query the database with an explicit allow-list rather than fetching
        # every session and filtering in Python after the fact.
        accessible_teams = await _user_team_ids(user)
        sessions = await agent_context.list_sessions(
            user_id=user.get("uid"),
            team_ids=sorted(accessible_teams),
            agent_type=agent_type,
            state=state,
            limit=limit,
            offset=offset,
        )
    return {"sessions": sessions, "count": len(sessions)}


@router.get("/{session_id}",
    responses={404: {"description": "Session not found"}})
async def get_session(session_id: str, include_history: bool = Query(True), history_limit: int = Query(50, ge=1, le=100), user: dict = Depends(get_current_user)):
    sess = await agent_context.get_session(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    await _assert_session_access(sess, user)
    out: Dict[str, Any] = {"session": sess}
    if include_history:
        out["history"] = await agent_context.get_history(session_id, limit=history_limit)
    return out


@router.post("/{session_id}/messages")
async def append_message(session_id: str, body: AppendMessageRequest, user: dict = Depends(get_current_user)):
    sess = await agent_context.get_session(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    await _assert_session_access(sess, user)
    if body.role not in ("system", "user", "assistant", "tool", "handoff", "event"):
        raise HTTPException(status_code=400, detail="Invalid role")
    msg = await agent_context.append_message(
        session_id, role=body.role, content=body.content,
        agent_type=body.agent_type or sess.get("agent_type"),
        tool_calls=body.tool_calls, handoff_to=body.handoff_to, handoff_payload=body.handoff_payload,
    )
    return msg


@router.post("/{session_id}/handoff")
async def handoff(session_id: str, body: HandoffRequest, user: dict = Depends(get_current_user)):
    sess = await agent_context.get_session(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    await _assert_session_access(sess, user)
    if not is_known_agent(body.target_agent):
        raise HTTPException(status_code=400, detail=f"Unknown target_agent '{body.target_agent}'")
    child = await agent_bus.handoff(
        source_session_id=session_id,
        source_agent=sess.get("agent_type", "unknown"),
        target_agent=body.target_agent,
        payload=body.payload,
        content=body.content,
    )
    return {"child": child, "parent_id": session_id}


@router.get("/{session_id}/thread",
    responses={404: {"description": "Session not found"}})
async def get_thread(session_id: str, user: dict = Depends(get_current_user)):
    chain = await agent_context.get_thread(session_id)
    if not chain:
        raise HTTPException(status_code=404, detail="Session not found")
    # Validate every link, not only the leaf: a caller must not be able to
    # read private parent-session history by requesting a child thread.
    for session in chain:
        await _assert_session_access(session, user)
    leaf = chain[-1] if chain else None
    history = await agent_context.get_history(leaf["id"], limit=50) if leaf else []
    return {"thread": chain, "leaf_history": history}


@router.patch("/{session_id}/state",
    responses={404: {"description": "Session not found"}})
async def set_state(session_id: str, state: str = Query(..., description="active|completed|failed|archived"), user: dict = Depends(get_current_user)):
    if state not in ("active", "completed", "failed", "archived"):
        raise HTTPException(status_code=400, detail="Invalid state")
    existing = await agent_context.get_session(session_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Session not found")
    await _assert_session_access(existing, user)
    sess = await agent_context.set_state(session_id, state)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    await agent_bus.publish(
        "agent.session.state_changed",
        payload={"session_id": session_id, "state": state},
        source_session_id=session_id,
        source_agent=sess.get("agent_type"),
        team_id=sess.get("team_id"),
    )
    return sess


@router.patch("/{session_id}/scratchpad",
    responses={404: {"description": "Session not found"}})
async def patch_scratchpad(session_id: str, patch: Dict[str, Any], user: dict = Depends(get_current_user)):
    existing = await agent_context.get_session(session_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Session not found")
    await _assert_session_access(existing, user)
    sess = await agent_context.update_scratchpad(session_id, patch)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    return sess


@router.get("/prompts/catalog")
async def prompts_catalog(user: dict = Depends(get_current_user)):
    """List registered prompt versions; previews are restricted to operators."""
    catalog = all_prompts()
    can_preview = bool(
        user.get("is_admin")
        or user.get("auth_method") == "api_key"
        or str(user.get("role", "")).lower() in {"admin", "ceo", "hr"}
    )
    prompts = {
        key: {
            "version": value["version"],
            **({"preview": str(value["system_prompt"])[:160]} if can_preview else {}),
        }
        for key, value in catalog.items()
    }
    return {"agents": sorted(catalog.keys()), "prompts": prompts}


# ── Bus endpoints ────────────────────────────────────────────────────

@bus_router.get("/events")
async def list_events(
    event_type: Optional[str] = Query(None),
    team_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
):
    if not team_id:
        raise HTTPException(status_code=400, detail="team_id is required")
    await _require_team_member(user, team_id)
    events = await agent_bus.list_events(event_type=event_type, limit=limit, offset=offset, team_id=team_id)
    return {"events": events, "count": len(events)}


@bus_router.post("/publish")
async def publish_event(body: PublishEventRequest, user: dict = Depends(get_current_user)):
    payload = dict(body.payload or {})
    team_id = body.team_id or payload.pop("team_id", None)
    if not team_id:
        raise HTTPException(status_code=400, detail="team_id is required")
    await _require_team_member(user, team_id)

    # If the event references a session, the caller must have access to it and
    # the event may not claim a different tenant than that session.
    if body.source_session_id:
        sess = await agent_context.get_session(body.source_session_id)
        if not sess:
            raise HTTPException(status_code=404, detail="Source session not found")
        await _assert_session_access(sess, user)
        session_team_id = sess.get("team_id")
        if session_team_id and str(session_team_id) != str(team_id):
            raise HTTPException(status_code=403, detail="Source session belongs to another team")

    rec = await agent_bus.publish(
        body.event_type,
        payload=payload,
        source_session_id=body.source_session_id,
        source_agent=body.source_agent,
        target_agent=body.target_agent,
        team_id=team_id,
    )
    return rec
