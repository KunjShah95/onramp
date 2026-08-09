"""Tests for the ops endpoints (/health, /ready) and security headers middleware."""

import os
os.environ.setdefault("STORAGE_BACKEND", "memory")

from fastapi.testclient import TestClient

from app.main import app

import pytest


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def _no_redis_env(monkeypatch):
    """Keep readiness tests hermetic.

    app.main calls load_dotenv(), which imports backend/.env and sets
    REDIS_URL even in tests. When no Redis server is running, the /ready
    probe then correctly reports redis=error and returns 503. These tests
    assert the "no Redis configured" path, so remove REDIS_URL for them.
    """
    monkeypatch.delenv("REDIS_URL", raising=False)


def test_health_liveness(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "version" in data
    assert "uptime_seconds" in data


def test_ready_readiness_ok_with_memory_backend(client):
    """With the memory backend + no Redis, readiness should be OK."""
    resp = client.get("/ready")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ready"
    assert data["checks"]["database"]["status"] == "ok"
    assert data["checks"]["redis"]["status"] == "ok"


def test_ready_shapes_checks_dict(client):
    resp = client.get("/ready")
    data = resp.json()
    assert set(data["checks"].keys()) == {"database", "redis"}


def test_ready_exposes_detail_for_each_check(client):
    resp = client.get("/ready")
    data = resp.json()
    for name, check in data["checks"].items():
        assert "status" in check
        assert "detail" in check


def test_security_headers_present(client):
    resp = client.get("/health")
    assert resp.headers.get("x-content-type-options") == "nosniff"
    assert resp.headers.get("x-frame-options") == "DENY"
    assert resp.headers.get("referrer-policy") == "strict-origin-when-cross-origin"
    assert resp.headers.get("permissions-policy") is not None


def test_security_headers_on_api_responses(client):
    resp = client.get("/api/v1/billing/pricing")
    assert resp.status_code == 200
    assert resp.headers.get("x-content-type-options") == "nosniff"


def test_request_id_header_echoed(client):
    resp = client.get("/health", headers={"X-Request-ID": "test-correlation-123"})
    assert resp.headers.get("x-request-id") == "test-correlation-123"


def test_request_id_generated_when_missing(client):
    resp = client.get("/health")
    rid = resp.headers.get("x-request-id")
    assert rid and len(rid) >= 8


def test_process_time_header(client):
    resp = client.get("/health")
    assert "x-process-time" in resp.headers
    assert resp.headers["x-process-time"].endswith("ms")
