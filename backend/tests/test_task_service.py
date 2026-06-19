"""
Tests for the Task Service state machine — transition validation, progress
aggregation, CRUD edge cases, and the auto-grant module integration.
"""

import uuid
import pytest
import pytest_asyncio

from app.services.task_service import (
    COLLECTION,
    TRANSITIONS,
    TERMINAL_STATES,
    create_task,
    get_task,
    list_tasks,
    update_task,
    transition_task,
    assign_task,
    start_task,
    submit_task,
    review_task,
    request_changes,
    approve_task,
    complete_task,
    cancel_task,
    delete_task,
    get_team_progress,
    get_user_progress,
)
from app.services.postgres_db import get_storage


# ── Fixtures ────────────────────────────────────────────────────────────────

TEAM_A = str(uuid.uuid4())
TEAM_B = str(uuid.uuid4())
SENIOR = str(uuid.uuid4())
TRAINEE = str(uuid.uuid4())
TRAINEE_2 = str(uuid.uuid4())


@pytest_asyncio.fixture(autouse=True)
async def clean_storage():
    """Clear the task collection before each test so tests are isolated."""
    storage = get_storage()
    coll = storage._coll(COLLECTION)
    coll.clear()
    # Also clear member_modules to keep auto-grant tests clean
    if "member_modules" in storage._data:
        storage._data["member_modules"].clear()
    yield


# ── Test Helpers ────────────────────────────────────────────────────────────

async def _make_task(
    team_id: str = TEAM_A,
    title: str = "Test Task",
    module: str = "api-core",
    priority: str = "medium",
    assigned_to: str | None = None,
    unlock_modules: list[str] | None = None,
) -> dict:
    """Create a bare-minimum task for use in tests."""
    return await create_task(
        team_id=team_id,
        created_by=SENIOR,
        title=title,
        module=module,
        priority=priority,
        assigned_to=assigned_to,
        unlock_modules=unlock_modules,
    )


# ════════════════════════════════════════════════════════════════════════════
# State Machine – Happiness Path
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_create_task_pending():
    """A task created without an assignee starts in 'pending'."""
    task = await _make_task(assigned_to=None)
    assert task["state"] == "pending"
    assert task["title"] == "Test Task"
    assert task["team_id"] == TEAM_A
    assert task["created_by"] == SENIOR
    assert task["assigned_to"] is None


@pytest.mark.asyncio
async def test_create_task_assigned():
    """A task created *with* an assignee starts in 'assigned'."""
    task = await _make_task(assigned_to=TRAINEE)
    assert task["state"] == "assigned"
    assert task["assigned_to"] == TRAINEE


@pytest.mark.asyncio
async def test_full_lifecycle():
    """Full pending → completed happy path."""
    task = await _make_task(assigned_to=None)
    tid = task["task_id"]

    # pending → assigned
    task = await assign_task(tid, TRAINEE, SENIOR)
    assert task["state"] == "assigned"

    # assigned → in_progress
    task = await start_task(tid, TRAINEE)
    assert task["state"] == "in_progress"

    # in_progress → submitted
    task = await submit_task(tid, TRAINEE, "https://github.com/org/repo/pull/42")
    assert task["state"] == "submitted"
    assert task["pr_url"] == "https://github.com/org/repo/pull/42"

    # submitted → under_review
    task = await transition_task(tid, "under_review", SENIOR)
    assert task["state"] == "under_review"
    assert task["reviewed_by"] == SENIOR

    # under_review → approved
    task = await approve_task(tid, SENIOR, feedback={"quality": "good"})
    assert task["state"] == "approved"

    # approved → completed
    task = await complete_task(tid, SENIOR)
    assert task["state"] == "completed"
    assert task["completed_at"] is not None


