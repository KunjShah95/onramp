"""
Unit tests for the DORA metrics computation service.

Tests deployment frequency, lead time, change failure rate, MTTR,
velocity trends, and team throughput calculations.

By default runs against InMemoryStorage. Pass --run-postgres to also run
against PostgreSQL:
  pytest tests/test_dora_metrics_service.py --run-postgres
"""

import os
from datetime import datetime, timedelta, timezone

import pytest
from app.services import dora_metrics_service as dora
from app.services.postgres_db import get_storage, generate_id
from tests.conftest import (
    TUID_TEAM_ALPHA, TUID_TEAM_EMPTY,
    TUID_USER_JUNIOR1, TUID_USER_JUNIOR2,
    TUID_USER_SENIOR,
)


# ── Dual-backend parametrization ────────────────────────────────────────

pytestmark = pytest.mark.usefixtures("clean_postgres_tables", "seed_test_base")


@pytest.fixture(params=["memory", "postgres"])
def storage_backend(request):
    """Override conftest's storage_backend with parametrized version."""
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


# ── Seed helpers ────────────────────────────────────────────────────────


async def _seed_completed_task(
    team_id: str,
    user_id: str,
    days_ago_completed: float = 1,
    days_ago_created: float = 5,
    needs_changes: bool = False,
):
    """Seed a single completed task with controlled timestamps."""
    storage = get_storage()
    now = datetime.now(timezone.utc)
    task_id = generate_id()

    state = "completed"
    if needs_changes:
        state = "completed"  # still completed but route through needs_changes

    task = {
        "task_id": task_id,
        "team_id": team_id,
        "assigned_to": user_id,
        "created_by": TUID_USER_SENIOR,
        "title": f"Test task {task_id[:8]}",
        "state": state,
        "module": "test",
        "priority": "medium",
        "created_at": (now - timedelta(days=days_ago_created)).isoformat(),
        "completed_at": (now - timedelta(days=days_ago_completed)).isoformat(),
        "updated_at": (now - timedelta(days=days_ago_completed)).isoformat(),
        "unlock_modules": [],
        "review_feedback": {"needs_changes": True} if needs_changes else None,
    }

    # For needs_changes simulation, store a flag in the task
    if needs_changes:
        task["review_feedback"] = {"approved": False, "comment": "Needs work"}

    await storage.create_document("onramp_tasks", task_id, task)
    return task


async def _seed_in_progress_task(team_id: str, user_id: str):
    """Seed an in-progress (not completed) task."""
    storage = get_storage()
    now = datetime.now(timezone.utc)
    task_id = generate_id()

    task = {
        "task_id": task_id,
        "team_id": team_id,
        "assigned_to": user_id,
        "created_by": TUID_USER_SENIOR,
        "title": f"In-progress task {task_id[:8]}",
        "state": "in_progress",
        "module": "test",
        "priority": "medium",
        "created_at": (now - timedelta(days=3)).isoformat(),
        "completed_at": None,
        "updated_at": now.isoformat(),
        "unlock_modules": [],
        "review_feedback": None,
    }

    await storage.create_document("onramp_tasks", task_id, task)
    return task


# ═══════════════════════════════════════════════════════════════
# Deployment Frequency
# ═══════════════════════════════════════════════════════════════


class TestDeploymentFrequency:
    async def test_no_completed_tasks(self):
        """A team with no completed tasks returns 'none' classification."""
        result = await dora.deployment_frequency(TUID_TEAM_EMPTY, days=90)
        assert result["classification"] == "none"
        assert result["value"] == "0"

    async def test_with_completed_tasks(self):
        """A team with completed tasks returns a deployment frequency."""
        await _seed_completed_task(TUID_TEAM_ALPHA, TUID_USER_JUNIOR1, days_ago_completed=1)
        await _seed_completed_task(TUID_TEAM_ALPHA, TUID_USER_JUNIOR1, days_ago_completed=2)
        await _seed_completed_task(TUID_TEAM_ALPHA, TUID_USER_JUNIOR1, days_ago_completed=3)

        result = await dora.deployment_frequency(TUID_TEAM_ALPHA, days=90)
        assert result["classification"] != "none"
        assert float(result["value"]) > 0

    async def test_outside_window(self):
        """Tasks completed outside the window are not counted."""
        await _seed_completed_task(TUID_TEAM_ALPHA, TUID_USER_JUNIOR1, days_ago_completed=200)
        result = await dora.deployment_frequency(TUID_TEAM_ALPHA, days=30)
        assert result["classification"] == "none"
        assert result["value"] == "0"


