"""Integration tests for the notification service (onramp_notifications table).

Tests notification CRUD, read tracking, notification builder functions, and
preference management.

By default runs against InMemoryStorage. Pass --run-postgres to also run
against PostgreSQL:
  pytest tests/test_notification_service.py --run-postgres
"""

import os
import pytest
from app.services import notification_service as ns
from app.services.postgres_db import get_storage
from tests.conftest import (
    TUID_USER_SENIOR, TUID_USER_JUNIOR1, TUID_USER_JUNIOR2,
    TUID_USER_USER1, TUID_USER_USER2,
    TUID_TEAM_ALPHA, TUID_TEAM_BETA,
)


TUID_NONEXISTENT = "f0000000-0000-4000-f000-000000000000"


# ── Dual-backend parametrization ────────────────────────────────────────
# When --run-postgres is passed, every test runs twice: once against
# InMemoryStorage and once against PostgresStorage.

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


# ═══════════════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════════════


@pytest.fixture
def sample_task():
    """Create a minimal task dict for notification builders."""
    return {
        "task_id": "task-42",
        "title": "Fix login bug",
        "module": "auth",
        "team_id": TUID_TEAM_ALPHA,
        "assigned_to": TUID_USER_JUNIOR1,
        "created_by": TUID_USER_SENIOR,
        "state": "assigned",
        "pr_url": "https://github.com/pull/42",
        "unlock_modules": ["auth-flow"],
    }


# ═══════════════════════════════════════════════════════════════
# Create Notification
# ═══════════════════════════════════════════════════════════════


class TestCreateNotification:
    async def test_create_basic(self):
        """Creating a basic notification returns the correct fields."""
        notif = await ns.create_notification(
            user_id=TUID_USER_USER1,
            type="task_assigned",
            title="Test Notification",
            message="You have been assigned a task",
        )
        assert notif["user_id"] == TUID_USER_USER1
        assert notif["type"] == "task_assigned"
        assert notif["title"] == "Test Notification"
        assert notif["message"] == "You have been assigned a task"
        assert notif["read"] is False
        assert notif["read_at"] is None
        assert notif["notification_id"] is not None
        assert notif["created_at"] is not None

    async def test_create_with_all_fields(self):
        """Creating a notification with optional fields works."""
        notif = await ns.create_notification(
            user_id=TUID_USER_USER1,
            type="system_alert",
            title="System Alert",
            message="Scheduled maintenance tonight",
            metadata={"severity": "high", "maintenance_window": "2h"},
            team_id=TUID_TEAM_ALPHA,
        )
        assert notif["team_id"] == TUID_TEAM_ALPHA
        assert notif["metadata"]["severity"] == "high"
        assert notif["metadata"]["maintenance_window"] == "2h"

    async def test_create_multiple_notifications(self):
        """Multiple notifications get unique IDs."""
        n1 = await ns.create_notification(TUID_USER_USER1, "info", "Title 1", "Msg 1")
        n2 = await ns.create_notification(TUID_USER_USER1, "info", "Title 2", "Msg 2")
        assert n1["notification_id"] != n2["notification_id"]

    async def test_create_with_edge_case_message_lengths(self):
        """Very long messages are preview-truncated but full_message preserved."""
        long_msg = "A" * 500
        notif = await ns.create_notification(
            user_id=TUID_USER_USER1,
            type="info",
            title="Long Message",
            message=long_msg,
        )
        assert len(notif["message"]) <= 120
        assert notif["message"].endswith("...")
        fetched = await ns.get_notification(notif["notification_id"])
        assert fetched is not None
        assert len(fetched["full_message"]) == 500

    async def test_create_different_types(self):
        """All supported notification types can be created."""
        for ntype in ns.NOTIFICATION_TYPES:
            notif = await ns.create_notification(
                user_id=TUID_USER_USER1,
                type=ntype,
                title=f"Type: {ntype}",
                message=f"Notification of type {ntype}",
            )
            assert notif["type"] == ntype


