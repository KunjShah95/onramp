"""Tests for self-serve user profile (position, avatar_url) storage."""

import pytest

from app.services.postgres_db import generate_id
from app.services.user_service import create_user, get_user_by_uid


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
