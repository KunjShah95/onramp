"""Tests for self-serve user profile (position, avatar_url) storage."""

import pytest

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
