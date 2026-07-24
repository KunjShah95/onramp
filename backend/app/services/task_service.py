"""
Task Service — PostgreSQL backend for the Senior → Trainee workflow state machine.

Manages the full lifecycle: create → assign → work → review → approve → complete.
Enforces valid state transitions and tracks timestamps.
"""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from app.services.postgres_db import get_storage, generate_id

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
    "submitted":      {"under_review", "needs_changes", "cancelled"},
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
        updates["assigned_to"] = user_id

    return await storage.update_document(COLLECTION, task_id, updates)


async def assign_task(task_id: str, assignee_id: str, assigned_by: str) -> dict:
    """Assign a task to a trainee."""
    return await transition_task(task_id, "assigned", assigned_by)


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
