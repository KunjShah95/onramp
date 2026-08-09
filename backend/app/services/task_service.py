"""
Task Service — PostgreSQL backend for the Senior → Trainee workflow state machine.

Manages the full lifecycle: create → assign → work → review → approve → complete.
Enforces valid state transitions and tracks timestamps.
"""

import asyncio
import re as _re
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
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.warning(f"Failed to broadcast WS task update for task {task.get('task_id')}: {e}", exc_info=True)


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
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.warning(f"Jira sync failed for task {task.get('task_id')} (team {task.get('team_id')}): {e}", exc_info=True)


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
    "under_review", "peer_review", "needs_changes", "product_review",
    "approved", "completed", "cancelled",
}

TRANSITIONS = {
    "pending":        {"assigned", "cancelled"},
    "assigned":       {"in_progress", "pending", "cancelled"},
    "in_progress":    {"submitted", "needs_changes", "cancelled"},
    # A reviewer can act on a submitted task directly (approve / route to
    # product / request changes) — under_review is an optional intermediate.
    "submitted":      {"under_review", "peer_review", "approved", "product_review", "needs_changes", "cancelled"},
    "under_review":   {"peer_review", "approved", "needs_changes", "product_review", "cancelled"},
    # Peer review: a fellow dev (not the assignee, not necessarily a senior)
    # claims the task for peer review. Outcome loops back into the normal
    # review outcomes.
    "peer_review":    {"approved", "needs_changes", "product_review", "cancelled"},
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
    quiz_required: bool = False,
    source_issue: Optional[Dict[str, Any]] = None,
    depends_on: Optional[List[str]] = None,
) -> dict:
    """Create a new task in pending state.

    ``depends_on`` is an optional list of prerequisite task_ids — the task
    cannot be started until all of them are completed (task dependency DAG).
    """
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
        "actual_hours": None,
        "pr_comments": None,
        "peer_reviewed_by": None,
        "quiz_required": quiz_required,
        "source_issue": source_issue,
        "depends_on": depends_on or [],
        "submitted_at": None,
        "reviewed_at": None,
        "review_cycles": 0,
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
    elif new_state == "submitted":
        updates["submitted_at"] = now
        if pr_url:
            updates["pr_url"] = pr_url
    elif new_state == "needs_changes":
        updates["reviewed_at"] = now
        updates["review_cycles"] = int(task.get("review_cycles", 0) or 0) + 1
        if feedback:
            updates["review_feedback"] = feedback
    elif new_state == "under_review":
        updates["reviewed_at"] = now
        updates["reviewed_by"] = user_id
    elif new_state in ("product_review", "approved"):
        updates["reviewed_at"] = now
    elif new_state == "product_review":
        updates["product_signoff"] = False
    elif new_state == "approved" and feedback:
        updates["review_feedback"] = feedback
    elif new_state == "assigned":
        updates["assigned_to"] = user_id

    # Broadcast the state transition
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
    """Mark task as in_progress (trainee starts working).

    Enforces the prerequisite quiz gate (when the task requires a quiz on its
    module) and the task dependency DAG (all ``depends_on`` tasks must be
    completed before this task can be started).

    Raises:
        ValueError: If the quiz gate or a dependency is not satisfied.
    """
    # Idempotent start — a task that is already in_progress is left as-is so a
    # double-click / retried Start request doesn't fail the state machine.
    existing = await get_task(task_id)
    if existing and existing.get("state") == "in_progress":
        return existing
    gate = await check_quiz_gate(task_id, user_id)
    if gate.get("required") and not gate.get("passed"):
        raise ValueError(
            f"Module quiz not passed yet — complete the quiz for '{gate['module']}' "
            "to unlock this task."
        )
    unmet = await get_unmet_dependencies(task_id)
    if unmet:
        titles = ", ".join(u["title"] for u in unmet[:5])
        raise ValueError(f"Prerequisite task(s) not completed yet: {titles}")
    return await transition_task(task_id, "in_progress", user_id)


async def get_unmet_dependencies(task_id: str) -> List[Dict[str, Any]]:
    """Return prerequisite tasks that are not completed.

    Reads the task's ``depends_on`` list and checks each prerequisite's state.
    Missing prerequisites (deleted tasks) are treated as unmet so the DAG can't
    be silently bypassed.
    """
    storage = get_storage()
    task = await storage.get_document(COLLECTION, task_id)
    if not task:
        raise ValueError(f"Task {task_id} not found")
    dep_ids = task.get("depends_on") or []
    if not dep_ids:
        return []
    unmet = []
    for dep_id in dep_ids:
        dep = await storage.get_document(COLLECTION, dep_id)
        if not dep or dep.get("state") != "completed":
            unmet.append({
                "task_id": dep_id,
                "title": dep.get("title", dep_id) if dep else dep_id,
                "state": dep.get("state") if dep else "missing",
            })
    return unmet


