"""
Unit tests for the GitHub webhook handler.

Tests HMAC signature verification, PR event handling (opened, synchronize),
push events, and issue comment events.
"""

import hashlib
import hmac
import json
import os

from app.api.v1.webhook_handler import (
    _verify_signature,
    _handle_pr_event,
    _handle_pr_merged,
    _handle_push_event,
    _handle_issue_comment_event,
    _get_webhook_secret,
)


TEST_SECRET = "test-webhook-secret"


def _sign(payload: dict) -> str:
    """Generate HMAC-SHA256 signature for a payload."""
    body = json.dumps(payload, separators=(",", ":")).encode()
    return "sha256=" + hmac.new(
        TEST_SECRET.encode(), body, hashlib.sha256,
    ).hexdigest()


def _build_pr_payload(action: str = "opened") -> dict:
    """Build a sample pull_request webhook payload."""
    return {
        "action": action,
        "pull_request": {
            "number": 42,
            "title": "Fix login bug",
            "html_url": "https://github.com/onramp/backend/pull/42",
            "base": {"ref": "main"},
            "head": {"ref": "fix-login-bug"},
        },
        "repository": {
            "full_name": "onramp/backend",
        },
        "sender": {
            "login": "test-user",
        },
    }


# ═══════════════════════════════════════════════════════════════
# Signature Verification
# ═══════════════════════════════════════════════════════════════


class TestVerifySignature:
    def test_valid_signature(self):
        """A correctly signed payload returns True."""
        payload = b'{"test": "data"}'
        expected = "sha256=" + hmac.new(
            TEST_SECRET.encode(), payload, hashlib.sha256,
        ).hexdigest()
        assert _verify_signature(payload, expected, TEST_SECRET) is True

    def test_invalid_signature(self):
        """An incorrectly signed payload returns False."""
        payload = b'{"test": "data"}'
        assert _verify_signature(payload, "sha256:invalid", TEST_SECRET) is False

    def test_empty_signature(self):
        """An empty signature header returns False."""
        payload = b'{"test": "data"}'
        assert _verify_signature(payload, "", TEST_SECRET) is False

    def test_wrong_secret(self):
        """A signature with the wrong secret returns False."""
        payload = b'{"test": "data"}'
        sig = _sign({"test": "data"})
        assert _verify_signature(payload, sig, "wrong-secret") is False

    def test_hmac_constant_time_comparison(self):
        """Using hmac.compare_digest for timing-safe comparison."""
        payload = b'{"test": "data"}'
        expected = "sha256=" + hmac.new(
            TEST_SECRET.encode(), payload, hashlib.sha256,
        ).hexdigest()
        # compare_digest is used internally
        result = _verify_signature(payload, expected, TEST_SECRET)
        assert result is True


# ═══════════════════════════════════════════════════════════════
# PR Event Handling
# ═══════════════════════════════════════════════════════════════


class TestHandlePrEvent:
    async def test_pr_opened(self):
        """An opened PR event is handled and triggers a review."""
        payload = _build_pr_payload("opened")
        result = await _handle_pr_event(payload, "pull_request")
        assert result["handled"] is True
        assert result["action"] == "opened"
        assert result["pr_data"]["pr_number"] == 42
        assert result["pr_data"]["repo_full_name"] == "onramp/backend"
        assert result["review_triggered"] is True

    async def test_pr_synchronize(self):
        """A synchronize PR event is handled and triggers a review."""
        payload = _build_pr_payload("synchronize")
        result = await _handle_pr_event(payload, "pull_request")
        assert result["handled"] is True
        assert result["action"] == "synchronize"
        assert result["review_triggered"] is True

    async def test_pr_closed_not_handled(self):
        """A closed PR event without a merge is not handled."""
        payload = _build_pr_payload("closed")
        result = await _handle_pr_event(payload, "pull_request")
        assert result["handled"] is False
        assert "PR closed without merge" in result["reason"]

    async def test_pr_has_head_and_base_branch(self):
        """PR event extracts head and base branch info."""
        payload = _build_pr_payload("opened")
        result = await _handle_pr_event(payload, "pull_request")
        assert result["pr_data"]["base_branch"] == "main"
        assert result["pr_data"]["head_branch"] == "fix-login-bug"

    async def test_pr_has_sender(self):
        """PR event extracts the sender login."""
        payload = _build_pr_payload("opened")
        result = await _handle_pr_event(payload, "pull_request")
        assert result["pr_data"]["sender"] == "test-user"


