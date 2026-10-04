"""Billing coupons: creation rules, checkout application, redemption on activation."""
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.services.billing_service import BillingService
from app.services.coupon_service import CouponError, CouponService


@pytest.fixture
def billing(monkeypatch):
    monkeypatch.setenv("RAZORPAY_KEY_ID", "rzp_test_dummy")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "rzp_test_secret")
    monkeypatch.setenv("ALLOW_UNVERIFIED_RAZORPAY", "true")
    monkeypatch.delenv("RAZORPAY_WEBHOOK_SECRET", raising=False)
    import app.services.billing_service as bs
    monkeypatch.setattr(bs, "RAZORPAY_PLAN_IDS", {
        "startup": "plan_startup_test",
        "professional": "plan_prof_test",
    })
    return BillingService()


@pytest.fixture
def coupons(billing):
    return CouponService(billing.storage)


def _unique(prefix: str) -> str:
    # The in-memory store is process-wide; keep codes unique per test.
    import uuid
    return f"{prefix}{uuid.uuid4().hex[:8].upper()}"


# ── creation rules ──────────────────────────────────────────────────────────

async def test_create_trial_coupon_normalizes_code(coupons):
    code = _unique("launch-")
    created = await coupons.create_coupon(code.lower(), "trial_days", trial_days=60, tiers=["startup"])
    assert created["code"] == code.upper()
    assert created["trial_days"] == 60
    assert created["redeemed"] == 0


@pytest.mark.parametrize("kwargs,message", [
    ({"code": "x", "kind": "trial_days", "trial_days": 30}, "Code must be"),
    ({"code": "OKCODE1", "kind": "percent"}, "kind must be"),
    ({"code": "OKCODE2", "kind": "trial_days", "trial_days": 0}, "trial_days must be"),
    ({"code": "OKCODE3", "kind": "trial_days", "trial_days": 400}, "trial_days must be"),
    ({"code": "OKCODE4", "kind": "razorpay_offer", "razorpay_offer_id": "nope"}, "razorpay_offer_id"),
    ({"code": "OKCODE5", "kind": "trial_days", "trial_days": 30, "tiers": ["enterprise"]}, "paid self-service"),
    ({"code": "OKCODE6", "kind": "trial_days", "trial_days": 30, "tiers": ["free"]}, "paid self-service"),
])
async def test_invalid_coupons_are_rejected(coupons, kwargs, message):
    code = kwargs.pop("code")
    kind = kwargs.pop("kind")
    with pytest.raises(ValueError, match=message):
        await coupons.create_coupon(code, kind, **kwargs)


async def test_duplicate_code_is_rejected(coupons):
    code = _unique("DUP")
    await coupons.create_coupon(code, "trial_days", trial_days=7)
    with pytest.raises(ValueError, match="already exists"):
        await coupons.create_coupon(code, "trial_days", trial_days=7)


# ── checking ────────────────────────────────────────────────────────────────

async def test_check_rejects_unknown_inactive_expired_and_wrong_tier(coupons):
    with pytest.raises(CouponError, match="isn't valid"):
        await coupons.check("NOSUCHCODE", "startup", "team_a")

    off = _unique("OFF")
    await coupons.create_coupon(off, "trial_days", trial_days=7)
    await coupons.set_active(off, False)
    with pytest.raises(CouponError, match="isn't valid"):
        await coupons.check(off, "startup", "team_a")

    old = _unique("OLD")
    await coupons.create_coupon(
        old, "trial_days", trial_days=7,
        expires_at=datetime.now(timezone.utc) - timedelta(days=1),
    )
    with pytest.raises(CouponError, match="expired"):
        await coupons.check(old, "startup", "team_a")

    pro = _unique("PRO")
    await coupons.create_coupon(pro, "trial_days", trial_days=42, tiers=["professional"])
    with pytest.raises(CouponError, match="Professional plan only"):
        await coupons.check(pro, "startup", "team_a")
    assert (await coupons.check(pro, "professional", "team_a"))["code"] == pro


