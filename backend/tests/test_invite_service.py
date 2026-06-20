"""Tests for the invite service."""

import pytest
from app.services.postgres_db import get_storage
from app.services.invite_service import (
    create_invite,
    get_invite_by_token,
    get_team_invites,
    get_user_pending_invites,
    accept_invite,
    cancel_invite,
)
from app.services.team_service import add_member, get_team_members


@pytest.fixture(autouse=True)
def setup():
    storage = get_storage()
    for coll in list(storage._data.keys()):
        storage._data[coll].clear()


TEAM_ID = "test-invite-team"
USER_ID = "test-user-id"
EMAIL = "new@test.com"


@pytest.mark.asyncio
async def test_create_invite_returns_token():
    invite = await create_invite(TEAM_ID, EMAIL, USER_ID, role="member")
    assert invite["email"] == EMAIL
    assert invite["status"] == "pending"
    assert len(invite["token"]) > 16
    assert invite["team_id"] == TEAM_ID
    assert "expires_at" in invite


@pytest.mark.asyncio
async def test_get_invite_by_token_found():
    created = await create_invite(TEAM_ID, EMAIL, USER_ID)
    found = await get_invite_by_token(created["token"])
    assert found is not None
    assert found["email"] == EMAIL


@pytest.mark.asyncio
async def test_get_invite_by_token_not_found():
    found = await get_invite_by_token("nonexistent-token")
    assert found is None


@pytest.mark.asyncio
async def test_get_team_invites():
    await create_invite(TEAM_ID, "a@test.com", USER_ID)
    await create_invite(TEAM_ID, "b@test.com", USER_ID)
    invites = await get_team_invites(TEAM_ID)
    assert len(invites) == 2


@pytest.mark.asyncio
async def test_get_user_pending_invites():
    await create_invite(TEAM_ID, EMAIL, USER_ID)
    pending = await get_user_pending_invites(EMAIL)
    assert len(pending) == 1
    assert pending[0]["email"] == EMAIL


@pytest.mark.asyncio
async def test_accept_invite_adds_to_team():
    await get_storage().create_document("teams", TEAM_ID, {"id": TEAM_ID, "name": "Test Team"})
    created = await create_invite(TEAM_ID, EMAIL, USER_ID, role="member")
    result = await accept_invite(created["token"], "new-user-id")

    assert result["success"] is True
    assert result["team_id"] == TEAM_ID

    members = await get_team_members(TEAM_ID)
    assert any(m.get("user_id") == "new-user-id" for m in members)


@pytest.mark.asyncio
async def test_accept_invite_expired():
    invite = await create_invite(TEAM_ID, EMAIL, USER_ID)
    # Manually expire it
    storage = get_storage()
    await storage.update_document(
        "team_invites", invite["id"],
        {"expires_at": "2020-01-01T00:00:00"},
    )
    with pytest.raises(ValueError, match="expired"):
        await accept_invite(invite["token"], "new-user-id")


@pytest.mark.asyncio
async def test_cancel_invite():
    created = await create_invite(TEAM_ID, EMAIL, USER_ID)
    result = await cancel_invite(created["id"])
    assert result is True

    found = await get_invite_by_token(created["token"])
    assert found["status"] == "cancelled"


@pytest.mark.asyncio
async def test_accept_invite_twice_fails():
    await get_storage().create_document("teams", TEAM_ID, {"id": TEAM_ID, "name": "Test Team"})
    created = await create_invite(TEAM_ID, EMAIL, USER_ID)
    await accept_invite(created["token"], "new-user-id")
    with pytest.raises(ValueError, match="already accepted"):
        await accept_invite(created["token"], "another-user-id")
