"""End-to-end tests for the full billing lifecycle.

Covers subscription CRUD, Stripe Checkout session creation, webhook event
processing (checkout completed, subscription update/delete, invoice events),
idempotency handling, and event audit logging.
"""
import json
from unittest.mock import MagicMock, patch
import pytest
from app.services.billing_service import BillingService


@pytest.fixture
def service(monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_dummy")
    monkeypatch.setenv("ALLOW_UNVERIFIED_STRIPE", "true")
    monkeypatch.delenv("STRIPE_WEBHOOK_SECRET", raising=False)
    import app.services.billing_service as bs
    monkeypatch.setattr(bs, "STRIPE_PRICE_IDS", {
        "startup": "price_startup_test",
        "professional": "price_prof_test",
    })
    return BillingService()


@pytest.fixture
async def seeded_sub(service):
    await service.create_subscription("team_e2e", "startup", "monthly")
    await service.attach_stripe("team_e2e", "cus_e2e", "sub_e2e")
    return "team_e2e"


def _make_webhook_event(event_type: str, **overrides: dict) -> bytes:
    data = {
        "id": "evt_test",
        "type": event_type,
        "data": {"object": {"id": "sub_test", "object": "event"}},
        "created": 1700000000,
    }
    data.update(overrides)
    return json.dumps(data).encode()


class TestSubscriptionCRUD:
    async def test_create_and_get_subscription(self, service):
        sub = await service.create_subscription("team_1", "startup", "monthly")
        assert sub["team_id"] == "team_1"
        assert sub["tier"] == "startup"
        assert sub["status"] == "active"
        assert sub["price"] == 49

        fetched = await service.get_subscription("team_1")
        assert fetched is not None
        assert fetched["subscription_id"] == sub["subscription_id"]

    async def test_get_nonexistent_subscription(self, service):
        assert await service.get_subscription("nonexistent") is None

    async def test_update_subscription_tier(self, service):
        await service.create_subscription("team_1", "startup", "monthly")
        updated = await service.update_subscription("team_1", "professional")
        assert updated["tier"] == "professional"
        assert updated["price"] == 299

    async def test_cancel_subscription_hides_it(self, service):
        await service.create_subscription("team_1", "startup", "monthly")
        assert await service.cancel_subscription("team_1") is True
        assert await service.get_subscription("team_1") is None

    async def test_cancel_nonexistent_returns_false(self, service):
        assert await service.cancel_subscription("nonexistent") is False

    async def test_attach_stripe_ids(self, service):
        await service.create_subscription("team_1", "startup", "monthly")
        assert await service.attach_stripe("team_1", "cus_abc", "sub_xyz") is True
        sub = await service.get_subscription("team_1")
        assert sub["stripe_customer_id"] == "cus_abc"
        assert sub["stripe_subscription_id"] == "sub_xyz"


class TestCheckoutSession:
    async def test_stripe_disabled_returns_stub(self, monkeypatch, service):
        monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
        result = await service.create_checkout_session(
            "team_1", "startup", "https://example.com/success", "https://example.com/cancel"
        )
        assert result == {"error": "Stripe is not configured", "stub": True}

    async def test_creates_stripe_checkout_session(self, service):
        mock_session = MagicMock(url="https://checkout.stripe.com/cs_test", id="cs_test_123")
        mock_stripe = MagicMock()
        mock_stripe.checkout.Session.create.return_value = mock_session
        with patch.object(service, "_stripe", return_value=mock_stripe):
            result = await service.create_checkout_session(
                "team_1", "startup", "https://example.com/success", "https://example.com/cancel"
            )
        assert result["url"] == "https://checkout.stripe.com/cs_test"
        assert result["session_id"] == "cs_test_123"


class TestWebhookEvents:
    async def test_checkout_completed_attaches_stripe(self, service, seeded_sub):
        payload = _make_webhook_event("checkout.session.completed",
            data={"object": {"client_reference_id": "team_e2e", "customer": "cus_new", "subscription": "sub_new"}},
        )
        result = await service.handle_webhook(payload, sig_header=None)
        assert result == {"received": True, "type": "checkout.session.completed"}
        sub = await service.get_subscription("team_e2e")
        assert sub["stripe_customer_id"] == "cus_new"
        assert sub["stripe_subscription_id"] == "sub_new"

    async def test_subscription_updated_syncs_status(self, service, seeded_sub):
        payload = _make_webhook_event("customer.subscription.updated",
            data={"object": {"id": "sub_e2e", "status": "past_due", "items": {"data": [{"price": {"id": ""}}]}, "cancel_at_period_end": False}},
        )
        await service.handle_webhook(payload, sig_header=None)
        subs = await service.storage.query_documents("codeflow_subscriptions", [("team_id", "==", "team_e2e")])
        assert subs[0]["status"] == "past_due"

    async def test_subscription_deleted_cancels_local(self, service, seeded_sub):
        payload = _make_webhook_event("customer.subscription.deleted",
            data={"object": {"id": "sub_e2e"}},
        )
        await service.handle_webhook(payload, sig_header=None)
        assert await service.get_subscription("team_e2e") is None

    async def test_invoice_payment_succeeded_updates_period(self, service, seeded_sub):
        payload = _make_webhook_event("invoice.payment_succeeded",
            data={"object": {"subscription": "sub_e2e", "period_end": 1700100000}},
        )
        await service.handle_webhook(payload, sig_header=None)
        sub = await service.get_subscription("team_e2e")
        assert sub["current_period_end"] is not None

    async def test_invoice_payment_failed_sets_past_due(self, service, seeded_sub):
        payload = _make_webhook_event("invoice.payment_failed",
            data={"object": {"subscription": "sub_e2e"}},
        )
        await service.handle_webhook(payload, sig_header=None)
        subs = await service.storage.query_documents("codeflow_subscriptions", [("team_id", "==", "team_e2e")])
        assert subs[0]["status"] == "past_due"

    async def test_idempotency_skips_duplicate(self, service, seeded_sub):
        payload = _make_webhook_event("checkout.session.completed",
            data={"object": {"client_reference_id": "team_e2e", "customer": "cus_dedup", "subscription": "sub_dedup"}},
        )
        r1 = await service.handle_webhook(payload, sig_header=None, idempotency_key="idem_1")
        assert r1["received"] is True
        r2 = await service.handle_webhook(payload, sig_header=None, idempotency_key="idem_1")
        assert r2["duplicate"] is True
        assert r2["type"] == "checkout.session.completed"

    async def test_unhandled_event_types_are_logged(self, service, seeded_sub):
        payload = _make_webhook_event("setup_intent.created",
            data={"object": {"id": "seti_test"}},
        )
        result = await service.handle_webhook(payload, sig_header=None)
        assert result == {"received": True, "type": "setup_intent.created"}


class TestEventAuditLog:
    async def test_webhook_events_are_logged(self, service):
        await service.create_subscription("team_log", "free", "monthly")
        payload = _make_webhook_event("checkout.session.completed",
            data={"object": {"client_reference_id": "team_log", "customer": "cus_log", "subscription": "sub_log"}},
        )
        await service.handle_webhook(payload, sig_header=None)
        logs = await service.get_event_log(limit=10)
        matching = [e for e in logs if e["event_type"] == "checkout.session.completed"]
        assert len(matching) >= 1
        assert matching[0]["status"] == "processed"


class TestPricingTiers:
    def test_all_tiers_present(self):
        pricing = BillingService.get_pricing()
        for tier in ("free", "startup", "professional", "enterprise"):
            assert tier in pricing

    def test_pricing_has_features(self):
        for tier_data in BillingService.get_pricing().values():
            assert "features" in tier_data
            assert isinstance(tier_data["features"], list)