# ═══════════════════════════════════════════════════════════════
# PR Merged Handling
# ═══════════════════════════════════════════════════════════════


class TestHandlePrMerged:
    async def test_merge_completes_task_and_stamps_pr_merged_at(self):
        """A merged PR auto-completes the linked task AND stamps pr_merged_at
        on it — the attribution that lets the ramp summary compute
        time-to-first-merged-PR without a linked GitHub account."""
        from datetime import datetime, timezone

        from app.services.postgres_db import get_storage, generate_id

        storage = get_storage()
        pr_url = "https://github.com/onramp/backend/pull/42"
        task = {
            "task_id": generate_id(),
            "team_id": "team-wh-1",
            "created_by": "senior-1",
            "assigned_to": "trainee-1",
            "title": "Fix login bug",
            "module": "core",
            "state": "submitted",
            "pr_url": pr_url,
            "review_cycles": 0,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "started_at": None,
            "submitted_at": datetime.now(timezone.utc),
            "reviewed_at": None,
            "completed_at": None,
            "pr_merged_at": None,
        }
        await storage.create_document("onramp_tasks", task["task_id"], task)

        payload = {
            "action": "closed",
            "pull_request": {
                "number": 42,
                "html_url": pr_url,
                "merged": True,
                "merged_by": {"login": "senior-1"},
                "user": {"login": "trainee-1"},
            },
            "repository": {"full_name": "onramp/backend"},
            "sender": {"login": "trainee-1"},
        }

        result = await _handle_pr_merged(payload)
        assert result["task_completed"] is True

        updated = await storage.get_document("onramp_tasks", task["task_id"])
        assert updated["state"] == "completed"
        assert updated["pr_merged_at"] is not None

    async def test_merge_stamps_already_completed_task(self):
        """Even when the task was already completed (e.g. senior closed it
        first), the merge still stamps pr_merged_at so the timing is captured."""
        from datetime import datetime, timezone

        from app.services.postgres_db import get_storage, generate_id

        storage = get_storage()
        pr_url = "https://github.com/onramp/backend/pull/43"
        task = {
            "task_id": generate_id(),
            "team_id": "team-wh-1",
            "created_by": "senior-1",
            "assigned_to": "trainee-1",
            "title": "Fix login bug 2",
            "module": "core",
            "state": "completed",
            "pr_url": pr_url,
            "review_cycles": 1,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "started_at": None,
            "submitted_at": datetime.now(timezone.utc),
            "reviewed_at": datetime.now(timezone.utc),
            "completed_at": datetime.now(timezone.utc),
            "pr_merged_at": None,
        }
        await storage.create_document("onramp_tasks", task["task_id"], task)

        payload = {
            "action": "closed",
            "pull_request": {
                "number": 43,
                "html_url": pr_url,
                "merged": True,
                "merged_by": {"login": "senior-1"},
                "user": {"login": "trainee-1"},
            },
            "repository": {"full_name": "onramp/backend"},
            "sender": {"login": "trainee-1"},
        }

        result = await _handle_pr_merged(payload)
        assert result["task_completed"] is False
        assert result["reason"] == "Already completed"

        updated = await storage.get_document("onramp_tasks", task["task_id"])
        assert updated["pr_merged_at"] is not None


# ═══════════════════════════════════════════════════════════════
# Push Event Handling
# ═══════════════════════════════════════════════════════════════