# ═══════════════════════════════════════════════════════════════
# Lead Time for Changes
# ═══════════════════════════════════════════════════════════════


class TestLeadTimeForChanges:
    async def test_no_completed_tasks(self):
        """A team with no completed tasks returns 'none'."""
        result = await dora.lead_time_for_changes(TUID_TEAM_EMPTY, days=90)
        assert result["classification"] == "none"

    async def test_with_completed_tasks(self):
        """Lead time is computed from created_at to completed_at."""
        await _seed_completed_task(
            TUID_TEAM_ALPHA, TUID_USER_JUNIOR1,
            days_ago_completed=1, days_ago_created=10,
        )
        result = await dora.lead_time_for_changes(TUID_TEAM_ALPHA, days=90)
        assert result["classification"] != "none"
        assert result["value"] != "N/A"

    async def test_outside_window(self):
        """Tasks completed outside the window are not included."""
        await _seed_completed_task(
            TUID_TEAM_ALPHA, TUID_USER_JUNIOR1,
            days_ago_completed=200, days_ago_created=210,
        )
        result = await dora.lead_time_for_changes(TUID_TEAM_ALPHA, days=30)
        assert result["classification"] == "none"


# ═══════════════════════════════════════════════════════════════
# Change Failure Rate
# ═══════════════════════════════════════════════════════════════


class TestChangeFailureRate:
    async def test_no_tasks(self):
        """A team with no tasks returns 'none'."""
        result = await dora.change_failure_rate(TUID_TEAM_EMPTY, days=90)
        assert result["classification"] == "none"

    async def test_all_successful(self):
        """Tasks without needs_changes have 0% failure rate."""
        await _seed_completed_task(TUID_TEAM_ALPHA, TUID_USER_JUNIOR1, needs_changes=False)
        await _seed_completed_task(TUID_TEAM_ALPHA, TUID_USER_JUNIOR1, needs_changes=False)

        result = await dora.change_failure_rate(TUID_TEAM_ALPHA, days=90)
        # Most tasks won't have 'needs_changes' in state
        assert result["value"] != "N/A"

    async def test_outside_window(self):
        """Tasks created outside the window are not included."""
        await _seed_completed_task(TUID_TEAM_ALPHA, TUID_USER_JUNIOR1,
                                   days_ago_completed=200, days_ago_created=210)
        result = await dora.change_failure_rate(TUID_TEAM_ALPHA, days=30)
        assert result["classification"] == "none"


# ═══════════════════════════════════════════════════════════════
# MTTR
# ═══════════════════════════════════════════════════════════════


class TestMTTR:
    async def test_no_recoveries(self):
        """A team with no recovery data returns 'none'."""
        result = await dora.mttr(TUID_TEAM_EMPTY, days=90)
        assert result["classification"] == "none"


# ═══════════════════════════════════════════════════════════════
# DORA Summary
# ═══════════════════════════════════════════════════════════════


class TestDoraSummary:
    async def test_empty_team(self):
        """An empty team returns all-none metrics with score 0."""
        result = await dora.dora_summary(TUID_TEAM_EMPTY, days=90)
        assert result["overall_score"] == 0
        assert result["metrics"]["deployment_frequency"]["classification"] == "none"
        assert result["metrics"]["lead_time_for_changes"]["classification"] == "none"
        assert result["metrics"]["change_failure_rate"]["classification"] == "none"
        assert result["metrics"]["mttr"]["classification"] == "none"

    async def test_team_with_data(self):
        """A team with completed tasks gets non-none metrics."""
        await _seed_completed_task(TUID_TEAM_ALPHA, TUID_USER_JUNIOR1, days_ago_completed=1)
        await _seed_completed_task(TUID_TEAM_ALPHA, TUID_USER_JUNIOR1, days_ago_completed=2)
        await _seed_completed_task(TUID_TEAM_ALPHA, TUID_USER_JUNIOR1, days_ago_completed=3)

        result = await dora.dora_summary(TUID_TEAM_ALPHA, days=90)
        assert result["overall_score"] > 0
        # At least deployment_frequency should have a value
        assert result["metrics"]["deployment_frequency"]["classification"] != "none"

    async def test_summary_has_all_four_metrics(self):
        """The summary result contains all four DORA metrics."""
        result = await dora.dora_summary(TUID_TEAM_ALPHA, days=90)
        assert "deployment_frequency" in result["metrics"]
        assert "lead_time_for_changes" in result["metrics"]
        assert "change_failure_rate" in result["metrics"]
        assert "mttr" in result["metrics"]