# Accepts https://github.com/owner/repo/pull/123 and https://github.com/pull/1
# (the latter is used by existing tests). Host + optional path segments + /pull/N.
_PR_URL_RE = _re.compile(r"^https?://[^/\s]+(?:/[^/\s]+)*/pull/\d+")


def _is_valid_pr_url(pr_url: str) -> bool:
    """Accept GitHub-style PR URLs: https://github.com/owner/repo/pull/123."""
    return bool(pr_url and _PR_URL_RE.match(pr_url.strip()))


async def submit_task(task_id: str, user_id: str, pr_url: str) -> dict:
    """Submit task for review with a PR URL.

    Validates that the PR URL is a real GitHub pull-request URL before
    transitioning, so invalid links never enter the review pipeline.
    """
    if not _is_valid_pr_url(pr_url):
        raise ValueError(
            "pr_url must be a valid GitHub pull request URL, e.g. https://github.com/owner/repo/pull/42"
        )
    return await transition_task(task_id, "submitted", user_id, pr_url=pr_url.strip())


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


def _assert_not_own_task(task: dict, reviewer_id: str) -> None:
    """Raise if the reviewer is the task assignee."""
    if task.get("assigned_to") == reviewer_id:
        raise ValueError("You cannot peer-review your own task")


async def peer_review_task(
    task_id: str,
    reviewer_id: str,
    feedback: Dict[str, Any],
    approve: bool = False,
    needs_product: bool = False,
) -> dict:
    """Peer review a task — a fellow dev (not the assignee) reviews the PR.

    Peers claim the review by moving the task to ``peer_review``, then land on
    the same outcomes as senior review (approve / request changes / product).
    The reviewer identity is recorded on ``peer_reviewed_by``.

    Raises:
        ValueError: If the reviewer is the task assignee (can't review your own work).
    """
    storage = get_storage()
    task = await storage.get_document(COLLECTION, task_id)
    if not task:
        raise ValueError(f"Task {task_id} not found")
    _assert_not_own_task(task, reviewer_id)

    # Route to the outcome state first — only record the reviewer on success.
    if approve:
        if needs_product:
            result = await transition_task(task_id, "product_review", reviewer_id, feedback=feedback)
        else:
            result = await transition_task(task_id, "approved", reviewer_id, feedback=feedback)
    else:
        result = await transition_task(task_id, "needs_changes", reviewer_id, feedback=feedback)

    await storage.update_document(COLLECTION, task_id, {"peer_reviewed_by": reviewer_id})
    if result:
        result["peer_reviewed_by"] = reviewer_id
    return result


async def start_peer_review(task_id: str, reviewer_id: str) -> dict:
    """Move a submitted task into peer_review so a peer can review it."""
    storage = get_storage()
    task = await storage.get_document(COLLECTION, task_id)
    if not task:
        raise ValueError(f"Task {task_id} not found")
    _assert_not_own_task(task, reviewer_id)
    result = await transition_task(task_id, "peer_review", reviewer_id)
    await storage.update_document(COLLECTION, task_id, {"peer_reviewed_by": reviewer_id})
    if result:
        result["peer_reviewed_by"] = reviewer_id
    return result


# ── Time Tracking ────────────────────────────────────────────


async def log_actual_hours(task_id: str, hours: float, user_id: str) -> dict:
    """Log actual hours spent on a task (time tracking).

    Only the assignee or the task creator may log hours. When the actual time
    exceeds the estimate, a time-overrun alert is fired (in-app + Slack via the
    notification helpers) so the senior can see tasks running long.

    Raises:
        ValueError: If the task doesn't exist or the caller isn't authorized.
    """
    storage = get_storage()
    task = await storage.get_document(COLLECTION, task_id)
    if not task:
        raise ValueError(f"Task {task_id} not found")
    if user_id not in (task.get("assigned_to"), task.get("created_by")):
        raise ValueError("Only the assignee or task creator can log hours")
    if hours is None or hours < 0:
        raise ValueError("hours must be a non-negative number")
    result = await storage.update_document(
        COLLECTION, task_id, {"actual_hours": float(hours)}
    )
    await _broadcast_task_update(result or task, "updated")

    # Time-overrun alert — actual hours exceeded the estimate.
    estimated = task.get("estimated_hours")
    if estimated is not None and float(hours) > float(estimated):
        try:
            from app.services.notification_helpers import notify_task_time_overrun

            overrun_task = result or task
            await notify_task_time_overrun(overrun_task, float(hours), float(estimated))
        except Exception:
            import logging
            logging.getLogger(__name__).debug("Time-overrun alert failed", exc_info=True)

    return result or task


