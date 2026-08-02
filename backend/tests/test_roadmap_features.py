"""Tests for the 2026 roadmap feature batch.

Covers:
- Time tracking (log_actual_hours, get_team_time_stats)
- Peer review state (start_peer_review, peer_review_task)
- Quiz gates (check_quiz_gate, start_task enforcement)
- PR comment sync (store_pr_comments)
- Task templates CRUD + bulk assignment
- Automated first-task assignment (starter_assignment_service)
- Stale task alerts (sweep_stale_tasks)
- Cohort analytics / timeline / mentor matching (hr_metrics_service)

Runs against InMemoryStorage by default (STORAGE_BACKEND=memory from conftest).
"""

import os
import pytest
from datetime import datetime, timedelta, timezone

from app.services.postgres_db import get_storage
from tests.conftest import (
    TUID_USER_SENIOR, TUID_USER_JUNIOR1, TUID_USER_JUNIOR2,
    TUID_TEAM_ALPHA, TUID_TEAM_EMPTY,
)

TUID_NONEXISTENT = "f0000000-0000-4000-f000-000000000000"


def _task_kwargs(**overrides):
    base = {
        "team_id": TUID_TEAM_ALPHA,
        "created_by": TUID_USER_SENIOR,
        "assigned_to": TUID_USER_JUNIOR1,
        "title": "Roadmap task",
        "module": "auth",
        "repo_url": "https://github.com/onramp/backend",
        "estimated_hours": 4.0,
    }
    base.update(overrides)
    return base


async def _to_submitted(task):
    from app.services import task_service as ts
    await ts.start_task(task["task_id"], TUID_USER_JUNIOR1)
    await ts.submit_task(task["task_id"], TUID_USER_JUNIOR1, "https://github.com/onramp/backend/pull/1")
    return task


# ═══════════════════════════════════════════════════════════════
# Time Tracking
# ═══════════════════════════════════════════════════════════════


class TestTimeTracking:
    async def test_create_task_has_new_fields(self):
        """New task fields default correctly."""
        from app.services import task_service as ts
        task = await ts.create_task(**_task_kwargs(quiz_required=True))
        assert task["actual_hours"] is None
        assert task["pr_comments"] is None
        assert task["peer_reviewed_by"] is None
        assert task["quiz_required"] is True

    async def test_log_actual_hours_assignee(self):
        from app.services import task_service as ts
        task = await ts.create_task(**_task_kwargs())
        updated = await ts.log_actual_hours(task["task_id"], 5.5, TUID_USER_JUNIOR1)
        assert updated["actual_hours"] == 5.5

    async def test_log_actual_hours_rejects_outsider(self):
        from app.services import task_service as ts
        task = await ts.create_task(**_task_kwargs())
        with pytest.raises(ValueError, match="Only the assignee"):
            await ts.log_actual_hours(task["task_id"], 5.5, TUID_USER_JUNIOR2)

    async def test_log_actual_hours_rejects_negative(self):
        from app.services import task_service as ts
        task = await ts.create_task(**_task_kwargs())
        with pytest.raises(ValueError, match="non-negative"):
            await ts.log_actual_hours(task["task_id"], -1, TUID_USER_JUNIOR1)

    async def test_team_time_stats_variance(self):
        from app.services import task_service as ts
        t1 = await ts.create_task(**_task_kwargs(estimated_hours=4.0))
        t2 = await ts.create_task(**_task_kwargs(title="T2", estimated_hours=10.0))
        await ts.log_actual_hours(t1["task_id"], 5.0, TUID_USER_JUNIOR1)
        await ts.log_actual_hours(t2["task_id"], 8.0, TUID_USER_JUNIOR1)

        stats = await ts.get_team_time_stats(TUID_TEAM_ALPHA)
        assert stats["with_actual_count"] == 2
        assert stats["total_estimated_hours"] == 14.0
        assert stats["total_actual_hours"] == 13.0
        assert stats["avg_variance_hours"] == -0.5
        # variance computed per row
        rows = {r["title"]: r for r in stats["tasks"]}
        assert rows["Roadmap task"]["variance_hours"] == 1.0
        assert rows["T2"]["variance_hours"] == -2.0

    async def test_empty_team_time_stats(self):
        from app.services import task_service as ts
        stats = await ts.get_team_time_stats(TUID_TEAM_EMPTY)
        assert stats["tasks"] == []
        assert stats["with_actual_count"] == 0


# ═══════════════════════════════════════════════════════════════
# Peer Review
# ═══════════════════════════════════════════════════════════════


