"""Tests for the GitHub OAuth login/sign-up flow (and a Google regression).

Covers the default login mode that test_oauth_linking.py skips:

- first-time GitHub login creates a user (provider "github.com")
- existing GitHub users sign in without re-creation (identity re-synced)
- provider mismatch with a password account is rejected
- GitHub user endpoint without an email falls back to /user/emails
- success responses include a refresh token so OAuth sessions persist
  (same as "remember me" password sessions) instead of dying after the
  15-minute access window
- Google login regression guard (shares the find-or-create helper)

The ORM block inside _find_or_create_oauth_user needs a database, so
db_config is stubbed with an in-memory fake session (same pattern as
test_auto_personal_team.py).
"""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.testclient import TestClient

from app.api.v1.auth import router as auth_router
from app.services import oauth_service
from app.services.oauth_service import (
    get_github_login_url,
    get_google_login_url,
    handle_github_callback,
    handle_google_callback,
    _state_store,
)
from app.services.user_service import create_user, update_user_profile


pytestmark = pytest.mark.usefixtures("clean_postgres_tables", "seed_test_base")


@pytest.fixture(autouse=True)
def _no_redis(monkeypatch):
    """Keep OAuth state tests hermetic: no REDIS_URL → in-memory fallback."""
    monkeypatch.delenv("REDIS_URL", raising=False)
    import app.services.cache_service as cache_service

    cache_service._client = None
    oauth_service._redis_unavailable_until = 0.0
    _state_store.clear()
    yield
    cache_service._client = None
    oauth_service._redis_unavailable_until = 0.0
    _state_store.clear()


class _FakeResponse:
    def __init__(self, status_code, json_data):
        self.status_code = status_code
        self._json = json_data
        self.text = str(json_data)

    def json(self):
        return self._json


def _fake_github_client(post_response, get_response):
    client = AsyncMock()
    client.post.return_value = post_response
    client.get.return_value = get_response
    client.__aenter__.return_value = client
    client.__aexit__.return_value = False
    return client


def _state_from_url(url: str) -> str:
    from urllib.parse import parse_qs, urlsplit

    return parse_qs(urlsplit(url).query)["state"][0]


class _FakeScalarResult:
    def __init__(self, row=None):
        self._row = row

    def scalar_one_or_none(self):
        return self._row


class _FakeSession:
    def __init__(self, existing_row=None):
        self._existing_row = existing_row

    async def execute(self, *args, **kwargs):
        return _FakeScalarResult(self._existing_row)

    def add(self, obj):
        pass

    async def flush(self):
        pass

    async def commit(self):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False


async def _noop_ensure_engine():
    return None


def _stub_db_config(existing_row=None, monkeypatch=None):
    """Swap oauth_service.db_config for an in-memory fake (no Postgres needed)."""

    def _factory():
        return _FakeSession(existing_row)

    monkeypatch.setattr(oauth_service.db_config, "ensure_engine", _noop_ensure_engine)
    monkeypatch.setattr(oauth_service.db_config, "get_session_factory", lambda: _factory)


def _github_user(login="octocat", email="octocat@example.com", gid="4242"):
    return {"id": gid, "login": login, "name": "The Octocat", "email": email}


# ═══════════════════════════════════════════════════════════════════════
# GitHub login mode
# ═══════════════════════════════════════════════════════════════════════


