"""
New accounts get a personal team + minimal role at registration.

Covers three layers:
  1. ``team_service.create_personal_team`` — creates the team named after the
     user and adds them as a ``new_dev`` member.
  2. ``POST /api/v1/auth/register`` — auto-provisions the team for a fresh
     email/password signup.
  3. OAuth signup (``oauth_service._find_or_create_oauth_user``) — new social
     accounts get a team too; existing accounts do NOT get a second one.

The register/OAuth endpoints contain an ORM sync block that needs a real
PostgreSQL connection; these tests stub ``db_config`` with an in-memory fake
session so the storage-layer assertions run on the memory backend.
"""

import asyncio
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.services.postgres_db import get_storage, generate_id
from app.services.team_service import create_personal_team


# ── Service layer ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_personal_team_named_after_user_with_new_dev_role():
    storage = get_storage()
    uid = generate_id()

    team = await create_personal_team(uid, "Ada Lovelace")

    assert team["name"] == "Ada Lovelace's Team"
    members = await storage.query_documents(
        "team_members", [("user_id", "==", uid)]
    )
    assert len(members) == 1
    assert members[0]["team_id"] == team["id"]
    assert members[0]["role"] == "junior_dev"


@pytest.mark.asyncio
async def test_create_personal_team_strips_and_falls_back_cleanly():
    storage = get_storage()
    uid = generate_id()

    team = await create_personal_team(uid, "   Grace   Hopper  ")
    assert team["name"] == "Grace Hopper's Team"

    team2 = await create_personal_team(uid, "   ")
    assert team2["name"] == "My Team"

    members = await storage.query_documents(
        "team_members", [("user_id", "==", uid)]
    )
    assert len(members) == 2


# ── In-memory fake for the endpoints' ORM sync block ─────────────────────────


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


def _stub_db_config(module, existing_row=None, monkeypatch=None):
    """Swap db_config for an in-memory fake (no real Postgres needed)."""

    def _factory():
        return _FakeSession(existing_row)

    monkeypatch.setattr(module.db_config, "ensure_engine", _noop_ensure_engine)
    # get_session_factory() returns a sessionmaker (callable); callers then do
    # ``factory()`` to get a session.
    monkeypatch.setattr(module.db_config, "get_session_factory", lambda: _factory)


@pytest.fixture
def client():
    from app.main import app

    with TestClient(app) as c:
        yield c


# ── Register endpoint wiring ─────────────────────────────────────────────────


def test_register_auto_creates_personal_team(client, monkeypatch):
    import app.api.v1.auth as auth_module

    _stub_db_config(auth_module, monkeypatch=monkeypatch)

    resp = client.post("/api/v1/auth/register", json={
        "email": "fresh.dev@example.com",
        "password": "password123",
        "name": "Fresh Dev",
    })
    assert resp.status_code == 200, resp.text
    # ResponseWrapperMiddleware wraps 2xx JSON in {success, data}.
    uid = resp.json()["data"]["uid"]

    async def _assert_team():
        storage = get_storage()
        members = await storage.query_documents(
            "team_members", [("user_id", "==", uid)]
        )
        assert len(members) == 1
        member = members[0]
        assert member["role"] == "junior_dev"
        team = await storage.get_document("teams", member["team_id"])
        assert team is not None
        assert team["name"] == "Fresh Dev's Team"

    asyncio.run(_assert_team())


def test_register_succeeds_even_if_team_creation_fails(client, monkeypatch):
    import app.api.v1.auth as auth_module

    _stub_db_config(auth_module, monkeypatch=monkeypatch)

    async def _boom(user_id, display_name, role="junior_dev"):
        raise RuntimeError("team insert failed")

    # auth.py imports create_personal_team at module level, so patch the
    # name as bound in the auth module.
    monkeypatch.setattr(
        auth_module, "create_personal_team", _boom
    )

    resp = client.post("/api/v1/auth/register", json={
        "email": "resilient.dev@example.com",
        "password": "password123",
        "name": "Resilient Dev",
    })
    # Registration must never be blocked by a best-effort side effect.
    assert resp.status_code == 200, resp.text


# ── OAuth wiring ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_oauth_new_user_gets_personal_team(monkeypatch):
    import app.services.oauth_service as oauth_module

    _stub_db_config(oauth_module, monkeypatch=monkeypatch)

    calls = []

    async def _spy(user_id, display_name, role="junior_dev"):
        calls.append((user_id, display_name, role))

    # oauth_service imports create_personal_team at module level, so patch
    # the name as bound in the oauth module.
    monkeypatch.setattr(
        oauth_module, "create_personal_team", _spy
    )

    result = await oauth_module._find_or_create_oauth_user(
        email="google.new@example.com",
        name="Google New",
        provider="google.com",
        provider_id="g-123",
    )

    assert len(calls) == 1
    assert calls[0][0] == result["uid"]
    assert calls[0][1] == "Google New"
    assert calls[0][2] == "junior_dev"


@pytest.mark.asyncio
async def test_oauth_existing_user_does_not_get_second_team(monkeypatch):
    import app.services.oauth_service as oauth_module

    existing = SimpleNamespace(
        provider="google.com",
        is_active=True,
        id="f0000000-0000-4000-a000-0000000000ff",
        email="existing@example.com",
        name="Existing User",
        github_username=None,
        github_id=None,
        updated_at=None,
    )
    _stub_db_config(oauth_module, existing_row=existing, monkeypatch=monkeypatch)

    calls = []

    async def _spy(user_id, display_name, role="junior_dev"):
        calls.append((user_id, display_name, role))

    monkeypatch.setattr(
        oauth_module, "create_personal_team", _spy
    )

    result = await oauth_module._find_or_create_oauth_user(
        email="existing@example.com",
        name="Existing User",
        provider="google.com",
        provider_id="g-456",
    )

    assert result["uid"] == existing.id
    assert calls == []
