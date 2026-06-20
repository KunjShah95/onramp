"""
Integration tests for the task submit endpoint's auto-AI-review integration.

Verifies that submitting a task triggers the PRReviewAgent and stores the
AI review result on the task — without making real GitHub or LLM API calls.

Uses a minimal FastAPI test app with auth dev bypass and mocked PRReviewAgent.
"""

from unittest.mock import AsyncMock
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.middleware.auth import AuthMiddleware
from app.api.v1.tasks import router as tasks_router
from app.services.postgres_db import get_storage

# ── Constants ──────────────────────────────────────────────────────────────

DEV_USER = "dev-user-id"
TRAINEE = "trainee-user-id"
TEAM_ID = "test-team-uuid"
PR_URL = "https://github.com/owner/repo/pull/42"
REPO_URL = "https://github.com/owner/repo"

FAKE_REVIEW_RESULT = {
    "summary": "Good PR with minor issues",
    "score": 82,
    "issues": [
        {
            "type": "performance",
            "severity": "low",
            "file": "src/main.py",
            "line": 42,
            "message": "Unnecessary list comprehension",
            "suggestion": "Use a generator expression instead",
        }
    ],
    "positives": ["Well-structured code", "Good test coverage"],
    "recommendations": ["Add error handling for edge cases"],
    "diff_stats": {"files_changed": 3, "additions": 50, "deletions": 20},
}


# ── Test app factory ──────────────────────────────────────────────────────

def _make_app():
    """Build a minimal FastAPI app with auth dev bypass and task routes."""
    app = FastAPI()
    app.add_middleware(AuthMiddleware)
    app.include_router(tasks_router, prefix="/api/v1")
    # The submit endpoint reads app.state.llm — set it to None for tests
    app.state.llm = None
    return app


def _auth_headers() -> dict:
    return {"Authorization": "Bearer dev_user_token_that_is_long_enough"}


# ── Helpers imported from the endpoint module ─────────────────────────────

from app.api.v1.tasks import _parse_pr_number, _infer_repo_url


# ════════════════════════════════════════════════════════════════════════════
# Helper unit tests
# ════════════════════════════════════════════════════════════════════════════


class TestHelpers:
    """Direct tests for the PR URL parsing helpers."""

    def test_parse_pr_number_standard(self):
        assert _parse_pr_number("https://github.com/foo/bar/pull/42") == 42

    def test_parse_pr_number_with_trailing_slash(self):
        assert _parse_pr_number("https://github.com/foo/bar/pull/42/") == 42

    def test_parse_pr_number_with_path(self):
        assert _parse_pr_number("https://github.com/foo/bar/pull/42/files") == 42

    def test_parse_pr_number_with_query(self):
        assert _parse_pr_number("https://github.com/foo/bar/pull/42?diff=unified") == 42

    def test_parse_pr_number_invalid_url(self):
        assert _parse_pr_number("https://gitlab.com/foo/bar/merge_requests/42") is None

    def test_parse_pr_number_no_match(self):
        assert _parse_pr_number("not-a-url") is None

    def test_infer_repo_url_standard(self):
        assert _infer_repo_url("https://github.com/foo/bar/pull/42") == "https://github.com/foo/bar"

    def test_infer_repo_url_with_path(self):
        assert _infer_repo_url("https://github.com/foo/bar/pull/42/files") == "https://github.com/foo/bar"

    def test_infer_repo_url_no_match(self):
        assert _infer_repo_url("not-a-url") is None

    def test_infer_repo_url_non_github(self):
        assert _infer_repo_url("https://gitlab.com/foo/bar/-/merge_requests/42") is None


# ════════════════════════════════════════════════════════════════════════════
# Auto-AI-Review Integration Tests
# ════════════════════════════════════════════════════════════════════════════


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    """Enable auth dev bypass and clear storage before each test."""
    monkeypatch.setenv("AUTH_DEV_BYPASS", "true")
    monkeypatch.setenv("ENV", "development")
    storage = get_storage()
    for coll in list(storage._data.keys()):
        storage._data[coll].clear()
    from app.services.postgres_db import generate_id
    storage._data.setdefault("teams", {})[TEAM_ID] = {
        "id": TEAM_ID,
        "name": "Test Team",
        "is_active": True,
    }
    member_id = generate_id()
    storage._data.setdefault("team_members", {})[member_id] = {
        "id": member_id,
        "team_id": TEAM_ID,
        "user_id": "00000000-0000-0000-0000-000000000001",
        "role": "senior",
        "joined_at": "2024-01-01T00:00:00Z",
    }


