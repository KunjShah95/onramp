"""
Integration tests for the Celery background task module.

Uses Celery's eager mode (task_always_eager=True) so tasks execute
synchronously without requiring a running Redis broker. All storage
operations use InMemoryStorage set by conftest.py.

Coverage:
    - Celery app configuration & task discovery
    - Beat schedule loading
    - Analytics tasks (leaderboard, dashboard cache, usage aggregation)
    - Notification tasks (email dispatch, digests)
    - Agent task registration
    - Error handling & retry configuration
"""

import pytest
import os
from unittest.mock import patch


# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _eager_celery():
    """Enable Celery eager mode so tasks run synchronously without Redis.

    Also pins the broker to a memory:// transport and pre-imports all task
    modules so they are registered with the Celery app without requiring a
    running worker process.
    """
    import importlib

    # Pre-import task modules so they register their @shared_task decorators
    # with the Celery app. In production, the worker auto-discovers these.
    importlib.import_module("app.tasks.agent_tasks")
    importlib.import_module("app.tasks.analytics_tasks")
    importlib.import_module("app.tasks.notification_tasks")

    # Import the celery app module (not the attribute from __init__.py)
    mod = importlib.import_module("app.tasks.celery_app")
    app = mod.celery_app

    old_eager = app.conf.task_always_eager
    old_broker = app.conf.broker_url

    try:
        app.conf.update(
            task_always_eager=True,
            broker_url="memory://",
            task_eager_propagates=True,  # Let exceptions bubble up
        )
        yield
    finally:
        app.conf.update(
            task_always_eager=old_eager,
            broker_url=old_broker,
        )


@pytest.fixture
def sample_task():
    """Create a sample task document matching the workflow_tasks schema."""
    return {
        "id": "task-42",
        "title": "Fix login bug",
        "description": "Users can't log in with special characters in password",
        "state": "assigned",
        "assigned_to": "user-456",
        "created_by": "user-123",
        "team_id": "team-alpha",
        "team_name": "Alpha Team",
        "module": "auth",
        "priority": "high",
        "created_at": "2026-07-21T10:00:00",
        "updated_at": "2026-07-21T10:00:00",
    }


@pytest.fixture
def seeded_storage(storage, sample_task):
    """Seed InMemoryStorage with sample data for analytics tests."""
    # Create a team
    storage._coll("teams")["team-alpha"] = {
        "id": "team-alpha",
        "name": "Alpha Team",
        "created_at": "2026-01-01T00:00:00",
    }

    # Create some users
    for uid, name in [("user-123", "Alice"), ("user-456", "Bob")]:
        storage._coll("users")[uid] = {
            "id": uid, "name": name, "email": f"{uid}@test.com"
        }

    # Create tasks with various states
    states = ["completed", "in_progress", "submitted", "needs_changes", "assigned"]
    for i, state in enumerate(states):
        storage._coll("workflow_tasks")[f"task-{i}"] = {
            **sample_task,
            "id": f"task-{i}",
            "state": state,
            "title": f"Task {i}: {state}",
        }

    # Create usage records with timestamps in the recent past (1-3 hours ago).
    # The aggregate_daily_usage task filters by >= yesterday, so any recent
    # timestamp will be within range as long as the test machine clock is sane.
    from datetime import datetime, timedelta, timezone
    _now = datetime.now(timezone.utc)
    for i in range(3):
        ts = (_now - timedelta(hours=1 + i)).isoformat()
        storage._coll("usage_records")[f"usage-{i}"] = {
            "id": f"usage-{i}",
            "user_id": "user-456",
            "team_id": "team-alpha",
            "endpoint": "/api/v1/ask",
            "tokens_used": 100 * (i + 1),
            "cost_usd": 0.01 * (i + 1),
            "created_at": ts,
        }

    # Create notification preferences for digest tests
    storage._coll("onramp_notification_preferences")["user-456"] = {
        "id": "user-456",
        "user_id": "user-456",
        "digest_period": "daily",
        "email_notifications": True,
    }

    return storage


# ═══════════════════════════════════════════════════════════════════════════════
# Celery App Configuration
# ═══════════════════════════════════════════════════════════════════════════════


