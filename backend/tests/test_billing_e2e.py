"""End-to-end tests for the full billing lifecycle (Razorpay).

Covers subscription CRUD, Razorpay subscription creation, webhook event
processing (activated/charged/cancelled), idempotency, and audit logging.
"""
import json
from unittest.mock import MagicMock, patch
import pytest
from app.services.billing_service import BillingService


@pytest.fixture
def service(monkeypatch):
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
async def seeded_sub(service):
    await service.create_subscription("team_e2e", "startup", "monthly")
    await service.attach_razorpay("team_e2e", "cus_e2e", "sub_e2e")
    return "team_e2e"


def _make_webhook_event(event_type: str, entity: dict, **overrides: dict) -> bytes:
    data = {
        "event": event_type,
        "payload": {"subscription": {"entity": entity}},
        "created_at": 1700000000,
    }
    data.update(overrides)
    return json.dumps(data).encode()


class TestSubscriptionCRUD:
    async def test_create_and_get_subscription(self, service):
        sub = await service.create_subscription("team_1", "startup", "monthly")
        assert sub["team_id"] == "team_1"
        assert sub["tier"] == "startup"
        assert sub["status"] == "active"
        assert sub["price"] == 999

        fetched = await service.get_subscription("team_1")
        assert fetched is not None
        assert fetched["subscription_id"] == sub["subscription_id"]

    async def test_get_nonexistent_subscription(self, service):
        assert await service.get_subscription("nonexistent") is None

    async def test_update_subscription_tier(self, service):
        await service.create_subscription("team_1", "startup", "monthly")
        updated = await service.update_subscription("team_1", "professional")
        assert updated["tier"] == "professional"
        assert updated["price"] == 2999

    async def test_cancel_subscription_hides_it(self, service):
        await service.create_subscription("team_1", "startup", "monthly")
        assert await service.cancel_subscription("team_1") is True
        assert await service.get_subscription("team_1") is None

    async def test_cancel_nonexistent_returns_false(self, service):
        assert await service.cancel_subscription("nonexistent") is False

    async def test_attach_razorpay_ids(self, service):
        await service.create_subscription("team_1", "startup", "monthly")
        assert await service.attach_razorpay("team_1", "cus_abc", "sub_xyz") is True
        sub = await service.get_subscription("team_1")
        assert sub["razorpay_customer_id"] == "cus_abc"
        assert sub["razorpay_subscription_id"] == "sub_xyz"


class TestSubscriptionCreation:
    async def test_razorpay_disabled_returns_stub(self, monkeypatch, service):
        monkeypatch.delenv("RAZORPAY_KEY_ID", raising=False)
        result = await service.create_checkout_session(
            "team_1", "startup", "https://example.com/success", "https://example.com/cancel"
        )
        assert result == {"error": "Razorpay is not configured", "stub": True}

    async def test_creates_razorpay_subscription(self, service):
        mock_sub = MagicMock()
        mock_sub.get.side_effect = lambda k, d=None: {"short_url": "https://rzp.io/abc", "id": "sub_test"}.get(k, d)
        mock_client = MagicMock()
        mock_client.subscription.create.return_value = mock_sub
        with patch.object(service, "_razorpay", return_value=mock_client):
            result = await service.create_checkout_session(
                "team_1", "startup", "https://example.com/success", "https://example.com/cancel"
            )
        assert result["url"] == "https://rzp.io/abc"
        assert result["subscription_id"] == "sub_test"


