"""
AgentBus — inter-agent event bus.

Durable in Postgres (onramp_agent_events), hot in Redis Streams
(`agent:bus:{event_type}`) with in-process asyncio.Queue fallback for dev.

Agents publish events; orchestrators / next agents subscribe.  WS bridge
re-broadcasts bus events to team rooms via ws_manager so the frontend sees
agent handoffs live.
"""

import asyncio
import json
import logging
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger("onramp.agent_bus")

REDIS_STREAM_PREFIX = "agent:bus"
LOCAL_MAX = 500

# In-process fallback subscribers: event_type -> [(queue, team_id)]
# A None team_id is reserved for internal/global consumers.  User-facing
# subscribers should always provide a team scope.
_LOCAL_SUBSCRIBERS: Dict[str, List[tuple[asyncio.Queue, Optional[str]]]] = defaultdict(list)
_LOCAL_HISTORY: deque = deque(maxlen=LOCAL_MAX)


def _uid() -> str:
    return str(uuid.uuid4())


def _now():
    return datetime.now(timezone.utc)


async def _redis():
    try:
        from app.services.cache_service import get_client
        return await get_client()
    except Exception:
        return None


class AgentBus:
    """Publish / subscribe for inter-agent events."""

    # ——— Publish ———

    async def publish(
        self,
        event_type: str,
        payload: Optional[Dict[str, Any]] = None,
        source_session_id: Optional[str] = None,
        source_agent: Optional[str] = None,
        target_agent: Optional[str] = None,
        team_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Persist and fan out an event with an explicit tenant scope.

        ``team_id`` is deliberately separate from the payload so callers cannot
        accidentally broaden an event's audience by accepting an untrusted
        payload field.  Internal callers may still omit it for audit/debug
        events, but unscoped events are never sent to user WebSockets.
        """
        eid = _uid()
        now = _now()
        event_payload = dict(payload or {})
        effective_team_id = team_id or event_payload.pop("team_id", None)
        if effective_team_id:
            # Keep the canonical scope visible to consumers reading the payload.
            event_payload["team_id"] = effective_team_id
        record = {
            "id": eid,
            "event_type": event_type,
            "source_session_id": source_session_id,
            "source_agent": source_agent,
            "target_agent": target_agent,
            "team_id": effective_team_id,
            "payload": event_payload,
            "created_at": now,
        }

        # Persist to Postgres (best-effort)
        try:
            from app.database.config import db_config
            from app.database.models import AgentEvent
            async with db_config.get_session_factory()() as db:
                db.add(AgentEvent(
                    id=eid,
                    event_type=event_type,
                    source_session_id=source_session_id,
                    source_agent=source_agent,
                    target_agent=target_agent,
                    team_id=effective_team_id,
                    payload=event_payload,
                    created_at=now,
                ))
                await db.commit()
        except Exception:
            logger.exception("AgentBus persist failed for %s", event_type)

        # Also append to source session as event message (so history is complete)
        if source_session_id:
            try:
                from app.services.agent_context import agent_context
                await agent_context.append_message(
                    source_session_id, role="event",
                    content=json.dumps({"event_type": event_type, **event_payload}, default=str),
                    agent_type=source_agent,
                )
            except Exception:
                pass

        # Hot path: Redis Streams
        client = await _redis()
        if client:
            try:
                stream = f"{REDIS_STREAM_PREFIX}:{event_type}"
                await client.xadd(stream, {
                    "id": eid,
                    "event_type": event_type,
                    "source_session_id": source_session_id or "",
                    "source_agent": source_agent or "",
                    "target_agent": target_agent or "",
                    "team_id": effective_team_id or "",
                    "payload": json.dumps(event_payload, default=str),
                })
                # Also write a wildcard stream for internal consumers.  The
                # team_id field is mandatory for consumers that expose events
                # to users; unscoped rows must not be treated as public.
                await client.xadd(f"{REDIS_STREAM_PREFIX}:*", {
                    "id": eid,
                    "event_type": event_type,
                    "team_id": effective_team_id or "",
                    "payload": json.dumps(event_payload, default=str),
                })
                await client.expire(stream, 7 * 24 * 3600)
            except Exception:
                logger.debug("Redis stream publish failed, using local fallback", exc_info=True)

        # In-process fan-out.  A subscriber may opt into one team; unscoped
        # subscribers are reserved for internal/debug consumers.
        _LOCAL_HISTORY.append(record)
        subscribers = list(_LOCAL_SUBSCRIBERS.get(event_type, [])) + list(_LOCAL_SUBSCRIBERS.get("*", []))
        for q, subscriber_team_id in subscribers:
            if subscriber_team_id is not None and subscriber_team_id != effective_team_id:
                continue
            try:
                q.put_nowait(record)
            except asyncio.QueueFull:
                pass

        # WS bridge — strictly team-scoped. Events without team_id are
        # persisted + fanned out to in-process subscribers only; they are
        # never broadcast to user WebSockets (no global fan-out).
        try:
            from app.services.ws_manager import manager
            if effective_team_id:
                ws_payload = {
                    "type": "agent_event",
                    "event_type": event_type,
                    "source_agent": source_agent,
                    "target_agent": target_agent,
                    "payload": event_payload,
                }
                from app.services.team_service import get_team_members
                members = await get_team_members(effective_team_id)
                uids = [m.get("user_id") or m.get("id") for m in members if (m.get("user_id") or m.get("id"))]
                await manager.broadcast_to_team(effective_team_id, ws_payload, uids)
            else:
                logger.debug("AgentBus: skipping WS broadcast for %s (no team_id)", event_type)
        except Exception:
            logger.debug("AgentBus: WS bridge failed for %s", event_type, exc_info=True)

        return {**record, "created_at": now.isoformat()}

    # Convenience: handoff event
    async def handoff(
        self,
        source_session_id: str,
        source_agent: str,
        target_agent: str,
        payload: Optional[Dict[str, Any]] = None,
        content: str = "",
    ) -> Dict[str, Any]:
        """Publish a handoff + create the child session via AgentContext."""
        from app.services.agent_context import agent_context
        child = await agent_context.handoff(source_session_id, target_agent, handoff_payload=payload, content=content)
        source = await agent_context.get_session(source_session_id)
        await self.publish(
            "agent.handoff",
            payload={"child_session_id": child["id"], "content": content, **(payload or {})},
            source_session_id=source_session_id,
            source_agent=source_agent,
            target_agent=target_agent,
            team_id=(source or {}).get("team_id"),
        )
        return child

    # ——— Subscribe (in-process) ———

    def subscribe(self, event_type: str = "*", team_id: Optional[str] = None) -> asyncio.Queue:
        """Return a Queue for future events.

        Pass ``team_id`` for a tenant-scoped subscriber.  Omitting it is
        reserved for internal/debug consumers and should not be used by API
        handlers.
        """
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        _LOCAL_SUBSCRIBERS[event_type].append((q, team_id))
        return q

    def unsubscribe(self, queue: asyncio.Queue, event_type: str = "*"):
        lst = _LOCAL_SUBSCRIBERS.get(event_type, [])
        _LOCAL_SUBSCRIBERS[event_type] = [entry for entry in lst if entry[0] is not queue]
        if not _LOCAL_SUBSCRIBERS[event_type]:
            _LOCAL_SUBSCRIBERS.pop(event_type, None)

    # ——— Query ———

    async def list_events(
        self, event_type: Optional[str] = None, limit: int = 50, offset: int = 0,
        team_id: Optional[str] = None, team_ids: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        from app.database.config import db_config
        from app.database.models import AgentEvent
        from sqlalchemy import select, desc
        async with db_config.get_session_factory()() as db:
            q = select(AgentEvent).order_by(desc(AgentEvent.created_at)).limit(limit).offset(offset)
            if event_type and event_type != "*":
                q = q.where(AgentEvent.event_type == event_type)
            if team_ids is not None:
                if team_ids:
                    q = q.where(AgentEvent.team_id.in_(team_ids))
                else:
                    # An explicitly empty scope must not turn into an
                    # unfiltered cross-tenant query.
                    q = q.where(AgentEvent.id.is_(None))
            elif team_id:
                q = q.where(AgentEvent.team_id == team_id)
            res = await db.execute(q)
            return [r.to_dict() for r in res.scalars().all()]

    async def recent_local(self, limit: int = 50, team_id: Optional[str] = None) -> List[Dict[str, Any]]:
        records = list(_LOCAL_HISTORY)
        if team_id is not None:
            records = [r for r in records if r.get("team_id") == team_id]
        return records[-limit:]


agent_bus = AgentBus()
