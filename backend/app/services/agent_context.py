"""
AgentContext — stateful session store for every agent thread.

Durable in Postgres (onramp_agent_sessions / onramp_agent_messages), hot in
Redis (agent:session:{id} + agent:history:{id}).  Falls back to in-process
when Redis is absent (dev/tests) like repo_context does.

Each agent gets its own session + system_prompt row; handoff() creates a
child session that links parent_id so the full trace is queryable.
"""

import asyncio
import hashlib
import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import select, desc, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.prompts import get_system_prompt

logger = logging.getLogger("onramp.agent_context")

REDIS_PREFIX = "agent:session"
REDIS_HISTORY_PREFIX = "agent:history"
DEFAULT_TTL = int(os.getenv("AGENT_SESSION_TTL", str(7 * 24 * 3600)))  # 7d

_LOCAL_CACHE: Dict[str, Dict[str, Any]] = {}
_LOCAL_HISTORY: Dict[str, List[Dict[str, Any]]] = {}
_LOCAL_LOCK = asyncio.Lock()


def _now():
    return datetime.now(timezone.utc)


def _uid() -> str:
    return str(uuid.uuid4())


async def _redis():
    try:
        from app.services.cache_service import get_client
        return await get_client()
    except Exception:
        return None


async def _get_db() -> AsyncSession:
    from app.database.config import async_session_factory
    # async_session_factory is the sessionmaker; create a session
    async with async_session_factory() as session:
        yield session  # type: ignore


# ── Local cache helpers ──────────────────────────────────────────────────

async def _cache_set(session_dict: Dict[str, Any]):
    client = await _redis()
    sid = session_dict["id"]
    payload = json.dumps(session_dict, default=str)
    if client:
        try:
            await client.setex(f"{REDIS_PREFIX}:{sid}", DEFAULT_TTL, payload)
            return
        except Exception:
            pass
    async with _LOCAL_LOCK:
        _LOCAL_CACHE[f"{REDIS_PREFIX}:{sid}"] = {"doc": session_dict, "expires_at": time.time() + DEFAULT_TTL}


async def _cache_get(session_id: str) -> Optional[Dict[str, Any]]:
    client = await _redis()
    key = f"{REDIS_PREFIX}:{session_id}"
    if client:
        try:
            raw = await client.get(key)
            if raw:
                return json.loads(raw)
        except Exception:
            pass
    async with _LOCAL_LOCK:
        entry = _LOCAL_CACHE.get(key)
        if entry and entry.get("expires_at", 0) > time.time():
            return entry["doc"]
        _LOCAL_CACHE.pop(key, None)
    return None


async def _history_cache_append(session_id: str, msg: Dict[str, Any]):
    client = await _redis()
    key = f"{REDIS_HISTORY_PREFIX}:{session_id}"
    payload = json.dumps(msg, default=str)
    if client:
        try:
            await client.rpush(key, payload)
            await client.expire(key, DEFAULT_TTL)
            return
        except Exception:
            pass
    async with _LOCAL_LOCK:
        _LOCAL_HISTORY.setdefault(key, []).append(msg)


async def _history_cache_get(session_id: str, limit: int = 50) -> Optional[List[Dict[str, Any]]]:
    client = await _redis()
    key = f"{REDIS_HISTORY_PREFIX}:{session_id}"
    if client:
        try:
            # lrange -limit .. -1
            items = await client.lrange(key, -limit, -1)
            if items:
                return [json.loads(x) for x in items]
        except Exception:
            pass
    async with _LOCAL_LOCK:
        hist = _LOCAL_HISTORY.get(key, [])
        if hist:
            return hist[-limit:]
    return None


async def _history_cache_invalidate(session_id: str) -> None:
    """Invalidate history cache so next get_history reads fresh DB state."""
    client = await _redis()
    key = f"{REDIS_HISTORY_PREFIX}:{session_id}"
    if client:
        try:
            await client.delete(key)
        except Exception:
            pass
    async with _LOCAL_LOCK:
        _LOCAL_HISTORY.pop(key, None)


# ── Public API ───────────────────────────────────────────────────────────

