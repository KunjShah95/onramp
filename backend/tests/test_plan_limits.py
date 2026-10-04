"""Subscription plan limits: enforcement, pricing copy and API-key tiers agree."""

import re
from pathlib import Path

import pytest

from app.services import quota
from app.services.api_key_service import APIKeyService, PLAN_LIMITS, TIER_LIMITS
from app.services.billing_service import TIER_PRICING

WEB = Path(__file__).resolve().parents[2] / "web"
PUBLISHED_CREDITS = {"free": 50, "startup": 5000, "professional": 50000}


def test_plan_credits_match_published_pricing():
    for plan, credits in PUBLISHED_CREDITS.items():
        assert PLAN_LIMITS[plan]["credits_per_month"] == credits
        assert f"{credits} credits/mo" in TIER_PRICING[plan]["features"]


def _advertised(path: Path) -> set[int]:
    text = path.read_text(encoding="utf-8")
    return {int(n.replace(",", "")) for n in re.findall(r"([\d,]+) (?:AI )?credits", text)}


def test_billing_page_matches_enforced_credits():
    assert _advertised(WEB / "src/pages/BillingPage.tsx") == set(PUBLISHED_CREDITS.values())


@pytest.mark.parametrize("path", ["public/pricing.md", "public/llms.txt", "src/pages/DocsPage.tsx"])
def test_other_pricing_copy_never_advertises_other_credits(path):
    # Optional copy (pricing.md is untracked); only wrong numbers fail.
    if not (WEB / path).exists():
        pytest.skip(f"{path} not present")
    assert _advertised(WEB / path) <= set(PUBLISHED_CREDITS.values())


@pytest.mark.parametrize("tier", list(TIER_LIMITS))
def test_api_key_tiers_resolve_to_themselves(tier):
    # "pro"/"team" used to fall through the plan mapping to free limits.
    assert APIKeyService.get_tier_limits(tier) is TIER_LIMITS[tier]


def test_unknown_plan_gets_free():
    assert APIKeyService.get_plan_limits("bogus") is PLAN_LIMITS["free"]
    assert APIKeyService.get_plan_limits(None) is PLAN_LIMITS["free"]


async def test_quota_enforces_plan_credits(monkeypatch):
    seen = {}

    async def _tier(scope):
        return "startup"

    async def _check(scope, limits):
        seen.update(limits)
        return {"within_quota": True}

    monkeypatch.setattr(quota, "_resolve_tier", _tier)
    monkeypatch.setattr(quota._usage, "check_quota", _check)
    await quota.check_quota("team-1", "chat")
    assert seen["credits_per_month"] == 5000
