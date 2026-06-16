import pytest
from app.services.team_service import TeamService
from app.services.playbook_service import PlaybookService
from app.services.billing_service import BillingService


# ─── TeamService ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_team():
    svc = TeamService()
    team = await svc.create_team("Test Team", "alice", "free")
    assert team["name"] == "Test Team"
    assert team["owner"] == "alice"
    assert team["tier"] == "free"
    assert len(team["members"]) == 1


@pytest.mark.asyncio
async def test_get_team():
    svc = TeamService()
    team = await svc.create_team("Get Team", "bob")
    fetched = await svc.get_team(team["team_id"])
    assert fetched is not None
    assert fetched["name"] == "Get Team"


@pytest.mark.asyncio
async def test_add_member():
    svc = TeamService()
    team = await svc.create_team("Member Team", "alice", "startup")
    result = await svc.add_member(team["team_id"], "bob")
    assert result["added"] is True
    assert result["user"] == "bob"


@pytest.mark.asyncio
async def test_add_duplicate_member():
    svc = TeamService()
    team = await svc.create_team("Dup Team", "alice", "startup")
    await svc.add_member(team["team_id"], "bob")
    result = await svc.add_member(team["team_id"], "bob")
    assert "error" in result


@pytest.mark.asyncio
async def test_remove_member():
    svc = TeamService()
    team = await svc.create_team("Remove Team", "alice", "startup")
    await svc.add_member(team["team_id"], "bob", "member")
    result = await svc.remove_member(team["team_id"], "bob")
    assert result["removed"] is True


@pytest.mark.asyncio
async def test_create_invite():
    svc = TeamService()
    team = await svc.create_team("Invite Team", "alice")
    invite = await svc.create_invite(team["team_id"], "newuser@test.com", "alice")
    assert invite["email"] == "newuser@test.com"
    assert invite["status"] == "pending"


@pytest.mark.asyncio
async def test_change_tier():
    svc = TeamService()
    team = await svc.create_team("Tier Team", "alice")
    result = await svc.change_tier(team["team_id"], "professional")
    assert result["tier"] == "professional"
    assert result["max_members"] == 20


# ─── PlaybookService ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_playbook():
    svc = PlaybookService()
    pb = await svc.create_playbook(
        team_id="team-1",
        title="Setup Guide",
        description="How to set up local dev",
        steps=["Clone repo", "Install deps", "Run tests"],
        created_by="alice",
        tags=["setup", "dev"],
    )
    assert pb["title"] == "Setup Guide"
    assert len(pb["steps"]) == 3
    assert pb["use_count"] == 0


@pytest.mark.asyncio
async def test_get_playbook():
    svc = PlaybookService()
    pb = await svc.create_playbook("team-2", "Test", "desc", ["step1"], "bob")
    fetched = await svc.get_playbook(pb["playbook_id"])
    assert fetched is not None
    assert fetched["title"] == "Test"


@pytest.mark.asyncio
async def test_list_playbooks():
    svc = PlaybookService()
    await svc.create_playbook("list-team", "PB1", "d1", ["s1"], "alice")
    await svc.create_playbook("list-team", "PB2", "d2", ["s2"], "bob")
    pbs = await svc.list_playbooks("list-team")
    assert len(pbs) >= 2


@pytest.mark.asyncio
async def test_update_playbook():
    svc = PlaybookService()
    pb = await svc.create_playbook("up-team", "Original", "desc", ["s1"], "alice")
    updated = await svc.update_playbook(pb["playbook_id"], {"title": "Updated"})
    assert updated["title"] == "Updated"
    assert updated["version"] == 2


@pytest.mark.asyncio
async def test_archive_playbook():
    svc = PlaybookService()
    pb = await svc.create_playbook("arc-team", "Arc", "desc", ["s1"], "alice")
    success = await svc.archive_playbook(pb["playbook_id"])
    assert success is True
    remaining = await svc.list_playbooks("arc-team")
    assert all(p["is_archived"] for p in remaining)


# ─── BillingService ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_subscription():
    svc = BillingService()
    sub = await svc.create_subscription("bill-team-1", "startup", "monthly")
    assert sub["tier"] == "startup"
    assert sub["price"] == 49
    assert sub["status"] == "active"


@pytest.mark.asyncio
async def test_get_subscription():
    svc = BillingService()
    await svc.create_subscription("bill-team-2", "professional")
    sub = await svc.get_subscription("bill-team-2")
    assert sub is not None
    assert sub["tier"] == "professional"


@pytest.mark.asyncio
async def test_update_subscription():
    svc = BillingService()
    await svc.create_subscription("bill-team-3", "free")
    updated = await svc.update_subscription("bill-team-3", "professional")
    assert updated["tier"] == "professional"
    assert updated["price"] == 299


@pytest.mark.asyncio
async def test_cancel_subscription():
    svc = BillingService()
    await svc.create_subscription("bill-team-4", "free")
    canceled = await svc.cancel_subscription("bill-team-4")
    assert canceled is True
    sub = await svc.get_subscription("bill-team-4")
    assert sub is None


@pytest.mark.asyncio
async def test_attach_stripe():
    svc = BillingService()
    await svc.create_subscription("stripe-team", "startup")
    result = await svc.attach_stripe("stripe-team", "cus_test123", "sub_test456")
    assert result is True


@pytest.mark.asyncio
async def test_get_pricing():
    pricing = BillingService.get_pricing()
    assert "free" in pricing
    assert "startup" in pricing
    assert "professional" in pricing
    assert pricing["free"]["price_monthly"] == 0
    assert pricing["startup"]["price_monthly"] == 49