class TestWebhookEvents:
    async def test_activated_attaches_razorpay(self, service, seeded_sub):
        payload = _make_webhook_event("subscription.activated",
            {"id": "sub_new", "customer_id": "cus_new", "notes": {"team_id": "team_e2e"}},
        )
        result = await service.handle_webhook(payload, sig_header=None)
        assert result == {"received": True, "type": "subscription.activated"}
        sub = await service.get_subscription("team_e2e")
        assert sub["razorpay_customer_id"] == "cus_new"
        assert sub["razorpay_subscription_id"] == "sub_new"

    async def test_charged_syncs_status(self, service, seeded_sub):
        payload = _make_webhook_event("subscription.charged",
            {"id": "sub_e2e", "plan_id": "plan_startup_test"},
        )
        await service.handle_webhook(payload, sig_header=None)
        subs = await service.storage.query_documents("onramp_subscriptions", [("team_id", "==", "team_e2e")])
        assert subs[0]["status"] == "active"

    async def test_cancelled_cancels_local(self, service, seeded_sub):
        payload = _make_webhook_event("subscription.cancelled", {"id": "sub_e2e"})
        await service.handle_webhook(payload, sig_header=None)
        assert await service.get_subscription("team_e2e") is None

    async def test_pending_sets_past_due(self, service, seeded_sub):
        payload = _make_webhook_event("subscription.pending", {"id": "sub_e2e"})
        await service.handle_webhook(payload, sig_header=None)
        subs = await service.storage.query_documents("onramp_subscriptions", [("team_id", "==", "team_e2e")])
        assert subs[0]["status"] == "past_due"

    async def test_activated_creates_local_subscription_when_missing(self, service):
        # Checkout creates the Razorpay subscription directly — no local doc
        # exists yet, so the webhook must upsert one for the team.
        payload = _make_webhook_event("subscription.activated",
            {"id": "sub_fresh", "customer_id": "cus_fresh", "plan_id": "plan_startup_test",
             "notes": {"team_id": "team_fresh"}},
        )
        result = await service.handle_webhook(payload, sig_header=None)
        assert result == {"received": True, "type": "subscription.activated"}
        sub = await service.get_subscription("team_fresh")
        assert sub is not None
        assert sub["tier"] == "startup"
        assert sub["razorpay_customer_id"] == "cus_fresh"
        assert sub["razorpay_subscription_id"] == "sub_fresh"

    async def test_charged_updates_period_end(self, service, seeded_sub):
        payload = _make_webhook_event("subscription.charged",
            {"id": "sub_e2e", "plan_id": "plan_startup_test", "current_end": 1767225600},
        )
        await service.handle_webhook(payload, sig_header=None)
        subs = await service.storage.query_documents("onramp_subscriptions", [("team_id", "==", "team_e2e")])
        assert subs[0]["status"] == "active"
        assert subs[0]["current_period_end"] is not None

    async def test_webhook_retry_deduped_by_event_id(self, service, seeded_sub):
        # Razorpay retries deliveries; the event id (not a header Razorpay
        # never sends) must dedupe the second attempt.
        payload = _make_webhook_event("subscription.charged",
            {"id": "sub_e2e", "plan_id": "plan_startup_test"},
            id="evt_retry_1",
        )
        r1 = await service.handle_webhook(payload, sig_header=None)
        assert r1["received"] is True
        r2 = await service.handle_webhook(payload, sig_header=None)
        assert r2["duplicate"] is True

    async def test_idempotency_skips_duplicate(self, service, seeded_sub):
        payload = _make_webhook_event("subscription.activated",
            {"id": "sub_dedup", "customer_id": "cus_dedup", "notes": {"team_id": "team_e2e"}},
        )
        r1 = await service.handle_webhook(payload, sig_header=None, idempotency_key="idem_1")
        assert r1["received"] is True
        r2 = await service.handle_webhook(payload, sig_header=None, idempotency_key="idem_1")
        assert r2["duplicate"] is True

    async def test_unhandled_event_types_are_logged(self, service, seeded_sub):
        payload = _make_webhook_event("subscription.halted", {"id": "sub_e2e"})
        result = await service.handle_webhook(payload, sig_header=None)
        assert result == {"received": True, "type": "subscription.halted"}


class TestEventAuditLog:
    async def test_webhook_events_are_logged(self, service):
        await service.create_subscription("team_log", "free", "monthly")
        payload = _make_webhook_event("subscription.charged",
            {"id": "sub_log", "plan_id": "plan_startup_test"},
        )
        await service.handle_webhook(payload, sig_header=None)
        logs = await service.get_event_log(limit=10)
        matching = [e for e in logs if e["event_type"] == "subscription.charged"]
        assert len(matching) >= 1
        assert matching[0]["status"] == "processed"


class TestPricingTiers:
    def test_all_tiers_present(self):
        pricing = BillingService.get_pricing()
        for tier in ("free", "startup", "professional", "enterprise"):
            assert tier in pricing

    def test_startup_price_is_inr(self):
        assert BillingService.get_pricing()["startup"]["price_monthly"] == 999

    def test_professional_price_is_inr(self):
        assert BillingService.get_pricing()["professional"]["price_monthly"] == 2999
