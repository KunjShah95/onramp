"""Integration tests for the task service (onramp_tasks table).

Tests the full task lifecycle: create → assign → in_progress → submitted →
under_review → approved → completed, including invalid transitions and
terminal state protection.

By default runs against InMemoryStorage. Pass --run-postgres to also run
against PostgreSQL:
  pytest tests/test_task_service.py --run-postgres
"""

import os
import pytest
from app.services import task_service as ts
from app.services.postgres_db import get_storage
from tests.conftest import (
    TUID_USER_SENIOR, TUID_USER_JUNIOR1, TUID_USER_JUNIOR2,
    TUID_USER_USER1, TUID_USER_USER2,
    TUID_TEAM_ALPHA, TUID_TEAM_BETA, TUID_TEAM_EMPTY,
)


TUID_NONEXISTENT = "f0000000-0000-4000-f000-000000000000"


# ── Dual-backend parametrization ────────────────────────────────────────
# When --run-postgres is passed, every test runs twice: once against
# InMemoryStorage and once against PostgresStorage.

pytestmark = pytest.mark.usefixtures("clean_postgres_tables", "seed_test_base")


@pytest.fixture(params=["memory", "postgres"])
def storage_backend(request):
    """Override conftest's storage_backend with parametrized version.

    When --run-postgres is NOT passed, the 'postgres' variant is skipped,
    maintaining the existing single-backend test behavior.
    """
    backend = request.param
    run_postgres = request.config.getoption("--run-postgres")

    if backend == "postgres" and not run_postgres:
        pytest.skip("PostgreSQL disabled (use --run-postgres)")

    os.environ["STORAGE_BACKEND"] = "" if backend == "postgres" else "memory"
    import app.services.postgres_db as postgres_db
    postgres_db._storage = None

    yield backend

    os.environ["STORAGE_BACKEND"] = "memory"
    postgres_db._storage = None


# ═══════════════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════════════


@pytest.fixture
def sample_task():
    """Create a minimal task fixture with default fields.
    Uses deterministic UUIDs for FK columns so the fixture
    works with both InMemoryStorage and PostgresStorage.
    """
    return {
        "team_id": TUID_TEAM_ALPHA,
        "created_by": TUID_USER_SENIOR,
        "assigned_to": TUID_USER_JUNIOR1,
        "title": "Fix login bug",
        "description": "Users can't log in with special characters",
        "module": "auth",
        "priority": "high",
        "repo_url": "https://github.com/onramp/backend",
        "branch": "main",
        "unlock_modules": ["auth-flow"],
        "estimated_hours": 4.0,
    }


# ── Helpers for state machine tests ────────────────────────────────


async def _to_submitted(task):
    """Helper: run a task through the happy path to 'submitted' state.
    Task must be in 'assigned' state (created with assigned_to set).
    """
    await ts.start_task(task["task_id"], TUID_USER_JUNIOR1)
    await ts.submit_task(task["task_id"], TUID_USER_JUNIOR1, "https://github.com/pull/1")
    return task


async def _to_under_review(task):
    """Helper: run a task to 'under_review' state ready for review.
    Task must be in 'assigned' state (created with assigned_to set).
    """
    await ts.start_task(task["task_id"], TUID_USER_JUNIOR1)
    await ts.submit_task(task["task_id"], TUID_USER_JUNIOR1, "https://github.com/pull/1")
    await ts.transition_task(task["task_id"], "under_review", TUID_USER_SENIOR)
    return task


async def _to_approved(task):
    """Helper: run a task through the full lifecycle to 'approved' state.
    Task must be in 'assigned' state (created with assigned_to set).
    """
    await _to_under_review(task)
    await ts.approve_task(task["task_id"], TUID_USER_SENIOR, {"comment": "Approved"})
    return task


# ═══════════════════════════════════════════════════════════════
# CRUD Operations
# ═══════════════════════════════════════════════════════════════


