"""
Tests for the Access Guard — FastAPI dependencies for module-level RBAC.

Uses TestClient to exercise the full middleware/dependency chain:
auth (dev bypass) → access guard.

IMPORTANT: The auth dev bypass always sets request.state.user.uid = "dev-user-id".
All team membership and module grants must use this UID.
"""

import pytest
from fastapi import FastAPI, Depends, Request
from fastapi.testclient import TestClient
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from app.middleware.access_guard import require_module_access, require_team_role, require_minimum_role, ROLE_HIERARCHY
from app.services.access_control_service import grant_module_access
from app.services.team_service import add_member
from app.services.postgres_db import get_storage

# ── Constants ──────────────────────────────────────────────────────────────

# The auth dev bypass always returns this UID in request.state.user
DEV_USER = "dev-user-id"
TEAM_ID = "test-team-uuid"
MODULE = "restricted-area"


# ── Test app with auth bypass ──────────────────────────────────────────────

@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    """Enable auth dev bypass and clear storage before each test."""
    monkeypatch.setenv("AUTH_DEV_BYPASS", "true")
    monkeypatch.setenv("ENV", "development")
    storage = get_storage()
    for coll in list(storage._data.keys()):
        storage._data[coll].clear()


class TestAuthMiddleware(BaseHTTPMiddleware):
    """Rejects requests without a valid auth header, then sets DEV_USER."""
    async def dispatch(self, request: Request, call_next):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer ") or len(auth) <= 20:
            return JSONResponse(status_code=401, content={"detail": "Not authenticated"})
        request.state.user = {
            "uid": DEV_USER,
            "email": "dev@test.com",
            "name": "Dev User",
        }
        return await call_next(request)


def _make_app():
    """Build a minimal FastAPI app with test auth and guarded endpoints."""
    app = FastAPI()
    app.add_middleware(TestAuthMiddleware)

    @app.get("/guarded")
    async def guarded_endpoint(
        team_id: str,
        _: None = require_module_access(MODULE),
    ):
        return {"ok": True, "user": DEV_USER}

    @app.get("/guarded-path/{team_id}")
    async def guarded_path_endpoint(
        team_id: str,
        _: None = require_module_access(MODULE),
    ):
        return {"ok": True}

    @app.get("/owner-only")
    async def owner_endpoint(
        team_id: str,
        _: None = require_team_role("owner"),
    ):
        return {"ok": True, "role": "owner"}

    return app


def _headers() -> dict:
    """Auth header with a token the dev bypass will accept."""
    return {"Authorization": "Bearer dev_user_token_that_is_long_enough"}


# ── Setup helpers ──────────────────────────────────────────────────────────

async def _create_team(team_id: str = TEAM_ID):
    """Create a team in storage."""
    storage = get_storage()
    await storage.create_document("teams", team_id, {
        "name": "Test Team",
        "description": "",
        "is_active": True,
    })


# ════════════════════════════════════════════════════════════════════════════
# Module Access Guard
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_guarded_endpoint_allowed():
    """User with module access can access the guarded endpoint."""
    await _create_team()
    await add_member(TEAM_ID, DEV_USER, role="member")
    # Explicitly grant module access to the dev-user-id
    await grant_module_access(TEAM_ID, DEV_USER, MODULE, DEV_USER, "manual")

    app = _make_app()
    with TestClient(app) as client:
        resp = client.get(f"/guarded?team_id={TEAM_ID}", headers=_headers())

    assert resp.status_code == 200
    assert resp.json()["ok"] is True


@pytest.mark.asyncio
async def test_guarded_endpoint_denied():
    """User without module access gets 403."""
    await _create_team()
    await add_member(TEAM_ID, DEV_USER, role="member")
    # NOTE: no grant_module_access call

    app = _make_app()
    with TestClient(app) as client:
        resp = client.get(f"/guarded?team_id={TEAM_ID}", headers=_headers())

    assert resp.status_code == 403
    detail = resp.json()["detail"]
    assert detail["code"] == "MODULE_ACCESS_DENIED"
    assert detail["module"] == MODULE


@pytest.mark.asyncio
async def test_owner_has_implicit_access():
    """Team owners are not required to have explicit module grants."""
    await _create_team()
    # Set dev-user-id as team OWNER (they get implicit access to all modules)
    await add_member(TEAM_ID, DEV_USER, role="owner")

    app = _make_app()
    with TestClient(app) as client:
        resp = client.get(f"/guarded?team_id={TEAM_ID}", headers=_headers())

    assert resp.status_code == 200
    assert resp.json()["ok"] is True


@pytest.mark.asyncio
async def test_not_team_member_no_access():
    """User who is not a team member AND not granted access gets 403."""
    await _create_team()
    # Don't add dev-user-id as a member at all
    # Also don't grant any module access

    app = _make_app()
    with TestClient(app) as client:
        resp = client.get(f"/guarded?team_id={TEAM_ID}", headers=_headers())

    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_missing_team_id():
    """Request without team_id gets 400."""
    app = _make_app()
    with TestClient(app) as client:
        resp = client.get("/guarded", headers=_headers())

    assert resp.status_code == 400
    assert "team context" in resp.text