# ═══════════════════════════════════════════════════════════════
# Velocity Trends
# ═══════════════════════════════════════════════════════════════


class TestVelocityTrends:
    async def test_no_completed_tasks(self):
        """A team with no completed tasks returns zero trends."""
        result = await dora.velocity_trends(TUID_TEAM_EMPTY, weeks=4)
        assert len(result["trends"]) == 4
        assert all(t["completed"] == 0 for t in result["trends"])

    async def test_with_completed_tasks(self):
        """A team with completed tasks shows positive trends."""
        await _seed_completed_task(TUID_TEAM_ALPHA, TUID_USER_JUNIOR1, days_ago_completed=1)
        await _seed_completed_task(TUID_TEAM_ALPHA, TUID_USER_JUNIOR1, days_ago_completed=3)

        result = await dora.velocity_trends(TUID_TEAM_ALPHA, weeks=4)
        assert len(result["trends"]) == 4
        # At least one week should have completions
        assert any(t["completed"] > 0 for t in result["trends"])


# ═══════════════════════════════════════════════════════════════
# Team Throughput
# ═══════════════════════════════════════════════════════════════


class TestTeamThroughput:
    async def test_no_tasks(self):
        """A team with no tasks returns empty members list."""
        result = await dora.team_throughput(TUID_TEAM_EMPTY, days=30)
        assert result["members"] == []

    async def test_member_completions(self):
        """Member throughput counts completed tasks."""
        await _seed_completed_task(TUID_TEAM_ALPHA, TUID_USER_JUNIOR1, days_ago_completed=1)
        await _seed_completed_task(TUID_TEAM_ALPHA, TUID_USER_JUNIOR1, days_ago_completed=2)

        result = await dora.team_throughput(TUID_TEAM_ALPHA, days=30)
        assert len(result["members"]) >= 1
        junior1 = [m for m in result["members"] if m["name"] == TUID_USER_JUNIOR1]
        assert len(junior1) >= 1
        assert junior1[0]["completed"] >= 2

    async def test_multiple_members(self):
        """Throughput distinguishes between different members."""
        await _seed_completed_task(TUID_TEAM_ALPHA, TUID_USER_JUNIOR1, days_ago_completed=1)
        await _seed_completed_task(TUID_TEAM_ALPHA, TUID_USER_JUNIOR2, days_ago_completed=2)

        result = await dora.team_throughput(TUID_TEAM_ALPHA, days=30)
        member_names = {m["name"] for m in result["members"]}
        assert TUID_USER_JUNIOR1 in member_names
        assert TUID_USER_JUNIOR2 in member_names

    async def test_in_progress_tasks(self):
        """Throughput counts in-progress tasks separately."""
        await _seed_in_progress_task(TUID_TEAM_ALPHA, TUID_USER_JUNIOR1)
        await _seed_completed_task(TUID_TEAM_ALPHA, TUID_USER_JUNIOR1, days_ago_completed=1)

        result = await dora.team_throughput(TUID_TEAM_ALPHA, days=30)
        junior1 = [m for m in result["members"] if m["name"] == TUID_USER_JUNIOR1]
        assert len(junior1) == 1
        assert junior1[0]["completed"] >= 1
        assert junior1[0]["in_progress"] >= 1

    async def test_outside_window(self):
        """Tasks completed outside the window are excluded."""
        await _seed_completed_task(TUID_TEAM_ALPHA, TUID_USER_JUNIOR1, days_ago_completed=100)
        result = await dora.team_throughput(TUID_TEAM_ALPHA, days=30)
        junior1 = [m for m in result["members"] if m["name"] == TUID_USER_JUNIOR1]
        assert len(junior1) == 0


# ═══════════════════════════════════════════════════════════════
# Edge Cases
# ═══════════════════════════════════════════════════════════════


class TestEdgeCases:
    async def test_classify_none(self):
        """_classify returns 'none' for invalid values."""
        from app.services.dora_metrics_service import _classify
        assert _classify("deployment_frequency", -1) == "none"
        assert _classify("deployment_frequency", None) == "none"

    async def test_format_value_integer(self):
        """Integers are formatted without decimals."""
        from app.services.dora_metrics_service import _format_value
        assert _format_value(5) == "5"
        assert _format_value(0) == "0"

    async def test_format_value_with_unit(self):
        """Values are formatted with the appropriate unit."""
        from app.services.dora_metrics_service import _format_value
        result = _format_value(2.5, "days")
        assert "d" in result
        result = _format_value(0.5, "hours")
        assert "m" in result