class TestPeerReview:
    async def test_start_peer_review_transition(self):
        from app.services import task_service as ts
        task = await ts.create_task(**_task_kwargs())
        await _to_submitted(task)
        updated = await ts.start_peer_review(task["task_id"], TUID_USER_JUNIOR2)
        assert updated["state"] == "peer_review"
        assert updated["peer_reviewed_by"] == TUID_USER_JUNIOR2

    async def test_cannot_peer_review_own_task(self):
        from app.services import task_service as ts
        task = await ts.create_task(**_task_kwargs())
        await _to_submitted(task)
        with pytest.raises(ValueError, match="own task"):
            await ts.start_peer_review(task["task_id"], TUID_USER_JUNIOR1)

    async def test_peer_review_approve(self):
        from app.services import task_service as ts
        task = await ts.create_task(**_task_kwargs())
        await _to_submitted(task)
        await ts.start_peer_review(task["task_id"], TUID_USER_JUNIOR2)
        updated = await ts.peer_review_task(
            task["task_id"], TUID_USER_JUNIOR2,
            {"comment": "Looks good"}, approve=True,
        )
        assert updated["state"] == "approved"
        assert updated["peer_reviewed_by"] == TUID_USER_JUNIOR2

    async def test_peer_review_needs_changes(self):
        from app.services import task_service as ts
        task = await ts.create_task(**_task_kwargs())
        await _to_submitted(task)
        updated = await ts.peer_review_task(
            task["task_id"], TUID_USER_JUNIOR2,
            {"comment": "Fix this"}, approve=False,
        )
        assert updated["state"] == "needs_changes"


# ═══════════════════════════════════════════════════════════════
# Quiz Gates
# ═══════════════════════════════════════════════════════════════


class TestQuizGates:
    async def test_gate_not_required_when_flag_off(self):
        from app.services import task_service as ts
        task = await ts.create_task(**_task_kwargs(module="auth", quiz_required=False))
        gate = await ts.check_quiz_gate(task["task_id"], TUID_USER_JUNIOR1)
        assert gate["required"] is False
        assert gate["passed"] is True

    async def test_gate_blocked_without_passing_quiz(self):
        from app.services import task_service as ts
        task = await ts.create_task(**_task_kwargs(module="auth", quiz_required=True))
        with pytest.raises(ValueError, match="Module quiz not passed"):
            await ts.start_task(task["task_id"], TUID_USER_JUNIOR1)

    async def test_gate_passes_after_module_quiz(self):
        from app.services import task_service as ts
        from app.services.postgres_db import generate_id

        # Seed a passing quiz result for module 'auth'
        storage = get_storage()
        await storage.create_document("onramp_quiz_results", generate_id(), {
            "result_id": generate_id(),
            "user_id": TUID_USER_JUNIOR1,
            "module": "auth",
            "score": 5, "total": 5, "percentage": 100.0,
            "passed": True,
            "submitted_at": datetime.now(timezone.utc).isoformat(),
        })

        task = await ts.create_task(**_task_kwargs(module="auth", quiz_required=True))
        gate = await ts.check_quiz_gate(task["task_id"], TUID_USER_JUNIOR1)
        assert gate["required"] is True
        assert gate["passed"] is True
        updated = await ts.start_task(task["task_id"], TUID_USER_JUNIOR1)
        assert updated["state"] == "in_progress"

    async def test_has_passed_module_quiz_false(self):
        from app.services import task_service as ts
        assert await ts.has_passed_module_quiz(TUID_USER_JUNIOR1, "payments") is False


# ═══════════════════════════════════════════════════════════════
# PR Comment Sync
# ═══════════════════════════════════════════════════════════════


class TestPrCommentSync:
    async def test_store_pr_comments_normalizes(self):
        from app.services import task_service as ts
        task = await ts.create_task(**_task_kwargs())
        raw = [
            {"user": {"login": "senior1"}, "body": "Use a constant", "path": "app.py", "line": 12, "created_at": "2026-01-01T00:00:00Z"},
            {"user": {"login": "peer1"}, "body": "Nit", "path": "app.py", "line": None, "created_at": "2026-01-02T00:00:00Z"},
        ]
        updated = await ts.store_pr_comments(task["task_id"], raw)
        assert updated is not None
        comments = updated["pr_comments"]
        assert comments[0]["user"] == "senior1"
        assert comments[0]["path"] == "app.py"
        assert comments[0]["line"] == 12
        assert comments[1]["line"] is None

    async def test_store_pr_comments_empty(self):
        from app.services import task_service as ts
        task = await ts.create_task(**_task_kwargs())
        result = await ts.store_pr_comments(task["task_id"], [])
        assert result is None


