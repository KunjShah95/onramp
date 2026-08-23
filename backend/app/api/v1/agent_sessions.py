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

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.v1.auth import get_current_user
from app.agents.prompts import all_prompts, get_system_prompt, is_known_agent
from app.services.agent_context import agent_context
from app.services.agent_bus import agent_bus

router = APIRouter(prefix="/agent-sessions", tags=["agent-sessions"])
bus_router = APIRouter(prefix="/agent-bus", tags=["agent-bus"])


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
    event_type: str
    payload: Optional[Dict[str, Any]] = None
    source_session_id: Optional[str] = None
    source_agent: Optional[str] = None
    target_agent: Optional[str] = None


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

# ── Session endpoints ────────────────────────────────────────────────

@router.post("")
async def create_session(body: CreateSessionRequest, user: dict = Depends(get_current_user)):
    if not is_known_agent(body.agent_type):
        raise HTTPException(status_code=400, detail=f"Unknown agent_type '{body.agent_type}'. Known: {sorted(all_prompts().keys())}")
    sess = await agent_context.create_session(
        agent_type=body.agent_type,
        team_id=body.team_id,
        user_id=user.get("uid"),
        index_id=body.index_id,
        parent_id=body.parent_id,
        root_task_id=body.root_task_id,
        system_prompt=body.system_prompt,
        scratchpad=body.scratchpad,
    )
    await agent_bus.publish(
        "agent.session.created",
        payload={"session_id": sess["id"], "agent_type": body.agent_type, "team_id": body.team_id},
        source_session_id=sess["id"],
        source_agent=body.agent_type,
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
    sessions = await agent_context.list_sessions(team_id=team_id, agent_type=agent_type, state=state, limit=limit, offset=offset)
    return {"sessions": sessions, "count": len(sessions)}


@router.get("/{session_id}")
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


@router.get("/{session_id}/thread")
async def get_thread(session_id: str, user: dict = Depends(get_current_user)):
    chain = await agent_context.get_thread(session_id)
    if not chain:
        raise HTTPException(status_code=404, detail="Session not found")
    # IDOR: ensure leaf session is accessible (covers parent chain via ownership)
    leaf = chain[-1] if chain else None
    if leaf:
        await _assert_session_access(leaf, user)
    # Also include history for leaf
    history = await agent_context.get_history(session_id, limit=50)
    return {"thread": chain, "leaf_history": history}


@router.patch("/{session_id}/state")
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
    await agent_bus.publish("agent.session.state_changed", payload={"session_id": session_id, "state": state}, source_session_id=session_id, source_agent=sess.get("agent_type"))
    return sess


@router.patch("/{session_id}/scratchpad")
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
    """List all registered agent system prompts (useful for debugging / version audit)."""
    catalog = all_prompts()
    return {"agents": sorted(catalog.keys()), "prompts": {k: {"version": v["version"], "preview": str(v["system_prompt"])[:160]} for k, v in catalog.items()}}


# ── Bus endpoints ────────────────────────────────────────────────────

@bus_router.get("/events")
async def list_events(
    event_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
):
    events = await agent_bus.list_events(event_type=event_type, limit=limit, offset=offset)
    return {"events": events, "count": len(events)}


@bus_router.post("/publish")
async def publish_event(body: PublishEventRequest, user: dict = Depends(get_current_user)):
    rec = await agent_bus.publish(
        body.event_type, payload=body.payload,
        source_session_id=body.source_session_id,
        source_agent=body.source_agent,
        target_agent=body.target_agent,
    )
    return rec
