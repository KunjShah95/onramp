"""Regression tests: Razorpay webhook must not be trusted without signature
verification in production, and dev bypass requires an explicit opt-in flag.
"""
import json

import pytest

from app.services.billing_service import BillingService


@pytest.fixture
def service(monkeypatch):
    monkeypatch.setenv("RAZORPAY_KEY_ID", "rzp_test_dummy")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "rzp_test_secret")
    return BillingService()


async def test_production_without_secret_or_signature_is_rejected(service, monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.delenv("RAZORPAY_WEBHOOK_SECRET", raising=False)
    payload = json.dumps({"event": "subscription.charged"}).encode()

    event = await service._verify_and_parse_event(payload, sig_header=None)
    assert event is None


async def test_dev_without_secret_and_without_allow_flag_is_rejected(service, monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.delenv("RAZORPAY_WEBHOOK_SECRET", raising=False)
    monkeypatch.delenv("ALLOW_UNVERIFIED_RAZORPAY", raising=False)
    payload = json.dumps({"event": "subscription.charged"}).encode()

    event = await service._verify_and_parse_event(payload, sig_header=None)
    assert event is None


async def test_dev_without_secret_but_with_allow_flag_is_accepted(service, monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.delenv("RAZORPAY_WEBHOOK_SECRET", raising=False)
    monkeypatch.setenv("ALLOW_UNVERIFIED_RAZORPAY", "true")
    payload = json.dumps({"event": "subscription.charged", "payload": {"subscription": {"entity": {"id": "s1"}}}}).encode()

    event = await service._verify_and_parse_event(payload, sig_header=None)
    assert event is not None
    assert event["type"] == "subscription.charged"


async def test_secret_set_but_signature_header_missing_is_rejected(service, monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("RAZORPAY_WEBHOOK_SECRET", "whsec_dummy")
    payload = b'{"event": "subscription.charged"}'

    event = await service._verify_and_parse_event(payload, sig_header=None)
    assert event is None


async def test_secret_and_header_present_but_invalid_signature_is_rejected(service, monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("RAZORPAY_WEBHOOK_SECRET", "whsec_dummy")
    payload = b'{"event": "subscription.charged"}'

    event = await service._verify_and_parse_event(payload, sig_header="not-a-real-signature")
    assert event is None


async def test_handle_webhook_returns_error_on_invalid_signature(service, monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("RAZORPAY_WEBHOOK_SECRET", "whsec_dummy")

    result = await service.handle_webhook(b'{"event": "subscription.charged"}', sig_header="bad-sig")
    assert result == {"error": "Invalid webhook signature"}