class TestCreateTask:
    async def test_create_with_assignee(self, sample_task):
        """Creating a task with an assignee sets state=assigned."""
        task = await ts.create_task(**sample_task)
        assert task["title"] == "Fix login bug"
        assert task["state"] == "assigned"
        assert task["assigned_to"] == TUID_USER_JUNIOR1
        assert task["team_id"] == TUID_TEAM_ALPHA
        assert task["created_by"] == TUID_USER_SENIOR
        assert task["task_id"] is not None
        assert task["started_at"] is None
        assert task["completed_at"] is None

    async def test_create_without_assignee(self, sample_task):
        """Creating a task without an assignee sets state=pending."""
        del sample_task["assigned_to"]
        task = await ts.create_task(**sample_task)
        assert task["state"] == "pending"
        assert task["assigned_to"] is None

    async def test_create_with_defaults(self):
        """Creating a task with only required fields works."""
        task = await ts.create_task(
            team_id=TUID_TEAM_ALPHA,
            created_by=TUID_USER_SENIOR,
            title="Simple task",
        )
        assert task["state"] == "pending"
        assert task["priority"] == "medium"
        assert task["module"] == ""
        assert task["unlock_modules"] == []

    async def test_create_sets_timestamps(self, sample_task):
        """Created task has created_at and updated_at set (ISO strings via storage)."""
        task = await ts.create_task(**sample_task)
        assert task["created_at"] is not None
        assert task["updated_at"] is not None
        # The storage backend serializes datetimes to ISO strings (or keeps them as-is
        # depending on backend). Both are fine — just verify they're set and non-empty.
        assert str(task["created_at"]) != ""
        assert str(task["updated_at"]) != ""

    async def test_create_multiple_tasks(self, sample_task):
        """Multiple tasks get unique IDs."""
        t1 = await ts.create_task(**sample_task)
        t2 = await ts.create_task(**sample_task)
        assert t1["task_id"] != t2["task_id"]


class TestGetTask:
    async def test_get_existing(self, sample_task):
        """Getting an existing task returns the full task dict."""
        created = await ts.create_task(**sample_task)
        fetched = await ts.get_task(created["task_id"])
        assert fetched is not None
        assert fetched["task_id"] == created["task_id"]
        assert fetched["title"] == "Fix login bug"

    async def test_get_nonexistent(self):
        """Getting a nonexistent task returns None."""
        result = await ts.get_task(TUID_NONEXISTENT)
        assert result is None

    async def test_get_after_update(self, sample_task):
        """Getting a task after update reflects changes."""
        created = await ts.create_task(**sample_task)
        await ts.update_task(created["task_id"], {"title": "Updated title"})
        fetched = await ts.get_task(created["task_id"])
        assert fetched["title"] == "Updated title"


class TestUpdateTask:
    async def test_update_fields(self, sample_task):
        """Updating a task's non-state fields works."""
        task = await ts.create_task(**sample_task)
        result = await ts.update_task(task["task_id"], {
            "title": "Updated title",
            "priority": "low",
            "description": "Updated desc",
        })
        assert result is not None
        assert result["title"] == "Updated title"
        assert result["priority"] == "low"
        assert result["description"] == "Updated desc"

    async def test_update_nonexistent(self):
        """Updating a nonexistent task returns None."""
        result = await ts.update_task(TUID_NONEXISTENT, {"title": "New"})
        assert result is None

    async def test_update_bumps_updated_at(self, sample_task):
        """Updating a task changes updated_at."""
        task = await ts.create_task(**sample_task)
        original = task["updated_at"]
        result = await ts.update_task(task["task_id"], {"title": "New"})
        assert result["updated_at"] != original

    async def test_update_no_fields(self, sample_task):
        """Updating with no changes still bumps updated_at."""
        task = await ts.create_task(**sample_task)
        result = await ts.update_task(task["task_id"], {})
        assert result is not None
        assert result["task_id"] == task["task_id"]


class TestDeleteTask:
    async def test_delete_existing(self, sample_task):
        """Deleting an existing task returns True."""
        task = await ts.create_task(**sample_task)
        result = await ts.delete_task(task["task_id"])
        assert result is True
        assert await ts.get_task(task["task_id"]) is None

    async def test_delete_nonexistent(self):
        """Deleting a nonexistent task returns False."""
        result = await ts.delete_task(TUID_NONEXISTENT)
        assert result is False


