"""
Billing coupons for launch and design-partner offers.

Two kinds, both applied through Razorpay rather than by editing local prices,
so the amount a customer is charged is always the amount Razorpay computes:

* ``trial_days`` — delays the first charge by setting the Razorpay
  subscription's ``start_at``. "2 months free on Startup" is a 60-day coupon.
* ``razorpay_offer`` — attaches an Offer created in the Razorpay dashboard
  (``offer_...``) to the subscription. Use it for percentage or flat discounts
  such as "50% off for 12 months"; the discount rules live in Razorpay.

Coupons are stored in the ``billing_coupons`` collection keyed by the
upper-cased code. A coupon is *checked* at checkout and *redeemed* only when a
verified ``subscription.activated`` webhook arrives, so abandoned checkouts do
not consume redemptions. Redemption rows are keyed ``CODE:team_id`` and created
with ``create_document_if_absent``, which makes a code single-use per team and
keeps redemption counting free of read-modify-write races.
"""

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.services.postgres_db import get_storage

logger = logging.getLogger("onramp.coupons")

COUPONS = "billing_coupons"
REDEMPTIONS = "billing_coupon_redemptions"

KINDS = {"trial_days", "razorpay_offer"}
CODE_RE = re.compile(r"^[A-Z0-9][A-Z0-9_-]{2,31}$")
OFFER_RE = re.compile(r"^offer_[A-Za-z0-9]{6,40}$")
MAX_TRIAL_DAYS = 365


class CouponError(ValueError):
    """A coupon cannot be used. The message is safe to show to the customer."""


def normalize_code(code: str) -> str:
    return (code or "").strip().upper()


def _flat(row: Optional[dict]) -> Optional[dict]:
    if row is None:
        return None
    if isinstance(row.get("data"), dict):
        return {**row["data"], "id": row.get("id")}
    return row


def _parse_time(value: Any) -> Optional[datetime]:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        stamp = value
    else:
        stamp = datetime.fromisoformat(str(value))
    return stamp if stamp.tzinfo else stamp.replace(tzinfo=timezone.utc)


def _public(coupon: dict, redeemed: Optional[int] = None) -> Dict[str, Any]:
    out = {
        "code": coupon["code"],
        "kind": coupon["kind"],
        "description": coupon.get("description") or "",
        "tiers": coupon.get("tiers") or [],
        "trial_days": coupon.get("trial_days"),
        "razorpay_offer_id": coupon.get("razorpay_offer_id"),
        "max_redemptions": coupon.get("max_redemptions"),
        "expires_at": coupon.get("expires_at"),
        "active": bool(coupon.get("active", True)),
        "created_at": coupon.get("created_at"),
    }
    if redeemed is not None:
        out["redeemed"] = redeemed
    return out