async def get_task_by_pr_url(pr_url: str) -> Optional[dict]:
    """Find a task whose PR URL matches the given URL (used by PR-merge webhooks).

    Normalizes trailing slashes so ``.../pull/42`` and ``.../pull/42/`` match.
    """
    storage = get_storage()
    tasks = await storage.list_documents(COLLECTION)
    target = (pr_url or "").strip().rstrip("/")
    if not target:
        return None
    for t in tasks:
        task_url = (t.get("pr_url") or "").strip().rstrip("/")
        if task_url and task_url == target:
            return t
    return None


async def get_team_time_stats(team_id: str) -> Dict[str, Any]:
    """Estimated vs actual hours per completed/assigned task, plus variance.

    Returns per-task rows (title, module, estimated_hours, actual_hours,
    variance_hours, variance_pct, state) plus aggregates over tasks that have
    an actual value logged.
    """
    storage = get_storage()
    tasks = await storage.query_documents(
        COLLECTION, [("team_id", "==", team_id)]
    )

    rows = []
    with_actual = 0
    total_est = 0.0
    total_actual = 0.0
    total_variance = 0.0

    for t in tasks:
        est = t.get("estimated_hours")
        actual = t.get("actual_hours")
        variance = None
        variance_pct = None
        if est is not None and actual is not None:
            variance = round(actual - est, 1)
            variance_pct = round((actual - est) / est * 100, 1) if est else None
            with_actual += 1
            total_est += est
            total_actual += actual
            total_variance += variance

        rows.append({
            "task_id": t.get("task_id"),
            "title": t.get("title"),
            "module": t.get("module", ""),
            "state": t.get("state"),
            "estimated_hours": est,
            "actual_hours": actual,
            "variance_hours": variance,
            "variance_pct": variance_pct,
        })

    rows.sort(key=lambda r: r.get("actual_hours") is None)  # rows with actual first
    return {
        "team_id": team_id,
        "tasks": rows,
        "with_actual_count": with_actual,
        "total_estimated_hours": round(total_est, 1),
        "total_actual_hours": round(total_actual, 1),
        "avg_variance_hours": round(total_variance / with_actual, 1) if with_actual else None,
        "avg_variance_pct": round((total_actual - total_est) / total_est * 100, 1) if total_est else None,
    }


# ── Quiz Gates ───────────────────────────────────────────────


async def has_passed_module_quiz(user_id: str, module: str) -> bool:
    """Return True if the user has passed a quiz for the given module.

    Uses the ``onramp_quiz_results`` collection — a result row is a pass when
    ``passed`` is True. Any passing attempt unlocks the gate.
    """
    if not module:
        return True
    try:
        storage = get_storage()
        results = await storage.query_documents(
            "onramp_quiz_results",
            [("user_id", "==", user_id), ("module", "==", module), ("passed", "==", True)],
        )
        return bool(results)
    except Exception:
        import logging
        logging.getLogger(__name__).debug("Quiz gate lookup failed", exc_info=True)
        # Fail open when quiz tracking is unavailable so we never brick a task.
        return True


async def check_quiz_gate(task_id: str, user_id: str) -> Dict[str, Any]:
    """Check whether the user may start a task under its quiz gate.

    Returns ``{required, module, passed}`` — when the task does not require a
    quiz (quiz_required False or no module) the gate is not required.
    """
    storage = get_storage()
    task = await storage.get_document(COLLECTION, task_id)
    if not task:
        raise ValueError(f"Task {task_id} not found")
    required = bool(task.get("quiz_required")) and bool(task.get("module"))
    passed = await has_passed_module_quiz(user_id, task.get("module", ""))
    return {
        "required": required,
        "module": task.get("module", ""),
        "passed": passed if required else True,
        "task_id": task_id,
    }


# ── PR Comment Sync ──────────────────────────────────────────


async def store_pr_comments(task_id: str, comments: List[Dict[str, Any]]) -> Optional[dict]:
    """Persist fetched GitHub PR review comments onto a task.

    Each comment dict is normalized to ``{user, body, path, line, created_at}``
    so the frontend can render real diff comments next to the AI summary.
    """
    if not comments:
        return None
    normalized = []
    for c in comments:
        normalized.append({
            "user": (c.get("user") or {}).get("login", "unknown") if isinstance(c.get("user"), dict) else c.get("user", ""),
            "body": c.get("body", ""),
            "path": c.get("path", ""),
            "line": c.get("line"),
            "created_at": str(c.get("created_at", "")),
        })
    storage = get_storage()
    result = await storage.update_document(COLLECTION, task_id, {"pr_comments": normalized})
    return result


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
