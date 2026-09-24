"""Regression tests for the distributed rate-limiting requirement (item 1.5
in features_mvp.md): in-memory limiting is per-worker and must be refused
in production without REDIS_URL.
"""
import asyncio
from unittest.mock import AsyncMock

import pytest
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from app.middleware.rate_limit import (
    RateLimitMiddleware,
    RateLimitRule,
    RedisSlidingWindowLog,
    RedisTokenBucket,
)


def _build_app(**middleware_kwargs):
    async def handler(request):
        return JSONResponse({"ok": True})

    app = Starlette(routes=[
        Route("/api/v1/ask/query", handler),
        Route("/api/v1/auth/login", handler),
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


def test_legacy_api_limit_setting_is_applied(monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.delenv("REDIS_URL", raising=False)
    monkeypatch.delenv("RATE_LIMIT_API", raising=False)
    monkeypatch.setenv("RATE_LIMIT_REQUESTS_PER_MINUTE", "7")

    middleware = _instantiate()

    assert middleware.rules["api"].limit == 7


def test_llm_route_has_stricter_limit_than_default(monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.delenv("REDIS_URL", raising=False)
    app = _build_app()
    client = TestClient(app)

    # LLM routes: token bucket with capacity 20
    for _ in range(20):
        resp = client.get("/api/v1/ask/query")
        assert resp.status_code == 200, f"Failed on iteration {_}"

    resp = client.get("/api/v1/ask/query")
    assert resp.status_code == 429

    # Non-LLM route on the same client should still work (sliding window 200/min)
    resp = client.get("/plain")
    assert resp.status_code == 200


def test_auth_route_has_separate_bucket(monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.delenv("REDIS_URL", raising=False)
    app = _build_app()
    client = TestClient(app)

    for _ in range(10):
        resp = client.get("/api/v1/auth/login")
        assert resp.status_code == 200, f"Auth failed on iteration {_}"

    resp = client.get("/api/v1/auth/login")
    assert resp.status_code == 429

    # Auth exhaustion should not affect API routes
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


def test_redis_token_bucket_is_compatible_with_redis_3():
    """Redis 3 rejects variadic HSET; write each hash field separately."""
    redis = AsyncMock()
    redis.eval.return_value = 1

    result = asyncio.run(RedisTokenBucket.try_consume(
        redis, "127.0.0.1", RateLimitRule("token_bucket", limit=10, window=60), "auth"
    ))

    assert result is True
    script = redis.eval.await_args.args[0]
    assert 'redis.call("HSET", key, "tokens", tokens)' in script
    assert 'redis.call("HSET", key, "last_refill", now)' in script
    assert 'redis.call("HSET", key, "tokens", tokens, "last_refill", now)' not in script


def test_redis_backend_errors_propagate_to_middleware_fallback():
    """A Redis outage must not be converted into a misleading 429 by a helper."""
    redis = AsyncMock()
    redis.eval.side_effect = RuntimeError("redis unavailable")

    with pytest.raises(RuntimeError, match="redis unavailable"):
        asyncio.run(RedisTokenBucket.try_consume(
            redis, "127.0.0.1", RateLimitRule("token_bucket", limit=10, window=60), "auth"
        ))

    with pytest.raises(RuntimeError, match="redis unavailable"):
        asyncio.run(RedisSlidingWindowLog.allows(
            redis, "127.0.0.1", RateLimitRule("sliding_window", limit=10, window=60), "api"
        ))


def test_production_redis_failure_returns_503_not_429(monkeypatch):
    """Production must not report a backend outage as a client rate limit."""
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    middleware = _instantiate()

    redis = AsyncMock()
    redis.eval.side_effect = RuntimeError("redis unavailable")

    async def broken_redis():
        return redis

    middleware._get_redis = broken_redis
    request = Request({
        "type": "http",
        "method": "GET",
        "path": "/api/v1/auth/login",
        "headers": [],
        "client": ("127.0.0.1", 12345),
        "query_string": b"",
        "scheme": "http",
        "server": ("testserver", 80),
    })

    async def call_next(_request):
        return JSONResponse({"ok": True})

    response = asyncio.run(middleware.dispatch(request, call_next))
    assert response.status_code == 503
    assert response.headers["retry-after"] == "1"
    assert response.body
