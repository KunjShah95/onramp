"""Regression tests for the distributed rate-limiting requirement (item 1.5
in features_mvp.md): in-memory limiting is per-worker and must be refused
in production without REDIS_URL.
"""
import pytest
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from app.middleware.rate_limit import RateLimitMiddleware


def _build_app(**middleware_kwargs):
    async def handler(request):
        return JSONResponse({"ok": True})

    app = Starlette(routes=[
        Route("/api/v1/ask/query", handler),
        Route("/plain", handler),
        Route("/health", handler),
    ])
    app.add_middleware(RateLimitMiddleware, **middleware_kwargs)
    return app


def _instantiate(**middleware_kwargs):
    """Construct RateLimitMiddleware directly.

    Starlette's add_middleware() only appends to a list; the middleware isn't
    actually instantiated until the stack is built lazily on the first
    request. Constructing it directly here is what actually exercises the
    fail-fast check in __init__.
    """
    return RateLimitMiddleware(app=lambda *a: None, **middleware_kwargs)


def test_production_without_redis_url_refuses_to_start(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.delenv("REDIS_URL", raising=False)
    with pytest.raises(RuntimeError, match="REDIS_URL"):
        _instantiate()


def test_production_with_redis_url_starts_fine(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    _instantiate()  # must not raise


def test_non_production_without_redis_url_starts_fine(monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.delenv("REDIS_URL", raising=False)
    _instantiate()  # must not raise


def test_llm_route_has_stricter_limit_than_default(monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.delenv("REDIS_URL", raising=False)
    app = _build_app(requests_per_minute=200)
    client = TestClient(app)

    for _ in range(RateLimitMiddleware.LLM_ROUTE_LIMIT):
        resp = client.get("/api/v1/ask/query")
        assert resp.status_code == 200

    resp = client.get("/api/v1/ask/query")
    assert resp.status_code == 429

    # A non-LLM route on the same client should still be well within budget.
    resp = client.get("/plain")
    assert resp.status_code == 200


def test_health_check_is_never_rate_limited(monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.delenv("REDIS_URL", raising=False)
    app = _build_app(requests_per_minute=1)
    client = TestClient(app)

    for _ in range(5):
        resp = client.get("/health")
        assert resp.status_code == 200
