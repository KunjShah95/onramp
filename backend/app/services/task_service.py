"""
Task Service — PostgreSQL backend for the Senior → Trainee workflow state machine.

Manages the full lifecycle: create → assign → work → review → approve → complete.
Enforces valid state transitions and tracks timestamps.
"""

import asyncio
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from app.services.postgres_db import get_storage, generate_id


async def _broadcast_task_update(task: dict, event_type: str = "updated") -> None:
    """Broadcast a task update via WebSocket to relevant users."""
    try:
        from app.services.ws_manager import manager

        # Collect user IDs that should be notified
        user_ids = set()
        if task.get("assigned_to"):
            user_ids.add(task["assigned_to"])
        if task.get("created_by"):
            user_ids.add(task["created_by"])

        if not user_ids:
            return

        await manager.broadcast_to_team(
            team_id=task.get("team_id", ""),
            event={
                "type": "task_update",
                "event": event_type,
                "task": {
                    "task_id": task.get("task_id"),
                    "team_id": task.get("team_id"),
                    "state": task.get("state"),
                    "title": task.get("title"),
                    "assigned_to": task.get("assigned_to"),
                    "module": task.get("module"),
                    "updated_at": str(task.get("updated_at", "")),
                },
            },
            user_ids=list(user_ids),
        )
    except Exception:
        import logging
        logging.getLogger(__name__).debug("Failed to broadcast WS task update", exc_info=True)


async def _sync_task_to_jira(task: dict) -> None:
    """Sync a task update to connected Jira integration."""
    try:
        from app.services.jira_service import get_config, create_ticket, update_ticket_state
        from app.services.feature_flag_service import is_feature_flag_enabled

        team_id = task.get("team_id", "")
        if not team_id:
            return

        # Check if jira_sync feature flag is enabled for this team
        if not await is_feature_flag_enabled(team_id, "jira_sync"):
            return

        # Get the Jira config for the task creator (who configured the integration)
        created_by = task.get("created_by", "")
        if not created_by:
            return

        config = await get_config(created_by)
        if not config or not config.get("api_token"):
            return

        jira_issue_key = task.get("jira_issue_key") or task.get("metadata", {}).get("jira_issue_key")

        if jira_issue_key:
            # Ticket already exists — update its state
            await update_ticket_state(config, jira_issue_key, task)
        else:
            # Check if auto-create is enabled
            if task.get("state") in ["assigned", "in_progress"] and config.get("project_key"):
                result = await create_ticket(config, task, config.get("project_key"))
                if result and result.get("key"):
                    # Store the Jira issue key back on the task
                    from app.services.postgres_db import get_storage
                    storage = get_storage()
                    try:
                        await storage.update_document(
                            "onramp_tasks",
                            task.get("task_id", ""),
                            {"jira_issue_key": result["key"]},
                        )
                    except Exception:
                        pass
    except Exception:
        import logging
        logging.getLogger(__name__).debug("Jira sync error", exc_info=True)


async def _sync_task_to_linear(task: dict) -> None:
    """Sync a task update to connected Linear integration."""
    try:
        from app.services.linear_service import get_config, create_issue, update_issue_state
        from app.services.feature_flag_service import is_feature_flag_enabled

        team_id = task.get("team_id", "")
        if not team_id:
            return

        # Check if linear_sync feature flag is enabled for this team
        if not await is_feature_flag_enabled(team_id, "linear_sync"):
            return

        # Get Linear config for the task creator
        created_by = task.get("created_by", "")
        if not created_by:
            return

        config = await get_config(created_by)
        if not config or not config.get("api_key"):
            return

        linear_issue_id = task.get("linear_issue_id") or task.get("metadata", {}).get("linear_issue_id")

        if linear_issue_id:
            await update_issue_state(config["api_key"], linear_issue_id, task, config.get("team_id", ""))
        else:
            if task.get("state") in ["assigned", "in_progress"] and config.get("team_id"):
                result = await create_issue(config["api_key"], task, config["team_id"])
                if result and result.get("id"):
                    from app.services.postgres_db import get_storage
                    storage = get_storage()
                    try:
                        await storage.update_document(
                            "onramp_tasks",
                            task.get("task_id", ""),
                            {"linear_issue_id": result["id"]},
                        )
                    except Exception:
                        pass
    except Exception:
        import logging
        logging.getLogger(__name__).debug("Linear sync error", exc_info=True)


