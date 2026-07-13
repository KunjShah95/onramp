"""Smoke tests: all 29+ API routers mount and respond correctly.

These tests verify:
1. All routers are registered on the app
2. Public endpoints return correct status codes
3. Health endpoints work without authentication
4. The app starts without errors
"""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    """Import the FastAPI app and create a test client.

    The conftest sets STORAGE_BACKEND=memory and GROQ_API_KEY,
    so the app initializes without a real database or LLM keys.
    """
    from app.main import app
    with TestClient(app) as c:
        yield c


class TestAppStartup:
    """App boots without errors and registers all routes."""

    def test_root_endpoint(self, client):
        resp = client.get("/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["data"]["status"] == "running"
        assert "CodeFlow 2.0 API" in data["data"]["message"]

    def test_health_endpoint(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["data"]["status"] == "healthy"

    def test_docs_endpoint(self, client):
        resp = client.get("/docs")
        assert resp.status_code == 200

    def test_openapi_schema(self, client):
        from app.main import app
        schema = app.openapi()
        paths = schema.get("paths", {})
        assert len(paths) > 20, f"Expected 20+ routes, got {len(paths)}"


class TestPublicEndpoints:
    """Public endpoints work without authentication."""

    def test_pricing_endpoint(self, client):
        resp = client.get("/api/v1/billing/pricing")
        assert resp.status_code == 200
        data = resp.json()
        assert "tiers" in data["data"] or "plans" in data["data"]

    def test_waitlist_count(self, client):
        resp = client.get("/api/v1/waitlist/count")
        assert resp.status_code == 200

    def test_ai_tiers(self, client):
        resp = client.get("/api/v1/ai/tiers")
        assert resp.status_code == 200

    def test_explore_health(self, client):
        resp = client.get("/api/v1/explore/health")
        assert resp.status_code == 200

    def test_waitlist_join_rejects_empty_body(self, client):
        resp = client.post("/api/v1/waitlist/join", json={})
        assert resp.status_code == 422


class TestAuthRequired:
    """Non-public endpoints reject unauthenticated requests."""

    def test_repos_requires_auth(self, client):
        resp = client.get("/api/v1/repos")
        assert resp.status_code == 401

    def test_dashboard_requires_auth(self, client):
        resp = client.get("/api/v1/dashboard")
        assert resp.status_code == 401

    def test_teams_requires_auth(self, client):
        resp = client.get("/api/v1/teams")
        assert resp.status_code == 401

    def test_billing_requires_auth(self, client):
        resp = client.get("/api/v1/billing")
        assert resp.status_code == 401

    def test_auth_me_requires_auth(self, client):
        resp = client.get("/api/v1/auth/me")
        assert resp.status_code == 401

    def test_notifications_requires_auth(self, client):
        resp = client.get("/api/v1/notifications")
        assert resp.status_code == 401

    def test_profile_requires_auth(self, client):
        resp = client.get("/api/v1/teams/profile")
        assert resp.status_code == 401

    def test_admin_requires_auth(self, client):
        resp = client.get("/api/v1/admin/keys")
        assert resp.status_code == 401

    def test_integrations_requires_auth(self, client):
        resp = client.get("/api/v1/integrations")
        assert resp.status_code == 401
