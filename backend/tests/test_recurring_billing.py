"""Recurring-revenue correctness: Razorpay renewal, cancel, plan change, trial,
and plan entitlements (seats / repositories / monthly credits)."""
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.services.billing_service import BillingService, BillingProviderError
from app.services import entitlements
from app.services.entitlements import PlanLimitReached


@pytest.fixture
def service(monkeypatch):
    monkeypatch.setenv("RAZORPAY_KEY_ID", "rzp_test_dummy")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "rzp_test_secret")
    monkeypatch.setenv("ALLOW_UNVERIFIED_RAZORPAY", "true")
    monkeypatch.delenv("RAZORPAY_WEBHOOK_SECRET", raising=False)
    import app.services.billing_service as bs
    monkeypatch.setattr(bs, "RAZORPAY_PLAN_IDS", {
        "startup": "plan_startup_m", "professional": "plan_prof_m", "usage_based": None,
    })
    monkeypatch.setattr(bs, "RAZORPAY_YEARLY_PLAN_IDS", {
        "startup": "plan_startup_y", "professional": "plan_prof_y", "usage_based": None,
    })
    return BillingService()


def _event(event_type: str, entity: dict) -> bytes:
    return json.dumps({"event": event_type, "payload": {"subscription": {"entity": entity}}}).encode()


def _client_returning(sub_id="sub_new", url="https://rzp.io/x"):
    client = MagicMock()
    client.subscription.create.return_value = {"id": sub_id, "short_url": url}
    return client


async def _paid_team(service, team="team_paid", tier="startup", rzp="sub_paid"):
    await service.handle_webhook(_event("subscription.activated", {
        "id": rzp, "customer_id": "cus_1", "plan_id": f"plan_{'prof' if tier == 'professional' else tier}_m",
        "notes": {"team_id": team},
    }), sig_header=None)
    return team


class TestCheckout:
    async def test_monthly_checkout_renews_for_years_not_one(self, service):
        client = _client_returning()
        with patch.object(service, "_razorpay", return_value=client):
            result = await service.create_checkout_session("t1", "startup", "s", "c")
        payload = client.subscription.create.call_args.args[0]
        assert payload["plan_id"] == "plan_startup_m"
        assert payload["total_count"] == 120
        assert "start_at" not in payload
        assert result["trial_days"] == 0

    async def test_yearly_checkout_uses_yearly_plan(self, service):
        client = _client_returning()
        with patch.object(service, "_razorpay", return_value=client):
            await service.create_checkout_session("t1", "startup", "s", "c", billing_cycle="yearly")
        payload = client.subscription.create.call_args.args[0]
        assert payload["plan_id"] == "plan_startup_y"
        assert payload["total_count"] == 10
        assert payload["notes"]["billing_cycle"] == "yearly"

    async def test_unknown_cycle_rejected(self, service):
        result = await service.create_checkout_session("t1", "startup", "s", "c", billing_cycle="weekly")
        assert "error" in result

    async def test_professional_first_subscription_gets_trial(self, service):
        client = _client_returning()
        with patch.object(service, "_razorpay", return_value=client):
            result = await service.create_checkout_session("t_trial", "professional", "s", "c")
        payload = client.subscription.create.call_args.args[0]
        start = datetime.fromtimestamp(payload["start_at"], tz=timezone.utc)
        assert timedelta(days=13) < start - datetime.now(timezone.utc) <= timedelta(days=14)
        assert result["trial_days"] == 14

    async def test_no_second_trial_for_team_that_had_a_subscription(self, service):
        await _paid_team(service, team="t_again", tier="startup", rzp="sub_old")
        await service.handle_webhook(_event("subscription.cancelled", {"id": "sub_old"}), sig_header=None)
        client = _client_returning()
        with patch.object(service, "_razorpay", return_value=client):
            result = await service.create_checkout_session("t_again", "professional", "s", "c")
        assert "start_at" not in client.subscription.create.call_args.args[0]
        assert result["trial_days"] == 0

    async def test_active_paid_team_cannot_open_second_subscription(self, service):
        await _paid_team(service)
        result = await service.create_checkout_session("team_paid", "professional", "s", "c")
        assert "change plan" in result["error"]


class TestActivation:
    async def test_activation_sets_tier_and_cycle_from_plan(self, service):
        # Team was on a local free record; paying for yearly Professional must
        # actually move it to professional/yearly.
        await service.create_subscription("t_up", "free")
        await service.handle_webhook(_event("subscription.activated", {
            "id": "sub_y", "customer_id": "cus_y", "plan_id": "plan_prof_y", "notes": {"team_id": "t_up"},
        }), sig_header=None)
        sub = await service.get_subscription("t_up")
        assert sub["tier"] == "professional"
        assert sub["billing_cycle"] == "yearly"
        assert sub["price"] == 29999

    async def test_authenticated_with_future_start_grants_trial_access(self, service):
        start = int((datetime.now(timezone.utc) + timedelta(days=14)).timestamp())
        await service.handle_webhook(_event("subscription.authenticated", {
            "id": "sub_tr", "customer_id": "cus_tr", "plan_id": "plan_prof_m",
            "start_at": start, "notes": {"team_id": "t_tr"},
        }), sig_header=None)
        sub = await service.get_subscription("t_tr")
        assert sub["tier"] == "professional"
        assert sub["trial_end"] is not None