# ═══════════════════════════════════════════════════════════════
# Task Templates + Bulk Assignment
# ═══════════════════════════════════════════════════════════════


class TestTaskTemplates:
    async def test_create_and_get_template(self):
        from app.services import task_template_service as tts
        template = await tts.create_template(
            team_id=TUID_TEAM_ALPHA, created_by=TUID_USER_SENIOR,
            name="Build auth flow", module="auth", estimated_hours=6.0,
            unlock_modules=["auth-flow"],
        )
        fetched = await tts.get_template(template["template_id"])
        assert fetched["name"] == "Build auth flow"
        assert fetched["module"] == "auth"
        assert fetched["unlock_modules"] == ["auth-flow"]

    async def test_list_templates_filter_by_team(self):
        from app.services import task_template_service as tts
        await tts.create_template(team_id=TUID_TEAM_ALPHA, created_by=TUID_USER_SENIOR, name="T1")
        await tts.create_template(team_id=TUID_TEAM_EMPTY, created_by=TUID_USER_SENIOR, name="T2")
        templates = await tts.list_templates(team_id=TUID_TEAM_ALPHA)
        assert len(templates) == 1
        assert templates[0]["name"] == "T1"

    async def test_update_and_delete_template(self):
        from app.services import task_template_service as tts
        template = await tts.create_template(team_id=TUID_TEAM_ALPHA, created_by=TUID_USER_SENIOR, name="T1")
        updated = await tts.update_template(template["template_id"], {"name": "T1 updated"})
        assert updated["name"] == "T1 updated"
        assert await tts.delete_template(template["template_id"]) is True
        assert await tts.get_template(template["template_id"]) is None

    async def test_instantiate_template_creates_task(self):
        from app.services import task_template_service as tts
        template = await tts.create_template(
            team_id=TUID_TEAM_ALPHA, created_by=TUID_USER_SENIOR,
            name="Setup env", estimated_hours=2.0, module="setup",
        )
        task = await tts.instantiate_template(template, TUID_TEAM_ALPHA, TUID_USER_JUNIOR1, TUID_USER_SENIOR)
        assert task["state"] == "assigned"
        assert task["assigned_to"] == TUID_USER_JUNIOR1
        assert task["title"] == "Setup env"
        assert task["estimated_hours"] == 2.0

    async def test_bulk_assign_templates(self):
        from app.services import task_template_service as tts
        t1 = await tts.create_template(team_id=TUID_TEAM_ALPHA, created_by=TUID_USER_SENIOR, name="A", module="m1")
        t2 = await tts.create_template(team_id=TUID_TEAM_ALPHA, created_by=TUID_USER_SENIOR, name="B", module="m2")
        result = await tts.bulk_assign_templates(
            team_id=TUID_TEAM_ALPHA, assignee_id=TUID_USER_JUNIOR1,
            template_ids=[t1["template_id"], t2["template_id"], TUID_NONEXISTENT],
            created_by=TUID_USER_SENIOR,
        )
        assert result["created_count"] == 2
        assert result["missing_count"] == 1
        assert result["missing_template_ids"] == [TUID_NONEXISTENT]


# ═══════════════════════════════════════════════════════════════
# Starter Assignment
# ═══════════════════════════════════════════════════════════════


