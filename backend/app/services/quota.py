"""
Quota enforcement for AI endpoints.

Charges credits per AI action against the caller's monthly quota and blocks
(HTTP 429) when the quota is exhausted. Usage is recorded via UsageTracker so
the usage dashboard reflects real consumption.
"""

import logging
from fastapi import Request, HTTPException, Depends
from app.services.api_key_service import APIKeyService
from app.services.usage_tracker import UsageTracker
from app.services.billing_service import BillingService

logger = logging.getLogger(__name__)

_usage = UsageTracker()
_billing = BillingService()


async def _resolve_tier(scope: str) -> str:
    """Best-effort tier lookup for a scope (team subscription, else free)."""
    try:
        sub = await _billing.get_subscription(scope)
        if sub and sub.get("tier"):
            return sub["tier"]
    except Exception:
        logger.warning("Failed to resolve tier for scope %s, defaulting to free", scope)
    return "free"


async def check_and_record(scope: str, action: str) -> dict:
    """Enforce quota for `action` under `scope`, then record the charge.

    Raises HTTPException(429) when the monthly credit quota is exceeded.
    Returns the credit cost charged.
    """
    cost = APIKeyService.get_credit_cost(action)
    tier = await _resolve_tier(scope)
    limits = APIKeyService.get_tier_limits(tier)

    quota = await _usage.check_quota(scope, limits)
    if not quota.get("within_quota", True):
        raise HTTPException(
            status_code=429,
            detail={
                "error": "Monthly credit quota exceeded",
                "code": "QUOTA_EXCEEDED",
                "used": quota.get("used"),
                "limit": quota.get("monthly_limit"),
                "tier": tier,
            },
        )

    await _usage.track(scope, action, cost)
    return {"charged": cost, "tier": tier}


def enforce_quota(action: str):
    """FastAPI dependency factory: enforce + record quota for an AI action."""

    async def _dep(request: Request) -> dict:
        user = getattr(request.state, "user", None)
        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated")
        scope = user.get("uid")
        return await check_and_record(scope, action)

    return Depends(_dep)
