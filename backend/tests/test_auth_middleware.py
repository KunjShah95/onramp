"""Regression tests for critical 1.1 (public-path prefix bypass) and 1.2
(session token-only auth) — see features_mvp.md section 2.
"""
import pytest
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from app.middleware.auth import AuthMiddleware, _dev_bypass_enabled


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


class TestDevBypass:
    """Session-token-only regression (critical 1.2): dev bypass must never
    activate outside explicit opt-in + non-production."""

    def test_disabled_by_default(self, monkeypatch):
        monkeypatch.delenv("AUTH_DEV_BYPASS", raising=False)
        assert _dev_bypass_enabled() is False

    def test_disabled_in_production_even_if_flag_set(self, monkeypatch):
        monkeypatch.setenv("AUTH_DEV_BYPASS", "true")
        monkeypatch.setenv("ENV", "production")
        assert _dev_bypass_enabled() is False

    def test_enabled_only_with_flag_and_non_production(self, monkeypatch):
        monkeypatch.setenv("AUTH_DEV_BYPASS", "true")
        monkeypatch.setenv("ENV", "development")
        assert _dev_bypass_enabled() is True
