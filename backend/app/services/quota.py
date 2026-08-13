"""
Quota enforcement for AI endpoints.

Charges credits per AI action against the caller's monthly quota and blocks
(HTTP 429) when the quota is exhausted. Usage is recorded via UsageTracker so
the usage dashboard reflects real consumption.
"""

import logging
from typing import Optional

from fastapi import Request, HTTPException, Depends
from app.services.api_key_service import APIKeyService
from app.services.usage_tracker import UsageTracker
from app.services.billing_service import BillingService
from app.services.credit_service import CreditService, InsufficientCreditsError
from app.services.team_service import get_user_teams

logger = logging.getLogger(__name__)

_usage = UsageTracker()
_billing = BillingService()
_credits = CreditService()


async def _resolve_tier(scope: str) -> str:
    """Best-effort tier lookup for a scope (team subscription, else free)."""
    try:
        sub = await _billing.get_subscription(scope)
        if sub and sub.get("tier"):
            return sub["tier"]
    except Exception:
        logger.warning("Failed to resolve tier for scope %s, defaulting to free", scope)
    return "free"


async def _enforce(scope: str, action: str) -> tuple[int, str, Optional[dict]]:
    """Check quota for ``action`` under ``scope`` without recording a charge.

    Raises HTTPException(429) when the monthly credit quota is exceeded and
    HTTPException(402) when a usage-based wallet can't cover the charge.
    Returns ``(cost, tier, wallet)`` for the caller to record on success.
    """
    cost = APIKeyService.get_credit_cost(action)
    tier = await _resolve_tier(scope)

    # Usage-based tier: draw down the prepaid credit wallet instead of a fixed
    # monthly allowance. Block (402) when the balance can't cover the charge.
    if tier == "usage_based":
        try:
            wallet = await _credits.get_wallet(scope)
        except Exception as exc:
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "Unable to verify credit balance",
                    "code": "CREDIT_CHECK_FAILED",
                    "tier": tier,
                },
            )
        if int(wallet.get("balance", 0)) < cost:
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "Insufficient credits — top up to continue",
                    "code": "INSUFFICIENT_CREDITS",
                    "balance": wallet.get("balance"),
                    "required": cost,
                    "tier": tier,
                },
            )
        return cost, tier, wallet

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
    return cost, tier, None


async def check_and_record(scope: str, action: str) -> dict:
    """Enforce quota for `action` under `scope`, then record the charge.

    Raises HTTPException(429) when the monthly credit quota is exceeded.
    Returns the credit cost charged.
    """
    cost, tier, wallet = await _enforce(scope, action)

    if tier == "usage_based":
        try:
            wallet = await _credits.deduct(scope, cost, action=action)
        except InsufficientCreditsError as exc:
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "Insufficient credits — top up to continue",
                    "code": "INSUFFICIENT_CREDITS",
                    "balance": exc.balance,
                    "required": exc.required,
                    "tier": tier,
                },
            )
        await _usage.track(scope, action, cost)
        return {"charged": cost, "tier": tier, "credit_balance": wallet.get("balance")}

    await _usage.track(scope, action, cost)
    return {"charged": cost, "tier": tier}


async def check_quota(scope: str, action: str) -> None:
    """Check quota without recording — callers record the charge on success.

    Raises HTTPException(402/429) exactly like :func:`check_and_record`, so
    endpoints that charge on success (e.g. the /v1 gateway) can enforce up
    front and never bill failed requests.
    """
    await _enforce(scope, action)


async def charge_wallet(scope: str, action: str) -> dict:
    """Best-effort wallet charge for usage_based callers (no-op otherwise).

    Returns ``{"charged": cost}`` when the caller is usage_based and the
    wallet was debited, ``{"charged": 0}`` otherwise. Never raises — the
    up-front :func:`check_quota` already verified the balance.
    """
    try:
        cost = APIKeyService.get_credit_cost(action)
        tier = await _resolve_tier(scope)
        if tier != "usage_based":
            return {"charged": 0}
        wallet = await _credits.deduct(scope, cost, action=action)
        return {"charged": cost, "credit_balance": wallet.get("balance")}
    except Exception:
        logger.exception("Wallet charge failed for scope %s, action %s", scope, action)
        return {"charged": 0}


def enforce_quota(action: str):
    """FastAPI dependency factory: enforce + record quota for an AI action."""

    async def _resolve_scope(uid: str) -> str:
        """Resolve the billing/usage scope for a user.

        Usage is metered per team — the rest of the app (billing, dashboards,
        usage tracking) keys on the user's team id. Using the raw uid as the
        ``team_id`` would write a ``usage_records`` row whose team_id doesn't
        reference any ``teams.id``, tripping the foreign key on insert.
        """
        try:
            teams = await get_user_teams(uid)
            if teams:
                return teams[0].get("id") or teams[0].get("team_id") or uid
        except Exception:
            logger.warning("Failed to resolve team scope for %s, using uid", uid)
        return uid

    async def _dep(request: Request) -> dict:
        user = getattr(request.state, "user", None)
        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated")
        scope = await _resolve_scope(user.get("uid"))
        return await check_and_record(scope, action)

    return Depends(_dep)