@pytest.mark.asyncio
async def test_review_approve_flow():
    """in_progress → submitted → under_review → approved."""
    task = await _make_task(assigned_to=TRAINEE)
    tid = task["task_id"]
    await start_task(tid, TRAINEE)
    await submit_task(tid, TRAINEE, "https://github.com/org/repo/pull/1")

    # Manually transition to under_review (as if senior picked it up)
    task = await transition_task(tid, "under_review", SENIOR)
    assert task["state"] == "under_review"
    assert task["reviewed_by"] == SENIOR

    # Approve via review_task convenience
    task = await review_task(tid, SENIOR, feedback={"looks_good": True}, approve=True)
    assert task["state"] == "approved"


@pytest.mark.asyncio
async def test_review_needs_changes():
    """in_progress → submitted → needs_changes → back to in_progress."""
    task = await _make_task(assigned_to=TRAINEE)
    tid = task["task_id"]
    await start_task(tid, TRAINEE)
    await submit_task(tid, TRAINEE, "https://github.com/org/repo/pull/2")

    task = await review_task(tid, SENIOR, feedback={"fix": "lint errors"}, approve=False)
    assert task["state"] == "needs_changes"
    assert task["review_feedback"] == {"fix": "lint errors"}

    # needs_changes → in_progress (trainee resumes)
    task = await start_task(tid, TRAINEE)
    assert task["state"] == "in_progress"


@pytest.mark.asyncio
async def test_review_product_signoff():
    """under_review → product_review → approved."""
    task = await _make_task(assigned_to=TRAINEE)
    tid = task["task_id"]
    await start_task(tid, TRAINEE)
    await submit_task(tid, TRAINEE, "https://github.com/org/repo/pull/3")
    await transition_task(tid, "under_review", SENIOR)

    # Senior routes to product review
    task = await review_task(tid, SENIOR, feedback={}, approve=True, needs_product=True)
    assert task["state"] == "product_review"
    assert task["product_signoff"] is False

    # Product approves
    task = await approve_task(tid, "product-lead", feedback={"approved": True})
    assert task["state"] == "approved"


@pytest.mark.asyncio
async def test_cancel_from_non_terminal():
    """Cancelling from a non-terminal state works."""
    task = await _make_task(assigned_to=TRAINEE)
    tid = task["task_id"]
    await start_task(tid, TRAINEE)
    await submit_task(tid, TRAINEE, "https://github.com/org/repo/pull/4")

    task = await cancel_task(tid, SENIOR)
    assert task["state"] == "cancelled"


@pytest.mark.asyncio
async def test_request_changes_convenience():
    """request_changes convenience function works."""
    task = await _make_task(assigned_to=TRAINEE)
    tid = task["task_id"]
    await start_task(tid, TRAINEE)
    await submit_task(tid, TRAINEE, "https://github.com/org/repo/pull/5")

    task = await request_changes(tid, SENIOR, {"issues": ["fix naming"]})
    assert task["state"] == "needs_changes"


# ════════════════════════════════════════════════════════════════════════════
# State Machine – Invalid Transitions (should raise ValueError)
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_pending_cannot_start():
    """pending → in_progress is not allowed (must be assigned first)."""
    task = await _make_task()
    with pytest.raises(ValueError, match="Cannot transition task from 'pending' to 'in_progress'"):
        await start_task(task["task_id"], TRAINEE)


@pytest.mark.asyncio
async def test_pending_cannot_submit():
    """pending → submitted is not allowed."""
    task = await _make_task()
    with pytest.raises(ValueError):
        await submit_task(task["task_id"], TRAINEE, "https://github.com/org/repo/pull/1")


@pytest.mark.asyncio
async def test_pending_cannot_approve():
    """pending → approved is not allowed."""
    task = await _make_task()
    with pytest.raises(ValueError):
        await approve_task(task["task_id"], SENIOR)


@pytest.mark.asyncio
async def test_assigned_cannot_submit():
    """assigned → submitted is not allowed (must start first)."""
    task = await _make_task(assigned_to=TRAINEE)
    tid = task["task_id"]
    with pytest.raises(ValueError):
        await submit_task(tid, TRAINEE, "https://github.com/org/repo/pull/1")