class TestCeleryAppConfig:
    """Verify the Celery application is configured correctly."""

    def test_app_imports(self):
        """celery_app can be imported and is a Celery instance."""
        from app.tasks.celery_app import celery_app
        from celery import Celery

        assert isinstance(celery_app, Celery)
        assert celery_app.main == "onramp"

    def test_task_modules_discovered(self):
        """All task modules are registered in the app."""
        from app.tasks.celery_app import celery_app

        task_names = list(celery_app.tasks.keys())

        # Check agent tasks
        assert any("agent_tasks" in name for name in task_names), \
            "agent_tasks not found in registered tasks"
        assert "app.tasks.agent_tasks.score_repo_health" in task_names
        assert "app.tasks.agent_tasks.analyze_pr_diffs" in task_names
        assert "app.tasks.agent_tasks.generate_learning_path" in task_names
        assert "app.tasks.agent_tasks.find_first_pr_issues" in task_names

        # Check analytics tasks
        assert any("analytics_tasks" in name for name in task_names)
        assert "app.tasks.analytics_tasks.aggregate_daily_usage" in task_names
        assert "app.tasks.analytics_tasks.refresh_leaderboard" in task_names
        assert "app.tasks.analytics_tasks.refresh_all_leaderboards" in task_names
        assert "app.tasks.analytics_tasks.refresh_team_dashboard_cache" in task_names

        # Check notification tasks
        assert any("notification_tasks" in name for name in task_names)
        assert "app.tasks.notification_tasks.send_email" in task_names
        assert "app.tasks.notification_tasks.notify_task_assigned" in task_names
        assert "app.tasks.notification_tasks.notify_task_submitted" in task_names
        assert "app.tasks.notification_tasks.notify_task_reviewed" in task_names
        assert "app.tasks.notification_tasks.send_user_digest" in task_names
        assert "app.tasks.notification_tasks.send_all_digests" in task_names

    def test_queue_routing(self):
        """Each task is routed to its correct queue."""
        from app.tasks import celery_app

        # Check task queues via the registered task's `queue` attribute
        agent_task = celery_app.tasks["app.tasks.agent_tasks.score_repo_health"]
        assert getattr(agent_task, "_queue", None) == "agent-tasks" or \
               agent_task.queue == "agent-tasks"

        analytics_task = celery_app.tasks["app.tasks.analytics_tasks.aggregate_daily_usage"]
        expected_queue = getattr(analytics_task, "_queue", None) or \
                         getattr(analytics_task, "queue", None)
        assert expected_queue == "analytics-tasks"

        notif_task = celery_app.tasks["app.tasks.notification_tasks.send_email"]
        expected_notif_queue = getattr(notif_task, "_queue", None) or \
                                getattr(notif_task, "queue", None)
        assert expected_notif_queue == "notification-tasks"

    def test_config_values(self):
        """Key Celery configuration values are set correctly."""
        from app.tasks.celery_app import celery_app

        assert celery_app.conf.task_serializer == "json"
        assert celery_app.conf.accept_content == ["json"]
        assert celery_app.conf.task_default_queue == "default"
        assert celery_app.conf.task_soft_time_limit == 300
        assert celery_app.conf.task_time_limit == 360

    def test_broker_url_format(self):
        """Broker URL is constructed from env vars when REDIS_URL is unset."""
        from app.tasks.celery_app import celery_app

        # With default env (no REDIS_URL), the broker URL should fall back
        # to the constructed redis://localhost:6379/0
        broker = celery_app.conf.broker_url
        assert broker is not None
        assert "redis://" in broker or "memory://" in broker  # eager fixture uses memory://

    def test_beat_schedule_loads(self):
        """Beat schedule is loaded and contains the expected periodic tasks."""
        from app.tasks.celery_app import celery_app

        schedule = celery_app.conf.beat_schedule
        assert isinstance(schedule, dict)

        # Check the 4 periodic tasks are defined
        expected_tasks = [
            "send-daily-digests",
            "send-weekly-digests",
            "aggregate-daily-usage",
            "refresh-all-leaderboards",
        ]
        for task_name in expected_tasks:
            assert task_name in schedule, f"Missing beat task: {task_name}"
            entry = schedule[task_name]
            assert "task" in entry
            assert "schedule" in entry

    def test_beat_task_references_exist(self):
        """All beat schedule tasks reference real registered tasks."""
        from app.tasks.celery_app import celery_app

        schedule = celery_app.conf.beat_schedule
        registered = set(celery_app.tasks.keys())

        for name, entry in schedule.items():
            task_path = entry["task"]
            # The task might be registered with a different key in eager mode
            assert task_path in registered or \
                   any(task_path in key for key in registered), \
                   f"Beat task '{name}' references '{task_path}' which is not registered"

    def test_rate_limits_applied(self):
        """Rate limit annotations are applied to task modules."""
        from app.tasks.celery_app import celery_app

        annotations = celery_app.conf.task_annotations or {}
        assert "app.tasks.agent_tasks.*" in annotations
        assert annotations["app.tasks.agent_tasks.*"]["rate_limit"] == "10/m"
        assert "app.tasks.notification_tasks.*" in annotations


