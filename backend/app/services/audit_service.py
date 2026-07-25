from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from app.services.postgres_db import get_storage, generate_id

COLLECTION = "onramp_audit_log"

EVENT_CODES = {
    "code_access", "pr_viewed", "module_granted", "module_revoked",
    "task_created", "task_assigned", "task_submitted", "task_reviewed",
    "task_approved", "task_completed", "task_cancelled",
    "user_joined_team", "user_left_team", "role_changed",
    "api_key_created", "api_key_revoked", "repo_cloned",
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def log_event(
    event_type: str,
    actor_id: str,
    target_id: str,
    team_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> dict:
    event = {
        "event_type": event_type,
        "actor_id": actor_id,
        "target_id": target_id,
        "team_id": team_id or "",
        "metadata": metadata or {},
        "timestamp": _utcnow(),
    }
    storage = get_storage()
    event_id = generate_id()
    await storage.create_document(COLLECTION, event_id, event)
    return {"event_id": event_id, **event}


async def query_events(
    team_id: Optional[str] = None,
    actor_id: Optional[str] = None,
    target_id: Optional[str] = None,
    event_type: Optional[str] = None,
    limit: int = 50,
) -> List[dict]:
    storage = get_storage()
    if team_id:
        events = await storage.query_documents(
            COLLECTION, [("team_id", "==", team_id)]
        )
    else:
        events = await storage.list_documents(COLLECTION)
    if actor_id:
        events = [e for e in events if e.get("actor_id") == actor_id]
    if target_id:
        events = [e for e in events if e.get("target_id") == target_id]
    if event_type:
        events = [e for e in events if e.get("event_type") == event_type]

    events.sort(key=lambda e: e.get("timestamp", ""), reverse=True)
    return events[:limit]


async def log_code_access(
    actor_id: str,
    repo_url: str,
    file_path: str,
    team_id: Optional[str] = None,
    action: str = "view",
) -> dict:
    return await log_event(
        event_type="code_access",
        actor_id=actor_id,
        target_id=repo_url,
        team_id=team_id,
        metadata={"file_path": file_path, "action": action, "repo_url": repo_url},
    )