def _create_task_via_api(client, team_id: str) -> str:
    """Helper: create a task via the API and return its task_id."""
    resp = client.post(
        f"/api/v1/tasks?team_id={team_id}",
        json={
            "team_id": team_id,
            "title": "Test task for AI review",
            "module": "api-core",
            "repo_url": REPO_URL,
            "priority": "medium",
        },
        headers=_auth_headers(),
    )
    assert resp.status_code == 200, f"Create task failed: {resp.text}"
    return resp.json()["task_id"]


def _walk_to_in_progress(client, task_id: str):
    """Helper: assign and start a task to get it to in_progress state."""
    # Assign the task to TRAINEE
    resp = client.post(
        f"/api/v1/tasks/{task_id}/assign",
        json={"assignee_id": TRAINEE},
        headers=_auth_headers(),
    )
    assert resp.status_code == 200, f"Assign failed: {resp.text}"

    # Start the task
    resp = client.post(
        f"/api/v1/tasks/{task_id}/start",
        headers=_auth_headers(),
    )
    assert resp.status_code == 200, f"Start failed: {resp.text}"


def test_submit_triggers_ai_review_and_stores_result(monkeypatch):
    """
    Full happy path: create → assign → start → submit with valid PR URL.
    The mocked PRReviewAgent returns a result that is stored as ai_review.
    """
    # Mock PRReviewAgent.review_pr to return a canned result
    mock_review = AsyncMock(return_value=FAKE_REVIEW_RESULT)
    monkeypatch.setattr(
        "app.agents.pr_review.PRReviewAgent.review_pr",
        mock_review,
    )

    app = _make_app()
    with TestClient(app) as client:
        task_id = _create_task_via_api(client, TEAM_ID)
        _walk_to_in_progress(client, task_id)

        resp = client.post(
            f"/api/v1/tasks/{task_id}/submit",
            json={"pr_url": PR_URL},
            headers=_auth_headers(),
        )

    assert resp.status_code == 200, f"Submit failed: {resp.text}"
    data = resp.json()

    # Task should now be in "submitted" state
    assert data["state"] == "submitted"

    # ai_review should be populated from the fake review result
    assert data["ai_review"] is not None
    assert data["ai_review"]["score"] == 82
    assert data["ai_review"]["summary"] == "Good PR with minor issues"
    assert len(data["ai_review"]["issues"]) == 1
    assert data["ai_review"]["issues"][0]["file"] == "src/main.py"
    assert data["ai_review"]["diff_stats"]["files_changed"] == 3

    # Verify the mock was called with the expected arguments
    mock_review.assert_awaited_once()
    call_kwargs = mock_review.await_args[1]
    assert call_kwargs["repo_url"] == REPO_URL
    assert call_kwargs["pr_number"] == 42
    assert "security" in call_kwargs["focus_areas"]