async def test_code_is_single_use_per_team_and_respects_limit(coupons):
    code = _unique("ONCE")
    await coupons.create_coupon(code, "trial_days", trial_days=14, max_redemptions=2)

    assert await coupons.redeem(code, "team_1", "sub_1") is True
    assert await coupons.redeem(code, "team_1", "sub_1") is False  # idempotent
    with pytest.raises(CouponError, match="already used"):
        await coupons.check(code, "startup", "team_1")

    await coupons.redeem(code, "team_2", "sub_2")
    with pytest.raises(CouponError, match="redemption limit"):
        await coupons.check(code, "startup", "team_3")
    assert await coupons.redemption_count(code) == 2


def test_subscription_params():
    now = datetime(2026, 10, 4, tzinfo=timezone.utc)
    trial = CouponService.subscription_params({"kind": "trial_days", "trial_days": 60}, now)
    assert trial == {"start_at": int((now + timedelta(days=60)).timestamp())}
    offer = CouponService.subscription_params({"kind": "razorpay_offer", "razorpay_offer_id": "offer_ABC123xyz"})
    assert offer == {"offer_id": "offer_ABC123xyz"}


# ── checkout + webhook ──────────────────────────────────────────────────────

def _fake_razorpay(captured: dict):
    client = MagicMock()

    def _create(payload):
        captured.update(payload)
        return {"id": "sub_coupon_test", "short_url": "https://rzp.io/i/test"}

    client.subscription.create.side_effect = _create
    return client


async def test_checkout_applies_trial_coupon_via_start_at(billing, coupons):
    code = _unique("PHL")
    await coupons.create_coupon(code, "trial_days", trial_days=60, tiers=["startup"],
                                description="2 months free on Startup")
    captured: dict = {}
    with patch.object(BillingService, "_razorpay", return_value=_fake_razorpay(captured)):
        result = await billing.create_checkout_session(
            "team_ck", "startup", "https://ok", "https://cancel", coupon_code=code.lower(),
        )
    assert result["url"] == "https://rzp.io/i/test"
    assert result["coupon"] == {"code": code, "summary": "2 months free on Startup"}
    assert captured["notes"]["coupon"] == code
    expected = datetime.now(timezone.utc) + timedelta(days=60)
    assert abs(captured["start_at"] - expected.timestamp()) < 120
    # Checking does not redeem: an abandoned checkout must not burn the code.
    assert await coupons.redemption_count(code) == 0


async def test_checkout_applies_offer_coupon(billing, coupons):
    code = _unique("HALF")
    await coupons.create_coupon(code, "razorpay_offer", razorpay_offer_id="offer_PartnerHalf01")
    captured: dict = {}
    with patch.object(BillingService, "_razorpay", return_value=_fake_razorpay(captured)):
        await billing.create_checkout_session("team_off", "professional", "u", "c", coupon_code=code)
    assert captured["offer_id"] == "offer_PartnerHalf01"
    assert "start_at" not in captured


async def test_checkout_with_bad_coupon_never_reaches_razorpay(billing):
    captured: dict = {}
    with patch.object(BillingService, "_razorpay", return_value=_fake_razorpay(captured)):
        result = await billing.create_checkout_session("team_x", "startup", "u", "c", coupon_code="BOGUS99")
    assert result == {"error": "That code isn't valid."}
    assert captured == {}


async def test_activation_webhook_redeems_coupon_once(billing, coupons):
    code = _unique("ACT")
    await coupons.create_coupon(code, "trial_days", trial_days=30)
    event = json.dumps({
        "event": "subscription.activated",
        "payload": {"subscription": {"entity": {
            "id": "sub_act_1",
            "plan_id": "plan_startup_test",
            "customer_id": "cus_1",
            "notes": {"team_id": "team_act", "tier": "startup", "coupon": code},
        }}},
        "created_at": 1700000000,
    }).encode()

    await billing.handle_webhook(event, None)
    await billing.handle_webhook(event, None)  # replay: idempotent

    assert await coupons.redemption_count(code) == 1
    with pytest.raises(CouponError, match="already used"):
        await coupons.check(code, "startup", "team_act")
