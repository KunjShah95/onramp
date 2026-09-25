"""Focused regressions for typed team-invite acceptance claims."""

import pytest

from app.services import invite_service
from app.services.postgres_db import get_storage


async def test_accept_invite_claims_registered_typed_document(monkeypatch):
    storage = get_storage()
    team_id = "f0000000-0000-4000-a000-0000000000a1"
    user_id = "f0000000-0000-4000-a000-0000000000a2"
    await storage.create_document(
        "teams",
        team_id,
        {"name": "Claim Team", "description": "", "is_active": True},
    )
    invite = await invite_service.create_invite(
        team_id, "invitee@example.com", user_id, role="member"
    )

    calls = []
    original_claim = storage.claim_document

    async def _claim(collection, doc_id, field, expected, updates):
        calls.append((collection, doc_id, field, expected))
        return await original_claim(collection, doc_id, field, expected, updates)

    async def _add_member(team, user, role="junior_dev"):
        assert (team, user, role) == (team_id, user_id, "member")

    monkeypatch.setattr(storage, "claim_document", _claim)
    monkeypatch.setattr("app.services.team_service.add_member", _add_member)

    result = await invite_service.accept_invite(invite["token"], user_id)

    assert result["success"] is True
    assert calls == [("team_invites", invite["id"], "status", "pending")]
    stored = await storage.get_document("team_invites", invite["id"])
    assert stored["status"] == "accepted"

    with pytest.raises(ValueError, match="already accepted"):
        await invite_service.accept_invite(invite["token"], user_id)
