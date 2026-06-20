import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.middleware.auth import AuthMiddleware
from app.api.v1.auth import get_current_user
from app.api.v1.dashboard import router as dashboard_router
from app.services.postgres_db import get_storage
from app.services.task_service import create_task
from app.services.team_service import add_member
from app.services.access_control_service import grant_module_access

DEV_USER = "dev-user-id"
TEAM_ID = "trainee-dash-team"


def _make_app():
    app = FastAPI()
    app.add_middleware(AuthMiddleware)
    app.include_router(dashboard_router, prefix="/api/v1")

    async def _test_user(request: Request = None):
        return {"uid": DEV_USER, "email": "dev@test.com", "name": "Dev User"}
    app.dependency_overrides[get_current_user] = _test_user
    return app


def _auth_headers() -> dict:
    return {"Authorization": "Bearer dev_user_token_that_is_long_enough"}


@pytest.fixture(autouse=True)
def setup(monkeypatch):
    monkeypatch.setenv("AUTH_DEV_BYPASS", "true")
    monkeypatch.setenv("ENV", "development")
    storage = get_storage()
    for coll in list(storage._data.keys()):
        storage._data[coll].clear()
    # Seed a user and team membership for DEV_USER
    import asyncio
    asyncio.run(storage.create_document(
        "users", DEV_USER,
        {"id": DEV_USER, "name": "Dev User", "provider": "password"},
    ))
    asyncio.run(add_member(TEAM_ID, DEV_USER, role="member"))


@pytest.mark.asyncio(loop_scope="session")
async def test_trainee_dashboard_returns_structure():
    app = _make_app()
    client = TestClient(app)
    resp = client.get(f"/api/v1/dashboard/trainee?team_id={TEAM_ID}", headers=_auth_headers())
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["user_id"] == DEV_USER
    assert "progress" in data
    assert "modules" in data
    assert "recent_tasks" in data


@pytest.mark.asyncio(loop_scope="session")
async def test_trainee_dashboard_shows_task_progress():
    await create_task(
        team_id=TEAM_ID,
        created_by=DEV_USER,
        title="Learn auth",
        assigned_to=DEV_USER,
        module="api-core",
    )
    app = _make_app()
    client = TestClient(app)
    resp = client.get(f"/api/v1/dashboard/trainee?team_id={TEAM_ID}", headers=_auth_headers())
    assert resp.status_code == 200
    data = resp.json()
    assert data["progress"]["total"] >= 1
    assert any(t["title"] == "Learn auth" for t in data["recent_tasks"])


@pytest.mark.asyncio(loop_scope="session")
async def test_trainee_dashboard_shows_modules():
    await grant_module_access(
        team_id=TEAM_ID,
        user_id=DEV_USER,
        module="frontend-auth",
        granted_by=DEV_USER,
        source="task_completion",
    )
    app = _make_app()
    client = TestClient(app)
    resp = client.get(f"/api/v1/dashboard/trainee?team_id={TEAM_ID}", headers=_auth_headers())
    assert resp.status_code == 200
    data = resp.json()
    module_names = [m["module"] for m in data["modules"]]
    assert "frontend-auth" in module_names


@pytest.mark.asyncio(loop_scope="session")
async def test_trainee_dashboard_unauthorized():
    app = _make_app()
    client = TestClient(app)
    resp = client.get(f"/api/v1/dashboard/trainee?team_id={TEAM_ID}")
    assert resp.status_code == 401
