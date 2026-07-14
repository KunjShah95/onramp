"""Cache Service — Redis-backed response caching with graceful fallback."""

import os
import json
import hashlib
import logging
from typing import Optional, Callable
from functools import wraps
from fastapi import Request, Response

logger = logging.getLogger("onramp.cache")

REDIS_URL_ENV = "REDIS_URL"
DEFAULT_TTL = 300  # 5 minutes

_client = None


def _get_redis_url() -> Optional[str]:
    return os.getenv(REDIS_URL_ENV)


def is_redis_available() -> bool:
    """Check if Redis is configured."""
    return bool(_get_redis_url())


async def get_client():
    """Get or create the Redis client. Returns None if unavailable."""
    global _client
    if _client is not None:
        return _client
    url = _get_redis_url()
    if not url:
        return None
    try:
        import redis.asyncio as aioredis
        _client = aioredis.from_url(url, decode_responses=True, socket_connect_timeout=2)
        await _client.ping()
        logger.info("Connected to Redis at %s", url)
        return _client
    except Exception:
        logger.warning("Redis unavailable — caching disabled")
        _client = None
        return None


async def close():
    """Close the Redis connection."""
    global _client
    if _client:
        await _client.close()
        _client = None


def _cache_key(prefix: str, request: Request) -> str:
    """Generate a cache key from request path, query params, and user identity."""
    uid = getattr(getattr(request, "state", None), "user", {}).get("uid", "")
    raw = f"{prefix}:{uid}:{request.url.path}:{sorted(request.query_params.items())}"
    return hashlib.md5(raw.encode()).hexdigest()


async def get_cached(prefix: str, request: Request) -> Optional[str]:
    """Get cached response. Returns None if miss."""
    client = await get_client()
    if not client:
        return None
    try:
        key = _cache_key(prefix, request)
        return await client.get(key)
    except Exception:
        return None


async def set_cached(prefix: str, request: Request, value: str, ttl: int = DEFAULT_TTL) -> bool:
    """Cache a response."""
    client = await get_client()
    if not client:
        return False
    try:
        key = _cache_key(prefix, request)
        await client.setex(key, ttl, value)
        return True
    except Exception:
        return False


async def invalidate_pattern(pattern: str) -> int:
    """Invalidate all cache keys matching a pattern (e.g. 'dashboard:*'). Returns count."""
    client = await get_client()
    if not client:
        return 0
    try:
        keys = await client.keys(pattern)
        if keys:
            await client.delete(*keys)
            return len(keys)
        return 0
    except Exception:
        return 0


async def invalidate_prefix(prefix: str) -> int:
    """Invalidate all cache keys with a prefix."""
    return await invalidate_pattern(f"{prefix}:*")


def cached(prefix: str, ttl: int = DEFAULT_TTL):
    """Decorator: cache GET endpoint responses keyed by path + query params.

    Usage:
        @router.get("/dashboard/cto")
        @cached("dashboard", ttl=120)
        async def cto_dashboard(...):
            ...
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            request = kwargs.get("request") or next(
                (a for a in args if isinstance(a, Request)), None
            )
            if request and request.method == "GET":
                cached_val = await get_cached(prefix, request)
                if cached_val is not None:
                    return Response(
                        content=cached_val,
                        media_type="application/json",
                        headers={"X-Cache": "HIT"},
                    )
                result = await func(*args, **kwargs)
                try:
                    serialized = json.dumps(result, default=str)
                    await set_cached(prefix, request, serialized, ttl=ttl)
                except Exception:
                    logger.exception("Failed to cache response")
                return result
            return await func(*args, **kwargs)
        return wrapper
    return decorator