@pytest.mark.asyncio
async def test_submitted_cannot_start():
    """submitted → in_progress is not allowed (must go through needs_changes)."""
    task = await _make_task(assigned_to=TRAINEE)
    tid = task["task_id"]
    await start_task(tid, TRAINEE)
    await submit_task(tid, TRAINEE, "https://github.com/org/repo/pull/1")
    with pytest.raises(ValueError):
        await start_task(tid, TRAINEE)


@pytest.mark.asyncio
async def test_approved_cannot_submit():
    """approved → submitted is not allowed."""
    task = await _make_task(assigned_to=TRAINEE)
    tid = task["task_id"]
    await start_task(tid, TRAINEE)
    await submit_task(tid, TRAINEE, "https://github.com/org/repo/pull/1")
    await transition_task(tid, "under_review", SENIOR)
    await approve_task(tid, SENIOR)
    with pytest.raises(ValueError):
        await submit_task(tid, TRAINEE, "https://github.com/org/repo/pull/2")


@pytest.mark.asyncio
async def test_completed_is_terminal():
    """completed → any non-cancelled state is rejected."""
    task = await _make_task(assigned_to=TRAINEE)
    tid = task["task_id"]
    await start_task(tid, TRAINEE)
    await submit_task(tid, TRAINEE, "https://github.com/org/repo/pull/1")
    await transition_task(tid, "under_review", SENIOR)
    await approve_task(tid, SENIOR)
    await complete_task(tid, SENIOR)
    with pytest.raises(ValueError, match="Cannot transition task from 'completed' to 'in_progress'"):
        await start_task(tid, TRAINEE)


@pytest.mark.asyncio
async def test_completed_cannot_be_approved():
    """completed → approved is rejected."""
    task = await _make_task(assigned_to=TRAINEE)
    tid = task["task_id"]
    await start_task(tid, TRAINEE)
    await submit_task(tid, TRAINEE, "https://github.com/org/repo/pull/1")
    await transition_task(tid, "under_review", SENIOR)
    await approve_task(tid, SENIOR)
    await complete_task(tid, SENIOR)
    with pytest.raises(ValueError):
        await approve_task(tid, SENIOR)


@pytest.mark.asyncio
async def test_cancelled_is_terminal():
    """cancelled → any state is rejected."""
    task = await _make_task(assigned_to=TRAINEE)
    tid = task["task_id"]
    await cancel_task(tid, SENIOR)
    with pytest.raises(ValueError):
        await assign_task(tid, TRAINEE, SENIOR)


@pytest.mark.asyncio
async def test_completed_update_returns_none():
    """update_task on a completed task returns None."""
    task = await _make_task(assigned_to=TRAINEE)
    tid = task["task_id"]
    await start_task(tid, TRAINEE)
    await submit_task(tid, TRAINEE, "https://github.com/org/repo/pull/1")
    await transition_task(tid, "under_review", SENIOR)
    await approve_task(tid, SENIOR)
    await complete_task(tid, SENIOR)
    result = await update_task(tid, {"title": "new title"})
    assert result is None


