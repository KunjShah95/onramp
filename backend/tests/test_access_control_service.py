"""
Tests for the Access Control Service — module-level RBAC.

Covers all public functions in access_control_service.py:
grant, revoke, revoke-all, get_user_modules, has_module_access,
list_team_module_permissions, get_team_modules.
"""

import pytest
from app.services.postgres_db import get_storage
from app.services.team_service import add_member
from app.services.access_control_service import (
    grant_module_access,
    revoke_module_access,
    revoke_all_module_access,
    get_user_modules,
    has_module_access,
    list_team_module_permissions,
    get_team_modules,
)

# ── Constants ──────────────────────────────────────────────────────────────

TEAM_A = "team-alpha"
TEAM_B = "team-beta"
SENIOR = "senior-uid"
TRAINEE = "trainee-uid"
OTHER_TRAINEE = "other-trainee"
MODULE_1 = "api-core"
MODULE_2 = "frontend-auth"
MODULE_3 = "payments"


# ── Fixture ───────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def clean_storage():
    """Clear all storage collections before each test."""
    storage = get_storage()
    for coll in list(storage._data.keys()):
        storage._data[coll].clear()


async def _setup_team(team_id: str = TEAM_A):
    """Create a team with a senior (owner) and a trainee (member)."""
    storage = get_storage()
    await storage.create_document("teams", team_id, {
        "id": team_id, "name": f"Team {team_id}", "is_active": True,
    })
    # Owner = SENIOR, Member = TRAINEE
    await add_member(team_id, SENIOR, role="owner")
    await add_member(team_id, TRAINEE, role="member")
    await add_member(team_id, OTHER_TRAINEE, role="member")


# ════════════════════════════════════════════════════════════════════════════
# Grant Module Access
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_grant_module_access_creates_record():
    """Granting module access creates a record with metadata."""
    await _setup_team()

    result = await grant_module_access(TEAM_A, TRAINEE, MODULE_1, SENIOR, source="manual")

    assert result is not None
    assert result["team_id"] == TEAM_A
    assert result["user_id"] == TRAINEE
    assert result["module"] == MODULE_1
    assert result["granted_by"] == SENIOR
    assert result["source"] == "manual"
    assert result["granted_at"] is not None


@pytest.mark.asyncio
async def test_grant_module_access_duplicate_rejected():
    """Granting the same (team, user, module) twice raises ValueError."""
    await _setup_team()

    await grant_module_access(TEAM_A, TRAINEE, MODULE_1, SENIOR)

    with pytest.raises(ValueError, match="already has access"):
        await grant_module_access(TEAM_A, TRAINEE, MODULE_1, SENIOR)


@pytest.mark.asyncio
async def test_grant_same_module_different_team_allowed():
    """Same user+module in different teams is a separate permission."""
    await _setup_team(TEAM_A)
    await _setup_team(TEAM_B)

    await grant_module_access(TEAM_A, TRAINEE, MODULE_1, SENIOR)
    # Should not raise — different team
    await grant_module_access(TEAM_B, TRAINEE, MODULE_1, SENIOR)

    # Both should be independently queryable
    a_modules = await get_user_modules(TEAM_A, TRAINEE)
    b_modules = await get_user_modules(TEAM_B, TRAINEE)
    assert len(a_modules) == 1
    assert len(b_modules) == 1


@pytest.mark.asyncio
async def test_grant_same_team_different_user_allowed():
    """Same team+module for different users is separate permissions."""
    await _setup_team()

    await grant_module_access(TEAM_A, TRAINEE, MODULE_1, SENIOR)
    await grant_module_access(TEAM_A, OTHER_TRAINEE, MODULE_1, SENIOR)

    # Both should have access
    assert await has_module_access(TEAM_A, TRAINEE, MODULE_1) is True
    assert await has_module_access(TEAM_A, OTHER_TRAINEE, MODULE_1) is True


# ════════════════════════════════════════════════════════════════════════════
# Revoke Module Access
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_revoke_removes_access():
    """After revoking, the user no longer has access."""
    await _setup_team()
    await grant_module_access(TEAM_A, TRAINEE, MODULE_1, SENIOR)

    assert await has_module_access(TEAM_A, TRAINEE, MODULE_1) is True

    revoked = await revoke_module_access(TEAM_A, TRAINEE, MODULE_1)
    assert revoked is True

    assert await has_module_access(TEAM_A, TRAINEE, MODULE_1) is False


@pytest.mark.asyncio
async def test_revoke_non_existent_permission_returns_false():
    """Revoking a permission that doesn't exist returns False."""
    await _setup_team()

    revoked = await revoke_module_access(TEAM_A, TRAINEE, MODULE_1)
    assert revoked is False


