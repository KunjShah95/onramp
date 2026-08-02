"""Tests for the second-wave feature batch (sessions, DORA, deps, alerts).

Covers:
- Task dependencies (depends_on DAG, start_task blocking)
- PR URL validation on submit + PR-merged auto-complete (webhook)
- Task lookup by PR URL (get_task_by_pr_url)
- Session refresh rotation (refresh token store/validate/revoke)
- Time-overrun alert (log_actual_hours > estimated)
- Stale task sweep (needs_changes > 48h, submitted > 24h)
- Review analytics (rework rate, turnaround, reviewer load)
- Milestone roadmap DAG (get_roadmap statuses)
- DORA metrics service (summary, velocity, throughput)

Runs against InMemoryStorage by default (STORAGE_BACKEND=memory from conftest).
"""

import os
import pytest
from datetime import datetime, timedelta, timezone

from app.services.postgres_db import get_storage
from tests.conftest import (
    TUID_USER_SENIOR, TUID_USER_JUNIOR1, TUID_USER_JUNIOR2,
    TUID_TEAM_ALPHA,
)


def _task_kwargs(**overrides):
    base = {
        "team_id": TUID_TEAM_ALPHA,
        "created_by": TUID_USER_SENIOR,
        "assigned_to": TUID_USER_JUNIOR1,
        "title": "Wave-2 task",
        "module": "auth",
        "repo_url": "https://github.com/onramp/backend",
        "estimated_hours": 4.0,
    }
    base.update(overrides)
    return base


async def _to_submitted(task, pr_url="https://github.com/onramp/backend/pull/7"):
    from app.services import task_service as ts
    await ts.start_task(task["task_id"], TUID_USER_JUNIOR1)
    await ts.submit_task(task["task_id"], TUID_USER_JUNIOR1, pr_url)
    return task


async def _force_state(task_id: str, state: str, **extra) -> None:
    """Bypass the state machine by writing storage directly (test helper)."""
    storage = get_storage()
    await storage.update_document("onramp_tasks", task_id, {"state": state, **extra})


# ═══════════════════════════════════════════════════════════════
# Task dependencies
# ═══════════════════════════════════════════════════════════════


class TestTaskDependencies:
    async def test_create_task_with_depends_on(self):
        from app.services import task_service as ts
        task = await ts.create_task(**_task_kwargs(depends_on=["task-1", "task-2"]))
        assert task["depends_on"] == ["task-1", "task-2"]

    async def test_start_task_blocked_by_unfinished_dependency(self):
        from app.services import task_service as ts
        dep = await ts.create_task(**_task_kwargs(title="Prereq"))
        task = await ts.create_task(**_task_kwargs(title="Dependent", depends_on=[dep["task_id"]]))
        with pytest.raises(ValueError, match="(?i)prerequisite|not completed"):
            await ts.start_task(task["task_id"], TUID_USER_JUNIOR1)

    async def test_start_task_allowed_when_dependency_completed(self):
        from app.services import task_service as ts
        dep = await ts.create_task(**_task_kwargs(title="Prereq done"))
        task = await ts.create_task(**_task_kwargs(title="Dependent ok", depends_on=[dep["task_id"]]))
        await _force_state(dep["task_id"], "completed", completed_at=datetime.now(timezone.utc))
        started = await ts.start_task(task["task_id"], TUID_USER_JUNIOR1)
        assert started["state"] == "in_progress"

    async def test_dependency_not_blocking_without_depends_on(self):
        from app.services import task_service as ts
        task = await ts.create_task(**_task_kwargs())
        started = await ts.start_task(task["task_id"], TUID_USER_JUNIOR1)
        assert started["state"] == "in_progress"


# ═══════════════════════════════════════════════════════════════
# PR URL validation + PR-merged auto-complete
# ═══════════════════════════════════════════════════════════════


