"""Tests for GitHub account linking.

Covers the flow where a user signed in with email/password attaches their
GitHub identity to the *same* account (instead of erroring with a provider
mismatch):

- ``get_github_login_url(mode="link", uid=...)`` bakes mode+uid into the
  server-side state token (Redis-backed with in-memory fallback).
- ``handle_github_callback`` in link mode attaches the identity and returns a
  fresh JWT for the existing account.
- ``link_github_identity`` refuses to link a GitHub email/account that already
  belongs to a different account.
- ``POST /api/v1/auth/oauth/github/link`` requires a session and returns the
  GitHub consent URL.

By default runs against InMemoryStorage. Pass --run-postgres to also run
against PostgreSQL:
  pytest tests/test_oauth_linking.py --run-postgres
"""

import os
import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.testclient import TestClient

from app.api.v1.auth import router as auth_router
from app.services import oauth_service
from app.services.oauth_service import (
    get_github_login_url,
    handle_github_callback,
    link_github_identity,
    _state_store,
)
from app.services.postgres_db import generate_id
from app.services.user_service import create_user, get_user_by_uid


# ── Dual-backend parametrization ────────────────────────────────────────

pytestmark = pytest.mark.usefixtures("clean_postgres_tables", "seed_test_base")


@pytest.fixture(autouse=True)
def _no_redis(monkeypatch):
    """Keep OAuth state tests hermetic: no REDIS_URL → in-memory fallback.

    Without this, backend/.env's REDIS_URL leaks into tests and
    cache_service.get_client() would attempt a real (failing, ~2s) Redis
    connection on the first state operation.
    """
    monkeypatch.delenv("REDIS_URL", raising=False)
    import app.services.cache_service as cache_service

    cache_service._client = None
    oauth_service._redis_unavailable_until = 0.0
    yield
    cache_service._client = None
    oauth_service._redis_unavailable_until = 0.0


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
    _state_store.clear()
    yield backend
    os.environ["STORAGE_BACKEND"] = "memory"
    postgres_db._storage = None
    _state_store.clear()


# ── Helpers ──────────────────────────────────────────────────────────────


class _FakeResponse:
    def __init__(self, status_code, json_data):
        self.status_code = status_code
        self._json = json_data
        self.text = str(json_data)

    def json(self):
        return self._json


class _FakeRedis:
    """Minimal in-memory stand-in for the async Redis client used by tests."""

    def __init__(self):
        self.store: dict[str, str] = {}

    async def setex(self, key, ttl, value):
        self.store[key] = value

    async def getdel(self, key):
        return self.store.pop(key, None)


def _fake_github_client(post_response, get_response):
    """Return an AsyncClient mock whose .post/.get return the given responses."""
    client = AsyncMock()
    client.post.return_value = post_response
    client.get.return_value = get_response
    client.__aenter__.return_value = client
    client.__aexit__.return_value = False
    return client


def _state_from_url(url: str) -> str:
    from urllib.parse import parse_qs, urlsplit

    return parse_qs(urlsplit(url).query)["state"][0]


# ═══════════════════════════════════════════════════════════════════════
# State store: Redis backing + in-memory fallback
# ═══════════════════════════════════════════════════════════════════════


class TestStateStoreRedisBacking:
    async def test_state_round_trips_through_redis(self, monkeypatch):
        """With Redis available, states are written with a TTL and consumed atomically."""
        fake = _FakeRedis()

        async def _fake_get_client():
            return fake

        monkeypatch.setattr("app.services.cache_service.get_client", _fake_get_client)

        url = await get_github_login_url(mode="link", uid="user-redis")
        state = _state_from_url(url)

        # Written to Redis (not the memory dict), keyed under the prefix.
        key = f"oauth:state:{state}"
        assert key in fake.store
        assert state not in _state_store

        record = await oauth_service._consume_state(state)
        assert record is not None
        assert record["mode"] == "link"
        assert record["uid"] == "user-redis"
        # Single-use — consumed atomically from Redis.
        assert key not in fake.store
        assert await oauth_service._consume_state(state) is None

    async def test_consume_unknown_state_returns_none(self, monkeypatch):
        fake = _FakeRedis()

        async def _fake_get_client():
            return fake

        monkeypatch.setattr("app.services.cache_service.get_client", _fake_get_client)

        assert await oauth_service._consume_state("forged-state") is None

    async def test_redis_write_failure_falls_back_to_memory(self, monkeypatch):
        """If Redis write fails, the state is kept in the in-memory store."""
        fake = _FakeRedis()

        async def _failing_setex(key, ttl, value):
            raise ConnectionError("redis down")

        async def _fake_get_client():
            return fake

        monkeypatch.setattr(fake, "setex", _failing_setex)
        monkeypatch.setattr("app.services.cache_service.get_client", _fake_get_client)

        url = await get_github_login_url(mode="link", uid="user-fallback")
        state = _state_from_url(url)

        assert state in _state_store  # written to memory after the failure

        record = await oauth_service._consume_state(state)
        assert record is not None
        assert record["uid"] == "user-fallback"

    async def test_redis_unavailable_backoff_short_circuits(self, monkeypatch):
        """A failed Redis probe is remembered, so we don't hammer a down Redis."""
        calls = {"n": 0}

        async def _unavailable_get_client():
            calls["n"] += 1
            return None

        monkeypatch.setattr("app.services.cache_service.get_client", _unavailable_get_client)

        assert await oauth_service._redis_client() is None
        assert calls["n"] == 1

        # Backoff active — the next call short-circuits without probing again.
        assert await oauth_service._redis_client() is None
        assert calls["n"] == 1

        # Once the backoff window passes, a probe is attempted again.
        oauth_service._redis_unavailable_until = 0.0
        assert await oauth_service._redis_client() is None
        assert calls["n"] == 2