class TestStarterAssignment:
    async def test_infer_user_level_junior_by_default(self):
        from app.services.starter_assignment_service import infer_user_level
        level = await infer_user_level(TUID_USER_JUNIOR2)
        assert level == "junior"

    async def test_infer_user_level_from_quiz(self):
        from app.services.postgres_db import generate_id
        storage = get_storage()
        await storage.create_document("onramp_quiz_results", generate_id(), {
            "result_id": generate_id(), "user_id": TUID_USER_JUNIOR1,
            "module": "auth", "score": 9, "total": 10, "percentage": 90.0,
            "passed": True, "submitted_at": datetime.now(timezone.utc).isoformat(),
        })
        from app.services.starter_assignment_service import infer_user_level
        level = await infer_user_level(TUID_USER_JUNIOR1)
        assert level == "senior"

    async def test_assign_starter_tasks_creates_and_is_idempotent(self, monkeypatch):
        from app.services.starter_assignment_service import assign_starter_tasks
        from app.services import task_service as ts

        fake_issues = [
            {"number": 1, "title": "Fix typo", "body": "A typo", "url": "https://github.com/onramp/backend/issues/1", "estimated_hours": 1.0},
            {"number": 2, "title": "Add tests", "body": "More tests", "url": "https://github.com/onramp/backend/issues/2", "estimated_hours": 2.0},
            {"number": 3, "title": "Doc pass", "body": "Docs", "url": "https://github.com/onramp/backend/issues/3", "estimated_hours": 1.5},
            {"number": 4, "title": "Refactor", "body": "Refactor", "url": "https://github.com/onramp/backend/issues/4", "estimated_hours": 3.0},
        ]

        async def fake_find(repo_url, user_level, count=3):
            return fake_issues[:count]

        # Patch the module-level issue finder so no real network call happens.
        monkeypatch.setattr(
            "app.services.starter_assignment_service.find_starter_issues",
            fake_find,
        )

        result = await assign_starter_tasks(
            team_id=TUID_TEAM_ALPHA, user_id=TUID_USER_JUNIOR2,
            repo_url="https://github.com/onramp/backend",
            created_by=TUID_USER_SENIOR, count=3,
        )
        assert result["created_count"] == 3
        assert result["level"] in ("junior", "mid", "senior")
        for t in result["tasks"]:
            assert t["assigned_to"] == TUID_USER_JUNIOR2
            assert t["source_issue"]["number"] in (1, 2, 3)

        # Idempotent — re-running does not duplicate issue #1/#2/#3.
        result2 = await assign_starter_tasks(
            team_id=TUID_TEAM_ALPHA, user_id=TUID_USER_JUNIOR2,
            repo_url="https://github.com/onramp/backend",
            created_by=TUID_USER_SENIOR, count=3,
        )
        assert result2["created_count"] == 0

    async def test_assign_starter_tasks_no_issues_returns_clean(self, monkeypatch):
        from app.services.starter_assignment_service import assign_starter_tasks

        async def fake_find(repo_url, user_level, count=3):
            return []

        monkeypatch.setattr(
            "app.services.starter_assignment_service.find_starter_issues",
            fake_find,
        )
        result = await assign_starter_tasks(
            team_id=TUID_TEAM_ALPHA, user_id=TUID_USER_JUNIOR2,
            repo_url="https://github.com/onramp/nonexistent",
            created_by=TUID_USER_SENIOR, count=3,
        )
        assert "created_count" in result
        assert "level" in result
        assert result["created_count"] == 0


# ═══════════════════════════════════════════════════════════════
# Stale Task Alerts
# ═══════════════════════════════════════════════════════════════


class TestStaleTaskSweep:
    async def test_fresh_tasks_not_flagged(self):
        from app.services import task_service as ts
        task = await ts.create_task(**_task_kwargs())
        await _to_submitted(task)
        from app.tasks.notification_tasks import sweep_stale_tasks
        result = await sweep_stale_tasks()
        assert result["notifications_sent"] == 0

    async def test_stale_needs_changes_notifies_assignee_and_creator(self):
        # Seed the task directly with an old updated_at — task_service.update_task
        # always forces updated_at=now, so a raw storage write is required to
        # simulate a task that has been waiting for 72h.
        storage = get_storage()
        old = (datetime.now(timezone.utc) - timedelta(hours=72)).isoformat()
        task_id = "f0000000-0000-4000-a000-00000000beef"
        await storage.create_document("onramp_tasks", task_id, {
            "task_id": task_id,
            "team_id": TUID_TEAM_ALPHA,
            "created_by": TUID_USER_SENIOR,
            "assigned_to": TUID_USER_JUNIOR1,
            "title": "Stale needs-changes task",
            "state": "needs_changes",
            "priority": "medium",
            "created_at": old,
            "updated_at": old,
        })
        from app.tasks.notification_tasks import sweep_stale_tasks
        result = await sweep_stale_tasks()
        assert result["notifications_sent"] >= 2
        assert any(a["state"] == "needs_changes" for a in result["alerts"])

    async def test_stale_submitted_notifies_creator(self):
        storage = get_storage()
        old = (datetime.now(timezone.utc) - timedelta(hours=30)).isoformat()
        task_id = "f0000000-0000-4000-a000-00000000cafe"
        await storage.create_document("onramp_tasks", task_id, {
            "task_id": task_id,
            "team_id": TUID_TEAM_ALPHA,
            "created_by": TUID_USER_SENIOR,
            "assigned_to": TUID_USER_JUNIOR1,
            "title": "Stale submitted task",
            "state": "submitted",
            "priority": "medium",
            "created_at": old,
            "updated_at": old,
        })
        from app.tasks.notification_tasks import sweep_stale_tasks
        result = await sweep_stale_tasks()
        assert result["notifications_sent"] >= 1
        assert any(a["state"] == "submitted" for a in result["alerts"])


# ═══════════════════════════════════════════════════════════════
# HR: Cohort comparison / Timeline / Mentor matching
# ═══════════════════════════════════════════════════════════════