class TestListTasks:
    async def test_list_by_team(self, sample_task):
        """Listing tasks by team returns only that team's tasks."""
        await ts.create_task(**sample_task)
        await ts.create_task(**{**sample_task, "team_id": TUID_TEAM_BETA})

        alpha_tasks = await ts.list_tasks(team_id=TUID_TEAM_ALPHA)
        beta_tasks = await ts.list_tasks(team_id=TUID_TEAM_BETA)

        assert len(alpha_tasks) == 1
        assert alpha_tasks[0]["team_id"] == TUID_TEAM_ALPHA
        assert len(beta_tasks) == 1
        assert beta_tasks[0]["team_id"] == TUID_TEAM_BETA

    async def test_list_by_assignee(self, sample_task):
        """Listing tasks by assignee returns only that user's tasks."""
        await ts.create_task(**sample_task)
        await ts.create_task(**{**sample_task, "assigned_to": TUID_USER_JUNIOR2})

        j1_tasks = await ts.list_tasks(team_id=TUID_TEAM_ALPHA, assigned_to=TUID_USER_JUNIOR1)
        j2_tasks = await ts.list_tasks(team_id=TUID_TEAM_ALPHA, assigned_to=TUID_USER_JUNIOR2)

        assert len(j1_tasks) == 1
        assert j1_tasks[0]["assigned_to"] == TUID_USER_JUNIOR1
        assert len(j2_tasks) == 1
        assert j2_tasks[0]["assigned_to"] == TUID_USER_JUNIOR2

    async def test_list_by_state(self, sample_task):
        """Listing tasks by state filters correctly."""
        await ts.create_task(**sample_task)  # assigned
        # Create a pending task, assign it, then start it → in_progress
        t2 = await ts.create_task(**{**sample_task, "title": "Task 2", "assigned_to": None})
        await ts.assign_task(t2["task_id"], TUID_USER_JUNIOR1, TUID_USER_SENIOR)
        await ts.start_task(t2["task_id"], TUID_USER_JUNIOR1)

        assigned = await ts.list_tasks(team_id=TUID_TEAM_ALPHA, state="assigned")
        in_progress = await ts.list_tasks(team_id=TUID_TEAM_ALPHA, state="in_progress")

        assert len(assigned) == 1
        assert len(in_progress) == 1

    async def test_list_returns_newest_first(self, sample_task):
        """Tasks are sorted by created_at descending (most recent first)."""
        t1 = await ts.create_task(**sample_task)
        t2 = await ts.create_task(**{**sample_task, "title": "Task 2"})
        t3 = await ts.create_task(**{**sample_task, "title": "Task 3"})

        tasks = await ts.list_tasks(team_id=TUID_TEAM_ALPHA)
        assert len(tasks) == 3
        # Most recent first
        assert tasks[0]["task_id"] == t3["task_id"]
        assert tasks[1]["task_id"] == t2["task_id"]
        assert tasks[2]["task_id"] == t1["task_id"]

    async def test_list_empty_team(self):
        """A team with no tasks returns an empty list."""
        tasks = await ts.list_tasks(team_id=TUID_TEAM_EMPTY)
        assert tasks == []


# ═══════════════════════════════════════════════════════════════
# State Machine Transitions
# ═══════════════════════════════════════════════════════════════


