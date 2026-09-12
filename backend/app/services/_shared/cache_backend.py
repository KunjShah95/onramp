"""CacheBackend protocol unifying memory + Redis tiers."""
from __future__ import annotations
import hashlib
from typing import Any, Optional, Protocol


def make_key(*parts: str) -> str:
    raw = ":".join(str(p) for p in parts)
    return hashlib.sha256(raw.encode()).hexdigest()


class CacheBackend(Protocol):
    async def get(self, key: str) -> Optional[Any]: ...
    async def set(self, key: str, value: Any, ttl: int = 300) -> bool: ...
    async def invalidate(self, key: str) -> None: ...
    async def invalidate_prefix(self, prefix: str) -> int: ...


class MemoryBackend:
    """Wraps app.services.cache.TTLCache for sync/async callers."""

    def __init__(self, ttl: int = 300):
        from app.services.cache import TTLCache
        self._inner = TTLCache(default_ttl=ttl)

    async def get(self, key: str):
        return self._inner.get(key)

    async def set(self, key: str, value: Any, ttl: int = 300) -> bool:
        self._inner.set(key, value, ttl)
        return True

    async def invalidate(self, key: str) -> None:
        self._inner.invalidate(key)

    async def invalidate_prefix(self, prefix: str) -> int:
        if hasattr(self._inner, "invalidate_prefix"):
            return self._inner.invalidate_prefix(prefix)
        removed = 0
        for k in [k for k in list(self._inner._cache.keys()) if k.startswith(prefix)]:
            self._inner.invalidate(k)
            removed += 1
        return removed


class RedisBackend:
    """Wraps app.services.cache_service.get_client (best-effort, fail-None)."""

    async def get(self, key: str):
        from app.services import cache_service
        client = await cache_service.get_client()
        if not client:
            return None
        try:
            return await client.get(key)
        except Exception:
            return None

    async def set(self, key: str, value: Any, ttl: int = 300) -> bool:
        from app.services import cache_service
        client = await cache_service.get_client()
        if not client:
            return False
        try:
            await client.setex(key, ttl, value if isinstance(value, str) else str(value))
            return True
        except Exception:
            return False

    async def invalidate(self, key: str) -> None:
        from app.services import cache_service
        await cache_service.invalidate_pattern(key)

    async def invalidate_prefix(self, prefix: str) -> int:
        from app.services import cache_service
        return await cache_service.invalidate_prefix(prefix)


def get_default_backend() -> CacheBackend:
    return MemoryBackend()