# ═══════════════════════════════════════════════════════════════
# Get Notification
# ═══════════════════════════════════════════════════════════════


class TestGetNotification:
    async def test_get_existing(self):
        """Getting an existing notification returns the full record."""
        created = await ns.create_notification(TUID_USER_USER1, "info", "Title", "Message")
        fetched = await ns.get_notification(created["notification_id"])
        assert fetched is not None
        assert fetched["notification_id"] == created["notification_id"]
        assert fetched["title"] == "Title"

    async def test_get_nonexistent(self):
        """Getting a nonexistent notification returns None."""
        result = await ns.get_notification(TUID_NONEXISTENT)
        assert result is None


# ═══════════════════════════════════════════════════════════════
# List Notifications
# ═══════════════════════════════════════════════════════════════


class TestListNotifications:
    async def test_list_all_for_user(self):
        """Listing all notifications for a user returns them all."""
        await ns.create_notification(TUID_USER_USER1, "info", "T1", "M1")
        await ns.create_notification(TUID_USER_USER1, "info", "T2", "M2")
        await ns.create_notification(TUID_USER_USER2, "info", "Other", "M3")

        user1_notifs = await ns.list_notifications(TUID_USER_USER1)
        assert len(user1_notifs) == 2

    async def test_list_unread_only(self):
        """Listing with unread_only=True filters out read notifications."""
        n1 = await ns.create_notification(TUID_USER_USER1, "info", "T1", "M1")
        await ns.create_notification(TUID_USER_USER1, "info", "T2", "M2")
        await ns.mark_as_read(n1["notification_id"], TUID_USER_USER1)

        unread = await ns.list_notifications(TUID_USER_USER1, unread_only=True)
        assert len(unread) == 1
        assert unread[0]["notification_id"] != n1["notification_id"]

    async def test_list_filtered_by_type(self):
        """Listing with type_filter returns only that type."""
        await ns.create_notification(TUID_USER_USER1, "task_assigned", "T1", "M1")
        await ns.create_notification(TUID_USER_USER1, "system_alert", "T2", "M2")

        assigned = await ns.list_notifications(TUID_USER_USER1, type_filter="task_assigned")
        assert len(assigned) == 1
        assert assigned[0]["type"] == "task_assigned"

    async def test_list_newest_first(self):
        """Notifications are sorted by created_at descending."""
        n1 = await ns.create_notification(TUID_USER_USER1, "info", "T1", "M1")
        n2 = await ns.create_notification(TUID_USER_USER1, "info", "T2", "M2")

        notifs = await ns.list_notifications(TUID_USER_USER1)
        assert notifs[0]["notification_id"] == n2["notification_id"]
        assert notifs[1]["notification_id"] == n1["notification_id"]

    async def test_list_respects_limit(self):
        """Listing with a limit returns at most that many items."""
        for i in range(10):
            await ns.create_notification(TUID_USER_USER1, "info", f"T{i}", f"M{i}")

        notifs = await ns.list_notifications(TUID_USER_USER1, limit=3)
        assert len(notifs) == 3

    async def test_list_empty_user(self):
        """A user with no notifications returns an empty list."""
        notifs = await ns.list_notifications(TUID_NONEXISTENT)
        assert notifs == []


# ═══════════════════════════════════════════════════════════════
# Read Tracking
# ═══════════════════════════════════════════════════════════════