class TestPRUrlAndMerge:
    async def test_submit_rejects_non_github_url(self):
        from app.services import task_service as ts
        task = await ts.create_task(**_task_kwargs())
        await ts.start_task(task["task_id"], TUID_USER_JUNIOR1)
        with pytest.raises(ValueError, match="valid GitHub pull request URL"):
            await ts.submit_task(task["task_id"], TUID_USER_JUNIOR1, "https://example.com/not-a-pr")

    async def test_submit_accepts_github_pull_url(self):
        from app.services import task_service as ts
        task = await ts.create_task(**_task_kwargs())
        await ts.start_task(task["task_id"], TUID_USER_JUNIOR1)
        submitted = await ts.submit_task(task["task_id"], TUID_USER_JUNIOR1, "https://github.com/onramp/backend/pull/42")
        assert submitted["state"] == "submitted"
        assert submitted["pr_url"] == "https://github.com/onramp/backend/pull/42"

    async def test_get_task_by_pr_url_finds_task(self):
        from app.services import task_service as ts
        task = await ts.create_task(**_task_kwargs())
        await _to_submitted(task, pr_url="https://github.com/onramp/backend/pull/9")
        found = await ts.get_task_by_pr_url("https://github.com/onramp/backend/pull/9")
        assert found is not None
        assert found["task_id"] == task["task_id"]

    async def test_get_task_by_pr_url_returns_none_when_missing(self):
        from app.services import task_service as ts
        found = await ts.get_task_by_pr_url("https://github.com/onramp/backend/pull/99999")
        assert found is None

    async def test_pr_merged_autocompletes_linked_task(self):
        from app.api.v1.webhook_handler import _handle_pr_merged
        from app.services import task_service as ts
        task = await ts.create_task(**_task_kwargs())
        await _to_submitted(task, pr_url="https://github.com/onramp/backend/pull/10")
        result = await _handle_pr_merged({
            "pull_request": {
                "number": 10,
                "html_url": "https://github.com/onramp/backend/pull/10",
                "merged_by": {"login": "gh-bot"},
            },
            "sender": {"login": "gh-bot"},
        })
        assert result["handled"] is True
        assert result["task_completed"] is True
        stored = await ts.get_task(task["task_id"])
        assert stored["state"] == "completed"

    async def test_pr_merged_with_no_linked_task_is_graceful(self):
        from app.api.v1.webhook_handler import _handle_pr_merged
        result = await _handle_pr_merged({
            "pull_request": {
                "number": 11,
                "html_url": "https://github.com/onramp/backend/pull/11",
            },
            "sender": {},
        })
        assert result["handled"] is True
        assert result["task_completed"] is False


# ═══════════════════════════════════════════════════════════════
# Session refresh rotation (server-side store)
# ═══════════════════════════════════════════════════════════════


class TestRefreshRotation:
    async def test_store_and_validate_refresh_token(self):
        from app.api.v1 import auth as auth_mod
        token = auth_mod._generate_refresh_token()
        assert len(token) >= 32
        stored = await auth_mod._store_refresh_token(TUID_USER_JUNIOR1, token, remember_me=True)
        assert stored["token_hash"] == auth_mod._hash_refresh_token(token)
        record = await auth_mod._validate_refresh_token(token)
        assert record is not None
        assert record["user_id"] == TUID_USER_JUNIOR1

    async def test_revoked_refresh_token_invalid(self):
        from app.api.v1 import auth as auth_mod
        token = auth_mod._generate_refresh_token()
        await auth_mod._store_refresh_token(TUID_USER_JUNIOR1, token, remember_me=True)
        await auth_mod._revoke_refresh_token(token)
        assert await auth_mod._validate_refresh_token(token) is None

    async def test_rotation_revokes_previous_token(self):
        from app.api.v1 import auth as auth_mod
        first = auth_mod._generate_refresh_token()
        await auth_mod._store_refresh_token(TUID_USER_JUNIOR1, first, remember_me=True)
        # A second token for the same user revokes the first (single active session).
        second = auth_mod._generate_refresh_token()
        await auth_mod._store_refresh_token(TUID_USER_JUNIOR1, second, remember_me=True)
        assert await auth_mod._validate_refresh_token(first) is None
        assert await auth_mod._validate_refresh_token(second) is not None

    async def test_unknown_refresh_token_invalid(self):
        from app.api.v1 import auth as auth_mod
        assert await auth_mod._validate_refresh_token("definitely-not-a-real-token") is None


# ═══════════════════════════════════════════════════════════════
# Time-overrun alert
# ═══════════════════════════════════════════════════════════════


class TestTimeOverrunAlert:
    async def test_logging_overrun_creates_notification(self):
        from app.services import task_service as ts
        from app.services.notification_service import COLLECTION
        storage = get_storage()
        task = await ts.create_task(**_task_kwargs(estimated_hours=4.0))
        await ts.log_actual_hours(task["task_id"], 6.5, TUID_USER_JUNIOR1)
        notifs = await storage.query_documents(COLLECTION, [("type", "==", "task_time_overrun")])
        assert len(notifs) >= 1
        assert "6.5" in str(notifs[0].get("full_message", "")) or "6.5" in str(notifs[0].get("message", ""))

    async def test_logging_within_estimate_no_alert(self):
        from app.services import task_service as ts
        from app.services.notification_service import COLLECTION
        storage = get_storage()
        task = await ts.create_task(**_task_kwargs(estimated_hours=4.0))
        await ts.log_actual_hours(task["task_id"], 3.0, TUID_USER_JUNIOR1)
        notifs = await storage.query_documents(COLLECTION, [("type", "==", "task_time_overrun")])
        assert len(notifs) == 0