def test_submit_infers_repo_url_from_pr_url(monkeypatch):
    """
    When the task has no repo_url, the endpoint infers it from the PR URL.
    """
    mock_review = AsyncMock(return_value=FAKE_REVIEW_RESULT)
    monkeypatch.setattr(
        "app.agents.pr_review.PRReviewAgent.review_pr",
        mock_review,
    )

    app = _make_app()
    with TestClient(app) as client:
        # Create a task WITHOUT repo_url
        resp = client.post(
            f"/api/v1/tasks?team_id={TEAM_ID}",
            json={
                "team_id": TEAM_ID,
                "title": "Task without repo URL",
                "module": "api-core",
                "priority": "medium",
            },
            headers=_auth_headers(),
        )
        assert resp.status_code == 200
        task_id = resp.json()["task_id"]

        _walk_to_in_progress(client, task_id)

        resp = client.post(
            f"/api/v1/tasks/{task_id}/submit",
            json={"pr_url": PR_URL},
            headers=_auth_headers(),
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["state"] == "submitted"

    # AI review should still run because repo_url is inferred from PR URL
    assert data["ai_review"] is not None
    assert data["ai_review"]["score"] == 82

    # Verify the mock was called with the inferred repo_url
    mock_review.assert_awaited_once()
    call_kwargs = mock_review.await_args[1]
    assert call_kwargs["repo_url"] == REPO_URL
    assert call_kwargs["pr_number"] == 42


def test_submit_ai_review_failure_does_not_block_submission(monkeypatch):
    """
    If the AI review agent throws an exception, the submission still succeeds
    and the task transitions to 'submitted' without ai_review populated.
    """
    mock_review = AsyncMock(side_effect=RuntimeError("GitHub API timeout"))
    monkeypatch.setattr(
        "app.agents.pr_review.PRReviewAgent.review_pr",
        mock_review,
    )

    app = _make_app()
    with TestClient(app) as client:
        task_id = _create_task_via_api(client, TEAM_ID)
        _walk_to_in_progress(client, task_id)

        resp = client.post(
            f"/api/v1/tasks/{task_id}/submit",
            json={"pr_url": PR_URL},
            headers=_auth_headers(),
        )

    assert resp.status_code == 200, f"Submit should succeed despite AI error: {resp.text}"
    data = resp.json()

    # Task should still be submitted
    assert data["state"] == "submitted"

    # ai_review should NOT be populated (the review failed)
    assert data["ai_review"] is None

    # Verify the mock was called (it threw, but submission continued)
    mock_review.assert_awaited_once()


def test_submit_with_invalid_pr_url_skips_ai_review(monkeypatch):
    """
    If the PR URL has no parseable PR number, AI review is skipped
    but the submission still succeeds (if the URL is still provided).
    """
    mock_review = AsyncMock()
    monkeypatch.setattr(
        "app.agents.pr_review.PRReviewAgent.review_pr",
        mock_review,
    )

    app = _make_app()
    with TestClient(app) as client:
        task_id = _create_task_via_api(client, TEAM_ID)
        _walk_to_in_progress(client, task_id)

        # Note: The endpoint requires a non-empty pr_url string in the body.
        # However, if the URL doesn't match GitHub's pattern, the parse
        # helpers return None and AI review is skipped.
        resp = client.post(
            f"/api/v1/tasks/{task_id}/submit",
            json={"pr_url": "https://gitlab.com/org/project/-/merge_requests/99"},
            headers=_auth_headers(),
        )

    assert resp.status_code == 200, f"Submit should succeed: {resp.text}"
    data = resp.json()

    assert data["state"] == "submitted"

    # AI review should NOT have been triggered (no parseable PR URL)
    mock_review.assert_not_called()
    assert data["ai_review"] is None


def test_submit_ai_review_stores_error_result_gracefully(monkeypatch):
    """
    If the AI review agent returns an error dict, the endpoint logs it
    but does NOT store it as ai_review (the condition checks for
    'error' not in review_result).
    """
    error_result = {
        "error": "PR diff too large for analysis",
        "repo_url": REPO_URL,
        "pr_number": 42,
    }
    mock_review = AsyncMock(return_value=error_result)
    monkeypatch.setattr(
        "app.agents.pr_review.PRReviewAgent.review_pr",
        mock_review,
    )

    app = _make_app()
    with TestClient(app) as client:
        task_id = _create_task_via_api(client, TEAM_ID)
        _walk_to_in_progress(client, task_id)

        resp = client.post(
            f"/api/v1/tasks/{task_id}/submit",
            json={"pr_url": PR_URL},
            headers=_auth_headers(),
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["state"] == "submitted"

    # The error result has "error" in it, so it should NOT be stored
    assert data["ai_review"] is None


def test_submit_with_empty_pr_url_skips_ai_review():
    """
    The endpoint requires a non-empty pr_url (Pydantic validation).
    """
    app = _make_app()
    with TestClient(app) as client:
        # Create a task first
        task_id = _create_task_via_api(client, TEAM_ID)
        _walk_to_in_progress(client, task_id)

        # Submit with empty string triggers Pydantic validation error
        resp = client.post(
            f"/api/v1/tasks/{task_id}/submit",
            json={"pr_url": ""},
            headers=_auth_headers(),
        )

    # Empty string passes Pydantic validation but has no parseable PR number
    assert resp.status_code == 200
    data = resp.json()
    assert data["state"] == "submitted"
    assert data["ai_review"] is None