class TestMarkAsRead:
    async def test_mark_single(self):
        """Marking a single notification as read works."""
        notif = await ns.create_notification(TUID_USER_USER1, "info", "Title", "Message")
        result = await ns.mark_as_read(notif["notification_id"], TUID_USER_USER1)
        assert result is True

        fetched = await ns.get_notification(notif["notification_id"])
        assert fetched["read"] is True
        assert fetched["read_at"] is not None

    async def test_mark_other_users_notification_fails(self):
        """A user cannot mark another user's notification as read."""
        notif = await ns.create_notification(TUID_USER_USER1, "info", "Title", "Message")
        result = await ns.mark_as_read(notif["notification_id"], TUID_USER_USER2)
        assert result is False

    async def test_mark_nonexistent(self):
        """Marking a nonexistent notification returns False."""
        result = await ns.mark_as_read(TUID_NONEXISTENT, TUID_USER_USER1)
        assert result is False

    async def test_get_unread_count(self):
        """get_unread_count returns the correct count of unread notifications."""
        await ns.create_notification(TUID_USER_USER1, "info", "T1", "M1")
        n2 = await ns.create_notification(TUID_USER_USER1, "info", "T2", "M2")
        await ns.mark_as_read(n2["notification_id"], TUID_USER_USER1)

        count = await ns.get_unread_count(TUID_USER_USER1)
        assert count == 1

    async def test_get_unread_count_empty(self):
        """A user with no unread notifications returns 0."""
        count = await ns.get_unread_count(TUID_USER_USER1)
        assert count == 0

    async def test_get_unread_count_per_user(self):
        """Unread counts are per-user and don't leak across users."""
        await ns.create_notification(TUID_USER_USER1, "info", "T1", "M1")
        await ns.create_notification(TUID_USER_USER1, "info", "T2", "M2")
        await ns.create_notification(TUID_USER_USER2, "info", "T3", "M3")
        assert await ns.get_unread_count(TUID_USER_USER1) == 2
        assert await ns.get_unread_count(TUID_USER_USER2) == 1

    async def test_mark_all_as_read(self):
        """Marking all notifications as read works."""
        n1 = await ns.create_notification(TUID_USER_USER1, "info", "T1", "M1")
        n2 = await ns.create_notification(TUID_USER_USER1, "info", "T2", "M2")
        n3 = await ns.create_notification(TUID_USER_USER2, "info", "Other", "M3")

        count = await ns.mark_all_as_read(TUID_USER_USER1)
        assert count == 2

        assert (await ns.get_notification(n1["notification_id"]))["read"] is True
        assert (await ns.get_notification(n2["notification_id"]))["read"] is True
        assert (await ns.get_notification(n3["notification_id"]))["read"] is False


# ═══════════════════════════════════════════════════════════════
# Delete
# ═══════════════════════════════════════════════════════════════


class TestDeleteNotification:
    async def test_delete_single(self):
        """Deleting a notification returns True and removes it."""
        notif = await ns.create_notification(TUID_USER_USER1, "info", "Title", "Message")
        result = await ns.delete_notification(notif["notification_id"], TUID_USER_USER1)
        assert result is True
        assert await ns.get_notification(notif["notification_id"]) is None

    async def test_delete_other_users_notification_fails(self):
        """A user cannot delete another user's notification."""
        notif = await ns.create_notification(TUID_USER_USER1, "info", "Title", "Message")
        result = await ns.delete_notification(notif["notification_id"], TUID_USER_USER2)
        assert result is False
        assert await ns.get_notification(notif["notification_id"]) is not None

    async def test_delete_all_read(self):
        """Deleting all read notifications removes only the read ones."""
        n1 = await ns.create_notification(TUID_USER_USER1, "info", "T1", "M1")
        n2 = await ns.create_notification(TUID_USER_USER1, "info", "T2", "M2")
        await ns.mark_as_read(n1["notification_id"], TUID_USER_USER1)

        count = await ns.delete_all_read(TUID_USER_USER1)
        assert count == 1

        assert await ns.get_notification(n1["notification_id"]) is None
        assert await ns.get_notification(n2["notification_id"]) is not None


# ═══════════════════════════════════════════════════════════════
# Notification Builders
# ═══════════════════════════════════════════════════════════════