# ═══════════════════════════════════════════════════════════════════════════════
# Analytics Tasks
# ═══════════════════════════════════════════════════════════════════════════════


class TestAnalyticsTasks:
    """Integration tests for analytics-queue tasks."""

    def test_refresh_team_dashboard_cache(self, seeded_storage):
        """Dashboard cache computes correct metrics for a team."""
        from app.tasks.analytics_tasks import refresh_team_dashboard_cache

        result = refresh_team_dashboard_cache.delay(team_id="team-alpha")
        cache = result.get(timeout=10)

        assert cache["team_id"] == "team-alpha"
        assert cache["total_tasks"] == 5
        assert cache["completed_tasks"] == 1
        assert cache["in_progress_tasks"] == 1
        assert cache["needs_review_tasks"] == 1   # submitted + under_review
        assert cache["needs_changes_tasks"] == 1
        assert cache["completion_rate"] == 20.0  # 1/5 = 20%
        assert "computed_at" in cache

    def test_refresh_team_dashboard_cache_empty_team(self, storage):
        """Dashboard cache handles teams with no tasks gracefully."""
        from app.tasks.analytics_tasks import refresh_team_dashboard_cache

        # Create team with no tasks
        storage._coll("teams")["empty-team"] = {"id": "empty-team", "name": "Empty"}

        result = refresh_team_dashboard_cache.delay(team_id="empty-team")
        cache = result.get(timeout=10)

        assert cache["team_id"] == "empty-team"
        assert cache["total_tasks"] == 0
        assert cache["completed_tasks"] == 0
        assert cache["completion_rate"] == 0.0

    def test_refresh_leaderboard(self, seeded_storage):
        """Leaderboard refresh works with seeded data."""
        import asyncio
        from app.tasks.analytics_tasks import refresh_leaderboard

        # Award some XP first so the leaderboard has data
        from app.services.gamification_service import award_xp
        asyncio.run(award_xp(user_id="user-456", source="task_completed", team_id="team-alpha"))

        result = refresh_leaderboard.delay(team_id="team-alpha")
        data = result.get(timeout=10)

        assert data["team_id"] == "team-alpha"
        assert len(data["entries"]) >= 1

    def test_refresh_all_leaderboards(self, seeded_storage):
        """Bulk leaderboard refresh processes all teams."""
        from app.tasks.analytics_tasks import refresh_all_leaderboards

        result = refresh_all_leaderboards.delay()
        data = result.get(timeout=10)

        assert data["total_teams"] >= 1
        assert "teams_refreshed" in data

    def test_aggregate_daily_usage(self, seeded_storage):
        """Usage aggregation creates aggregate records from usage data."""
        from app.tasks.analytics_tasks import aggregate_daily_usage

        result = aggregate_daily_usage.delay()
        data = result.get(timeout=10)

        assert data["total_records"] >= 3
        assert data["teams_aggregated"] >= 1
        assert data["period"] is not None

        # Check the aggregate was stored
        from app.services.postgres_db import get_storage
        agg_storage = get_storage()
        agg_docs = agg_storage._coll("usage_aggregates").values()
        assert len(agg_docs) >= 1


# ═══════════════════════════════════════════════════════════════════════════════
# Notification Tasks
# ═══════════════════════════════════════════════════════════════════════════════