COLLECTION = "onramp_tasks"

# ── State machine ────────────────────────────────────────────

VALID_STATES = {
    "pending", "assigned", "in_progress", "submitted",
    "under_review", "needs_changes", "product_review",
    "approved", "completed", "cancelled",
}

TRANSITIONS = {
    "pending":        {"assigned", "cancelled"},
    "assigned":       {"in_progress", "pending", "cancelled"},
    "in_progress":    {"submitted", "needs_changes", "cancelled"},
    # A reviewer can act on a submitted task directly (approve / route to
    # product / request changes) — under_review is an optional intermediate.
    "submitted":      {"under_review", "approved", "product_review", "needs_changes", "cancelled"},
    "under_review":   {"approved", "needs_changes", "product_review", "cancelled"},
    "needs_changes":  {"in_progress", "cancelled"},
    "product_review": {"approved", "needs_changes", "cancelled"},
    "approved":       {"completed", "cancelled"},
    "completed":      set(),
    "cancelled":      set(),
}

# Terminal states that a task cannot transition out of
TERMINAL_STATES = {"completed", "cancelled"}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _can_transition(current: str, target: str) -> bool:
    """Check if the state transition is allowed."""
    return target in TRANSITIONS.get(current, set())


# ── CRUD Operations ──────────────────────────────────────────


async def create_task(
    team_id: str,
    created_by: str,
    title: str,
    description: Optional[str] = None,
    module: Optional[str] = None,
    priority: str = "medium",
    repo_url: Optional[str] = None,
    branch: Optional[str] = None,
    unlock_modules: Optional[List[str]] = None,
    estimated_hours: Optional[float] = None,
    assigned_to: Optional[str] = None,
) -> dict:
    """Create a new task in pending state."""
    storage = get_storage()

    now = _utcnow()
    task_id = generate_id()
    task = {
        "task_id": task_id,
        "team_id": team_id,
        "created_by": created_by,
        "assigned_to": assigned_to,
        "title": title,
        "description": description or "",
        "module": module or "",
        "state": "assigned" if assigned_to else "pending",
        "priority": priority,
        "pr_url": None,
        "branch": branch or "",
        "repo_url": repo_url or "",
        "unlock_modules": unlock_modules or [],
        "review_feedback": None,
        "ai_review": None,
        "product_signoff": False,
        "estimated_hours": estimated_hours,
        "created_at": now,
        "updated_at": now,
        "started_at": None,
        "completed_at": None,
    }

    await storage.create_document(COLLECTION, task_id, task)
    await _broadcast_task_update(task, "created")
    # Fire-and-forget sync to Jira/Linear (do not block task creation)
    asyncio.ensure_future(_sync_task_to_jira(task))
    asyncio.ensure_future(_sync_task_to_linear(task))
    return task


async def get_task(task_id: str) -> Optional[dict]:
    """Get a task by ID."""
    storage = get_storage()
    return await storage.get_document(COLLECTION, task_id)


async def list_tasks(
    team_id: Optional[str] = None,
    assigned_to: Optional[str] = None,
    created_by: Optional[str] = None,
    state: Optional[str] = None,
) -> List[dict]:
    """List tasks with optional filters."""
    storage = get_storage()

    if team_id:
        tasks = await storage.query_documents(
            COLLECTION, [("team_id", "==", team_id)]
        )
    else:
        tasks = []

    # Client-side filtering for additional filters
    if assigned_to:
        tasks = [t for t in tasks if t.get("assigned_to") == assigned_to]
    if created_by:
        tasks = [t for t in tasks if t.get("created_by") == created_by]
    if state:
        tasks = [t for t in tasks if t.get("state") == state]

    # Sort by created_at descending (most recent first)
    tasks.sort(key=lambda t: t.get("created_at", ""), reverse=True)
    return tasks