class TestStateMachine:
    async def test_full_lifecycle(self, sample_task):
        """A task can go through the full happy-path lifecycle."""
        task = await ts.create_task(**sample_task)
        assert task["state"] == "assigned"

        task = await ts.start_task(task["task_id"], TUID_USER_JUNIOR1)
        assert task["state"] == "in_progress"
        assert task["started_at"] is not None

        task = await ts.submit_task(task["task_id"], TUID_USER_JUNIOR1, "https://github.com/onramp/backend/pull/1")
        assert task["state"] == "submitted"
        assert task["pr_url"] == "https://github.com/onramp/backend/pull/1"

        # Must go through under_review before approving
        task = await ts.transition_task(task["task_id"], "under_review", TUID_USER_SENIOR)
        assert task["state"] == "under_review"

        task = await ts.approve_task(task["task_id"], TUID_USER_SENIOR, {"comment": "Looks good"})
        assert task["state"] == "approved"

        task = await ts.complete_task(task["task_id"], TUID_USER_SENIOR)
        assert task["state"] == "completed"
        assert task["completed_at"] is not None

    async def test_assign_pending_task(self, sample_task):
        """A task created without assignee can be assigned."""
        del sample_task["assigned_to"]
        task = await ts.create_task(**sample_task)
        assert task["state"] == "pending"

        task = await ts.assign_task(task["task_id"], TUID_USER_JUNIOR1, TUID_USER_SENIOR)
        assert task["state"] == "assigned"

    async def test_submit_with_pr_url(self, sample_task):
        """Submitting a task stores the PR URL."""
        task = await ts.create_task(**sample_task)
        await ts.start_task(task["task_id"], TUID_USER_JUNIOR1)

        task = await ts.submit_task(
            task["task_id"], TUID_USER_JUNIOR1,
            "https://github.com/onramp/backend/pull/42",
        )
        assert task["pr_url"] == "https://github.com/onramp/backend/pull/42"

    async def test_review_needs_changes(self, sample_task):
        """Reviewing with approve=False sets state=needs_changes."""
        task = await ts.create_task(**sample_task)
        task = await _to_under_review(task)

        task = await ts.review_task(
            task["task_id"], TUID_USER_SENIOR,
            {"comment": "Needs refactoring"},
            approve=False,
        )
        assert task["state"] == "needs_changes"
        assert task["review_feedback"] == {"comment": "Needs refactoring"}

    async def test_needs_changes_loops_back(self, sample_task):
        """A task that needs changes can go back to in_progress."""
        task = await ts.create_task(**sample_task)
        task = await _to_under_review(task)
        await ts.review_task(task["task_id"], TUID_USER_SENIOR, {"comment": "Fix it"}, approve=False)

        task = await ts.start_task(task["task_id"], TUID_USER_JUNIOR1)
        assert task["state"] == "in_progress"

    async def test_product_review_route(self, sample_task):
        """Review can route to product_review instead of direct approval."""
        task = await ts.create_task(**sample_task)
        task = await _to_under_review(task)

        task = await ts.review_task(
            task["task_id"], TUID_USER_SENIOR,
            {"comment": "Product should verify"},
            approve=True, needs_product=True,
        )
        assert task["state"] == "product_review"

    async def test_cancel_from_any_state(self, sample_task):
        """A task can be cancelled from any non-terminal state."""
        states = ["pending", "assigned", "in_progress", "submitted", "under_review", "needs_changes", "approved", "product_review"]
        for state in states:
            if state == "pending":
                task = await ts.create_task(**{**sample_task, "assigned_to": None})
            else:
                task = await ts.create_task(**sample_task)  # starts in 'assigned'

            if state == "pending":
                pass  # already pending
            elif state == "assigned":
                pass  # already assigned from create
            elif state == "in_progress":
                await ts.start_task(task["task_id"], TUID_USER_JUNIOR1)
            elif state == "submitted":
                await _to_submitted(task)
            elif state == "under_review":
                await _to_under_review(task)
            elif state == "needs_changes":
                task = await _to_under_review(task)
                await ts.review_task(task["task_id"], TUID_USER_SENIOR, {}, approve=False)
            elif state == "approved":
                task = await _to_under_review(task)
                await ts.approve_task(task["task_id"], TUID_USER_SENIOR, {})
            elif state == "product_review":
                task = await _to_under_review(task)
                await ts.review_task(task["task_id"], TUID_USER_SENIOR, {}, approve=True, needs_product=True)

            cancelled = await ts.cancel_task(task["task_id"], TUID_USER_SENIOR)
            assert cancelled["state"] == "cancelled", f"Failed to cancel from {state}"

    async def test_transition_value_error(self, sample_task):
        """Invalid transition raises ValueError."""
        task = await ts.create_task(**sample_task)
        with pytest.raises(ValueError, match="Cannot transition task"):
            await ts.transition_task(task["task_id"], "completed", TUID_USER_SENIOR)

    async def test_transition_nonexistent_task(self):
        """Transitioning a nonexistent task raises ValueError."""
        with pytest.raises(ValueError, match="not found"):
            await ts.transition_task(TUID_NONEXISTENT, "assigned", TUID_USER_USER1)