class CouponService:
    def __init__(self, storage=None):
        self.storage = storage or get_storage()

    # ── admin ────────────────────────────────────────────────────────────────

    async def create_coupon(
        self,
        code: str,
        kind: str,
        *,
        description: str = "",
        tiers: Optional[List[str]] = None,
        trial_days: Optional[int] = None,
        razorpay_offer_id: Optional[str] = None,
        max_redemptions: Optional[int] = None,
        expires_at: Optional[datetime] = None,
        created_by: Optional[str] = None,
    ) -> Dict[str, Any]:
        from app.services.billing_service import SELF_SERVICE_TIERS

        code = normalize_code(code)
        if not CODE_RE.match(code):
            raise ValueError("Code must be 3-32 characters: letters, digits, '-' or '_'")
        if kind not in KINDS:
            raise ValueError(f"kind must be one of {sorted(KINDS)}")
        if kind == "trial_days":
            if not trial_days or not 1 <= int(trial_days) <= MAX_TRIAL_DAYS:
                raise ValueError(f"trial_days must be between 1 and {MAX_TRIAL_DAYS}")
            razorpay_offer_id = None
        else:
            if not razorpay_offer_id or not OFFER_RE.match(razorpay_offer_id):
                raise ValueError("razorpay_offer_id must look like 'offer_XXXXXXXX'")
            trial_days = None
        tiers = sorted(set(tiers or []))
        unknown = [t for t in tiers if t not in SELF_SERVICE_TIERS or t == "free"]
        if unknown:
            raise ValueError(f"Coupons apply only to paid self-service tiers, not {unknown}")
        if max_redemptions is not None and int(max_redemptions) < 1:
            raise ValueError("max_redemptions must be at least 1")

        data = {
            "code": code,
            "kind": kind,
            "description": description.strip()[:200],
            "tiers": tiers,
            "trial_days": int(trial_days) if trial_days else None,
            "razorpay_offer_id": razorpay_offer_id,
            "max_redemptions": int(max_redemptions) if max_redemptions else None,
            "expires_at": _parse_time(expires_at).isoformat() if expires_at else None,
            "active": True,
            "created_by": created_by,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        if not await self.storage.create_document_if_absent(COUPONS, code, data):
            raise ValueError(f"Coupon {code} already exists")
        return _public(data, redeemed=0)

    async def set_active(self, code: str, active: bool) -> Optional[Dict[str, Any]]:
        coupon = await self._get(code)
        if coupon is None:
            return None
        coupon.pop("id", None)
        for wrapper in ("collection", "updated_at"):
            coupon.pop(wrapper, None)
        coupon["active"] = bool(active)
        # update_document replaces the JSONB payload, so write the full record.
        await self.storage.update_document(COUPONS, coupon["code"], coupon)
        return _public(coupon, redeemed=await self.redemption_count(coupon["code"]))

    async def list_coupons(self) -> List[Dict[str, Any]]:
        rows = [_flat(r) for r in await self.storage.list_documents(COUPONS)]
        out = [_public(r, redeemed=await self.redemption_count(r["code"])) for r in rows if r]
        return sorted(out, key=lambda c: c.get("created_at") or "", reverse=True)

    # ── checkout ─────────────────────────────────────────────────────────────

    async def _get(self, code: str) -> Optional[dict]:
        return _flat(await self.storage.get_document(COUPONS, normalize_code(code)))

    async def redemption_count(self, code: str) -> int:
        rows = await self.storage.query_documents(REDEMPTIONS, [("code", "==", normalize_code(code))])
        return len(rows)

    async def check(self, code: str, tier: str, team_id: str) -> Dict[str, Any]:
        """Return the coupon if ``team_id`` may use it on ``tier``; else raise CouponError."""
        coupon = await self._get(code)
        if coupon is None or not coupon.get("active", True):
            raise CouponError("That code isn't valid.")
        expires = _parse_time(coupon.get("expires_at"))
        if expires and expires <= datetime.now(timezone.utc):
            raise CouponError("That code has expired.")
        tiers = coupon.get("tiers") or []
        if tiers and tier not in tiers:
            names = ", ".join(t.replace("_", " ").title() for t in tiers)
            raise CouponError(f"That code applies to the {names} plan only.")
        redemption_id = f"{coupon['code']}:{team_id}"
        if await self.storage.get_document(REDEMPTIONS, redemption_id):
            raise CouponError("Your team has already used this code.")
        limit = coupon.get("max_redemptions")
        if limit and await self.redemption_count(coupon["code"]) >= int(limit):
            raise CouponError("That code has reached its redemption limit.")
        return coupon

    @staticmethod
    def subscription_params(coupon: dict, now: Optional[datetime] = None) -> Dict[str, Any]:
        """Extra fields for Razorpay ``subscription.create`` that apply the coupon."""
        if coupon["kind"] == "trial_days":
            start = (now or datetime.now(timezone.utc)) + timedelta(days=int(coupon["trial_days"]))
            return {"start_at": int(start.timestamp())}
        return {"offer_id": coupon["razorpay_offer_id"]}

    @staticmethod
    def summary(coupon: dict) -> str:
        if coupon.get("description"):
            return coupon["description"]
        if coupon["kind"] == "trial_days":
            return f"First charge in {coupon['trial_days']} days"
        return "Discount applied at checkout"

    # ── activation ───────────────────────────────────────────────────────────

    async def redeem(self, code: str, team_id: str, razorpay_subscription_id: Optional[str]) -> bool:
        """Record a redemption after a verified activation. Idempotent per team."""
        code = normalize_code(code)
        if not code or not team_id:
            return False
        created = await self.storage.create_document_if_absent(REDEMPTIONS, f"{code}:{team_id}", {
            "code": code,
            "team_id": team_id,
            "razorpay_subscription_id": razorpay_subscription_id,
            "redeemed_at": datetime.now(timezone.utc).isoformat(),
        })
        if created:
            logger.info("coupon %s redeemed by team %s", code, team_id)
        return created