@pytest.mark.asyncio
async def test_team_id_from_path_param():
    """team_id extracted from path parameter works."""
    await _create_team()
    await add_member(TEAM_ID, DEV_USER, role="member")
    await grant_module_access(TEAM_ID, DEV_USER, MODULE, DEV_USER, "manual")

    app = _make_app()
    with TestClient(app) as client:
        resp = client.get(f"/guarded-path/{TEAM_ID}", headers=_headers())

    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_guarded_endpoint_not_authenticated():
    """Unauthenticated requests get 401 before the guard is reached."""
    app = _make_app()
    with TestClient(app) as client:
        resp = client.get(f"/guarded?team_id={TEAM_ID}")  # no auth header

    assert resp.status_code == 401


# ════════════════════════════════════════════════════════════════════════════
# Team Role Guard
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_owner_endpoint_allowed():
    """Team owner can access owner-only endpoint."""
    await _create_team()
    await add_member(TEAM_ID, DEV_USER, role="owner")

    app = _make_app()
    with TestClient(app) as client:
        resp = client.get(f"/owner-only?team_id={TEAM_ID}", headers=_headers())

    assert resp.status_code == 200
    assert resp.json()["role"] == "owner"


@pytest.mark.asyncio
async def test_owner_endpoint_denied_for_member():
    """Regular team member cannot access owner-only endpoint."""
    await _create_team()
    await add_member(TEAM_ID, DEV_USER, role="member")

    app = _make_app()
    with TestClient(app) as client:
        resp = client.get(f"/owner-only?team_id={TEAM_ID}", headers=_headers())

    assert resp.status_code == 403
    detail = resp.json()["detail"]
    assert detail["code"] == "INSUFFICIENT_ROLE"
    assert detail["required_role"] == "owner"
    assert detail["user_role"] == "member"


@pytest.mark.asyncio
async def test_owner_endpoint_missing_team_id():
    """Owner endpoint without team_id gets 400."""
    app = _make_app()
    with TestClient(app) as client:
        resp = client.get("/owner-only", headers=_headers())

    assert resp.status_code == 400
    assert "team context" in resp.text


# ── require_minimum_role tests ──────────────────────────────────

@pytest.mark.asyncio
async def test_minimum_role_owner_allowed():
    """Owner passes require_minimum_role('senior')."""
    await _create_team()
    await add_member(TEAM_ID, DEV_USER, role="owner")

    app = FastAPI()
    app.add_middleware(TestAuthMiddleware)

    @app.get("/min-senior")
    async def min_senior_endpoint(
        team_id: str,
        _: None = require_minimum_role("senior"),
    ):
        return {"ok": True}

    with TestClient(app) as client:
        resp = client.get(f"/min-senior?team_id={TEAM_ID}", headers=_headers())

    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_minimum_role_senior_allowed():
    """Senior passes require_minimum_role('senior')."""
    await _create_team()
    await add_member(TEAM_ID, DEV_USER, role="senior")

    app = FastAPI()
    app.add_middleware(TestAuthMiddleware)

    @app.get("/min-senior")
    async def min_senior_endpoint(
        team_id: str,
        _: None = require_minimum_role("senior"),
    ):
        return {"ok": True}

    with TestClient(app) as client:
        resp = client.get(f"/min-senior?team_id={TEAM_ID}", headers=_headers())

    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_minimum_role_member_denied():
    """Member fails require_minimum_role('senior')."""
    await _create_team()
    await add_member(TEAM_ID, DEV_USER, role="member")

    app = FastAPI()
    app.add_middleware(TestAuthMiddleware)

    @app.get("/min-senior")
    async def min_senior_endpoint(
        team_id: str,
        _: None = require_minimum_role("senior"),
    ):
        return {"ok": True}

    with TestClient(app) as client:
        resp = client.get(f"/min-senior?team_id={TEAM_ID}", headers=_headers())

    assert resp.status_code == 403
    detail = resp.json()["detail"]
    assert detail["code"] == "INSUFFICIENT_ROLE"
    assert detail["user_role"] == "member"
    assert detail["required_min_role"] == "senior"


@pytest.mark.asyncio
async def test_minimum_role_not_a_member():
    """Non-member gets 403 NOT_A_MEMBER."""
    await _create_team()
    # DON'T add DEV_USER to the team

    app = FastAPI()
    app.add_middleware(TestAuthMiddleware)

    @app.get("/min-senior")
    async def min_senior_endpoint(
        team_id: str,
        _: None = require_minimum_role("senior"),
    ):
        return {"ok": True}

    with TestClient(app) as client:
        resp = client.get(f"/min-senior?team_id={TEAM_ID}", headers=_headers())

    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "NOT_A_MEMBER"