class AgentContextService:
    """CRUD for agent sessions + append-only message log."""

    # ——— Sessions ———

    async def create_session(
        self,
        agent_type: str,
        team_id: Optional[str] = None,
        user_id: Optional[str] = None,
        index_id: Optional[str] = None,
        parent_id: Optional[str] = None,
        root_task_id: Optional[str] = None,
        system_prompt: Optional[str] = None,
        scratchpad: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        from app.database.config import async_session_factory
        from app.database.models import AgentSession, AgentMessage

        prompt, version = get_system_prompt(agent_type)
        effective_prompt = system_prompt if system_prompt is not None else prompt
        effective_version = version if system_prompt is None else 0

        sid = _uid()
        now = _now()
        data = {
            "id": sid,
            "agent_type": agent_type,
            "parent_id": parent_id,
            "root_task_id": root_task_id,
            "team_id": team_id,
            "user_id": user_id,
            "index_id": index_id,
            "state": "active",
            "system_prompt": effective_prompt,
            "system_prompt_version": effective_version,
            "scratchpad": scratchpad or {},
            "turn_count": 0,
            "created_at": now,
            "updated_at": now,
        }

        async with async_session_factory() as db:
            db.add(AgentSession(**data))
            await db.commit()
            # Seed the system message so history is self-contained
            if effective_prompt:
                mid = _uid()
                db.add(AgentMessage(
                    id=mid,
                    session_id=sid,
                    role="system",
                    agent_type=agent_type,
                    content=effective_prompt,
                    created_at=now,
                ))
                await db.commit()
                await _history_cache_append(sid, {
                    "id": mid, "session_id": sid, "role": "system",
                    "agent_type": agent_type, "content": effective_prompt,
                    "created_at": now.isoformat(),
                })

        out = {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in data.items()}
        await _cache_set(out)
        return out

    async def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        cached = await _cache_get(session_id)
        if cached:
            return cached
        from app.database.config import async_session_factory
        from app.database.models import AgentSession
        async with async_session_factory() as db:
            res = await db.execute(select(AgentSession).where(AgentSession.id == session_id))
            row = res.scalar_one_or_none()
            if not row:
                return None
            d = row.to_dict()
            await _cache_set(d)
            return d

    async def update_scratchpad(self, session_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        from app.database.config import async_session_factory
        from app.database.models import AgentSession
        async with async_session_factory() as db:
            res = await db.execute(select(AgentSession).where(AgentSession.id == session_id))
            row = res.scalar_one_or_none()
            if not row:
                return None
            cur = dict(row.scratchpad or {})
            cur.update(patch)
            row.scratchpad = cur
            row.updated_at = _now()
            await db.commit()
            await db.refresh(row)
            d = row.to_dict()
            await _cache_set(d)
            return d

    async def set_state(self, session_id: str, state: str) -> Optional[Dict[str, Any]]:
        from app.database.config import async_session_factory
        from app.database.models import AgentSession
        async with async_session_factory() as db:
            res = await db.execute(select(AgentSession).where(AgentSession.id == session_id))
            row = res.scalar_one_or_none()
            if not row:
                return None
            row.state = state
            row.updated_at = _now()
            await db.commit()
            await db.refresh(row)
            d = row.to_dict()
            await _cache_set(d)
            return d

    # ——— Messages ———

    async def append_message(
        self,
        session_id: str,
        role: str,
        content: str,
        agent_type: Optional[str] = None,
        tool_calls: Optional[Any] = None,
        token_count: Optional[int] = None,
        handoff_to: Optional[str] = None,
        handoff_payload: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        from app.database.config import async_session_factory
        from app.database.models import AgentMessage, AgentSession
        mid = _uid()
        now = _now()
        row_data = {
            "id": mid,
            "session_id": session_id,
            "role": role,
            "agent_type": agent_type,
            "content": content,
            "tool_calls": tool_calls,
            "token_count": token_count,
            "handoff_to": handoff_to,
            "handoff_payload": handoff_payload,
            "created_at": now,
        }
        async with async_session_factory() as db:
            db.add(AgentMessage(**row_data))
            # bump turn_count for assistant/user turns
            if role in ("user", "assistant"):
                res = await db.execute(select(AgentSession).where(AgentSession.id == session_id))
                sess = res.scalar_one_or_none()
                if sess:
                    sess.turn_count = (sess.turn_count or 0) + 1
                    sess.updated_at = now
            await db.commit()

        msg = {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in row_data.items()}
        # Invalidate stale history cache then append fresh message
        await _history_cache_invalidate(session_id)
        await _history_cache_append(session_id, msg)
        return msg

    async def get_history(self, session_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        # Try cache first
        cached = await _history_cache_get(session_id, limit)
        if cached is not None and len(cached) > 0:
            # If we have cached history smaller than limit, still try DB for completeness
            # but prefer cache when it looks full
            if len(cached) >= limit or len(cached) >= 1:
                # Verify cache isn't stale by checking DB count quickly
                pass
        from app.database.config import async_session_factory
        from app.database.models import AgentMessage
        async with async_session_factory() as db:
            # Single query: get last N by desc then reverse (removed unused asc query)
            res2 = await db.execute(
                select(AgentMessage)
                .where(AgentMessage.session_id == session_id)
                .order_by(desc(AgentMessage.created_at))
                .limit(limit)
            )
            rows = list(reversed(res2.scalars().all()))
            if rows:
                return [r.to_dict() for r in rows]
            # Fallback to cached
            if cached:
                return cached
            return []

    async def get_history_as_llm_messages(self, session_id: str, limit: int = 20) -> List[Dict[str, str]]:
        """Return history shaped as LLM messages [{role, content}] for prompt injection."""
        hist = await self.get_history(session_id, limit=limit)
        out = []
        for m in hist:
            r = m.get("role")
            if r == "handoff":
                out.append({"role": "system", "content": f"[handoff to {m.get('handoff_to')}] {m.get('content')}"})
            elif r == "event":
                out.append({"role": "system", "content": f"[event] {m.get('content')}"})
            elif r in ("system", "user", "assistant", "tool"):
                # Map DB roles to LLM roles (tool -> user)
                llm_role = "user" if r == "tool" else r
                out.append({"role": llm_role, "content": m.get("content", "")})
        return out

    # ——— Handoff (parent → child) ———

    async def handoff(
        self,
        source_session_id: str,
        target_agent: str,
        handoff_payload: Optional[Dict[str, Any]] = None,
        content: str = "",
    ) -> Dict[str, Any]:
        """Create a child session for target_agent, log handoff in both sessions."""
        source = await self.get_session(source_session_id)
        if not source:
            raise ValueError(f"source session {source_session_id} not found")

        # Log handoff event in source
        await self.append_message(
            source_session_id, role="handoff", content=content or f"handoff to {target_agent}",
            agent_type=source.get("agent_type"), handoff_to=target_agent, handoff_payload=handoff_payload,
        )

        child = await self.create_session(
            agent_type=target_agent,
            team_id=source.get("team_id"),
            user_id=source.get("user_id"),
            index_id=source.get("index_id"),
            parent_id=source_session_id,
            root_task_id=source.get("root_task_id"),
            scratchpad={"handoff_from": source.get("agent_type"), "handoff_payload": handoff_payload or {}},
        )

        # Seed child with handoff context as user message
        if handoff_payload or content:
            handoff_content = content or json.dumps(handoff_payload or {}, default=str)
            await self.append_message(child["id"], role="user", content=f"[handoff from {source.get('agent_type')}] {handoff_content}")

        return child

    # ——— Listing ———

    async def list_sessions(
        self, team_id: Optional[str] = None, agent_type: Optional[str] = None,
        state: Optional[str] = None, limit: int = 50, offset: int = 0,
    ) -> List[Dict[str, Any]]:
        from app.database.config import async_session_factory
        from app.database.models import AgentSession
        async with async_session_factory() as db:
            q = select(AgentSession).order_by(desc(AgentSession.updated_at))
            if team_id:
                q = q.where(AgentSession.team_id == team_id)
            if agent_type:
                q = q.where(AgentSession.agent_type == agent_type)
            if state:
                q = q.where(AgentSession.state == state)
            q = q.limit(limit).offset(offset)
            res = await db.execute(q)
            return [r.to_dict() for r in res.scalars().all()]

    async def get_thread(self, session_id: str) -> List[Dict[str, Any]]:
        """Walk parent chain up to root, return chain oldest→newest."""
        chain = []
        cur_id: Optional[str] = session_id
        seen = set()
        for _ in range(20):  # guard
            if not cur_id or cur_id in seen:
                break
            seen.add(cur_id)
            sess = await self.get_session(cur_id)
            if not sess:
                break
            chain.append(sess)
            cur_id = sess.get("parent_id")
        chain.reverse()
        return chain


agent_context = AgentContextService()
