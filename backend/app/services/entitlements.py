"""Plan entitlements — the limits each subscription tier pays for.

Pricing sells team size (members, repositories) and AI-credit volume; every
feature is on every plan. These limits mirror the public plan catalogue in
``web/src/components/marketing/plans.ts`` — change them together.

``None`` means unlimited. Limits are enforced at the point a resource is added
(invite created/accepted, member added, repository registered), never
retroactively: a team that downgrades keeps what it has but cannot add more.
"""

import logging
from typing import Optional

from app.services._shared.errors import PaymentRequired
from app.services.postgres_db import get_storage

logger = logging.getLogger("onramp.entitlements")

PLAN_LIMITS: dict[str, dict[str, Optional[int]]] = {
    "free": {"members": 1, "repos": 1, "credits_per_month": 50},
    "startup": {"members": 5, "repos": 10, "credits_per_month": 5000},
    "professional": {"members": 20, "repos": 50, "credits_per_month": 50000},
    # Usage-based draws a prepaid wallet instead of a monthly allowance.
    "usage_based": {"members": 1, "repos": 1, "credits_per_month": None},
    "enterprise": {"members": None, "repos": None, "credits_per_month": None},
}

# Next tier to suggest when a limit is hit.
_UPGRADE_PATH = {"free": "startup", "usage_based": "startup", "startup": "professional", "professional": "enterprise"}


class PlanLimitReached(PaymentRequired):
    code = "PLAN_LIMIT_REACHED"


def limits_for(tier: str) -> dict[str, Optional[int]]:
    return PLAN_LIMITS.get(tier, PLAN_LIMITS["free"])


async def team_tier(team_id: str) -> str:
    """Tier of the team's active subscription; ``free`` when there is none."""
    from app.services.billing_service import BillingService

    try:
        sub = await BillingService().get_subscription(team_id)
    except Exception:
        logger.warning("Tier lookup failed for team %s; treating as free", team_id, exc_info=True)
        return "free"
    return (sub or {}).get("tier") or "free"


def _raise_limit(resource: str, tier: str, limit: int) -> None:
    upgrade = _UPGRADE_PATH.get(tier)
    hint = f" Upgrade to {upgrade.title()} for more." if upgrade else ""
    raise PlanLimitReached(
        f"Your {tier.replace('_', ' ')} plan includes {limit} {resource}.{hint}",
        details={"resource": resource, "tier": tier, "limit": limit, "upgrade_to": upgrade},
    )


async def ensure_seat_available(team_id: str, *, count_pending_invites: bool = False) -> None:
    """Raise PlanLimitReached when the team has no free member seat.

    ``count_pending_invites`` reserves seats for outstanding invites so a team
    cannot send more invites than it can ever accept.
    """
    tier = await team_tier(team_id)
    limit = limits_for(tier)["members"]
    if limit is None:
        return
    storage = get_storage()
    used = len(await storage.query_documents("team_members", [("team_id", "==", team_id)]))
    if count_pending_invites:
        used += len(await storage.query_documents(
            "team_invites", [("team_id", "==", team_id), ("status", "==", "pending")]
        ))
    if used >= limit:
        _raise_limit("members" if limit != 1 else "member", tier, limit)


async def ensure_repo_slot_available(team_id: str) -> None:
    """Raise PlanLimitReached when the team cannot register another repository."""
    tier = await team_tier(team_id)
    limit = limits_for(tier)["repos"]
    if limit is None:
        return
    repos = await get_storage().query_documents("repositories", [("team_id", "==", team_id)])
    if len(repos) >= limit:
        _raise_limit("repositories" if limit != 1 else "repository", tier, limit)