class TestNotificationBuilders:
    async def test_notify_task_assigned(self, sample_task):
        """notify_task_assigned creates the correct notification."""
        notif = await ns.notify_task_assigned(sample_task, TUID_USER_JUNIOR1, "Senior Claude")
        assert notif is not None
        assert notif["type"] == "task_assigned"
        assert notif["user_id"] == TUID_USER_JUNIOR1
        assert "Senior Claude" in notif["message"]
        assert "Fix login bug" in notif["message"]
        assert notif["metadata"]["task_id"] == "task-42"

    async def test_notify_task_submitted(self, sample_task):
        """notify_task_submitted creates the correct notification."""
        notif = await ns.notify_task_submitted(sample_task, TUID_USER_SENIOR, "Junior Dev")
        assert notif is not None
        assert notif["type"] == "task_submitted"
        assert notif["user_id"] == TUID_USER_SENIOR
        assert "Junior Dev" in notif["message"]
        assert notif["metadata"]["pr_url"] == "https://github.com/pull/42"

    async def test_notify_task_reviewed_approved(self, sample_task):
        """notify_task_reviewed with approved=True creates task_approved."""
        notif = await ns.notify_task_reviewed(sample_task, "Senior Claude", approved=True)
        assert notif is not None
        assert notif["type"] == "task_approved"
        assert notif["user_id"] == TUID_USER_JUNIOR1
        assert "approved" in notif["message"]

    async def test_notify_task_reviewed_needs_changes(self, sample_task):
        """notify_task_reviewed with approved=False creates task_needs_changes."""
        notif = await ns.notify_task_reviewed(sample_task, "Senior Claude", approved=False)
        assert notif is not None
        assert notif["type"] == "task_needs_changes"
        assert notif["user_id"] == TUID_USER_JUNIOR1
        assert "requested changes" in notif["message"]

    async def test_notify_task_reviewed_no_assignee(self, sample_task):
        """notify_task_reviewed returns None when there's no assignee."""
        sample_task["assigned_to"] = None
        notif = await ns.notify_task_reviewed(sample_task, "Senior Claude", approved=True)
        assert notif is None

    async def test_notify_task_completed(self, sample_task):
        """notify_task_completed creates the correct notification."""
        notif = await ns.notify_task_completed(sample_task)
        assert notif is not None
        assert notif["type"] == "task_completed"
        assert notif["user_id"] == TUID_USER_JUNIOR1
        assert "modules unlocked" in notif["message"]
        assert "auth-flow" in notif["message"]

    async def test_notify_task_completed_no_unlocked(self, sample_task):
        """notify_task_completed without unlock_modules works."""
        sample_task["unlock_modules"] = []
        notif = await ns.notify_task_completed(sample_task)
        assert notif is not None
        assert "completed" in notif["message"]
        assert "modules unlocked" not in notif["message"]

    async def test_notify_task_completed_no_assignee(self, sample_task):
        """notify_task_completed returns None when there's no assignee."""
        sample_task["assigned_to"] = None
        notif = await ns.notify_task_completed(sample_task)
        assert notif is None

    async def test_notify_module_granted(self):
        """notify_module_granted creates the correct notification."""
        notif = await ns.notify_module_granted(
            user_id=TUID_USER_JUNIOR1,
            module="auth-flow",
            team_id=TUID_TEAM_ALPHA,
            source="task_completion",
        )
        assert notif is not None
        assert notif["type"] == "module_granted"
        assert notif["user_id"] == TUID_USER_JUNIOR1
        assert "auth-flow" in notif["message"]
        assert notif["metadata"]["source"] == "task_completion"

    async def test_all_builders_create_different_types(self, sample_task):
        """All notification builder functions create distinct notification types."""
        types = set()
        notif = await ns.notify_task_assigned(sample_task, TUID_USER_JUNIOR1, "Senior")
        types.add(notif["type"])

        notif = await ns.notify_task_submitted(sample_task, TUID_USER_SENIOR, "Junior")
        types.add(notif["type"])

        notif = await ns.notify_task_reviewed(sample_task, "Senior", approved=True)
        types.add(notif["type"])

        notif = await ns.notify_task_reviewed(sample_task, "Senior", approved=False)
        types.add(notif["type"])

        notif = await ns.notify_task_completed(sample_task)
        types.add(notif["type"])

        notif = await ns.notify_module_granted(TUID_USER_JUNIOR1, "test-module", TUID_TEAM_ALPHA)
        types.add(notif["type"])

        assert len(types) == 6


