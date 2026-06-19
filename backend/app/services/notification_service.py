"""
Notification Service — in-app notifications for CodeFlow.

Stores notifications in the same DynamiDocument / JSONB collection used by
the rest of the platform so that the storage backend (PostgreSQL or in-memory)
is transparent to callers.
"""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Set
from app.services.postgres_db import get_storage, generate_id

COLLECTION = "codeflow_notifications"


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _preview_message(title: str, message: str, max_len: int = 120) -> str:
    """Truncate message to max_len with ellipsis."""
    if len(message) <= max_len:
        return message
    return message[: max_len - 3] + "..."


# ── Types ────────────────────────────────────────────────────

NOTIFICATION_TYPES = {
    "task_assigned",
    "task_started",
    "task_submitted",
    "task_reviewed",
    "task_approved",
    "task_needs_changes",
    "task_completed",
    "task_cancelled",
    "module_granted",
    "team_invite",
    "system_alert",
    "pr_merged",
    "milestone_reached",
}


# ── CRUD ─────────────────────────────────────────────────────


async def create_notification(
    user_id: str,
    type: str,
    title: str,
    message: str,
    metadata: Optional[Dict[str, Any]] = None,
    team_id: Optional[str] = None,
) -> dict:
    """Create a new notification for a user."""
    storage = get_storage()
    now = _utcnow()
    notif_id = generate_id()

    notification = {
        "notification_id": notif_id,
        "user_id": user_id,
        "type": type,
        "title": title,
        "message": _preview_message(title, message),
        "full_message": message,
        "metadata": metadata or {},
        "team_id": team_id or "",
        "read": False,
        "read_at": None,
        "created_at": now,
    }

    await storage.create_document(COLLECTION, notif_id, notification)
    return notification


async def get_notification(notification_id: str) -> Optional[dict]:
    """Get a single notification."""
    storage = get_storage()
    return await storage.get_document(COLLECTION, notification_id)


async def list_notifications(
    user_id: str,
    unread_only: bool = False,
    limit: int = 50,
    type_filter: Optional[str] = None,
) -> List[dict]:
    """List notifications for a user, newest first."""
    storage = get_storage()
    all_notifications = await storage.query_documents(
        COLLECTION, [("user_id", "==", user_id)]
    )

    result = []
    for n in all_notifications:
        if unread_only and n.get("read"):
            continue
        if type_filter and n.get("type") != type_filter:
            continue
        result.append(n)

    result.sort(key=lambda n: n.get("created_at", ""), reverse=True)
    return result[:limit]


async def get_unread_count(user_id: str) -> int:
    """Get the number of unread notifications for a user."""
    storage = get_storage()
    notifications = await storage.query_documents(
        COLLECTION, [("user_id", "==", user_id)]
    )
    return sum(1 for n in notifications if not n.get("read"))


async def mark_as_read(notification_id: str, user_id: str) -> bool:
    """Mark a single notification as read."""
    storage = get_storage()
    notif = await storage.get_document(COLLECTION, notification_id)
    if not notif or notif.get("user_id") != user_id:
        return False
    await storage.update_document(COLLECTION, notification_id, {
        "read": True,
        "read_at": _utcnow(),
    })
    return True


async def mark_all_as_read(user_id: str) -> int:
    """Mark all notifications as read for a user. Returns count."""
    storage = get_storage()
    notifications = await storage.query_documents(
        COLLECTION, [("user_id", "==", user_id)]
    )
    count = 0
    for n in notifications:
        if not n.get("read"):
            await storage.update_document(COLLECTION, n["notification_id"], {
                "read": True,
                "read_at": _utcnow(),
            })
            count += 1
    return count


async def delete_notification(notification_id: str, user_id: str) -> bool:
    """Delete a notification."""
    storage = get_storage()
    notif = await storage.get_document(COLLECTION, notification_id)
    if not notif or notif.get("user_id") != user_id:
        return False
    await storage.delete_document(COLLECTION, notification_id)
    return True


async def delete_all_read(user_id: str) -> int:
    """Delete all read notifications for a user. Returns count."""
    storage = get_storage()
    notifications = await storage.query_documents(
        COLLECTION, [("user_id", "==", user_id)]
    )
    count = 0
    for n in notifications:
        if n.get("read"):
            await storage.delete_document(COLLECTION, n["notification_id"])
            count += 1
    return count


# ── Notification Builders ────────────────────────────────────


async def notify_task_assigned(
    task: dict, assignee_id: str, assigned_by_name: str = "A senior"
) -> Optional[dict]:
    """Notify a trainee that a task has been assigned to them."""
    return await create_notification(
        user_id=assignee_id,
        type="task_assigned",
        title="Task Assigned",
        message=f"{assigned_by_name} assigned you: \"{task.get('title', '')}\"",
        metadata={
            "task_id": task.get("task_id"),
            "team_id": task.get("team_id"),
            "module": task.get("module", ""),
            "task_state": "assigned",
        },
        team_id=task.get("team_id"),
    )


async def notify_task_submitted(task: dict, submitter_id: str) -> Optional[dict]:
    """Notify team/seniors that a task has been submitted for review."""
    return await create_notification(
        user_id=submitter_id,  # Will be overridden per team member
        type="task_submitted",
        title="Task Submitted for Review",
        message=f"Task \"{task.get('title', '')}\" submitted for review",
        metadata={
            "task_id": task.get("task_id"),
            "team_id": task.get("team_id"),
            "module": task.get("module", ""),
            "pr_url": task.get("pr_url", ""),
            "task_state": "submitted",
        },
        team_id=task.get("team_id"),
    )


async def notify_task_reviewed(
    task: dict, reviewer_name: str = "A senior", approved: bool = False
) -> Optional[dict]:
    """Notify the assignee that their task was reviewed."""
    assignee = task.get("assigned_to")
    if not assignee:
        return None
    action = "approved" if approved else "requested changes on"
    return await create_notification(
        user_id=assignee,
        type="task_approved" if approved else "task_needs_changes",
        title="Task Reviewed" if not approved else "Task Approved",
        message=f"{reviewer_name} {action} \"{task.get('title', '')}\"",
        metadata={
            "task_id": task.get("task_id"),
            "team_id": task.get("team_id"),
            "module": task.get("module", ""),
            "task_state": task.get("state", ""),
        },
        team_id=task.get("team_id"),
    )


async def notify_task_completed(task: dict) -> Optional[dict]:
    """Notify the assignee that their task was completed (modules unlocked)."""
    assignee = task.get("assigned_to")
    if not assignee:
        return None
    unlocked = task.get("unlock_modules", [])
    msg = f"Task \"{task.get('title', '')}\" completed"
    if unlocked:
        msg += f" — modules unlocked: {', '.join(unlocked)}"
    return await create_notification(
        user_id=assignee,
        type="task_completed",
        title="Task Completed 🎉",
        message=msg,
        metadata={
            "task_id": task.get("task_id"),
            "team_id": task.get("team_id"),
            "module": task.get("module", ""),
            "unlock_modules": unlocked,
            "task_state": "completed",
        },
        team_id=task.get("team_id"),
    )


async def notify_module_granted(
    user_id: str, module: str, team_id: str, source: str = "manual"
) -> dict:
    """Notify a user they gained access to a module."""
    return await create_notification(
        user_id=user_id,
        type="module_granted",
        title="Module Access Granted 🔓",
        message=f"You now have access to module: {module}",
        metadata={
            "module": module,
            "team_id": team_id,
            "source": source,
        },
        team_id=team_id,
    )