@pytest.mark.asyncio
async def test_all_invalid_pairs_blocked():
    """Every state rejects every transition not in its allowed set.

    Creates independent tasks per state and validates that every
    disallowed transition raises ValueError.
    """
    all_states = set(TRANSITIONS.keys())
    state_allowed = dict(TRANSITIONS)  # use the source of truth directly

    for current_state, allowed in state_allowed.items():
        # Create a task at the target state
        if current_state == "pending":
            task = await _make_task(assigned_to=None)
        else:
            task = await _make_task(assigned_to=TRAINEE)

        tid = task["task_id"]

        # Walk to the requested state
        if current_state == "in_progress":
            await start_task(tid, TRAINEE)
        elif current_state == "submitted":
            await start_task(tid, TRAINEE)
            await submit_task(tid, TRAINEE, "https://github.com/org/repo/pull/99")
        elif current_state == "under_review":
            await start_task(tid, TRAINEE)
            await submit_task(tid, TRAINEE, "https://github.com/org/repo/pull/99")
            await transition_task(tid, "under_review", SENIOR)
        elif current_state == "needs_changes":
            await start_task(tid, TRAINEE)
            await submit_task(tid, TRAINEE, "https://github.com/org/repo/pull/99")
            await transition_task(tid, "needs_changes", SENIOR, feedback={"x": "y"})
        elif current_state == "product_review":
            await start_task(tid, TRAINEE)
            await submit_task(tid, TRAINEE, "https://github.com/org/repo/pull/99")
            await transition_task(tid, "under_review", SENIOR)
            await transition_task(tid, "product_review", SENIOR)
        elif current_state == "approved":
            await start_task(tid, TRAINEE)
            await submit_task(tid, TRAINEE, "https://github.com/org/repo/pull/99")
            await transition_task(tid, "under_review", SENIOR)
            await transition_task(tid, "approved", SENIOR)
        elif current_state == "completed":
            await start_task(tid, TRAINEE)
            await submit_task(tid, TRAINEE, "https://github.com/org/repo/pull/99")
            await transition_task(tid, "under_review", SENIOR)
            await transition_task(tid, "approved", SENIOR)
            await complete_task(tid, SENIOR)
        elif current_state == "cancelled":
            await cancel_task(tid, SENIOR)

        # Now verify every disallowed transition raises ValueError
        disallowed = all_states - allowed - {current_state}
        for bad in disallowed:
            with pytest.raises(ValueError):
                await transition_task(tid, bad, SENIOR)


@pytest.mark.asyncio
async def test_transition_nonexistent_task():
    """transitioning a non-existent task raises ValueError."""
    fake_id = "00000000-0000-0000-0000-000000000000"
    with pytest.raises(ValueError, match="not found"):
        await transition_task(fake_id, "assigned", SENIOR)


# ════════════════════════════════════════════════════════════════════════════
# CRUD Edge Cases
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_get_task_nonexistent():
    """get_task returns None for a non-existent task."""
    task = await get_task("nonexistent-id")
    assert task is None


@pytest.mark.asyncio
async def test_get_task_exists():
    """get_task returns the full task dict."""
    created = await _make_task(title="Find Me")
    fetched = await get_task(created["task_id"])
    assert fetched is not None
    assert fetched["title"] == "Find Me"
    assert fetched["task_id"] == created["task_id"]


@pytest.mark.asyncio
async def test_update_task_fields():
    """update_task modifies non-state fields."""
    task = await _make_task(title="Old Title")
    tid = task["task_id"]
    updated = await update_task(tid, {"title": "New Title", "priority": "high"})
    assert updated["title"] == "New Title"
    assert updated["priority"] == "high"


@pytest.mark.asyncio
async def test_update_task_nonexistent():
    """update_task returns None when task doesn't exist."""
    result = await update_task("no-such-task", {"title": "nope"})
    assert result is None


@pytest.mark.asyncio
async def test_delete_task():
    """delete_task removes the task."""
    task = await _make_task(title="Delete Me")
    tid = task["task_id"]
    assert await get_task(tid) is not None
    assert await delete_task(tid) is True
    assert await get_task(tid) is None


@pytest.mark.asyncio
async def test_delete_nonexistent():
    """delete_task returns False for non-existent task."""
    assert await delete_task("no-such-task") is False


@pytest.mark.asyncio
async def test_list_tasks_filters():
    """list_tasks supports team, assignee, creator, and state filters."""
    await _make_task(team_id=TEAM_A, title="A1", assigned_to=TRAINEE)
    await _make_task(team_id=TEAM_A, title="A2", assigned_to=TRAINEE_2)
    await _make_task(team_id=TEAM_B, title="B1", assigned_to=TRAINEE)

    assert len(await list_tasks(team_id=TEAM_A)) == 2
    assert len(await list_tasks(team_id=TEAM_B)) == 1
    assert len(await list_tasks(assigned_to=TRAINEE)) == 2

    pending = await list_tasks(state="pending")
    assigned = await list_tasks(state="assigned")
    assert len(pending) + len(assigned) == 3  # all tasks are pending or assigned


