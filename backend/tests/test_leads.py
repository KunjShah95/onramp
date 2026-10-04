"""Tests for the public contact-form intake and GTM signup attribution."""
from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1 import leads as leads_mod
from app.api.v1.analytics import ALLOWED_EVENTS, _clean_props
from app.services.field_encryption import decrypt_field_lenient


class FakeStorage:
    def __init__(self):
        self.docs = []
        self.rate_docs = []

    async def query_documents(self, collection, filters):
        if collection == "rate_limits":
            return list(self.rate_docs)
        return []

    async def create_document(self, collection, doc_id, data):
        if collection == "rate_limits":
            self.rate_docs.append(data)
        else:
            self.docs.append((collection, doc_id, data))
        return data


@pytest.fixture
def storage(monkeypatch):
    fake = FakeStorage()
    monkeypatch.setattr(leads_mod, "get_storage", lambda: fake)
    return fake


@pytest.fixture
def client(storage):
    app = FastAPI()
    app.include_router(leads_mod.router, prefix="/api/v1")
    return TestClient(app)


VALID = {
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "company": "Analytical Engines",
    "message": "We hire four engineers a quarter.",
    "utm_source": "linkedin",
    "utm_campaign": "launch",
}


def test_lead_is_stored_with_pii_encrypted(client, storage):
    res = client.post("/api/v1/leads", json=VALID)
    assert res.status_code == 200
    assert res.json()["received"] is True

    [(collection, _id, data)] = storage.docs
    assert collection == "leads"
    assert data["email"] != VALID["email"]
    assert decrypt_field_lenient(data["email"]) == VALID["email"]
    assert decrypt_field_lenient(data["name"]) == VALID["name"]
    assert decrypt_field_lenient(data["message"]) == VALID["message"]
    assert data["utm_source"] == "linkedin"
    assert data["status"] == "new"


def test_honeypot_submission_is_dropped_silently(client, storage):
    res = client.post("/api/v1/leads", json={**VALID, "website": "http://spam.example"})
    assert res.status_code == 200
    assert storage.docs == []


def test_rate_limit_blocks_after_cap(client, storage):
    now = datetime.now(timezone.utc).isoformat()
    storage.rate_docs = [{"key": "x", "created_at": now}] * leads_mod._RATE_MAX
    res = client.post("/api/v1/leads", json=VALID)
    assert res.status_code == 429
    assert storage.docs == []


@pytest.mark.parametrize("bad", [
    {"email": "not-an-email"},
    {"message": ""},
    {"message": "x" * 4001},
    {"name": ""},
])
def test_invalid_payloads_are_rejected(client, storage, bad):
    res = client.post("/api/v1/leads", json={**VALID, **bad})
    assert res.status_code == 422
    assert storage.docs == []


@pytest.mark.parametrize("value,expected", [
    ("linkedin", "linkedin"),
    ("show-hn_2026.10", "show-hn_2026.10"),
    ("<script>", None),
    ("has space", None),
    ("x" * 65, None),
    (None, None),
])
def test_clean_utm_keeps_only_short_slugs(value, expected):
    assert leads_mod.clean_utm(value) == expected


def test_unslugged_utm_is_not_stored(client, storage):
    client.post("/api/v1/leads", json={**VALID, "utm_source": "a b <c>"})
    [(_, _, data)] = storage.docs
    assert data["utm_source"] is None


def test_activation_events_are_allowlisted():
    for name in ("repo_connected", "ask_answered", "invite_sent", "contact_submitted"):
        assert name in ALLOWED_EVENTS
    props = _clean_props("signup_completed", {
        "method": "password", "utm_source": "hn", "email": "leak@example.com",
    })
    assert props == {"method": "password", "utm_source": "hn"}