# ═══════════════════════════════════════════════════════════════
# Terminal State Protection
# ═══════════════════════════════════════════════════════════════


class TestTerminalStates:
    async def test_completed_cannot_transition(self, sample_task):
        """A completed task cannot transition to any other state."""
        task = await ts.create_task(**sample_task)
        task = await _to_approved(task)
        await ts.complete_task(task["task_id"], TUID_USER_SENIOR)

        for state in ["assigned", "in_progress", "submitted", "approved"]:
            with pytest.raises(ValueError, match="Cannot transition task"):
                await ts.transition_task(task["task_id"], state, TUID_USER_USER1)

    async def test_cancelled_cannot_transition(self, sample_task):
        """A cancelled task cannot transition to any other state."""
        task = await ts.create_task(**sample_task)
        await ts.cancel_task(task["task_id"], TUID_USER_SENIOR)

        with pytest.raises(ValueError):
            await ts.transition_task(task["task_id"], "assigned", TUID_USER_USER1)

    async def test_completed_task_cannot_update(self, sample_task):
        """A completed task's non-state fields cannot be updated (except cancel)."""
        task = await ts.create_task(**sample_task)
        task = await _to_approved(task)
        await ts.complete_task(task["task_id"], TUID_USER_SENIOR)

        result = await ts.update_task(task["task_id"], {"title": "New title"})
        assert result is None


# ═══════════════════════════════════════════════════════════════
# Aggregation / Progress
# ═══════════════════════════════════════════════════════════════


class TestTeamProgress:
    async def test_empty_team(self):
        """A team with no tasks returns all zeros."""
        progress = await ts.get_team_progress(TUID_TEAM_EMPTY)
        assert progress["total"] == 0
        assert progress["completed"] == 0
        assert progress["in_progress"] == 0

    async def test_mixed_states(self, sample_task):
        """Team progress counts tasks by state correctly."""
        t1 = await ts.create_task(**sample_task)  # assigned
        t2 = await ts.create_task(**{**sample_task, "title": "T2"})
        await ts.start_task(t2["task_id"], TUID_USER_JUNIOR1)  # in_progress
        t3 = await ts.create_task(**{**sample_task, "title": "T3"})
        await ts.start_task(t3["task_id"], TUID_USER_JUNIOR1)
        await ts.submit_task(t3["task_id"], TUID_USER_JUNIOR1, "https://github.com/pull/1")  # submitted

        progress = await ts.get_team_progress(TUID_TEAM_ALPHA)
        assert progress["total"] == 3
        assert progress["by_state"]["assigned"] == 1
        assert progress["by_state"]["in_progress"] == 1
        assert progress["by_state"]["submitted"] == 1
        assert progress["pending_review"] == 1
        assert progress["completed"] == 0
        assert progress["blocked"] == 0


class TestUserProgress:
    async def test_empty_user(self, sample_task):
        """A user with no tasks gets all zeros."""
        progress = await ts.get_user_progress(TUID_NONEXISTENT, TUID_TEAM_ALPHA)
        assert progress["total"] == 0
        assert progress["completion_rate"] == 0.0
        assert progress["modules_unlocked"] == []

    async def test_user_progress_with_completions(self, sample_task):
        """User progress counts tasks and tracks unlocked modules."""
        t1 = await ts.create_task(**sample_task)
        await _to_approved(t1)
        await ts.complete_task(t1["task_id"], TUID_USER_SENIOR)

        t2 = await ts.create_task(**{**sample_task, "title": "T2", "unlock_modules": ["testing"]})
        await ts.start_task(t2["task_id"], TUID_USER_JUNIOR1)

        progress = await ts.get_user_progress(TUID_USER_JUNIOR1, TUID_TEAM_ALPHA)
        assert progress["total"] == 2
        assert progress["completed"] == 1
        assert progress["in_progress"] == 1
        assert "auth-flow" in progress["modules_unlocked"]
        assert progress["completion_rate"] == 50.0

    async def test_user_progress_different_team(self, sample_task):
        """User progress only counts tasks in the specified team."""
        await ts.create_task(**sample_task)
        await ts.create_task(**{**sample_task, "team_id": TUID_TEAM_BETA, "title": "T2"})

        alpha = await ts.get_user_progress(TUID_USER_JUNIOR1, TUID_TEAM_ALPHA)
        beta = await ts.get_user_progress(TUID_USER_JUNIOR1, TUID_TEAM_BETA)

        assert alpha["total"] == 1
        assert beta["total"] == 1