# ═══════════════════════════════════════════════════════════════
# Stale task sweep
# ═══════════════════════════════════════════════════════════════


class TestStaleSweep:
    async def _seed_stale_task(self, task_id: str, state: str, hours: float) -> None:
        """Seed a task directly with an old updated_at.

        task_service.create_task always sets updated_at=now, and
        InMemoryStorage.update_document also forces updated_at=now, so a raw
        create with an old timestamp is required to simulate staleness.
        """
        storage = get_storage()
        old = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
        await storage.create_document("onramp_tasks", task_id, {
            "task_id": task_id,
            "team_id": TUID_TEAM_ALPHA,
            "created_by": TUID_USER_SENIOR,
            "assigned_to": TUID_USER_JUNIOR1,
            "title": f"Stale {state} task",
            "state": state,
            "priority": "medium",
            "created_at": old,
            "updated_at": old,
        })

    async def test_needs_changes_over_48h_alerts(self):
        from app.tasks.notification_tasks import sweep_stale_tasks
        await self._seed_stale_task("f0000000-0000-4000-a000-00000000b001", "needs_changes", 60)
        result = await sweep_stale_tasks()
        assert result["notifications_sent"] >= 1
        assert any(a["state"] == "needs_changes" for a in result["alerts"])

    async def test_submitted_over_24h_alerts_senior(self):
        from app.tasks.notification_tasks import sweep_stale_tasks
        await self._seed_stale_task("f0000000-0000-4000-a000-00000000b002", "submitted", 30)
        result = await sweep_stale_tasks()
        assert result["notifications_sent"] >= 1
        assert any(a["state"] == "submitted" for a in result["alerts"])

    async def test_fresh_submitted_task_not_alerted(self):
        from app.services import task_service as ts
        from app.tasks.notification_tasks import sweep_stale_tasks
        task = await ts.create_task(**_task_kwargs())
        await _to_submitted(task)
        result = await sweep_stale_tasks()
        assert not any(a["task_id"] == task["task_id"] for a in result["alerts"])


# ═══════════════════════════════════════════════════════════════
# Review analytics
# ═══════════════════════════════════════════════════════════════


class TestReviewAnalytics:
    async def test_empty_team_returns_zeros(self):
        from app.services.hr_metrics_service import review_analytics
        result = await review_analytics(TUID_TEAM_ALPHA)
        assert result["total_tasks"] == 0
        assert result["rework_rate_pct"] == 0.0
        assert result["pending_review_count"] == 0
        assert result["top_reviewers"] == []

    async def test_rework_and_turnaround_computed(self):
        from app.services import task_service as ts
        from app.services.hr_metrics_service import review_analytics
        task = await ts.create_task(**_task_kwargs())
        await _to_submitted(task)
        await _force_state(task["task_id"], "needs_changes")
        # Simulate a review cycle recorded on the task.
        storage = get_storage()
        await storage.update_document("onramp_tasks", task["task_id"], {
            "review_cycles": 1,
            "reviewed_by": TUID_USER_SENIOR,
            "submitted_at": datetime.now(timezone.utc) - timedelta(hours=2),
            "reviewed_at": datetime.now(timezone.utc),
        })
        result = await review_analytics(TUID_TEAM_ALPHA)
        assert result["reworked_task_count"] >= 1
        assert result["rework_rate_pct"] > 0
        assert result["avg_review_turnaround_hours"] is not None
        assert any(r["user_id"] == TUID_USER_SENIOR for r in result["top_reviewers"])


# ═══════════════════════════════════════════════════════════════
# Milestone roadmap DAG
# ═══════════════════════════════════════════════════════════════