async def _seed_member(user_id, role="new_dev", joined_days_ago=30):
    storage = get_storage()
    joined = (datetime.now(timezone.utc) - timedelta(days=joined_days_ago)).isoformat()
    await storage.create_document("team_members", f"mem-{user_id}", {
        "user_id": user_id, "team_id": TUID_TEAM_ALPHA, "role": role, "joined_at": joined,
    })
    return joined


class TestCohortComparison:
    async def test_cohort_grouping_and_ramp(self):
        from app.services import task_service as ts
        from app.services import hr_metrics_service as hr
        await _seed_member(TUID_USER_JUNIOR1, joined_days_ago=45)
        await _seed_member(TUID_USER_JUNIOR2, joined_days_ago=45)
        await _seed_member(TUID_USER_SENIOR, role="senior_dev", joined_days_ago=200)

        task = await ts.create_task(**_task_kwargs())
        task = await _to_submitted(task)
        # Complete it quickly so ramp days is small
        from app.services import task_service as ts2
        await ts2.approve_task(task["task_id"], TUID_USER_SENIOR, {})
        await ts2.complete_task(task["task_id"], TUID_USER_SENIOR)

        result = await hr.cohort_comparison(TUID_TEAM_ALPHA)
        assert result["cohorts"]
        # Senior is in an older cohort than the juniors
        assert len(result["cohorts"]) >= 2
        # The newest cohort has a completed task → ramp value present somewhere
        latest = result["cohorts"][-1]
        assert latest["member_count"] >= 2

    async def test_empty_team(self):
        from app.services import hr_metrics_service as hr
        result = await hr.cohort_comparison(TUID_TEAM_EMPTY)
        assert result["cohorts"] == []


class TestOnboardingTimeline:
    async def test_lanes_and_milestones(self):
        from app.services import task_service as ts
        from app.services import hr_metrics_service as hr
        await _seed_member(TUID_USER_JUNIOR1)
        task = await ts.create_task(**_task_kwargs())
        await _to_submitted(task)
        await ts.approve_task(task["task_id"], TUID_USER_SENIOR, {})
        await ts.complete_task(task["task_id"], TUID_USER_SENIOR)

        result = await hr.onboarding_timeline(TUID_TEAM_ALPHA)
        lane = next((l for l in result["lanes"] if l["user_id"] == TUID_USER_JUNIOR1), None)
        assert lane is not None
        labels = {ms["label"] for ms in lane["milestones"]}
        assert "Assigned" in labels
        assert "Completed" in labels

    async def test_empty_team(self):
        from app.services import hr_metrics_service as hr
        result = await hr.onboarding_timeline(TUID_TEAM_EMPTY)
        assert result["lanes"] == []


class TestMentorMatching:
    async def test_matches_shared_languages(self):
        from app.services import hr_metrics_service as hr
        from app.services import task_service as ts
        storage = get_storage()
        await _seed_member(TUID_USER_JUNIOR1, role="new_dev")
        await _seed_member(TUID_USER_JUNIOR2, role="senior_dev")
        await _seed_member(TUID_USER_SENIOR, role="senior_dev")

        # Repos: python and javascript, both team-scoped
        for i, (owner, lang) in enumerate([("org", "Python"), ("org", "JavaScript")]):
            await storage.create_document("repositories", f"repo-{i}", {
                "owner": owner, "name": f"repo-{i}",
                "team_id": TUID_TEAM_ALPHA, "language": lang,
                "url": f"https://github.com/{owner}/repo-{i}",
            })

        # Senior works on the python repo; the other senior on javascript only.
        await ts.create_task(**_task_kwargs(
            assigned_to=TUID_USER_SENIOR,
            title="Python work",
            repo_url="https://github.com/org/repo-0",
        ))
        await ts.create_task(**_task_kwargs(
            assigned_to=TUID_USER_JUNIOR2,
            title="JS work",
            repo_url="https://github.com/org/repo-1",
        ))
        # New dev has no tasks yet → falls back to the team's stack (python+js)

        result = await hr.mentor_matching(TUID_TEAM_ALPHA, TUID_USER_JUNIOR1)
        assert result["match_count"] == 2
        assert result["new_dev_languages"] == ["javascript", "python"]
        # Senior who actually works on python scores higher than the JS-only one
        assert result["matches"][0]["shared_languages"] == ["python"]
        assert result["matches"][0]["score"] == 2

    async def test_no_seniors(self):
        from app.services import hr_metrics_service as hr
        await _seed_member(TUID_USER_JUNIOR1, role="new_dev")
        result = await hr.mentor_matching(TUID_TEAM_ALPHA, TUID_USER_JUNIOR1)
        assert result["match_count"] == 0