async def update_task(task_id: str, updates: dict) -> Optional[dict]:
    """Update task fields (non-state)."""
    storage = get_storage()
    task = await storage.get_document(COLLECTION, task_id)
    if not task:
        return None

    # Don't update terminal tasks
    if task.get("state") in TERMINAL_STATES:
        # Allow only cancellation-related updates on completed
        if updates.get("state") != "cancelled":
            return None

    updates["updated_at"] = _utcnow()
    result = await storage.update_document(COLLECTION, task_id, updates)
    return result


# ── State Machine Transitions ────────────────────────────────


async def transition_task(
    task_id: str,
    new_state: str,
    user_id: str,
    feedback: Optional[Dict[str, Any]] = None,
    pr_url: Optional[str] = None,
) -> dict:
    """Transition a task to a new state (enforces valid transitions).

    Args:
        task_id: The task ID
        new_state: Target state
        user_id: Who's performing the transition
        feedback: Optional review feedback (for review states)
        pr_url: Optional PR URL (for submitted state)

    Returns:
        Updated task dict

    Raises:
        ValueError: If transition is not allowed
    """
    storage = get_storage()
    task = await storage.get_document(COLLECTION, task_id)
    if not task:
        raise ValueError(f"Task {task_id} not found")

    current = task.get("state", "pending")
    if not _can_transition(current, new_state):
        raise ValueError(
            f"Cannot transition task from '{current}' to '{new_state}'. "
            f"Allowed: {TRANSITIONS.get(current, set())}"
        )

    now = _utcnow()
    updates = {
        "state": new_state,
        "updated_at": now,
    }

    # Track timestamps per state
    if new_state == "in_progress":
        updates["started_at"] = now
    elif new_state == "completed":
        updates["completed_at"] = now
    elif new_state == "submitted" and pr_url:
        updates["pr_url"] = pr_url
    elif new_state == "needs_changes" and feedback:
        updates["review_feedback"] = feedback
    elif new_state == "under_review":
        updates["reviewed_by"] = user_id
    elif new_state == "product_review":
        updates["product_signoff"] = False
    elif new_state == "approved" and feedback:
        updates["review_feedback"] = feedback
    elif new_state == "assigned":
        updates["assigned_to"] = user_id        # Broadcast the state transition
    result = await storage.update_document(COLLECTION, task_id, updates)
    if result:
        result["state"] = new_state
        await _broadcast_task_update(result, "updated")
        # Fire-and-forget sync to Jira/Linear (do not block the transition)
        asyncio.ensure_future(_sync_task_to_jira(result))
        asyncio.ensure_future(_sync_task_to_linear(result))
    return result


async def assign_task(task_id: str, assignee_id: str, assigned_by: str) -> dict:
    """Assign a task to a trainee.

    The "assigned" transition sets ``assigned_to`` to the actor it receives, so
    the assignee (not the assigner) must be passed through.
    """
    return await transition_task(task_id, "assigned", assignee_id)


async def start_task(task_id: str, user_id: str) -> dict:
    """Mark task as in_progress."""
    return await transition_task(task_id, "in_progress", user_id)


async def submit_task(task_id: str, user_id: str, pr_url: str) -> dict:
    """Submit task for review with a PR URL."""
    return await transition_task(task_id, "submitted", user_id, pr_url=pr_url)


async def review_task(
    task_id: str,
    reviewer_id: str,
    feedback: Dict[str, Any],
    approve: bool = False,
    needs_product: bool = False,
) -> dict:
    """Review a submitted task — approve, request changes, or route to product."""
    if approve:
        if needs_product:
            return await transition_task(task_id, "product_review", reviewer_id, feedback=feedback)
        return await transition_task(task_id, "approved", reviewer_id, feedback=feedback)
    return await transition_task(task_id, "needs_changes", reviewer_id, feedback=feedback)


