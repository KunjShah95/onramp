"""Tests for provider route tracking: usage logging + cost-savings endpoint."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.middleware.base import BaseHTTPMiddleware

from app.services.usage_tracker import UsageTracker
from app.services.postgres_db import get_storage, generate_id


def _route(provider="groq", model="llama-3.3-70b-versatile", free=True, qtype="chat"):
    return {
        "provider": provider,
        "model": model,
        "served": f"{provider}/{model}",
        "free": free,
        "query_type": qtype,
    }


class TestProviderBreakdown:
    """UsageTracker.get_provider_breakdown() aggregation."""

    async def test_empty_org(self):
        result = await UsageTracker().get_provider_breakdown("nobody")
        assert result["total_requests"] == 0
        assert result["tracked_requests"] == 0
        assert result["free_pct"] == 0.0
        assert result["providers"] == {}

    async def test_aggregates_free_and_paid(self):
        tracker = UsageTracker()
        await tracker.record_usage("acme", "chat", credits=1, metadata=_route())
        await tracker.record_usage(
            "acme",
            "chat",
            credits=1,
            metadata=_route(
                provider="anthropic",
                model="claude-3-5-sonnet-20241022",
                free=False,
                qtype="code",
            ),
        )
        result = await tracker.get_provider_breakdown("acme")
        assert result["total_requests"] == 2
        assert result["tracked_requests"] == 2
        assert result["free_requests"] == 1
        assert result["paid_requests"] == 1
        assert result["free_pct"] == 50.0
        assert result["providers"] == {"groq": 1, "anthropic": 1}
        assert result["models"]["groq/llama-3.3-70b-versatile"] == 1
        # Defaults: no dollar figures were passed, so cost is $0.
        assert result["total_cost_usd"] == 0.0
        assert result["total_cost_avoided_usd"] == 0.0
        assert result["provider_costs"]["groq"]["requests"] == 1

    async def test_aggregates_cost_and_savings(self):
        tracker = UsageTracker()
        await tracker.record_usage(
            "acme", "chat", credits=1,
            cost_usd=0.0, cost_avoided_usd=0.0500,
            metadata=_route(provider="groq"),
        )
        await tracker.record_usage(
            "acme", "chat", credits=1,
            cost_usd=0.0300, cost_avoided_usd=0.0,
            metadata=_route(
                provider="anthropic",
                model="claude-3-5-sonnet-20241022",
                free=False,
                qtype="code",
            ),
        )
        result = await tracker.get_provider_breakdown("acme")
        assert result["total_cost_usd"] == pytest.approx(0.03)
        assert result["total_cost_avoided_usd"] == pytest.approx(0.05)
        assert result["provider_costs"]["groq"] == {
            "requests": 1, "cost_usd": 0.0, "cost_avoided_usd": 0.05,
        }
        assert result["provider_costs"]["anthropic"]["cost_usd"] == pytest.approx(0.03)

    async def test_ignores_records_without_metadata(self):
        tracker = UsageTracker()
        await tracker.record_usage("acme", "chat", credits=1)  # no provider metadata
        result = await tracker.get_provider_breakdown("acme")
        assert result["total_requests"] == 1
        assert result["tracked_requests"] == 0
        assert result["providers"] == {}

    async def test_period_filter(self):
        tracker = UsageTracker()
        await tracker.record_usage("acme", "chat", credits=1, metadata=_route())
        result = await tracker.get_provider_breakdown("acme", period="day")
        assert result["tracked_requests"] == 1


class TestProviderUsageEndpoint:
    """GET /api/v1/ai/usage/{org}/providers endpoint."""

    @pytest.fixture
    def app(self, monkeypatch):
        from app.api.v1 import ai_gateway
        from app.services import api_key_service

        async def fake_validate(key):
            return {
                "key_hash": "x",
                "name": "acme",
                "permissions": {"tier": "free", "org_name": "acme"},
                "org_name": "acme",
            }

        monkeypatch.setattr(api_key_service, "validate_api_key", fake_validate)

        application = FastAPI()

        class _SetUser(BaseHTTPMiddleware):
            async def dispatch(self, request, call_next):
                request.state.user = {
                    "uid": "testuser",
                    "email": "t@test.com",
                    "name": "Test",
                    "provider": "test",
                }
                return await call_next(request)

        application.add_middleware(_SetUser)
        application.include_router(ai_gateway.router, prefix="/api/v1")
        return application

    async def test_providers_endpoint(self, app):
        storage = get_storage()
        await storage.create_document("users", "testuser", {
            "email": "t@test.com", "name": "Test", "is_active": True,
        })
        await storage.create_document("team_members", generate_id(), {
            "team_id": "acme", "user_id": "testuser", "role": "owner",
        })
        await UsageTracker().record_usage("acme", "chat", credits=1, metadata=_route())

        resp = TestClient(app).get("/api/v1/ai/usage/acme/providers")
        assert resp.status_code == 200
        data = resp.json()
        assert data["providers"] == {"groq": 1}
        assert data["free_pct"] == 100.0
        assert data["tracked_requests"] == 1

    async def test_providers_endpoint_requires_membership(self, app):
        resp = TestClient(app).get("/api/v1/ai/usage/acme/providers")
        assert resp.status_code == 403
