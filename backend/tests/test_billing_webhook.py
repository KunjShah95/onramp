"""Regression tests for critical 1.5: Stripe webhook must not be trusted
without signature verification in production, and dev bypass requires an
explicit opt-in flag.
"""
import json

import pytest

from app.services.billing_service import BillingService


@pytest.fixture
def service(monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_dummy")
    return BillingService()


async def test_production_without_secret_or_signature_is_rejected(service, monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.delenv("STRIPE_WEBHOOK_SECRET", raising=False)
    payload = json.dumps({"id": "evt_1", "type": "checkout.session.completed"}).encode()

    event = await service._verify_and_parse_event(payload, sig_header=None)
    assert event is None


async def test_dev_without_secret_and_without_allow_flag_is_rejected(service, monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.delenv("STRIPE_WEBHOOK_SECRET", raising=False)
    monkeypatch.delenv("ALLOW_UNVERIFIED_STRIPE", raising=False)
    payload = json.dumps({"id": "evt_1", "type": "checkout.session.completed"}).encode()

    event = await service._verify_and_parse_event(payload, sig_header=None)
    assert event is None


async def test_dev_without_secret_but_with_allow_flag_is_accepted(service, monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.delenv("STRIPE_WEBHOOK_SECRET", raising=False)
    monkeypatch.setenv("ALLOW_UNVERIFIED_STRIPE", "true")
    payload = json.dumps({"id": "evt_1", "type": "checkout.session.completed"}).encode()

    event = await service._verify_and_parse_event(payload, sig_header=None)
    assert event == {"id": "evt_1", "type": "checkout.session.completed"}


async def test_secret_set_but_signature_header_missing_is_rejected(service, monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_dummy")
    payload = b'{"id": "evt_1"}'

    event = await service._verify_and_parse_event(payload, sig_header=None)
    assert event is None


async def test_secret_and_header_present_but_invalid_signature_is_rejected(service, monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_dummy")
    payload = b'{"id": "evt_1"}'

    event = await service._verify_and_parse_event(payload, sig_header="t=1,v1=not-a-real-signature")
    assert event is None


async def test_handle_webhook_returns_error_on_invalid_signature(service, monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_dummy")

    result = await service.handle_webhook(b'{"id": "evt_1"}', sig_header="bad-sig")
    assert result == {"error": "Invalid webhook signature"}