@pytest.mark.asyncio
async def test_list_tasks_orders_by_created_at():
    """list_tasks returns most recently created first."""
    await _make_task(title="First")
    await _make_task(title="Second")
    await _make_task(title="Third")
    tasks = await list_tasks()
    assert tasks[0]["title"] == "Third"
    assert tasks[1]["title"] == "Second"
    assert tasks[2]["title"] == "First"


@pytest.mark.asyncio
async def test_update_task_updated_at_changes():
    """update_task changes the updated_at timestamp."""
    task = await _make_task()
    tid = task["task_id"]
    original = task["updated_at"]
    updated = await update_task(tid, {"title": "Touched"})
    assert updated["updated_at"] > original


# ════════════════════════════════════════════════════════════════════════════
# Progress Aggregation
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_team_progress_empty():
    """get_team_progress returns zeros for a team with no tasks."""
    prog = await get_team_progress(TEAM_A)
    assert prog["total"] == 0
    assert prog["completed"] == 0
    assert prog["in_progress"] == 0
    assert prog["pending_review"] == 0
    assert prog["blocked"] == 0


@pytest.mark.asyncio
async def test_team_progress_counts():
    """get_team_progress tallies tasks by state correctly."""
    # 2 completed, 1 in_progress, 1 submitted, 1 needs_changes
    c1 = await _make_task(team_id=TEAM_A, title="C1", assigned_to=TRAINEE)
    await start_task(c1["task_id"], TRAINEE)
    await submit_task(c1["task_id"], TRAINEE, "https://github.com/org/repo/pull/1")
    await transition_task(c1["task_id"], "under_review", SENIOR)
    await approve_task(c1["task_id"], SENIOR)
    await complete_task(c1["task_id"], SENIOR)

    c2 = await _make_task(team_id=TEAM_A, title="C2", assigned_to=TRAINEE)
    await start_task(c2["task_id"], TRAINEE)
    await submit_task(c2["task_id"], TRAINEE, "https://github.com/org/repo/pull/2")
    await transition_task(c2["task_id"], "under_review", SENIOR)
    await approve_task(c2["task_id"], SENIOR)
    await complete_task(c2["task_id"], SENIOR)

    ip = await _make_task(team_id=TEAM_A, title="IP", assigned_to=TRAINEE)
    await start_task(ip["task_id"], TRAINEE)

    sr = await _make_task(team_id=TEAM_A, title="SR", assigned_to=TRAINEE)
    await start_task(sr["task_id"], TRAINEE)
    await submit_task(sr["task_id"], TRAINEE, "https://github.com/org/repo/pull/3")

    nc = await _make_task(team_id=TEAM_A, title="NC", assigned_to=TRAINEE)
    await start_task(nc["task_id"], TRAINEE)
    await submit_task(nc["task_id"], TRAINEE, "https://github.com/org/repo/pull/4")
    await request_changes(nc["task_id"], SENIOR, {"fix": "bugs"})

    prog = await get_team_progress(TEAM_A)
    assert prog["total"] == 5
    assert prog["completed"] == 2
    assert prog["in_progress"] == 1
    assert prog["pending_review"] == 1  # submitted (1)
    assert prog["blocked"] == 1  # needs_changes (1)


@pytest.mark.asyncio
async def test_team_progress_isolated():
    """get_team_progress only counts tasks for the requested team."""
    await _make_task(team_id=TEAM_A, title="A")
    await _make_task(team_id=TEAM_B, title="B1")
    await _make_task(team_id=TEAM_B, title="B2")

    assert (await get_team_progress(TEAM_A))["total"] == 1
    assert (await get_team_progress(TEAM_B))["total"] == 2


@pytest.mark.asyncio
async def test_user_progress_empty():
    """get_user_progress returns zeros for a user with no tasks."""
    prog = await get_user_progress(TRAINEE, team_id=TEAM_A)
    assert prog["total"] == 0
    assert prog["completion_rate"] == 0.0
    assert prog["modules_unlocked"] == []


