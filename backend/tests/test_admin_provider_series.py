"""Tests for the admin cost-savings time series (GET /admin/usage).

The admin usage endpoint aggregates usage records across ALL teams and now
also returns the free-vs-paid provider split, dollar cost/savings figures,
and a daily ``provider_series`` for the cost-savings chart.
"""

from datetime import datetime, timezone, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.middleware.base import BaseHTTPMiddleware

from app.services.postgres_db import get_storage, generate_id


def _day(days_ago: int) -> str:
    """ISO date (YYYY-MM-DD) ``days_ago`` before today (UTC)."""
    return (datetime.now(timezone.utc).date() - timedelta(days=days_ago)).isoformat()


def _route_meta(provider: str, free: bool, cost_avoided: float = 0.0) -> dict:
    return {
        "provider": provider,
        "free": free,
        "served": f"{provider}/some-model",
        "cost_avoided_usd": cost_avoided,
    }


async def _seed_record(org: str, meta: dict, cost_usd: float = 0.0, created: str = ""):
    storage = get_storage()
    await storage.create_document("usage_records", generate_id(), {
        "user_id": None,
        "team_id": org,
        "endpoint": "chat",
        "method": "POST",
        "status_code": 200,
        "response_time_ms": 0,
        "tokens_used": 1,
        "cost_usd": cost_usd,
        "usage_metadata": meta,
        "created_at": created,
    })


@pytest.fixture
def app(monkeypatch):
    from app.api.v1 import admin as admin_module

    application = FastAPI()

    class _SetUser(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            request.state.user = {
                "uid": "adminuser",
                "email": "admin@test.com",
                "name": "Admin",
            }
            return await call_next(request)

    application.add_middleware(_SetUser)
    application.include_router(admin_module.router, prefix="/api/v1")
    return application


def _client(app):
    return TestClient(app)


async def _seed_admin_owner():
    """Give adminuser the owner role so _require_owner passes."""
    storage = get_storage()
    await storage.create_document("users", "adminuser", {
        "email": "admin@test.com", "name": "Admin", "is_active": True,
    })
    await storage.create_document("teams", "acme", {"name": "Acme", "is_active": True})
    await storage.create_document("team_members", generate_id(), {
        "team_id": "acme", "user_id": "adminuser", "role": "owner",
    })


class TestAdminUsageSeries:
    async def test_aggregates_free_paid_and_cost(self, app):
        await _seed_admin_owner()
        await _seed_record("acme", _route_meta("groq", free=True, cost_avoided=0.05),
                           cost_usd=0.0, created=f"{_day(0)}T10:00:00+00:00")
        await _seed_record("acme", _route_meta("anthropic", free=False),
                           cost_usd=0.03, created=f"{_day(1)}T10:00:00+00:00")
        # Untracked record (no provider metadata) — counts in totals only.
        await _seed_record("acme", {}, created=f"{_day(0)}T11:00:00+00:00")

        resp = _client(app).get("/api/v1/admin/usage")
        assert resp.status_code == 200
        data = resp.json()

        assert data["total_requests"] == 3
        assert data["tracked_requests"] == 2
        assert data["free_requests"] == 1
        assert data["paid_requests"] == 1
        assert data["free_pct"] == 50.0
        assert data["total_cost_usd"] == pytest.approx(0.03)
        assert data["total_cost_avoided_usd"] == pytest.approx(0.05)

        # Series covers the default 14 days; today has the free request,
        # yesterday the paid one, everything else zero.
        series = data["provider_series"]
        assert len(series) == 14
        assert series[-1]["date"] == _day(0)  # oldest bucket
        by_date = {p["date"]: p for p in series}
        assert by_date[_day(0)]["free"] == 1
        assert by_date[_day(0)]["paid"] == 0
        assert by_date[_day(0)]["cost_avoided_usd"] == pytest.approx(0.05)
        assert by_date[_day(1)]["paid"] == 1
        assert by_date[_day(1)]["cost_usd"] == pytest.approx(0.03)

    async def test_series_length_respects_days_param(self, app):
        await _seed_admin_owner()
        await _seed_record("acme", _route_meta("groq", free=True),
                           created=f"{_day(20)}T10:00:00+00:00")

        resp = _client(app).get("/api/v1/admin/usage?days=30")
        data = resp.json()
        assert len(data["provider_series"]) == 30
        by_date = {p["date"]: p for p in data["provider_series"]}
        assert by_date[_day(20)]["free"] == 1

        # A 14-day window excludes a 20-day-old record from the series.
        resp14 = _client(app).get("/api/v1/admin/usage")
        by_date14 = {p["date"]: p for p in resp14.json()["provider_series"]}
        assert _day(20) not in by_date14
        assert resp14.json()["tracked_requests"] == 1  # still in totals

    async def test_period_filter_still_applies(self, app):
        await _seed_admin_owner()
        await _seed_record("acme", _route_meta("groq", free=True),
                           created=f"{_day(40)}T10:00:00+00:00")
        # month = since the 1st of this month; a 40-day-old record is outside.
        resp = _client(app).get("/api/v1/admin/usage?period=month")
        data = resp.json()
        assert data["tracked_requests"] == 0
        assert data["free_pct"] == 0.0

    async def test_reads_postgres_metadata_key(self, app):
        """PostgresStorage emits route metadata under the "metadata" key;
        the admin endpoint must normalize both key shapes."""
        await _seed_admin_owner()
        storage = get_storage()
        await storage.create_document("usage_records", generate_id(), {
            "user_id": None,
            "team_id": "acme",
            "endpoint": "chat",
            "method": "POST",
            "status_code": 200,
            "response_time_ms": 0,
            "tokens_used": 1,
            "cost_usd": 0.0,
            # Postgres read shape: key is "metadata" (column name).
            "metadata": _route_meta("gemini", free=True, cost_avoided=0.02),
            "created_at": f"{_day(0)}T10:00:00+00:00",
        })

        resp = _client(app).get("/api/v1/admin/usage")
        data = resp.json()
        assert data["tracked_requests"] == 1
        assert data["free_requests"] == 1
        assert data["total_cost_avoided_usd"] == pytest.approx(0.02)
        by_date = {p["date"]: p for p in data["provider_series"]}
        assert by_date[_day(0)]["free"] == 1

    async def test_days_param_validation(self, app):
        await _seed_admin_owner()
        # days=0 violates ge=1 → FastAPI returns 422.
        assert _client(app).get("/api/v1/admin/usage?days=0").status_code == 422
        # days=91 violates le=90.
        assert _client(app).get("/api/v1/admin/usage?days=91").status_code == 422
        assert _client(app).get("/api/v1/admin/usage?days=90").status_code == 200

    async def test_requires_owner_role(self, app):
        # No team membership → adminuser is not an owner → 403.
        resp = _client(app).get("/api/v1/admin/usage")
        assert resp.status_code == 403