# ═══════════════════════════════════════════════════════════════
# Notification Preferences
# ═══════════════════════════════════════════════════════════════


class TestNotificationPreferences:
    async def test_default_preferences(self):
        """A user with no saved preferences gets the defaults."""
        prefs = await ns.get_preferences(TUID_USER_USER1)
        assert prefs["user_id"] == TUID_USER_USER1
        assert prefs["digest_frequency"] == "daily"
        assert prefs["quiet_hours_enabled"] is False
        assert "in_app" in prefs["channels"]
        assert "email" in prefs["channels"]
        assert "slack" in prefs["channels"]

    async def test_update_preferences_creates(self):
        """Updating preferences for a new user creates them."""
        updated = await ns.update_preferences(TUID_USER_USER1, {
            "digest_frequency": "weekly",
            "quiet_hours_enabled": True,
        })
        assert updated["digest_frequency"] == "weekly"
        assert updated["quiet_hours_enabled"] is True

        fetched = await ns.get_preferences(TUID_USER_USER1)
        assert fetched["digest_frequency"] == "weekly"

    async def test_update_preferences_updates_existing(self):
        """Updating preferences for an existing user merges changes."""
        await ns.update_preferences(TUID_USER_USER1, {"digest_frequency": "daily"})
        await ns.update_preferences(TUID_USER_USER1, {"quiet_hours_enabled": True})

        prefs = await ns.get_preferences(TUID_USER_USER1)
        assert prefs["digest_frequency"] == "daily"
        assert prefs["quiet_hours_enabled"] is True

    async def test_preferences_channel_defaults(self):
        """Default preferences have all expected channels."""
        prefs = await ns.get_preferences(TUID_USER_USER1)
        channels = prefs["channels"]

        assert channels["in_app"]["task_assigned"] is True
        assert channels["in_app"]["task_cancelled"] is False
        assert channels["email"]["task_assigned"] is True
        assert channels["email"]["task_started"] is False
        assert channels["slack"]["task_assigned"] is False
        assert channels["slack"]["team_invite"] is True
        assert channels["slack"]["system_alert"] is True


# ═══════════════════════════════════════════════════════════════
# Edge Cases
# ═══════════════════════════════════════════════════════════════


class TestEdgeCases:
    async def test_create_with_empty_message(self):
        """Creating a notification with an empty message still works."""
        notif = await ns.create_notification(TUID_USER_USER1, "info", "Title", "")
        assert notif["message"] == ""

    async def test_create_none_metadata(self):
        """Creating a notification with metadata=None uses empty dict."""
        notif = await ns.create_notification(TUID_USER_USER1, "info", "Title", "Msg", metadata=None)
        assert notif["metadata"] == {}

    async def test_create_none_team_id(self):
        """Creating a notification with team_id=None stores None (SQL NULL)."""
        notif = await ns.create_notification(TUID_USER_USER1, "info", "Title", "Msg", team_id=None)
        assert notif["team_id"] is None

    async def test_mark_all_as_read_empty(self):
        """mark_all_as_read for a user with no notifications returns 0."""
        count = await ns.mark_all_as_read(TUID_NONEXISTENT)
        assert count == 0

    async def test_delete_all_read_empty(self):
        """delete_all_read for a user with no notifications returns 0."""
        count = await ns.delete_all_read(TUID_NONEXISTENT)
        assert count == 0

    async def test_list_other_user_notifications(self):
        """A user can only see their own notifications."""
        await ns.create_notification(TUID_USER_USER1, "info", "T1", "M1")
        await ns.create_notification(TUID_USER_USER2, "info", "T2", "M2")

        user1 = await ns.list_notifications(TUID_USER_USER1)
        user2 = await ns.list_notifications(TUID_USER_USER2)
        assert len(user1) == 1
        assert len(user2) == 1
        assert user1[0]["title"] == "T1"
        assert user2[0]["title"] == "T2"