class TestGithubLoginMode:
    @patch("app.services.oauth_service.httpx.AsyncClient")
    async def test_new_user_created_on_first_github_login(self, mock_client_cls, monkeypatch):
        _stub_db_config(monkeypatch=monkeypatch)
        spy = []

        async def _spy_team(user_id, display_name, role="junior_dev"):
            spy.append((user_id, display_name, role))

        monkeypatch.setattr(oauth_service, "create_personal_team", _spy_team)
        mock_client_cls.return_value = _fake_github_client(
            _FakeResponse(200, {"access_token": "gho_login_token"}),
            _FakeResponse(200, _github_user()),
        )

        url = await get_github_login_url()
        result = await handle_github_callback(code="test-code", state=_state_from_url(url))

        assert result["provider"] == "github.com"
        assert result["email"] == "octocat@example.com"
        assert result["token"]
        assert result.get("refresh_token")
        # A brand-new account was created and provisioned a personal team.
        assert len(spy) == 1
        assert spy[0][0] == result["uid"]

    @patch("app.services.oauth_service.httpx.AsyncClient")
    async def test_existing_github_user_signs_in_and_resyncs_identity(self, mock_client_cls, monkeypatch):
        existing = SimpleNamespace(
            provider="github.com",
            is_active=True,
            id="f0000000-0000-4000-a000-0000000000f1",
            email="octocat@example.com",
            name="Old Name",
            github_username="oldlogin",
            github_id="999",
            updated_at=None,
        )
        _stub_db_config(existing_row=existing, monkeypatch=monkeypatch)
        calls = []

        async def _spy_team(user_id, display_name, role="junior_dev"):
            calls.append((user_id, display_name, role))

        monkeypatch.setattr(oauth_service, "create_personal_team", _spy_team)
        mock_client_cls.return_value = _fake_github_client(
            _FakeResponse(200, {"access_token": "gho_login_token"}),
            _FakeResponse(200, _github_user()),
        )

        url = await get_github_login_url()
        result = await handle_github_callback(code="test-code", state=_state_from_url(url))

        assert result["uid"] == existing.id
        assert result["token"]
        assert result.get("refresh_token")
        # No second account, no second team — identity is re-synced in place.
        assert calls == []
        assert existing.github_username == "octocat"
        assert existing.github_id == "4242"

    @patch("app.services.oauth_service.httpx.AsyncClient")
    async def test_provider_mismatch_with_password_account_raises(self, mock_client_cls, monkeypatch):
        existing = SimpleNamespace(
            provider="password",
            is_active=True,
            id="f0000000-0000-4000-a000-0000000000f2",
            email="pw@example.com",
            name="PW User",
            github_username=None,
            github_id=None,
            updated_at=None,
        )
        _stub_db_config(existing_row=existing, monkeypatch=monkeypatch)
        mock_client_cls.return_value = _fake_github_client(
            _FakeResponse(200, {"access_token": "gho_login_token"}),
            _FakeResponse(200, _github_user(email="pw@example.com")),
        )

        url = await get_github_login_url()
        with pytest.raises(ValueError, match="already registered with password"):
            await handle_github_callback(code="test-code", state=_state_from_url(url))

    @patch("app.services.oauth_service.httpx.AsyncClient")
    async def test_email_fallback_uses_primary_verified_email(self, mock_client_cls, monkeypatch):
        _stub_db_config(monkeypatch=monkeypatch)
        client = AsyncMock()
        client.post.return_value = _FakeResponse(200, {"access_token": "gho_login_token"})
        client.get.side_effect = [
            _FakeResponse(200, {"id": 4242, "login": "octocat", "name": "The Octocat", "email": None}),
            _FakeResponse(200, [
                {"email": "secondary@example.com", "primary": False, "verified": True},
                {"email": "octocat@example.com", "primary": True, "verified": True},
            ]),
        ]
        client.__aenter__.return_value = client
        client.__aexit__.return_value = False
        mock_client_cls.return_value = client

        url = await get_github_login_url()
        result = await handle_github_callback(code="test-code", state=_state_from_url(url))

        assert result["email"] == "octocat@example.com"
        assert result["token"]
        assert result.get("refresh_token")


# ═══════════════════════════════════════════════════════════════════════
# Google regression (shares the find-or-create helper)
# ═══════════════════════════════════════════════════════════════════════


class TestGoogleLoginMode:
    @patch("app.services.oauth_service.httpx.AsyncClient")
    async def test_google_login_returns_token_and_refresh_token(self, mock_client_cls, monkeypatch):
        _stub_db_config(monkeypatch=monkeypatch)
        mock_client_cls.return_value = _fake_github_client(
            _FakeResponse(200, {"access_token": "goog_token"}),
            _FakeResponse(200, {"id": "g-1", "email": "gmail@example.com", "name": "G User"}),
        )

        url = await get_google_login_url()
        result = await handle_google_callback(code="test-code", state=_state_from_url(url))

        assert result["provider"] == "google.com"
        assert result["email"] == "gmail@example.com"
        assert result["token"]
        assert result.get("refresh_token")


# ═══════════════════════════════════════════════════════════════════════
# POST /api/v1/auth/oauth/github/unlink
# ═══════════════════════════════════════════════════════════════════════


@pytest.fixture
def unlink_client():
    app = FastAPI()

    class _SetUser(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            request.state.user = {
                "uid": "unlink-user",
                "email": "unlink@example.com",
                "name": "Unlinker",
                "provider": "password",
            }
            return await call_next(request)

    app.add_middleware(_SetUser)
    app.include_router(auth_router, prefix="/api/v1")
    return TestClient(app)


async def _seed_unlink_user():
    await create_user(
        uid="unlink-user", email="unlink@example.com", name="Unlinker", provider="password"
    )
    await update_user_profile("unlink-user", {"github_username": "octocat", "github_id": "4242"})


def test_unlink_requires_auth():
    plain_app = FastAPI()
    plain_app.include_router(auth_router, prefix="/api/v1")
    resp = TestClient(plain_app).post("/api/v1/auth/oauth/github/unlink", json={})
    assert resp.status_code == 401


def test_unlink_clears_github_identity(unlink_client):
    asyncio.run(_seed_unlink_user())
    resp = unlink_client.post("/api/v1/auth/oauth/github/unlink", json={})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["uid"] == "unlink-user"
    assert body["github_username"] is None
    assert body["github_id"] is None
    # Account/email/provider untouched.
    assert body["provider"] == "password"
    assert body["email"] == "unlink@example.com"