@pytest.mark.asyncio
async def test_user_progress_counts():
    """get_user_progress counts only tasks assigned to the user."""
    await _make_task(team_id=TEAM_A, title="T1", assigned_to=TRAINEE)
    t2 = await _make_task(team_id=TEAM_A, title="T2", assigned_to=TRAINEE)
    await start_task(t2["task_id"], TRAINEE)
    t3 = await _make_task(team_id=TEAM_A, title="T3", assigned_to=TRAINEE)
    await start_task(t3["task_id"], TRAINEE)
    await submit_task(t3["task_id"], TRAINEE, "https://github.com/org/repo/pull/1")
    await transition_task(t3["task_id"], "under_review", SENIOR)
    await approve_task(t3["task_id"], SENIOR)
    await complete_task(t3["task_id"], SENIOR)

    await _make_task(team_id=TEAM_A, title="O1", assigned_to=TRAINEE_2)

    prog = await get_user_progress(TRAINEE, team_id=TEAM_A)
    assert prog["total"] == 3
    assert prog["completed"] == 1
    assert prog["in_progress"] == 1
    assert prog["completion_rate"] == pytest.approx(33.3, abs=0.1)


@pytest.mark.asyncio
async def test_user_progress_modules_unlocked():
    """get_user_progress collects modules_unlocked from completed tasks."""
    m1 = await _make_task(
        team_id=TEAM_A, title="Unlock API",
        assigned_to=TRAINEE, unlock_modules=["api-core", "api-auth"],
    )
    await start_task(m1["task_id"], TRAINEE)
    await submit_task(m1["task_id"], TRAINEE, "https://github.com/org/repo/pull/1")
    await transition_task(m1["task_id"], "under_review", SENIOR)
    await approve_task(m1["task_id"], SENIOR)
    await complete_task(m1["task_id"], SENIOR)

    m2 = await _make_task(
        team_id=TEAM_A, title="Unlock Frontend",
        assigned_to=TRAINEE, unlock_modules=["frontend-auth"],
    )
    await start_task(m2["task_id"], TRAINEE)
    await submit_task(m2["task_id"], TRAINEE, "https://github.com/org/repo/pull/2")
    await transition_task(m2["task_id"], "under_review", SENIOR)
    await approve_task(m2["task_id"], SENIOR)
    await complete_task(m2["task_id"], SENIOR)

    prog = await get_user_progress(TRAINEE, team_id=TEAM_A)
    assert sorted(prog["modules_unlocked"]) == ["api-auth", "api-core", "frontend-auth"]


@pytest.mark.asyncio
async def test_user_progress_skips_non_completed():
    """get_user_progress doesn't count modules from non-completed tasks."""
    t = await _make_task(
        team_id=TEAM_A, title="In Progress",
        assigned_to=TRAINEE, unlock_modules=["not-yet"],
    )
    await start_task(t["task_id"], TRAINEE)

    prog = await get_user_progress(TRAINEE, team_id=TEAM_A)
    assert prog["modules_unlocked"] == []


@pytest.mark.asyncio
async def test_user_progress_isolated_by_team():
    """get_user_progress respects team_id filter."""
    await _make_task(team_id=TEAM_A, title="A", assigned_to=TRAINEE)
    await _make_task(team_id=TEAM_B, title="B", assigned_to=TRAINEE)

    prog_a = await get_user_progress(TRAINEE, team_id=TEAM_A)
    prog_all = await get_user_progress(TRAINEE)

    assert prog_a["total"] == 1
    assert prog_all["total"] == 2


@pytest.mark.asyncio
async def test_pending_review_counts():
    """pending_review aggregates submitted + under_review tasks."""
    s = await _make_task(team_id=TEAM_A, title="Submitted", assigned_to=TRAINEE)
    await start_task(s["task_id"], TRAINEE)
    await submit_task(s["task_id"], TRAINEE, "https://github.com/org/repo/pull/1")

    u = await _make_task(team_id=TEAM_A, title="Under Review", assigned_to=TRAINEE)
    await start_task(u["task_id"], TRAINEE)
    await submit_task(u["task_id"], TRAINEE, "https://github.com/org/repo/pull/2")
    await transition_task(u["task_id"], "under_review", SENIOR)

    prog = await get_team_progress(TEAM_A)
    assert prog["pending_review"] == 2
    assert prog["blocked"] == 0


