"""Usage dashboard must report the same monthly quota the quota dependency enforces."""

import pytest

from app.api.v1 import dashboard
from app.services.api_key_service import APIKeyService


class _Usage:
    async def get_usage(self, org_name, period="month"):
        return {"total_credits": 40, "total_requests": 4, "endpoint_breakdown": {}}

    async def check_quota(self, org_name, limits):
        # Real implementation, fed the limits the endpoint chose.
        from app.services.usage_tracker import UsageTracker
        return await UsageTracker.check_quota(self, org_name, limits)


class _Billing:
    def __init__(self, tier):
        self.tier = tier

    async def get_subscription(self, org_name):
        return {"tier": self.tier} if self.tier else None


@pytest.mark.parametrize("tier", [None, "free", "startup", "professional", "usage_based"])
async def test_quota_matches_enforced_tier_limits(monkeypatch, tier):
    async def _team(user, team_id=None):
        return "team-1"

    monkeypatch.setattr(dashboard, "_get_user_team", _team)
    monkeypatch.setattr(dashboard, "_usage", _Usage())
    monkeypatch.setattr(dashboard, "_billing", _Billing(tier))

    result = await dashboard.usage_dashboard(team_id=None, user={"uid": "u-1"})

    expected = APIKeyService.get_plan_limits(tier)["credits_per_month"]
    assert result["tier"] == (tier or "free")
    assert result["limits"]["monthly_credits"] == expected
    assert result["quota"]["monthly_limit"] == expected
    if expected:
        assert result["quota"]["remaining"] == expected - 40
    else:
        # usage_based has no monthly allowance; the credit wallet gates it.
        assert result["quota"]["within_quota"] is True