# ═══════════════════════════════════════════════════════════════════════
# get_github_login_url link mode
# ═══════════════════════════════════════════════════════════════════════


class TestGetGithubLoginUrlLinkMode:
    async def test_link_mode_stores_uid_in_state(self):
        """mode='link' bakes the uid into the server-side state token."""
        url = await get_github_login_url(mode="link", uid="user-123")
        state = _state_from_url(url)

        record = _state_store.get(state)
        assert record is not None
        assert record["mode"] == "link"
        assert record["uid"] == "user-123"

    async def test_login_mode_has_no_uid(self):
        """Default login mode carries no uid in the state record."""
        url = await get_github_login_url()
        state = _state_from_url(url)

        record = _state_store.get(state)
        assert record is not None
        assert record.get("mode", "login") == "login"
        assert "uid" not in record

    async def test_consume_state_returns_link_metadata(self):
        """_consume_state returns the full record so the callback can branch."""
        url = await get_github_login_url(mode="link", uid="user-456")
        state = _state_from_url(url)

        record = await oauth_service._consume_state(state)
        assert record is not None
        assert record["mode"] == "link"
        assert record["uid"] == "user-456"
        # Single-use — a second consume must fail.
        assert await oauth_service._consume_state(state) is None

    async def test_expired_state_rejected(self):
        """A state token older than the TTL is rejected."""
        url = await get_github_login_url()
        state = _state_from_url(url)
        _state_store[state]["created_at"] = (
            datetime.now(timezone.utc) - timedelta(minutes=20)
        ).isoformat()

        assert await oauth_service._consume_state(state) is None


# ═══════════════════════════════════════════════════════════════════════
# link_github_identity
# ═══════════════════════════════════════════════════════════════════════


class TestLinkGithubIdentity:
    async def test_attaches_identity_to_existing_account(self):
        uid = generate_id()
        await create_user(uid=uid, email="dev@example.com", name="Dev", provider="password")

        updated = await link_github_identity(uid, "98765", "octocat", "dev@example.com")

        assert updated["uid"] == uid
        assert updated["github_id"] == "98765"
        assert updated["github_username"] == "octocat"
        # Email/provider stay untouched — the account is not re-created.
        assert updated["provider"] == "password"

        record = await get_user_by_uid(uid)
        assert record["github_id"] == "98765"
        assert record["github_username"] == "octocat"

    async def test_missing_account_raises(self):
        with pytest.raises(ValueError, match="Account not found"):
            await link_github_identity(generate_id(), "1", "ghost")

    async def test_github_email_belongs_to_other_account_raises(self):
        """Linking a GitHub email that belongs to a different account is refused."""
        target_uid = generate_id()
        await create_user(uid=target_uid, email="target@example.com", name="Target", provider="password")
        await create_user(uid=generate_id(), email="taken@example.com", name="Taken", provider="password")

        with pytest.raises(ValueError, match="already registered"):
            await link_github_identity(target_uid, "111", "taken-user", "taken@example.com")

    async def test_same_email_same_account_allowed(self):
        """Linking when the GitHub email matches the target account is fine."""
        uid = generate_id()
        await create_user(uid=uid, email="me@example.com", name="Me", provider="password")

        updated = await link_github_identity(uid, "222", "me-user", "me@example.com")
        assert updated["github_username"] == "me-user"

    async def test_github_id_already_linked_to_other_account_raises(self):
        """A GitHub account (by github_id) cannot be linked to two accounts,
        even when GitHub exposes no email."""
        target_uid = generate_id()
        await create_user(uid=target_uid, email="target@example.com", name="Target", provider="password")
        other_uid = generate_id()
        await create_user(uid=other_uid, email="other@example.com", name="Other", provider="password")
        # The other account already claimed this GitHub identity.
        await link_github_identity(other_uid, "777", "shared-user", "")

        with pytest.raises(ValueError, match="already linked"):
            await link_github_identity(target_uid, "777", "shared-user", "")

    async def test_no_identity_data_raises(self):
        uid = generate_id()
        await create_user(uid=uid, email="x@example.com", name="X", provider="password")

        with pytest.raises(ValueError, match="did not provide"):
            await link_github_identity(uid, "", "", "")


