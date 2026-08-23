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

# In-process fallback subscribers: event_type -> [queue]
_LOCAL_SUBSCRIBERS: Dict[str, List[asyncio.Queue]] = defaultdict(list)
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
    ) -> Dict[str, Any]:
        """Persist + fan out an event. Returns the persisted record."""
        eid = _uid()
        now = _now()
        record = {
            "id": eid,
            "event_type": event_type,
            "source_session_id": source_session_id,
            "source_agent": source_agent,
            "target_agent": target_agent,
            "payload": payload or {},
            "created_at": now,
        }

        # Persist to Postgres (best-effort)
        try:
            from app.database.config import async_session_factory
            from app.database.models import AgentEvent
            async with async_session_factory() as db:
                db.add(AgentEvent(
                    id=eid,
                    event_type=event_type,
                    source_session_id=source_session_id,
                    source_agent=source_agent,
                    target_agent=target_agent,
                    payload=payload or {},
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
                    content=json.dumps({"event_type": event_type, **(payload or {})}, default=str),
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
                    "payload": json.dumps(payload or {}, default=str),
                })
                # Also global stream for wildcard consumers
                await client.xadd(f"{REDIS_STREAM_PREFIX}:*", {
                    "id": eid,
                    "event_type": event_type,
                    "payload": json.dumps(payload or {}, default=str),
                })
                await client.expire(stream, 7 * 24 * 3600)
            except Exception:
                logger.debug("Redis stream publish failed, using local fallback", exc_info=True)

        # In-process fan-out
        _LOCAL_HISTORY.append(record)
        for q in list(_LOCAL_SUBSCRIBERS.get(event_type, [])) + list(_LOCAL_SUBSCRIBERS.get("*", [])):
            try:
                q.put_nowait(record)
            except asyncio.QueueFull:
                pass

        # WS bridge — team-scoped if payload has team_id, else global fan-out so UI still sees progress
        try:
            from app.services.ws_manager import manager
            ws_payload = {
                "type": "agent_event",
                "event_type": event_type,
                "source_agent": source_agent,
                "target_agent": target_agent,
                "payload": payload or {},
            }
            team_id = (payload or {}).get("team_id")
            if team_id:
                from app.services.team_service import get_team_members
                members = await get_team_members(team_id)
                uids = [m.get("user_id") or m.get("id") for m in members if (m.get("user_id") or m.get("id"))]
                await manager.broadcast_to_team(team_id, ws_payload, uids)
            else:
                for uid in list(manager.get_connected_users()):
                    await manager.send_to_user(uid, ws_payload)
        except Exception:
            pass

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
        await self.publish(
            "agent.handoff",
            payload={"child_session_id": child["id"], "content": content, **(payload or {})},
            source_session_id=source_session_id,
            source_agent=source_agent,
            target_agent=target_agent,
        )
        return child

    # ——— Subscribe (in-process) ———

    def subscribe(self, event_type: str = "*") -> asyncio.Queue:
        """Return a Queue that receives future publishes for event_type."""
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        _LOCAL_SUBSCRIBERS[event_type].append(q)
        return q

    def unsubscribe(self, queue: asyncio.Queue, event_type: str = "*"):
        lst = _LOCAL_SUBSCRIBERS.get(event_type, [])
        if queue in lst:
            lst.remove(queue)

    # ——— Query ———

    async def list_events(
        self, event_type: Optional[str] = None, limit: int = 50, offset: int = 0
    ) -> List[Dict[str, Any]]:
        from app.database.config import async_session_factory
        from app.database.models import AgentEvent
        from sqlalchemy import select, desc
        async with async_session_factory() as db:
            q = select(AgentEvent).order_by(desc(AgentEvent.created_at)).limit(limit).offset(offset)
            if event_type and event_type != "*":
                q = q.where(AgentEvent.event_type == event_type)
            res = await db.execute(q)
            return [r.to_dict() for r in res.scalars().all()]

    async def recent_local(self, limit: int = 50) -> List[Dict[str, Any]]:
        return list(_LOCAL_HISTORY)[-limit:]


agent_bus = AgentBus()