@pytest.mark.asyncio
async def test_revoke_only_removes_specific_module():
    """Revoking one module does not affect other granted modules."""
    await _setup_team()
    await grant_module_access(TEAM_A, TRAINEE, MODULE_1, SENIOR)
    await grant_module_access(TEAM_A, TRAINEE, MODULE_2, SENIOR)

    await revoke_module_access(TEAM_A, TRAINEE, MODULE_1)

    assert await has_module_access(TEAM_A, TRAINEE, MODULE_1) is False
    assert await has_module_access(TEAM_A, TRAINEE, MODULE_2) is True


# ════════════════════════════════════════════════════════════════════════════
# Revoke All Module Access
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_revoke_all_removes_all_modules():
    """Revoke-all removes every module grant for a user in a team."""
    await _setup_team()
    await grant_module_access(TEAM_A, TRAINEE, MODULE_1, SENIOR)
    await grant_module_access(TEAM_A, TRAINEE, MODULE_2, SENIOR)
    await grant_module_access(TEAM_A, TRAINEE, MODULE_3, SENIOR)

    count = await revoke_all_module_access(TEAM_A, TRAINEE)
    assert count == 3

    assert await has_module_access(TEAM_A, TRAINEE, MODULE_1) is False
    assert await has_module_access(TEAM_A, TRAINEE, MODULE_2) is False
    assert await has_module_access(TEAM_A, TRAINEE, MODULE_3) is False


@pytest.mark.asyncio
async def test_revoke_all_does_not_affect_other_users():
    """Revoke-all for one user does not affect other users' grants."""
    await _setup_team()
    await grant_module_access(TEAM_A, TRAINEE, MODULE_1, SENIOR)
    await grant_module_access(TEAM_A, OTHER_TRAINEE, MODULE_2, SENIOR)

    count = await revoke_all_module_access(TEAM_A, TRAINEE)
    assert count == 1

    # Other user still has their grant
    assert await has_module_access(TEAM_A, OTHER_TRAINEE, MODULE_2) is True


@pytest.mark.asyncio
async def test_revoke_all_empty_returns_zero():
    """Revoke-all for a user with no grants returns 0."""
    await _setup_team()

    count = await revoke_all_module_access(TEAM_A, TRAINEE)
    assert count == 0


# ════════════════════════════════════════════════════════════════════════════
# Get User Modules
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_get_user_modules_returns_granted():
    """get_user_modules returns all modules granted to a user, sorted by date."""
    await _setup_team()
    await grant_module_access(TEAM_A, TRAINEE, MODULE_2, SENIOR)
    await grant_module_access(TEAM_A, TRAINEE, MODULE_1, SENIOR)

    records = await get_user_modules(TEAM_A, TRAINEE)

    assert len(records) == 2
    # Should be sorted by granted_at descending (most recent first)
    assert records[0]["module"] == MODULE_1  # granted last
    assert records[1]["module"] == MODULE_2  # granted first


@pytest.mark.asyncio
async def test_get_user_modules_empty():
    """get_user_modules returns empty list when no grants exist."""
    await _setup_team()

    records = await get_user_modules(TEAM_A, TRAINEE)
    assert records == []


@pytest.mark.asyncio
async def test_get_user_modules_only_own_team():
    """Grants in one team don't appear in get_user_modules for another team."""
    await _setup_team(TEAM_A)
    await _setup_team(TEAM_B)
    await grant_module_access(TEAM_A, TRAINEE, MODULE_1, SENIOR)

    a_records = await get_user_modules(TEAM_A, TRAINEE)
    b_records = await get_user_modules(TEAM_B, TRAINEE)

    assert len(a_records) == 1
    assert len(b_records) == 0


# ════════════════════════════════════════════════════════════════════════════
# Has Module Access
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_has_module_access_granted_returns_true():
    """A user with an explicit module grant has access."""
    await _setup_team()
    await grant_module_access(TEAM_A, TRAINEE, MODULE_1, SENIOR)

    assert await has_module_access(TEAM_A, TRAINEE, MODULE_1) is True


@pytest.mark.asyncio
async def test_has_module_access_not_granted_returns_false():
    """A user without a grant does not have access."""
    await _setup_team()

    assert await has_module_access(TEAM_A, TRAINEE, MODULE_1) is False


@pytest.mark.asyncio
async def test_has_module_access_owner_implicit():
    """Team owners have implicit access to all modules without explicit grant."""
    await _setup_team()
    # SENIOR is the owner — no explicit grant for MODULE_1

    assert await has_module_access(TEAM_A, SENIOR, MODULE_1) is True


@pytest.mark.asyncio
async def test_has_module_access_owner_also_with_grant():
    """Owners with an explicit grant still pass."""
    await _setup_team()
    await grant_module_access(TEAM_A, SENIOR, MODULE_1, SENIOR)

    assert await has_module_access(TEAM_A, SENIOR, MODULE_1) is True