# ═══════════════════════════════════════════════════════════════════════
# handle_github_callback in link mode (mocked GitHub HTTP)
# ═══════════════════════════════════════════════════════════════════════


class TestGithubCallbackLinkMode:
    @patch("app.services.oauth_service.httpx.AsyncClient")
    async def test_callback_attaches_identity_and_returns_jwt(self, mock_client_cls):
        """Link-mode callback returns a JWT for the existing account + links it."""
        uid = generate_id()
        await create_user(uid=uid, email="mona@example.com", name="Mona", provider="password")

        mock_client_cls.return_value = _fake_github_client(
            _FakeResponse(200, {"access_token": "gho_test_token"}),
            _FakeResponse(
                200,
                {"id": 4242, "login": "octocat", "name": "Mona", "email": "mona@example.com"},
            ),
        )

        url = await get_github_login_url(mode="link", uid=uid)
        result = await handle_github_callback(code="test-code", state=_state_from_url(url))

        assert result["uid"] == uid
        assert result["email"] == "mona@example.com"
        assert result["token"]

        record = await get_user_by_uid(uid)
        assert record["github_id"] == "4242"
        assert record["github_username"] == "octocat"

    @patch("app.services.oauth_service.httpx.AsyncClient")
    async def test_callback_link_mode_conflict_raises(self, mock_client_cls):
        """Link-mode callback refuses when GitHub email is already another account."""
        target_uid = generate_id()
        await create_user(uid=target_uid, email="target@example.com", name="Target", provider="password")
        await create_user(uid=generate_id(), email="mona@example.com", name="Mona", provider="password")

        mock_client_cls.return_value = _fake_github_client(
            _FakeResponse(200, {"access_token": "gho_test_token"}),
            _FakeResponse(
                200,
                {"id": 4242, "login": "octocat", "name": "Mona", "email": "mona@example.com"},
            ),
        )

        url = await get_github_login_url(mode="link", uid=target_uid)
        with pytest.raises(ValueError, match="already registered"):
            await handle_github_callback(code="test-code", state=_state_from_url(url))

    async def test_callback_invalid_state_raises(self):
        with pytest.raises(ValueError, match="Invalid state parameter"):
            await handle_github_callback(code="test-code", state="forged-state")


# ═══════════════════════════════════════════════════════════════════════
# POST /api/v1/auth/oauth/github/link endpoint
# ═══════════════════════════════════════════════════════════════════════


@pytest.fixture
def link_client():
    app = FastAPI()

    class _SetUser(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            request.state.user = {
                "uid": "link-user",
                "email": "link@example.com",
                "name": "Linker",
                "provider": "password",
            }
            return await call_next(request)

    app.add_middleware(_SetUser)
    app.include_router(auth_router, prefix="/api/v1")
    return TestClient(app)


@pytest.fixture
def seeded_link_user():
    import asyncio

    asyncio.run(_seed_link_user())
    yield
    asyncio.run(_cleanup_link_user())


async def _seed_link_user():
    await create_user(uid="link-user", email="link@example.com", name="Linker", provider="password")


async def _cleanup_link_user():
    from app.services.postgres_db import get_storage

    storage = get_storage()
    await storage.delete_document("users", "link-user")


def test_github_link_requires_auth(link_client):
    """Without an authenticated session the endpoint is 401."""
    # No _SetUser middleware on this app → request.state.user is never set.
    plain_app = FastAPI()
    plain_app.include_router(auth_router, prefix="/api/v1")
    resp = TestClient(plain_app).post("/api/v1/auth/oauth/github/link")
    assert resp.status_code == 401


def test_github_link_returns_consent_url(link_client, seeded_link_user):
    resp = link_client.post("/api/v1/auth/oauth/github/link", json={})
    assert resp.status_code == 200
    body = resp.json()
    assert body["url"].startswith("https://github.com/login/oauth/authorize")
    assert "client_id=" in body["url"]
    assert "state=" in body["url"]