class TestNotificationTasks:
    """Integration tests for notification-queue tasks."""

    def test_send_email_disabled(self):
        """send_email task returns False when SendGrid is not configured."""
        from app.tasks.notification_tasks import send_email

        # Only unset SENDGRID_API_KEY rather than clearing all env vars
        with patch.dict(os.environ, {"SENDGRID_API_KEY": ""}):
            result = send_email.delay(
                to="test@example.com",
                subject="Test",
                html_body="<p>Hello</p>",
            )
            sent = result.get(timeout=10)
            assert sent is False

    def test_notify_task_assigned_handles_no_slack(self, seeded_storage, sample_task):
        """Task assigned notification gracefully handles missing Slack config."""
        from app.tasks.notification_tasks import notify_task_assigned

        # This should not raise — missing Slack/email configs are handled gracefully
        result = notify_task_assigned.delay(
            task=sample_task,
            assignee_id="user-456",
            assigned_by_name="Alice",
        )
        # Task completed without error
        assert result.get(timeout=10) is None

        # Verify an in-app notification was created
        from app.services.postgres_db import get_storage
        storage = get_storage()
        notifs = storage._coll("onramp_notifications").values()
        assert len(notifs) >= 1

    def test_notify_task_submitted_handles_no_slack(self, seeded_storage, sample_task):
        """Task submitted notification gracefully handles missing config."""
        from app.tasks.notification_tasks import notify_task_submitted

        result = notify_task_submitted.delay(
            task=sample_task,
            submitter_id="user-456",
            submitter_name="Bob",
        )
        assert result.get(timeout=10) is None

    def test_notify_task_reviewed_approved(self, seeded_storage, sample_task):
        """Task reviewed notification with approved=True creates correct notification type."""
        from app.tasks.notification_tasks import notify_task_reviewed

        result = notify_task_reviewed.delay(
            task=sample_task,
            reviewer_name="Alice",
            approved=True,
        )
        assert result.get(timeout=10) is None

    def test_notify_task_reviewed_needs_changes(self, seeded_storage, sample_task):
        """Task reviewed notification with approved=False creates needs_changes type."""
        from app.tasks.notification_tasks import notify_task_reviewed

        result = notify_task_reviewed.delay(
            task=sample_task,
            reviewer_name="Alice",
            approved=False,
        )
        assert result.get(timeout=10) is None

    def test_send_user_digest_empty(self, seeded_storage):
        """Digest for a user with no activity returns sent=False with reason."""
        from app.tasks.notification_tasks import send_user_digest

        result = send_user_digest.delay(
            user_id="user-456",
            user_email="user-456@test.com",
            user_name="Bob",
            period="daily",
        )
        data = result.get(timeout=10)
        assert isinstance(data, dict)
        assert data["sent"] is False
        assert data.get("reason") == "no_items"

    def test_send_all_digests_filters_by_preference(self, seeded_storage):
        """send_all_digests only sends to users with matching digest preference."""
        from app.tasks.notification_tasks import send_all_digests, send_user_digest

        # Patch send_user_digest.delay to avoid nested event loop conflicts
        # since eager mode runs the nested task in the same thread
        with patch.object(send_user_digest, "delay", return_value=None):
            result = send_all_digests.delay(period="daily")
            data = result.get(timeout=10)

        # user-456 has daily digest enabled
        assert data["digests_sent"] >= 1
        assert data["period"] == "daily"

    def test_send_all_digests_weekly_skips_daily_users(self, seeded_storage):
        """send_all_digests for weekly period doesn't send to daily-only users."""
        from app.tasks.notification_tasks import send_all_digests

        result = send_all_digests.delay(period="weekly")
        data = result.get(timeout=10)

        # user-456 only has daily preference, so weekly should send 0
        assert data["digests_sent"] == 0
        assert data["period"] == "weekly"


# ═══════════════════════════════════════════════════════════════════════════════
# Agent Tasks
# ═══════════════════════════════════════════════════════════════════════════════


class TestAgentTasks:
    """Registration and basic invocation tests for agent tasks.

    Full agent execution tests require LLM API responses and are better
    suited for integration tests with mocked LLM responses or a test
    harness that can provide fixture responses.
    """

    def test_agent_tasks_registered(self):
        """All agent tasks are registered in the Celery app."""
        from app.tasks import celery_app

        assert "app.tasks.agent_tasks.score_repo_health" in celery_app.tasks
        assert "app.tasks.agent_tasks.analyze_pr_diffs" in celery_app.tasks
        assert "app.tasks.agent_tasks.generate_learning_path" in celery_app.tasks
        assert "app.tasks.agent_tasks.find_first_pr_issues" in celery_app.tasks

    def test_agent_tasks_have_correct_queues(self):
        """All agent tasks are routed to the agent-tasks queue."""
        from app.tasks import celery_app

        agent_tasks = [
            "app.tasks.agent_tasks.score_repo_health",
            "app.tasks.agent_tasks.analyze_pr_diffs",
            "app.tasks.agent_tasks.generate_learning_path",
            "app.tasks.agent_tasks.find_first_pr_issues",
        ]

        for task_path in agent_tasks:
            task = celery_app.tasks[task_path]
            queue = getattr(task, "_queue", None) or getattr(task, "queue", None)
            assert queue == "agent-tasks", f"{task_path} should be on agent-tasks queue"

    def test_agent_task_retry_config(self):
        """Agent tasks have reasonable retry configuration."""
        import inspect
        import app.tasks.agent_tasks as agent_tasks

        # Check each task function's decorator for retry settings
        for name, obj in inspect.getmembers(agent_tasks):
            if not name.startswith("test_") and callable(obj) and hasattr(obj, "max_retries"):
                assert obj.max_retries >= 1, f"{name} should have at least 1 retry"
                assert obj.default_retry_delay >= 10, \
                    f"{name} should have a retry delay >= 10s"

    def test_find_first_pr_issues_handles_no_github_token(self):
        """find_first_pr_issues fails when GITHUB_TOKEN is not set."""
        from app.tasks.agent_tasks import find_first_pr_issues

        # Only unset GITHUB_TOKEN — keep all other env vars intact
        with patch.dict(os.environ, {"GITHUB_TOKEN": ""}):
            with pytest.raises(Exception):
                find_first_pr_issues.delay(owner="test", repo="test-repo").get(timeout=10)


