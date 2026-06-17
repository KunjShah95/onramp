import pytest
import uuid
from app.services.api_key_service import APIKeyService, TIER_LIMITS, CREDIT_COSTS
from app.services.usage_tracker import UsageTracker


@pytest.mark.asyncio
async def test_create_api_key():
    svc = APIKeyService()
    org_id = str(uuid.uuid4())
    result = await svc.create_key("test-org", "free", "tester", org_id=org_id)
    assert "raw_key" in result
    assert result["raw_key"].startswith("cf_")
    assert result["org_name"] == "test-org"
    assert result["team_id"] == org_id
    assert result["tier"] == "free"


@pytest.mark.asyncio
async def test_create_key_invalid_tier():
    svc = APIKeyService()
    result = await svc.create_key("test-org", "nonexistent")
    assert "error" in result


@pytest.mark.asyncio
async def test_validate_valid_key():
    svc = APIKeyService()
    org_id = str(uuid.uuid4())
    created = await svc.create_key("validate-org", "free", org_id=org_id)
    raw = created["raw_key"]
    validated = await svc.validate_key(raw)
    assert validated is not None
    assert validated["name"] == "validate-org"
    assert validated["team_id"] == org_id


@pytest.mark.asyncio
async def test_validate_invalid_key():
    svc = APIKeyService()
    result = await svc.validate_key("cf_invalid_key_hash")
    assert result is None


@pytest.mark.asyncio
async def test_revoke_key():
    svc = APIKeyService()
    org_id = str(uuid.uuid4())
    created = await svc.create_key("revoke-org", "free", org_id=org_id)
    key_id = created["key_id"]
    revoked = await svc.revoke_key(key_id)
    assert revoked is True
    keys = await svc.list_keys(owner_id=org_id, owner_type="team")
    for k in keys:
        assert k["is_active"] is False


@pytest.mark.asyncio
async def test_list_keys():
    svc = APIKeyService()
    org_id = str(uuid.uuid4())
    await svc.create_key("list-org", "free", org_id=org_id)
    await svc.create_key("list-org", "pro", org_id=org_id)
    keys = await svc.list_keys(owner_id=org_id, owner_type="team")
    assert len(keys) >= 2


@pytest.mark.asyncio
async def test_tier_limits():
    limits = APIKeyService.get_tier_limits("free")
    assert limits["credits_per_month"] == 500


@pytest.mark.asyncio
async def test_credit_costs():
    assert CREDIT_COSTS.get("chat") == 1
    assert CREDIT_COSTS.get("analyze") == 10


@pytest.mark.asyncio
async def test_usage_tracker_track():
    tracker = UsageTracker()
    org_id = str(uuid.uuid4())
    entry = await tracker.track(org_id, "explore", 10)
    assert entry["org_name"] == org_id
    assert entry["credits"] == 10
    assert entry["endpoint"] == "explore"


@pytest.mark.asyncio
async def test_usage_tracker_get_usage():
    tracker = UsageTracker()
    org_id = str(uuid.uuid4())
    await tracker.track(org_id, "explore", 10)
    await tracker.track(org_id, "learn", 5)
    usage = await tracker.get_usage(org_id)
    assert usage["org_name"] == org_id
    assert usage["total_credits"] >= 15
    assert "explore" in usage["endpoint_breakdown"]


@pytest.mark.asyncio
async def test_usage_tracker_check_quota():
    tracker = UsageTracker()
    org_id = str(uuid.uuid4())
    await tracker.track(org_id, "explore", 10)
    result = await tracker.check_quota(org_id, {"credits_per_month": 50})
    assert result["used"] >= 10
    assert result["remaining"] <= 40
    assert result["within_quota"] is True


@pytest.mark.asyncio
async def test_usage_tracker_quota_exceeded():
    tracker = UsageTracker()
    org_id = str(uuid.uuid4())
    await tracker.track(org_id, "explore", 60)
    result = await tracker.check_quota(org_id, {"credits_per_month": 50})
    assert result["within_quota"] is False
