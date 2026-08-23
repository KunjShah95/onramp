"""Helper to create/bind agent sessions with graceful fallback."""
import logging
from typing import Optional

logger = logging.getLogger("onramp.agent_helper")

async def get_session(agent_type: str, user_id: Optional[str] = None, team_id: Optional[str] = None, index_id: Optional[str] = None, scratchpad: Optional[dict] = None) -> Optional[str]:
    try:
        from app.services.agent_context import agent_context
        sess = await agent_context.create_session(agent_type=agent_type, user_id=user_id, team_id=team_id, index_id=index_id, scratchpad=scratchpad or {})
        return sess["id"]
    except Exception:
        logger.debug("agent session create failed for %s", agent_type, exc_info=True)
        return None

async def complete_session(session_id: Optional[str], agent_type: str, success: bool = True, payload: Optional[dict] = None):
    if not session_id:
        return
    try:
        from app.services.agent_context import agent_context
        from app.services.agent_bus import agent_bus
        await agent_context.set_state(session_id, "completed" if success else "failed")
        await agent_bus.publish(f"agent.{agent_type}.completed", payload={"session_id": session_id, **(payload or {})}, source_session_id=session_id, source_agent=agent_type)
    except Exception:
        pass

async def fail_session(session_id: Optional[str], agent_type: str):
    await complete_session(session_id, agent_type, success=False)