class TestRoadmapDag:
    async def _seed_plan(self, milestones):
        storage = get_storage()
        from app.services.postgres_db import generate_id
        plan_id = generate_id()
        await storage.create_document("onboarding_plans", plan_id, {
            "team_id": TUID_TEAM_ALPHA, "user_id": TUID_USER_JUNIOR1, "title": "Test plan",
        })
        ids = []
        for m in milestones:
            mid = generate_id()
            payload = {
                "id": mid, "plan_id": plan_id,
                "title": m["title"], "day_target": m.get("day_target", 30),
                "sort_order": m.get("sort_order", 0),
                "category": m.get("category", "technical"),
                "is_completed": m.get("is_completed", False),
                "depends_on_milestones": m.get("depends_on_milestones", []),
            }
            await storage.create_document("onboarding_milestones", mid, payload)
            ids.append(mid)
        return plan_id, ids

    async def test_sequential_unlock(self):
        from app.services.onboarding_plan_service import get_roadmap
        plan_id, _ = await self._seed_plan([
            {"title": "A", "sort_order": 0, "is_completed": True},
            {"title": "B", "sort_order": 1},
            {"title": "C", "sort_order": 2},
        ])
        roadmap = await get_roadmap(plan_id)
        statuses = {m["title"]: m["status"] for m in roadmap["milestones"]}
        assert statuses["A"] == "completed"
        assert statuses["B"] == "in_progress"
        assert statuses["C"] == "locked"

    async def test_explicit_dependency_blocks_successor(self):
        from app.services.onboarding_plan_service import get_roadmap
        # Seed A + B first, then link B→A and C→B by writing depends_on_milestones.
        plan_id, ids = await self._seed_plan([
            {"title": "A", "sort_order": 0, "is_completed": True},
            {"title": "B", "sort_order": 1},
            {"title": "C", "sort_order": 2},
        ])
        storage = get_storage()
        await storage.update_document("onboarding_milestones", ids[1], {"depends_on_milestones": [ids[0]]})
        await storage.update_document("onboarding_milestones", ids[2], {"depends_on_milestones": [ids[1]]})
        roadmap = await get_roadmap(plan_id)
        statuses = {m["title"]: m["status"] for m in roadmap["milestones"]}
        assert statuses["A"] == "completed"
        assert statuses["B"] == "in_progress"
        assert statuses["C"] == "locked"

    async def test_missing_plan_returns_none(self):
        from app.services.onboarding_plan_service import get_roadmap
        assert await get_roadmap("no-such-plan") is None


# ═══════════════════════════════════════════════════════════════
# DORA metrics service
# ═══════════════════════════════════════════════════════════════


class TestDoraMetrics:
    async def test_dora_summary_shape(self):
        from app.services import dora_metrics_service as dora
        result = await dora.dora_summary(TUID_TEAM_ALPHA, days=90)
        assert set(result.keys()) >= {"overall_score", "metrics"}
        assert set(result["metrics"].keys()) >= {
            "deployment_frequency", "lead_time_for_changes",
            "change_failure_rate", "mttr",
        }

    async def test_velocity_trends_shape(self):
        from app.services import dora_metrics_service as dora
        result = await dora.velocity_trends(TUID_TEAM_ALPHA, weeks=12)
        assert "trends" in result

    async def test_throughput_shape(self):
        from app.services import dora_metrics_service as dora
        result = await dora.team_throughput(TUID_TEAM_ALPHA, days=30)
        assert "members" in result


# ═══════════════════════════════════════════════════════════════
# New notification / Slack alert types
# ═══════════════════════════════════════════════════════════════


class TestNewAlertTypes:
    async def test_notify_peer_review_claimed_creates_notification(self):
        from app.services import task_service as ts
        from app.services.notification_helpers import notify_peer_review_claimed
        from app.services.notification_service import COLLECTION
        storage = get_storage()
        task = await ts.create_task(**_task_kwargs())
        await notify_peer_review_claimed(task, reviewer_name="A Senior")
        notifs = await storage.query_documents(COLLECTION, [("type", "==", "peer_review_claimed")])
        assert len(notifs) >= 1

    async def test_notify_stale_task_creates_notification(self):
        from app.services import task_service as ts
        from app.services.notification_helpers import notify_stale_task
        from app.services.notification_service import COLLECTION
        storage = get_storage()
        task = await ts.create_task(**_task_kwargs())
        await notify_stale_task(task, stale_days=3.0)
        notifs = await storage.query_documents(COLLECTION, [("type", "==", "task_stale")])
        assert len(notifs) >= 1

    async def test_notification_preferences_include_new_types(self):
        from app.services.notification_service import DEFAULT_PREFERENCES, NOTIFICATION_TYPE_LABELS
        for channel in ("in_app", "email", "slack"):
            assert "task_stale" in DEFAULT_PREFERENCES[channel]
            assert "task_time_overrun" in DEFAULT_PREFERENCES[channel]
            assert "peer_review_claimed" in DEFAULT_PREFERENCES[channel]
        assert "task_stale" in NOTIFICATION_TYPE_LABELS
        assert "task_time_overrun" in NOTIFICATION_TYPE_LABELS
        assert "peer_review_claimed" in NOTIFICATION_TYPE_LABELS