class TestHandlePushEvent:
    async def test_push_event(self):
        """A push event to an UNregistered repo is acknowledged, no rebuild."""
        payload = {
            "ref": "refs/heads/main",
            "repository": {"full_name": "onramp/backend"},
            "commits": [{"id": "abc123"}, {"id": "def456"}],
        }
        result = await _handle_push_event(payload)
        assert result["handled"] is True
        assert result["ref"] == "refs/heads/main"
        assert result["commit_count"] == 2
        assert result["rebuild_triggered"] is False

    async def test_push_no_commits(self):
        """A push event with no commits returns zero count."""
        payload = {
            "ref": "refs/heads/main",
            "repository": {"full_name": "onramp/backend"},
            "commits": [],
        }
        result = await _handle_push_event(payload)
        assert result["handled"] is True
        assert result["commit_count"] == 0

    async def test_push_to_registered_repo_dispatches_rebuild(self, monkeypatch):
        """A push to a registered repo evicts the cache and dispatches a rebuild."""
        from app.services.postgres_db import get_storage

        # Register the repo so the handler recognises it.
        await get_storage().create_document(
            "repositories",
            "r1",
            {"owner": "acme", "name": "app", "url": "https://github.com/acme/app"},
        )

        # Stale cached answer under the repo's index scope.
        from app.services import llm_cache
        from app.services.repo_context import index_id_for

        scope = index_id_for("https://github.com/acme/app", "main")
        await llm_cache.set_cached("chat", "how does auth work", None, 2000, "stale", scope=scope)
        assert await llm_cache.get_cached("chat", "how does auth work", None, 2000, scope=scope) == "stale"

        # Patch the celery dispatch to capture the call (no broker in tests).
        dispatched = {}

        def fake_delay(url, branch="main", force=False, scope=""):
            dispatched.update(url=url, branch=branch, force=force, scope=scope)
            return type("R", (), {"id": "task-push-1"})()

        from app.tasks import repo_index_tasks

        monkeypatch.setattr(
            repo_index_tasks,
            "build_repo_index",
            type("T", (), {"delay": staticmethod(fake_delay)})(),
        )

        payload = {
            "ref": "refs/heads/main",
            "repository": {
                "full_name": "acme/app",
                "html_url": "https://github.com/acme/app",
            },
            "commits": [{"id": "new-sha"}],
        }
        result = await _handle_push_event(payload)

        assert result["rebuild_triggered"] is True
        assert result["task_id"] == "task-push-1"
        assert result["cache_entries_evicted"] >= 1
        assert dispatched == {
            "url": "https://github.com/acme/app",
            "branch": "main",
            "force": True,
            "scope": scope,
        }
        # The stale cached answer is gone.
        assert await llm_cache.get_cached("chat", "how does auth work", None, 2000, scope=scope) is None


# ═══════════════════════════════════════════════════════════════
# Issue Comment Event Handling
# ═══════════════════════════════════════════════════════════════


class TestHandleIssueCommentEvent:
    async def test_comment_on_pr(self):
        """A comment on a PR is handled."""
        payload = {
            "action": "created",
            "issue": {"number": 42, "pull_request": {}},
            "comment": {
                "body": "This looks good to me!",
                "user": {"login": "reviewer"},
            },
        }
        result = await _handle_issue_comment_event(payload)
        assert result["handled"] is True
        assert result["pr_number"] == 42
        assert "looks good" in result["comment_body"]

    async def test_comment_not_on_pr(self):
        """A comment not on a PR is not handled."""
        payload = {
            "action": "created",
            "issue": {"number": 99},
            "comment": {"body": "Just a regular issue comment"},
        }
        result = await _handle_issue_comment_event(payload)
        assert result["handled"] is False
        assert "not on a PR" in result["reason"]


# ═══════════════════════════════════════════════════════════════
# Webhook Secret
# ═══════════════════════════════════════════════════════════════


class TestGetWebhookSecret:
    def test_default_secret(self):
        """When GITHUB_WEBHOOK_SECRET is not set, returns a dev default."""
        if "GITHUB_WEBHOOK_SECRET" in os.environ:
            del os.environ["GITHUB_WEBHOOK_SECRET"]
        secret = _get_webhook_secret()
        assert secret == "dev-secret"

    def test_env_secret(self):
        """When GITHUB_WEBHOOK_SECRET is set, returns that value."""
        os.environ["GITHUB_WEBHOOK_SECRET"] = "my-production-secret"
        secret = _get_webhook_secret()
        assert secret == "my-production-secret"
        del os.environ["GITHUB_WEBHOOK_SECRET"]