# ════════════════════════════════════════════════════════════════════════════
# Auto-Grant Modules on Completion
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_complete_grants_modules():
    """completing a task auto-grants unlock_modules to the assignee."""
    task = await _make_task(
        team_id=TEAM_A,
        title="Grant Test",
        assigned_to=TRAINEE,
        unlock_modules=["api-core", "docs"],
    )
    tid = task["task_id"]
    await start_task(tid, TRAINEE)
    await submit_task(tid, TRAINEE, "https://github.com/org/repo/pull/1")
    await transition_task(tid, "under_review", SENIOR)
    await approve_task(tid, SENIOR)
    await complete_task(tid, SENIOR)

    storage = get_storage()
    grants = await storage.query_documents(
        "member_modules",
        [("team_id", "==", TEAM_A), ("user_id", "==", TRAINEE)],
    )
    granted_modules = {g["module"] for g in grants}
    assert "api-core" in granted_modules
    assert "docs" in granted_modules


@pytest.mark.asyncio
async def test_complete_no_modules_skips_grant():
    """completing a task with no unlock_modules doesn't create grants."""
    task = await _make_task(
        team_id=TEAM_A,
        title="No Grant",
        assigned_to=TRAINEE,
        unlock_modules=[],
    )
    tid = task["task_id"]
    await start_task(tid, TRAINEE)
    await submit_task(tid, TRAINEE, "https://github.com/org/repo/pull/1")
    await transition_task(tid, "under_review", SENIOR)
    await approve_task(tid, SENIOR)
    await complete_task(tid, SENIOR)

    storage = get_storage()
    grants = await storage.query_documents(
        "member_modules",
        [("team_id", "==", TEAM_A)],
    )
    assert len(grants) == 0


@pytest.mark.asyncio
async def test_complete_duplicate_grant_skipped():
    """Granting the same module twice via complete is safe (no error)."""
    # Manually pre-grant the module so the auto-grant hits the duplicate path
    from app.services.access_control_service import grant_module_access
    await grant_module_access(TEAM_A, TRAINEE_2, "api-core", SENIOR, "manual")

    task = await _make_task(
        team_id=TEAM_A,
        title="Dup Grant",
        assigned_to=TRAINEE_2,
        unlock_modules=["api-core"],
    )
    tid = task["task_id"]
    await start_task(tid, TRAINEE_2)
    await submit_task(tid, TRAINEE_2, "https://github.com/org/repo/pull/2")
    await transition_task(tid, "under_review", SENIOR)
    await approve_task(tid, SENIOR)
    await complete_task(tid, SENIOR)


# ════════════════════════════════════════════════════════════════════════════
# State Machine Constants
# ════════════════════════════════════════════════════════════════════════════


class TestConstants:
    """Synchronous sanity checks on the state machine definitions."""

    def test_valid_states_are_comprehensive(self):
        """VALID_STATES covers all states in TRANSITIONS and TERMINAL_STATES."""
        from app.services.task_service import VALID_STATES

        all_in_transitions = set(TRANSITIONS.keys())
        all_in_terminals = TERMINAL_STATES
        assert all_in_transitions == VALID_STATES
        assert all_in_terminals.issubset(VALID_STATES)

    def test_transitions_are_symmetric(self):
        """Every 'from' state appears as a key, and targets are valid states."""
        all_states = set(TRANSITIONS.keys())
        for source, targets in TRANSITIONS.items():
            assert targets.issubset(all_states), f"{source} → {targets - all_states} not in valid states"

    def test_no_self_transitions(self):
        """No state should be able to transition to itself."""
        for source, targets in TRANSITIONS.items():
            assert source not in targets, f"{source} can transition to itself"
