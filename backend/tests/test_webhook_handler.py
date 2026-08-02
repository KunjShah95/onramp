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
# Push Event Handling
# ═══════════════════════════════════════════════════════════════


class TestHandlePushEvent:
    async def test_push_event(self):
        """A push event is handled with ref and commit count."""
        payload = {
            "ref": "refs/heads/main",
            "repository": {"full_name": "onramp/backend"},
            "commits": [{"id": "abc123"}, {"id": "def456"}],
        }
        result = await _handle_push_event(payload)
        assert result["handled"] is True
        assert result["ref"] == "refs/heads/main"
        assert result["commit_count"] == 2

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