async def request_changes(task_id: str, reviewer_id: str, feedback: Dict[str, Any]) -> dict:
    """Request changes on a task (loops back to in_progress)."""
    return await transition_task(task_id, "needs_changes", reviewer_id, feedback=feedback)


async def approve_task(task_id: str, reviewer_id: str, feedback: Optional[Dict[str, Any]] = None) -> dict:
    """Approve a task (senior or product sign-off)."""
    return await transition_task(task_id, "approved", reviewer_id, feedback=feedback)


async def complete_task(task_id: str, user_id: str) -> dict:
    """Mark task as completed — modules are now unlocked.

    Auto-grants any modules listed in unlock_modules to the task assignee.
    """
    storage = get_storage()
    task = await storage.get_document(COLLECTION, task_id)
    if not task:
        raise ValueError(f"Task {task_id} not found")

    result = await transition_task(task_id, "completed", user_id)

    # Auto-grant module access to the assignee
    assignee = task.get("assigned_to")
    unlock_modules = task.get("unlock_modules", [])
    team_id = task.get("team_id")

    if assignee and unlock_modules and team_id:
        from app.services.access_control_service import grant_module_access

        for module in unlock_modules:
            if isinstance(module, str) and module.strip():
                try:
                    await grant_module_access(
                        team_id=team_id,
                        user_id=assignee,
                        module=module.strip(),
                        granted_by=user_id,  # The person completing is granting
                        source="task_completion",
                    )
                except ValueError:
                    # User already has this module — skip silently
                    pass

    return result


async def cancel_task(task_id: str, user_id: str) -> dict:
    """Cancel a task (from any non-terminal state)."""
    return await transition_task(task_id, "cancelled", user_id)


async def delete_task(task_id: str) -> bool:
    """Hard-delete a task (admin only)."""
    storage = get_storage()
    task = await storage.get_document(COLLECTION, task_id)
    if not task:
        return False
    await storage.delete_document(COLLECTION, task_id)
    return True


# ── Aggregation / Progress ───────────────────────────────────


async def get_team_progress(team_id: str) -> Dict[str, Any]:
    """Get aggregate progress metrics for a team."""
    storage = get_storage()
    tasks = await storage.query_documents(
        COLLECTION, [("team_id", "==", team_id)]
    )

    total = len(tasks)
    by_state: Dict[str, int] = {}
    for t in tasks:
        s = t.get("state", "unknown")
        by_state[s] = by_state.get(s, 0) + 1

    return {
        "total": total,
        "by_state": by_state,
        "completed": by_state.get("completed", 0),
        "in_progress": by_state.get("in_progress", 0),
        "pending_review": by_state.get("submitted", 0) + by_state.get("under_review", 0),
        "blocked": by_state.get("needs_changes", 0),
    }


async def get_user_progress(user_id: str, team_id: Optional[str] = None) -> Dict[str, Any]:
    """Get aggregate progress metrics for a specific user (trainee)."""
    storage = get_storage()

    if team_id:
        all_tasks = await storage.query_documents(
            COLLECTION, [("team_id", "==", team_id)]
        )
    else:
        all_tasks = []

    user_tasks = [t for t in all_tasks if t.get("assigned_to") == user_id]

    total = len(user_tasks)
    by_state: Dict[str, int] = {}
    modules_unlocked = set()
    for t in user_tasks:
        s = t.get("state", "unknown")
        by_state[s] = by_state.get(s, 0) + 1
        if s == "completed":
            unlocked = t.get("unlock_modules", [])
            if isinstance(unlocked, list):
                modules_unlocked.update(unlocked)

    return {
        "total": total,
        "by_state": by_state,
        "completed": by_state.get("completed", 0),
        "in_progress": by_state.get("in_progress", 0),
        "pending_review": by_state.get("submitted", 0) + by_state.get("under_review", 0),
        "modules_unlocked": sorted(modules_unlocked),
        "completion_rate": round((by_state.get("completed", 0) / max(total, 1)) * 100, 1),
    }
