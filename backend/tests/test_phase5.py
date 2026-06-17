import pytest
import pytest_asyncio
import uuid
from app.services.team_service import TeamService
from app.services.playbook_service import PlaybookService
from app.services.billing_service import BillingService
from app.services.postgres_db import get_storage

USER_ALICE = str(uuid.uuid4())
USER_BOB = str(uuid.uuid4())

@pytest_asyncio.fixture(autouse=True)
async def setup_users():
    storage = get_storage()
    for uid, email, name in [(USER_ALICE, f"alice_{USER_ALICE[:8]}@test.com", "Alice"), (USER_BOB, f"bob_{USER_BOB[:8]}@test.com", "Bob")]:
        if not await storage.get_document("users", uid):
            await storage.create_document("users", uid, {
                "email": email,
                "name": name,
                "provider": "github",
                "is_active": True
            })

# ─── TeamService ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_team():
    svc = TeamService()
    team = await svc.create_team("Test Team", USER_ALICE, "free")
    assert team["name"] == "Test Team"
    assert team["owner"] == USER_ALICE
    assert team["tier"] == "free"
    assert len(team["members"]) == 1


@pytest.mark.asyncio
async def test_get_team():
    svc = TeamService()
    team = await svc.create_team("Get Team", USER_BOB)
    fetched = await svc.get_team(team["id"])
    assert fetched is not None
    assert fetched["name"] == "Get Team"


@pytest.mark.asyncio
async def test_add_member():
    svc = TeamService()
    team = await svc.create_team("Member Team", USER_ALICE, "startup")
    result = await svc.add_member(team["id"], USER_BOB)
    assert result["added"] is True
    assert result["user"] == USER_BOB


@pytest.mark.asyncio
async def test_add_duplicate_member():
    svc = TeamService()
    team = await svc.create_team("Dup Team", USER_ALICE, "startup")
    await svc.add_member(team["id"], USER_BOB)
    result = await svc.add_member(team["id"], USER_BOB)
    assert "error" in result


@pytest.mark.asyncio
async def test_remove_member():
    svc = TeamService()
    team = await svc.create_team("Remove Team", USER_ALICE, "startup")
    await svc.add_member(team["id"], USER_BOB, "member")
    result = await svc.remove_member(team["id"], USER_BOB)
    assert result["removed"] is True


@pytest.mark.asyncio
async def test_create_invite():
    svc = TeamService()
    team = await svc.create_team("Invite Team", USER_ALICE)
    invite = await svc.create_invite(team["id"], "newuser@test.com", USER_ALICE)
    assert invite["email"] == "newuser@test.com"
    assert invite["status"] == "pending"


@pytest.mark.asyncio
async def test_change_tier():
    svc = TeamService()
    team = await svc.create_team("Tier Team", USER_ALICE)
    result = await svc.change_tier(team["id"], "professional")
    assert result["tier"] == "professional"
    assert result["max_members"] == 20


# ─── PlaybookService ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_playbook():
    svc = PlaybookService()
    team_id = str(uuid.uuid4())
    pb = await svc.create_playbook(
        team_id=team_id,
        title="Setup Guide",
        description="How to set up local dev",
        steps=["Clone repo", "Install deps", "Run tests"],
        created_by=USER_ALICE,
        tags=["setup", "dev"],
    )
    assert pb["title"] == "Setup Guide"
    assert len(pb["steps"]) == 3
    assert pb["use_count"] == 0


@pytest.mark.asyncio
async def test_get_playbook():
    svc = PlaybookService()
    team_id = str(uuid.uuid4())
    pb = await svc.create_playbook(team_id, "Test", "desc", ["step1"], USER_BOB)
    fetched = await svc.get_playbook(pb["playbook_id"])
    assert fetched is not None
    assert fetched["title"] == "Test"


@pytest.mark.asyncio
async def test_list_playbooks():
    svc = PlaybookService()
    team_id = str(uuid.uuid4())
    await svc.create_playbook(team_id, "PB1", "d1", ["s1"], USER_ALICE)
    await svc.create_playbook(team_id, "PB2", "d2", ["s2"], USER_BOB)
    pbs = await svc.list_playbooks(team_id)
    assert len(pbs) >= 2


@pytest.mark.asyncio
async def test_update_playbook():
    svc = PlaybookService()
    team_id = str(uuid.uuid4())
    pb = await svc.create_playbook(team_id, "Original", "desc", ["s1"], USER_ALICE)
    updated = await svc.update_playbook(pb["playbook_id"], {"title": "Updated"})
    assert updated["title"] == "Updated"
    assert updated["version"] == 2


@pytest.mark.asyncio
async def test_archive_playbook():
    svc = PlaybookService()
    team_id = str(uuid.uuid4())
    pb = await svc.create_playbook(team_id, "Arc", "desc", ["s1"], USER_ALICE)
    success = await svc.archive_playbook(pb["playbook_id"])
    assert success is True
    remaining = await svc.list_playbooks(team_id)
    assert all(p["is_archived"] for p in remaining)


# ─── BillingService ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_subscription():
    svc = BillingService()
    team_id = str(uuid.uuid4())
    sub = await svc.create_subscription(team_id, "startup", "monthly")
    assert sub["tier"] == "startup"
    assert sub["price"] == 49
    assert sub["status"] == "active"


@pytest.mark.asyncio
async def test_get_subscription():
    svc = BillingService()
    team_id = str(uuid.uuid4())
    await svc.create_subscription(team_id, "professional")
    sub = await svc.get_subscription(team_id)
    assert sub is not None
    assert sub["tier"] == "professional"


@pytest.mark.asyncio
async def test_update_subscription():
    svc = BillingService()
    team_id = str(uuid.uuid4())
    await svc.create_subscription(team_id, "free")
    updated = await svc.update_subscription(team_id, "professional")
    assert updated["tier"] == "professional"
    assert updated["price"] == 299


@pytest.mark.asyncio
async def test_cancel_subscription():
    svc = BillingService()
    team_id = str(uuid.uuid4())
    await svc.create_subscription(team_id, "free")
    canceled = await svc.cancel_subscription(team_id)
    assert canceled is True
    sub = await svc.get_subscription(team_id)
    assert sub is None


@pytest.mark.asyncio
async def test_attach_stripe():
    svc = BillingService()
    team_id = str(uuid.uuid4())
    await svc.create_subscription(team_id, "startup")
    result = await svc.attach_stripe(team_id, "cus_test123", "sub_test456")
    assert result is True


@pytest.mark.asyncio
async def test_get_pricing():
    pricing = BillingService.get_pricing()
    assert "free" in pricing
    assert "startup" in pricing
    assert "professional" in pricing
    assert pricing["free"]["price_monthly"] == 0
    assert pricing["startup"]["price_monthly"] == 49
