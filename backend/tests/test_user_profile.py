"""Tests for self-serve user profile (position, avatar_url) storage."""

import asyncio

import pytest
from fastapi import FastAPI
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.testclient import TestClient

from app.api.v1.auth import router as auth_router
from app.services.postgres_db import get_storage, generate_id
from app.services.field_encryption import decrypt_field
from app.services.user_service import create_user, get_user_by_uid, update_user_profile


@pytest.mark.asyncio
async def test_new_user_profile_fields_default_to_none():
    uid = generate_id()
    await create_user(uid=uid, email="pos@example.com", name="Pos", provider="password")

    record = await get_user_by_uid(uid)
    assert record is not None
    assert "position" in record
    assert record["position"] is None
    assert "avatar_url" in record
    assert record["avatar_url"] is None


@pytest.mark.asyncio
async def test_update_user_profile_sets_position_and_avatar():
    uid = generate_id()
    await create_user(uid=uid, email="p1@example.com", name="P1", provider="password")

    updated = await update_user_profile(uid, {"position": "Senior Engineer", "avatar_url": "https://img/a.png"})
    assert updated["position"] == "Senior Engineer"
    assert updated["avatar_url"] == "https://img/a.png"

    record = await get_user_by_uid(uid)
    assert record["position"] == "Senior Engineer"
    assert record["avatar_url"] == "https://img/a.png"


@pytest.mark.asyncio
async def test_update_user_profile_clears_position_with_empty_string():
    uid = generate_id()
    await create_user(uid=uid, email="p2@example.com", name="P2", provider="password")
    await update_user_profile(uid, {"position": "CTO"})

    updated = await update_user_profile(uid, {"position": ""})
    assert updated["position"] is None


@pytest.mark.asyncio
async def test_update_user_profile_encrypts_name_at_rest():
    s = get_storage()
    uid = generate_id()
    await create_user(uid=uid, email="p3@example.com", name="P3", provider="password")

    await update_user_profile(uid, {"name": "New Name"})

    raw = await s.get_document("users", uid)
    assert raw["name"] != "New Name"          # stored encrypted
    assert decrypt_field(raw["name"]) == "New Name"


@pytest.mark.asyncio
async def test_update_user_profile_returns_none_for_missing_user():
    updated = await update_user_profile(generate_id(), {"name": "Ghost"})
    assert updated is None


@pytest.fixture
def profile_client():
    app = FastAPI()

    class _SetUser(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            request.state.user = {
                "uid": "ep-user",
                "email": "ep@example.com",
                "name": "EP",
                "provider": "password",
            }
            return await call_next(request)

    app.add_middleware(_SetUser)
    app.include_router(auth_router, prefix="/api/v1")
    return TestClient(app)


@pytest.fixture
def seeded_profile_user():
    asyncio.run(_seed_ep_user())
    yield
    asyncio.run(_cleanup_ep_user())


async def _seed_ep_user():
    await create_user(uid="ep-user", email="ep@example.com", name="EP", provider="password")


async def _cleanup_ep_user():
    storage = get_storage()
    await storage.delete_document("users", "ep-user")


def test_patch_me_updates_profile(profile_client, seeded_profile_user):
    resp = profile_client.patch("/api/v1/auth/me", json={
        "name": "Updated Name",
        "position": "Staff Engineer",
        "avatar_url": "https://img/b.png",
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Updated Name"
    assert body["position"] == "Staff Engineer"
    assert body["avatar_url"] == "https://img/b.png"


def test_patch_me_clears_position(profile_client, seeded_profile_user):
    resp = profile_client.patch("/api/v1/auth/me", json={"position": ""})
    assert resp.status_code == 200
    assert resp.json()["position"] is None


def test_patch_me_rejects_email_change(profile_client, seeded_profile_user):
    resp = profile_client.patch("/api/v1/auth/me", json={"email": "hacked@example.com"})
    assert resp.status_code == 400


def test_patch_me_unknown_fields_rejected(profile_client, seeded_profile_user):
    resp = profile_client.patch("/api/v1/auth/me", json={"hacker_field": "x"})
    assert resp.status_code == 422


def test_patch_me_missing_user_404(profile_client):
    resp = profile_client.patch("/api/v1/auth/me", json={"name": "Ghost"})
    assert resp.status_code == 404


def test_patch_me_empty_name_rejected(profile_client, seeded_profile_user):
    resp = profile_client.patch("/api/v1/auth/me", json={"name": "   "})
    assert resp.status_code == 400
