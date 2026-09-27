"""Tests for the first-party analytics intake.

The properties worth pinning are the ones that protect users, not the happy
path: a hostile or careless client must not be able to store a credential, an
identifier, or unbounded junk.
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1 import analytics as analytics_mod
from app.api.v1.analytics import _clean_props, _normalise_path, _visitor_id


class FakeStorage:
    """Records what would have been written."""

    def __init__(self):
        self.docs = []
        self.rate_docs = []

    async def query_documents(self, collection, filters):
        if collection == "rate_limits":
            return list(self.rate_docs)
        return []

    async def create_document(self, collection, doc_id, data):
        self.docs.append((collection, doc_id, data))
        return data

    async def create_documents(self, collection, items):
        for doc_id, data in items:
            self.docs.append((collection, doc_id, data))
        return [d for _, d in items]


@pytest.fixture
def storage(monkeypatch):
    fake = FakeStorage()
    monkeypatch.setattr(analytics_mod, "get_storage", lambda: fake)
    return fake


@pytest.fixture
def client(storage):
    app = FastAPI()
    app.include_router(analytics_mod.router, prefix="/api/v1")
    return TestClient(app)


# ── the credential guard ──────────────────────────────────────────────────
# /reset-password?token=<jwt> and /verify-email?token=<jwt> are real URLs in
# this app. A tracker that stored the query string would capture every password
# reset in the country.

@pytest.mark.parametrize(
    "raw",
    [
        "/reset-password?token=eyJhbGciOiJIUzI1NiJ9.payload.sig",
        "/verify-email?token=abc123",
        "/docs?search=reset-password",
        "/pricing#pricing",
        "https://evil.example.com/reset-password?token=x",
        "//evil.example.com/x",
        "/path with spaces",
        "",
        None,
    ],
)
def test_paths_carrying_queries_or_secrets_are_refused(raw):
    assert _normalise_path(raw) is None


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("/", "/"),
        ("/why-onramp", "/why-onramp"),
        ("/docs/api", "/docs/api"),
        ("/blog/2026-06-hello", "/blog/2026-06-hello"),
    ],
)
def test_bare_paths_are_kept(raw, expected):
    assert _normalise_path(raw) == expected


def test_token_in_url_is_never_persisted(client, storage):
    r = client.post("/api/v1/events", json={
        "path": "/reset-password?token=SUPERSECRETTOKEN",
        "events": [{"name": "cta_click", "props": {"placement": "hero"}}],
    })
    assert r.status_code == 204
    body = repr(storage.docs)
    assert "SUPERSECRETTOKEN" not in body
    # The event is still recorded, just without a path.
    analytics_rows = [d for d in storage.docs if d[0] == "onramp_events"]
    assert len(analytics_rows) == 1
    assert "path" not in analytics_rows[0][2]["props"]


# ── allowlisting ──────────────────────────────────────────────────────────

def test_unknown_event_names_are_dropped(client, storage):
    client.post("/api/v1/events", json={
        "path": "/",
        "events": [
            {"name": "cta_click", "props": {"placement": "hero"}},
            {"name": "exfiltrate_everything", "props": {}},
            {"name": "sql", "props": {"x": "'; DROP TABLE--"}},
        ],
    })
    rows = [d[2] for d in storage.docs if d[0] == "onramp_events"]
    assert [r["name"] for r in rows] == ["cta_click"]


def test_properties_outside_the_allowlist_are_dropped():
    out = _clean_props("cta_click", {
        "placement": "hero",          # allowed
        "email": "victim@example.com",  # not in the allowlist
        "token": "abc",                 # not in the allowlist
    })
    assert out == {"placement": "hero"}


def test_property_values_are_length_capped():
    out = _clean_props("cta_click", {"placement": "x" * 5000})
    assert len(out["placement"]) == 64


def test_non_scalar_property_values_are_dropped_not_serialised():
    out = _clean_props("cta_click", {
        "placement": {"nested": "object"},
        "href": ["a", "b"],
    })
    assert out == {}


# ── volume abuse ──────────────────────────────────────────────────────────

def test_batch_size_is_capped(client, storage):
    client.post("/api/v1/events", json={
        "path": "/",
        "events": [{"name": "section_viewed", "props": {"section": f"s{i}"}} for i in range(200)],
    })
    rows = [d for d in storage.docs if d[0] == "onramp_events"]
    assert len(rows) == analytics_mod.MAX_EVENTS_PER_REQUEST


def test_empty_batch_is_a_noop(client, storage):
    r = client.post("/api/v1/events", json={"path": "/", "events": []})
    assert r.status_code == 204
    assert [d for d in storage.docs if d[0] == "onramp_events"] == []


# ── the visitor identifier ────────────────────────────────────────────────

def test_visitor_id_rotates_daily_and_is_stable_within_a_day():
    a = _visitor_id("203.0.113.7", "secret", "2026-09-27")
    b = _visitor_id("203.0.113.7", "secret", "2026-09-27")
    c = _visitor_id("203.0.113.7", "secret", "2026-09-28")
    assert a == b, "same visitor, same day, same id"
    assert a != c, "must not be correlatable across days"
    assert "203.0.113.7" not in a, "the IP must not be recoverable"


def test_visitor_id_depends_on_the_server_secret():
    assert _visitor_id("203.0.113.7", "secret-a", "2026-09-27") != _visitor_id(
        "203.0.113.7", "secret-b", "2026-09-27"
    )


def test_ip_is_never_stored(client, storage):
    client.post("/api/v1/events", json={
        "path": "/",
        "events": [{"name": "cta_click", "props": {"placement": "hero"}}],
    })
    row = [d[2] for d in storage.docs if d[0] == "onramp_events"][0]
    assert "ip" not in row
    assert "ip_address" not in row
    assert set(row) == {"visitor_id", "name", "props", "day", "occurred_at"}


def test_response_is_always_204(client, storage):
    assert client.post("/api/v1/events", json={"path": "/", "events": []}).status_code == 204
    assert client.post("/api/v1/events", json={
        "path": "/", "events": [{"name": "nope"}],
    }).status_code == 204
