"""Razorpay webhook event -> local state mapping (payment.captured top-ups)."""
import json
import pytest
from app.services.billing_service import BillingService


@pytest.fixture
def service(monkeypatch):
    monkeypatch.setenv("RAZORPAY_KEY_ID", "rzp_test_dummy")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "rzp_test_secret")
    monkeypatch.setenv("ALLOW_UNVERIFIED_RAZORPAY", "true")
    monkeypatch.delenv("RAZORPAY_WEBHOOK_SECRET", raising=False)
    return BillingService()


def _event(event_type: str, entity: dict) -> bytes:
    return json.dumps({"event": event_type, "payload": {"payment": {"entity": entity}}}).encode()


class TestPaymentCapturedTopup:
    async def test_topup_credits_wallet(self, service):
        await service.storage.create_document("credit_topup_orders", "order_t1", {
            "order_id": "order_t1", "team_id": "user_t1", "amount_inr": 300,
        })
        payload = _event("payment.captured", {
            "id": "pay_t1", "order_id": "order_t1", "amount": 30000,
            "notes": {"team_id": "user_t1", "topup": "1"},
        })
        result = await service.handle_webhook(payload, sig_header=None)
        assert result == {"received": True, "type": "payment.captured"}

        from app.services.credit_service import CreditService
        wallet = await CreditService().get_wallet("user_t1")
        assert wallet["balance"] == 300

    async def test_subscription_payment_captured_is_logged_only(self, service):
        payload = _event("payment.captured", {
            "id": "pay_t2", "order_id": "order_x", "amount": 99900,
            "notes": {},
        })
        result = await service.handle_webhook(payload, sig_header=None)
        assert result == {"received": True, "type": "payment.captured"}

    async def test_duplicate_topup_payment_credits_once(self, service):
        await service.storage.create_document("credit_topup_orders", "order_t3", {
            "order_id": "order_t3", "team_id": "user_t3", "amount_inr": 100,
        })
        payload = _event("payment.captured", {
            "id": "pay_t3", "order_id": "order_t3", "amount": 10000,
            "notes": {"team_id": "user_t3", "topup": "1"},
        })
        await service.handle_webhook(payload, sig_header=None)
        await service.handle_webhook(payload, sig_header=None)

        from app.services.credit_service import CreditService
        wallet = await CreditService().get_wallet("user_t3")
        assert wallet["balance"] == 100

    async def test_topup_without_matching_order_is_not_credited(self, service):
        payload = _event("payment.captured", {
            "id": "pay_t4", "order_id": "order_missing", "amount": 5000,
            "notes": {"team_id": "user_t4", "topup": "1"},
        })
        result = await service.handle_webhook(payload, sig_header=None)
        assert result == {"received": True, "type": "payment.captured"}

        from app.services.credit_service import CreditService
        wallet = await CreditService().get_wallet("user_t4")
        assert wallet["balance"] == 0

    async def test_webhooks_without_event_id_do_not_collide_in_log(self, service):
        # Regression: id-less events all fell back to the "evt_unknown" log
        # primary key, so a second one raised a duplicate-key error on
        # PostgreSQL. Each must get its own log row.
        p1 = _event("subscription.completed", {"id": "sub_c1", "notes": {}})
        p2 = _event("subscription.completed", {"id": "sub_c2", "notes": {}})
        r1 = await service.handle_webhook(p1, sig_header=None)
        r2 = await service.handle_webhook(p2, sig_header=None)
        assert r1 == {"received": True, "type": "subscription.completed"}
        assert r2 == {"received": True, "type": "subscription.completed"}
        log = await service.storage.query_documents("onramp_webhook_events", [])
        assert len(log) == 2