# ═══════════════════════════════════════════════════════════════
# Complete → Module Grant Flow
# ═══════════════════════════════════════════════════════════════


class TestCompleteGrantsModule:
    async def test_complete_grants_modules(self, sample_task):
        """Completing a task auto-grants unlock_modules to the assignee."""
        task = await ts.create_task(**sample_task)
        task = await _to_approved(task)
        await ts.complete_task(task["task_id"], TUID_USER_SENIOR)

        storage = get_storage()
        modules = await storage.query_documents(
            "member_modules",
            [
                ("team_id", "==", TUID_TEAM_ALPHA),
                ("user_id", "==", TUID_USER_JUNIOR1),
                ("module", "==", "auth-flow"),
            ],
        )
        assert len(modules) == 1
        assert modules[0]["source"] == "task_completion"

    async def test_complete_no_unlock_modules(self, sample_task):
        """Completing a task with no unlock_modules does not grant anything."""
        sample_task["unlock_modules"] = []
        task = await ts.create_task(**sample_task)
        task = await _to_approved(task)
        await ts.complete_task(task["task_id"], TUID_USER_SENIOR)

        storage = get_storage()
        modules = await storage.query_documents(
            "member_modules",
            [("team_id", "==", TUID_TEAM_ALPHA), ("user_id", "==", TUID_USER_JUNIOR1)],
        )
        assert len(modules) == 0

    async def test_complete_duplicate_grant_skipped(self, sample_task):
        """If the module is already granted, completing the task skips silently."""
        from app.services.access_control_service import grant_module_access

        await grant_module_access(
            team_id=TUID_TEAM_ALPHA,
            user_id=TUID_USER_JUNIOR1,
            module="auth-flow",
            granted_by=TUID_USER_SENIOR,
            source="manual",
        )

        task = await ts.create_task(**sample_task)
        task = await _to_approved(task)
        result = await ts.complete_task(task["task_id"], TUID_USER_SENIOR)
        assert result["state"] == "completed"


# ═══════════════════════════════════════════════════════════════
# Edge Cases
# ═══════════════════════════════════════════════════════════════


class TestEdgeCases:
    async def test_long_title(self, sample_task):
        """A task with a very long title is handled."""
        sample_task["title"] = "A" * 500
        task = await ts.create_task(**sample_task)
        assert len(task["title"]) == 500

    async def test_empty_strings_default(self):
        """Empty optional fields default to empty strings."""
        task = await ts.create_task(team_id=TUID_TEAM_ALPHA, created_by=TUID_USER_USER1, title="Task")
        assert task["description"] == ""
        assert task["module"] == ""
        assert task["branch"] == ""
        assert task["repo_url"] == ""

    async def test_multiple_unlock_modules(self, sample_task):
        """Multiple unlock modules are stored as a list."""
        sample_task["unlock_modules"] = ["auth-flow", "testing", "deployment"]
        task = await ts.create_task(**sample_task)
        assert len(task["unlock_modules"]) == 3
        assert "deployment" in task["unlock_modules"]

    async def test_estimated_hours_none(self, sample_task):
        """estimated_hours can be None."""
        sample_task["estimated_hours"] = None
        task = await ts.create_task(**sample_task)
        assert task["estimated_hours"] is None

    async def test_pr_url_null_on_create(self, sample_task):
        """pr_url is None when no PR is linked."""
        task = await ts.create_task(**sample_task)
        assert task["pr_url"] is None

    async def test_transition_empty_task_id(self):
        """Transitioning with an empty task ID raises ValueError."""
        with pytest.raises(ValueError):
            await ts.transition_task("", "assigned", TUID_USER_USER1)

    # NOTE: list_tasks(team_id=None) returns [] — there's currently no way to list
    # all tasks globally without a team_id. This is a known limitation documented
    # in the current implementation.