@pytest.mark.asyncio
async def test_has_module_access_different_team_isolation():
    """Access in one team does not grant access in another team."""
    await _setup_team(TEAM_A)
    await _setup_team(TEAM_B)
    await grant_module_access(TEAM_A, TRAINEE, MODULE_1, SENIOR)

    assert await has_module_access(TEAM_A, TRAINEE, MODULE_1) is True
    assert await has_module_access(TEAM_B, TRAINEE, MODULE_1) is False


# ════════════════════════════════════════════════════════════════════════════
# List Team Module Permissions
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_list_team_module_permissions_returns_all():
    """list_team_module_permissions returns all grants across members."""
    await _setup_team()

    # Create user records so list_team_module_permissions can populate user_name
    storage = get_storage()
    await storage.create_document("users", TRAINEE, {"id": TRAINEE, "name": "Alpha", "email": "a@t.com"})
    await storage.create_document("users", OTHER_TRAINEE, {"id": OTHER_TRAINEE, "name": "Beta", "email": "b@t.com"})

    await grant_module_access(TEAM_A, TRAINEE, MODULE_1, SENIOR)
    await grant_module_access(TEAM_A, TRAINEE, MODULE_2, SENIOR)
    await grant_module_access(TEAM_A, OTHER_TRAINEE, MODULE_3, SENIOR)

    permissions = await list_team_module_permissions(TEAM_A)

    assert len(permissions) == 3

    # Find by user_id
    alpha_perms = [p for p in permissions if p["user_id"] == TRAINEE]
    beta_perms = [p for p in permissions if p["user_id"] == OTHER_TRAINEE]

    assert len(alpha_perms) == 2
    assert len(beta_perms) == 1

    # user_name should be populated from the users collection
    assert alpha_perms[0]["user_name"] == "Alpha"
    assert beta_perms[0]["user_name"] == "Beta"


@pytest.mark.asyncio
async def test_list_team_module_permissions_empty():
    """list_team_module_permissions returns empty list when no grants."""
    await _setup_team()

    permissions = await list_team_module_permissions(TEAM_A)
    assert permissions == []


@pytest.mark.asyncio
async def test_list_team_module_permissions_sorted_by_date():
    """Permissions should be sorted with most recent grant first."""
    await _setup_team()
    await storage_create_user(TRAINEE, "Alpha")

    await grant_module_access(TEAM_A, TRAINEE, MODULE_1, SENIOR)  # older
    await grant_module_access(TEAM_A, TRAINEE, MODULE_2, SENIOR)  # newer

    permissions = await list_team_module_permissions(TEAM_A)

    assert len(permissions) == 2
    # Most recent first
    assert permissions[0]["module"] == MODULE_2
    assert permissions[1]["module"] == MODULE_1


async def storage_create_user(uid: str, name: str):
    """Helper to create a minimal user record."""
    storage = get_storage()
    await storage.create_document("users", uid, {
        "id": uid, "name": name, "email": f"{name.lower()}@t.com",
    })


# ════════════════════════════════════════════════════════════════════════════
# Get Team Modules (distinct modules used in a team)
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_get_team_modules_returns_distinct():
    """get_team_modules returns sorted distinct modules across all grants."""
    await _setup_team()
    await grant_module_access(TEAM_A, TRAINEE, MODULE_2, SENIOR)
    await grant_module_access(TEAM_A, TRAINEE, MODULE_1, SENIOR)
    await grant_module_access(TEAM_A, OTHER_TRAINEE, MODULE_2, SENIOR)  # duplicate

    modules = await get_team_modules(TEAM_A)

    assert modules == sorted([MODULE_1, MODULE_2])


@pytest.mark.asyncio
async def test_get_team_modules_empty():
    """get_team_modules returns empty list when no grants exist."""
    await _setup_team()

    modules = await get_team_modules(TEAM_A)
    assert modules == []


@pytest.mark.asyncio
async def test_get_team_modules_team_isolation():
    """Modules from one team don't appear in another team's list."""
    await _setup_team(TEAM_A)
    await _setup_team(TEAM_B)
    await grant_module_access(TEAM_A, TRAINEE, MODULE_1, SENIOR)

    a_modules = await get_team_modules(TEAM_A)
    b_modules = await get_team_modules(TEAM_B)

    assert MODULE_1 in a_modules
    assert b_modules == []


# ════════════════════════════════════════════════════════════════════════════
# Source tracking
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_grant_module_access_source_task_completion():
    """Grants with source='task_completion' are properly recorded."""
    await _setup_team()

    result = await grant_module_access(TEAM_A, TRAINEE, MODULE_1, SENIOR, source="task_completion")

    assert result["source"] == "task_completion"

    # Verify via list
    records = await get_user_modules(TEAM_A, TRAINEE)
    assert records[0]["source"] == "task_completion"


@pytest.mark.asyncio
async def test_grant_module_access_default_source_manual():
    """Granting without specifying source defaults to 'manual'."""
    await _setup_team()

    result = await grant_module_access(TEAM_A, TRAINEE, MODULE_1, SENIOR)

    assert result["source"] == "manual"
