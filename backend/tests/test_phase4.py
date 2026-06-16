import pytest
from app.services.api_key_service import APIKeyService, TIER_LIMITS, CREDIT_COSTS
from app.services.usage_tracker import UsageTracker


@pytest.mark.asyncio
async def test_create_api_key():
    svc = APIKeyService()
    result = await svc.create_key("test-org", "free", "tester")
    assert "raw_key" in result
    assert result["raw_key"].startswith("cf_")
    assert result["org_name"] == "test-org"
    assert result["tier"] == "free"
    assert result["is_active"] is True


@pytest.mark.asyncio
async def test_create_key_invalid_tier():
    svc = APIKeyService()
    result = await svc.create_key("test-org", "nonexistent")
    assert "error" in result


@pytest.mark.asyncio
async def test_validate_valid_key():
    svc = APIKeyService()
    created = await svc.create_key("validate-org", "free")
    raw = created["raw_key"]
    validated = await svc.validate_key(raw)
    assert validated is not None
    assert validated["org_name"] == "validate-org"


@pytest.mark.asyncio
async def test_validate_invalid_key():
    svc = APIKeyService()
    result = await svc.validate_key("cf_invalid_key_hash")
    assert result is None


@pytest.mark.asyncio
async def test_revoke_key():
    svc = APIKeyService()
    created = await svc.create_key("revoke-org", "free")
    key_id = created["key_id"]
    revoked = await svc.revoke_key(key_id)
    assert revoked is True
    keys = await svc.list_keys("revoke-org")
    for k in keys:
        assert k["is_active"] is False


@pytest.mark.asyncio
async def test_list_keys():
    svc = APIKeyService()
    await svc.create_key("list-org", "free")
    await svc.create_key("list-org", "startup")
    keys = await svc.list_keys("list-org")
    assert len(keys) >= 2


@pytest.mark.asyncio
async def test_tier_limits():
    limits = APIKeyService.get_tier_limits("free")
    assert limits["credits_per_month"] == 50
    assert limits["max_repos"] == 1

    pro = APIKeyService.get_tier_limits("professional")
    assert pro["credits_per_month"] == 50000


@pytest.mark.asyncio
async def test_credit_costs():
    assert APIKeyService.get_credit_cost("explore") == 10
    assert APIKeyService.get_credit_cost("nonexistent") == 5


@pytest.mark.asyncio
async def test_usage_tracker_track():
    tracker = UsageTracker()
    entry = await tracker.track("usage-org", "explore", 10)
    assert entry["org_name"] == "usage-org"
    assert entry["credits"] == 10
    assert entry["endpoint"] == "explore"


@pytest.mark.asyncio
async def test_usage_tracker_get_usage():
    tracker = UsageTracker()
    await tracker.track("usage2-org", "explore", 10)
    await tracker.track("usage2-org", "learn", 5)
    usage = await tracker.get_usage("usage2-org")
    assert usage["org_name"] == "usage2-org"
    assert usage["total_credits"] >= 15
    assert "explore" in usage["endpoint_breakdown"]


@pytest.mark.asyncio
async def test_usage_tracker_check_quota():
    tracker = UsageTracker()
    await tracker.track("quota-org", "explore", 10)
    result = await tracker.check_quota("quota-org", {"credits_per_month": 50})
    assert result["credits_used"] >= 10
    assert result["credits_remaining"] <= 40
    assert result["within_quota"] is True


@pytest.mark.asyncio
async def test_usage_tracker_quota_exceeded():
    tracker = UsageTracker()
    await tracker.track("quota2-org", "explore", 60)
    result = await tracker.check_quota("quota2-org", {"credits_per_month": 50})
    assert result["within_quota"] is False