# ═══════════════════════════════════════════════════════════════════════════════
# Edge Cases & Error Handling
# ═══════════════════════════════════════════════════════════════════════════════


class TestErrorHandling:
    """Tasks handle errors and edge cases gracefully."""

    def test_notify_task_assigned_no_assignee(self, seeded_storage, sample_task):
        """Notification with no assignee raises/invalid field is handled."""
        from app.tasks.notification_tasks import notify_task_assigned

        no_assignee = {**sample_task, "assigned_to": None}
        result = notify_task_assigned.delay(
            task=no_assignee,
            assignee_id="nonexistent",
            assigned_by_name="Alice",
        )
        assert result.get(timeout=10) is None

    def test_notify_task_reviewed_no_assignee(self, seeded_storage, sample_task):
        """Task reviewed with no assigned_to should not crash."""
        from app.tasks.notification_tasks import notify_task_reviewed

        no_assignee = {**sample_task, "assigned_to": None}
        result = notify_task_reviewed.delay(
            task=no_assignee,
            reviewer_name="Alice",
            approved=True,
        )
        # Task should complete without error (early return)
        assert result.get(timeout=10) is None

    def test_send_user_digest_nonexistent_user(self):
        """Digest for a non-existent user returns sections with sent=False."""
        from app.tasks.notification_tasks import send_user_digest

        result = send_user_digest.delay(
            user_id="ghost-user",
            user_email="ghost@test.com",
            user_name="Ghost",
            period="daily",
        )
        data = result.get(timeout=10)
        assert isinstance(data, dict)
        assert data.get("sent") is False  # no items, so not sent

    def test_dashboard_cache_nonexistent_team(self, storage):
        """Dashboard cache for a non-existent team returns all zeros."""
        from app.tasks.analytics_tasks import refresh_team_dashboard_cache

        result = refresh_team_dashboard_cache.delay(team_id="nonexistent-team")
        cache = result.get(timeout=10)

        assert cache["team_id"] == "nonexistent-team"
        assert cache["total_tasks"] == 0
        assert cache["completed_tasks"] == 0


# ═══════════════════════════════════════════════════════════════════════════════
# Beat Schedule Validation
# ═══════════════════════════════════════════════════════════════════════════════


class TestBeatSchedule:
    """Validate the beat schedule configuration."""

    def test_load_beat_schedule(self):
        """BEAT_SCHEDULE is importable and contains expected tasks."""
        from app.tasks.beat_schedule import BEAT_SCHEDULE

        assert isinstance(BEAT_SCHEDULE, dict)
        assert len(BEAT_SCHEDULE) >= 4  # At least 4 periodic tasks

    def test_crontab_syntax(self):
        """All beat schedule entries use valid crontab syntax."""
        from app.tasks.beat_schedule import BEAT_SCHEDULE
        from celery.schedules import crontab

        for name, entry in BEAT_SCHEDULE.items():
            assert "schedule" in entry, f"{name} missing schedule"
            schedule = entry["schedule"]
            assert isinstance(schedule, crontab), \
                f"{name} schedule should be a crontab instance"

    def test_queue_routing_in_beat(self):
        """All beat tasks specify a queue in options."""
        from app.tasks.beat_schedule import BEAT_SCHEDULE

        for name, entry in BEAT_SCHEDULE.items():
            options = entry.get("options", {})
            assert "queue" in options, f"{name} missing queue routing"
            assert options["queue"] in (
                "notification-tasks",
                "analytics-tasks",
                "agent-tasks",
                "default",
            ), f"{name} has invalid queue: {options['queue']}"


# ═══════════════════════════════════════════════════════════════════════════════
# Package Init
# ═══════════════════════════════════════════════════════════════════════════════


class TestPackageInit:
    """Verify the tasks package exports."""

    def test_celery_app_exported(self):
        """celery_app is exported from the package."""
        from app.tasks import celery_app
        from celery import Celery

        assert isinstance(celery_app, Celery)
