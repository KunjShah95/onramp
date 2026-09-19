"""n8n two-way integration tests (no external network — httpx mocked)."""
import hashlib
import hmac
import json
import os

import pytest


def _set_env(monkeypatch, **kwargs):
    for k, v in kwargs.items():
        monkeypatch.setenv(k, v)


def test_build_envelope_and_outbound_signature(monkeypatch):
    _set_env(monkeypatch, N8N_HMAC_SECRET="s3cret")
    from app.services import n8n_service as n8n
    import importlib

    importlib.reload(n8n)
    body = n8n.build_envelope("test.ping", {"hello": "n8n"})
    data = json.loads(body)
    assert data["event"] == "test.ping"
    assert data["source"] == "onramp"
    headers = n8n._sign(body)
    assert headers["X-Onramp-Signature"].startswith("sha256=")
    expected = "sha256=" + hmac.new(b"s3cret", body, hashlib.sha256).hexdigest()
    assert headers["X-Onramp-Signature"] == expected


def test_inbound_signature_verify(monkeypatch):
    _set_env(monkeypatch, N8N_INBOUND_SECRET="inbound-secret")
    from app.services import n8n_service as n8n
    import importlib

    importlib.reload(n8n)
    body = b'{"action":"ping"}'
    good = "sha256=" + hmac.new(b"inbound-secret", body, hashlib.sha256).hexdigest()
    assert n8n.verify_inbound_signature(body, good) is True
    assert n8n.verify_inbound_signature(body, "sha256=wrong") is False
    assert n8n.verify_inbound_signature(body, "") is False


def test_inbound_requires_secret(monkeypatch):
    monkeypatch.delenv("N8N_INBOUND_SECRET", raising=False)
    from app.services import n8n_service as n8n
    import importlib

    importlib.reload(n8n)
    assert n8n.verify_inbound_signature(b"{}", "sha256=anything") is False


@pytest.mark.asyncio
async def test_notify_noop_when_unconfigured(monkeypatch):
    monkeypatch.delenv("N8N_WEBHOOK_URL", raising=False)
    monkeypatch.delenv("N8N_ONBOARDING_WEBHOOK_URL", raising=False)
    from app.services import n8n_service as n8n
    import importlib

    importlib.reload(n8n)

    async def _no_team(_team_id):
        return None

    async def _no_user(_uid):
        return []

    monkeypatch.setattr(n8n, "_resolve_team_webhook", _no_team)
    monkeypatch.setattr(n8n, "_resolve_user_webhooks", _no_user)
    assert await n8n.notify("test.ping", {}) is False


@pytest.mark.asyncio
async def test_event_filtering(monkeypatch):
    from app.services import n8n_service as n8n

    assert n8n._event_allowed("task.completed", ["*"]) is True
    assert n8n._event_allowed("task.completed", None) is True
    assert n8n._event_allowed("task.completed", ["task.completed"]) is True
    assert n8n._event_allowed("task.completed", ["task.assigned"]) is False