class TestCancel:
    async def test_cancel_stops_renewal_at_razorpay_and_keeps_access(self, service):
        await _paid_team(service)
        client = MagicMock()
        with patch.object(service, "_razorpay", return_value=client):
            result = await service.cancel_subscription("team_paid")
        client.subscription.cancel.assert_called_once_with("sub_paid", {"cancel_at_cycle_end": 1})
        assert result["cancel_at_period_end"] is True
        sub = await service.get_subscription("team_paid")
        assert sub is not None and sub["cancel_at_period_end"] is True

    async def test_access_ends_when_razorpay_reports_cancelled(self, service):
        await _paid_team(service)
        with patch.object(service, "_razorpay", return_value=MagicMock()):
            await service.cancel_subscription("team_paid")
        await service.handle_webhook(_event("subscription.cancelled", {"id": "sub_paid"}), sig_header=None)
        assert await service.get_subscription("team_paid") is None

    async def test_cancel_during_trial_ends_immediately(self, service):
        start = int((datetime.now(timezone.utc) + timedelta(days=10)).timestamp())
        await service.handle_webhook(_event("subscription.authenticated", {
            "id": "sub_tr2", "plan_id": "plan_prof_m", "start_at": start, "notes": {"team_id": "t_tr2"},
        }), sig_header=None)
        client = MagicMock()
        with patch.object(service, "_razorpay", return_value=client):
            await service.cancel_subscription("t_tr2")
        client.subscription.cancel.assert_called_once_with("sub_tr2", {"cancel_at_cycle_end": 0})
        assert await service.get_subscription("t_tr2") is None

    async def test_provider_failure_does_not_mark_canceled(self, service):
        await _paid_team(service)
        client = MagicMock()
        client.subscription.cancel.side_effect = RuntimeError("boom")
        with patch.object(service, "_razorpay", return_value=client), pytest.raises(BillingProviderError):
            await service.cancel_subscription("team_paid")
        sub = await service.get_subscription("team_paid")
        assert sub["status"] == "active" and not sub.get("cancel_at_period_end")


class TestChangePlan:
    async def test_upgrade_applies_now(self, service):
        await _paid_team(service)
        client = MagicMock()
        with patch.object(service, "_razorpay", return_value=client):
            result = await service.change_plan("team_paid", "professional")
        args = client.subscription.edit.call_args.args
        assert args[0] == "sub_paid"
        assert args[1]["plan_id"] == "plan_prof_m" and args[1]["schedule_change_at"] == "now"
        assert result["change_applies"] == "now"
        assert (await service.get_subscription("team_paid"))["tier"] == "professional"

    async def test_downgrade_waits_for_cycle_end(self, service):
        await _paid_team(service, tier="professional")
        client = MagicMock()
        with patch.object(service, "_razorpay", return_value=client):
            await service.change_plan("team_paid", "startup")
        assert client.subscription.edit.call_args.args[1]["schedule_change_at"] == "cycle_end"
        sub = await service.get_subscription("team_paid")
        assert sub["tier"] == "professional" and sub["pending_tier"] == "startup"
        await service.handle_webhook(_event("subscription.updated", {
            "id": "sub_paid", "plan_id": "plan_startup_m",
        }), sig_header=None)
        sub = await service.get_subscription("team_paid")
        assert sub["tier"] == "startup" and sub["pending_tier"] is None and sub["price"] == 999

    async def test_change_without_paid_subscription_rejected(self, service):
        await service.create_subscription("t_free", "free")
        with pytest.raises(ValueError):
            await service.change_plan("t_free", "startup")


class TestEntitlements:
    async def test_free_team_has_one_seat(self, service, storage):
        await storage.create_document("team_members", "m1", {"team_id": "t_ent", "user_id": "u1", "role": "admin"})
        with pytest.raises(PlanLimitReached) as exc:
            await entitlements.ensure_seat_available("t_ent")
        assert exc.value.details["upgrade_to"] == "startup"

    async def test_pending_invites_reserve_seats(self, service, storage):
        await _paid_team(service, team="t_inv")
        for i in range(3):
            await storage.create_document("team_members", f"mi{i}", {"team_id": "t_inv", "user_id": f"u{i}", "role": "member"})
        await entitlements.ensure_seat_available("t_inv", count_pending_invites=True)
        for i in range(2):
            await storage.create_document("team_invites", f"inv{i}", {"team_id": "t_inv", "status": "pending", "email": f"x{i}@e.co"})
        with pytest.raises(PlanLimitReached):
            await entitlements.ensure_seat_available("t_inv", count_pending_invites=True)

    async def test_repo_limit_by_plan(self, service, storage):
        await storage.create_document("repositories", "r1", {"team_id": "t_repo", "owner": "o", "name": "a"})
        with pytest.raises(PlanLimitReached):
            await entitlements.ensure_repo_slot_available("t_repo")
        await _paid_team(service, team="t_repo")
        await entitlements.ensure_repo_slot_available("t_repo")

    def test_limits_match_advertised_plans(self):
        assert entitlements.limits_for("free") == {"members": 1, "repos": 1, "credits_per_month": 50}
        assert entitlements.limits_for("startup")["members"] == 5
        assert entitlements.limits_for("professional")["repos"] == 50
        assert entitlements.limits_for("enterprise")["members"] is None
        assert entitlements.limits_for("unknown") == entitlements.limits_for("free")
