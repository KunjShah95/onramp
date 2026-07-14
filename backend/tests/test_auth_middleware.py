"""Regression tests for auth middleware: public-path prefix bypass protection
and JWT-based authentication.
"""
import pytest
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from app.middleware.auth import AuthMiddleware


PUBLIC_PATHS = ["/health", "/api/v1/billing/webhook"]


def _build_app():
    async def handler(request):
        return JSONResponse({"ok": True})

    routes = [
        Route("/health", handler),
        Route("/api/v1/billing/webhook", handler, methods=["POST"]),
        Route("/api/v1/billing/webhook-extra", handler),  # prefix, NOT in public_paths
        Route("/protected", handler),
    ]
    app = Starlette(routes=routes)
    app.add_middleware(AuthMiddleware, public_paths=PUBLIC_PATHS)
    return app


@pytest.fixture
def client():
    return TestClient(_build_app())


def test_exact_public_path_allowed_without_auth(client):
    resp = client.get("/health")
    assert resp.status_code == 200


def test_public_path_prefix_is_not_bypassed(client):
    """A path that merely starts with a public path must still require auth.

    This is the exact regression for critical 1.1: the old implementation used
    startswith() matching, so /api/v1/billing/webhook-extra would have slipped
    through unauthenticated just because /api/v1/billing/webhook is public.
    """
    resp = client.get("/api/v1/billing/webhook-extra")
    assert resp.status_code == 401


def test_protected_path_without_header_rejected(client):
    resp = client.get("/protected")
    assert resp.status_code == 401
    assert "Authorization" in resp.json()["detail"]


def test_protected_path_with_malformed_header_rejected(client):
    resp = client.get("/protected", headers={"Authorization": "Basic abc123"})
    assert resp.status_code == 401


def test_protected_path_with_invalid_token_rejected(client, monkeypatch):
    async def _fake_verify(token):
        return None

    monkeypatch.setattr("app.middleware.auth.verify_session_token", _fake_verify)
    resp = client.get("/protected", headers={"Authorization": "Bearer not-a-real-token"})
    assert resp.status_code == 401


def test_protected_path_with_valid_token_allowed(client, monkeypatch):
    async def _fake_verify(token):
        assert token == "good-token"
        return {"uid": "u1", "email": "a@b.com", "name": "A", "provider": "password"}

    monkeypatch.setattr("app.middleware.auth.verify_session_token", _fake_verify)
    resp = client.get("/protected", headers={"Authorization": "Bearer good-token"})
    assert resp.status_code == 200


def test_options_request_bypasses_auth(client):
    """CORS preflight must not be blocked by auth."""
    resp = client.options("/protected")
    assert resp.status_code != 401


class TestJWTValidation:
    """JWT validation: invalid/expired tokens must be rejected."""

    def test_invalid_jwt_format_rejected(self, client):
        resp = client.get("/protected", headers={"Authorization": "Bearer not-a-jwt"})
        assert resp.status_code == 401

    def test_malformed_bearer_header_rejected(self, client):
        resp = client.get("/protected", headers={"Authorization": "NotBearer token"})
        assert resp.status_code == 401
