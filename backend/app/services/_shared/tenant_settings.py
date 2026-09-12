"""TenantScopedSettingStore — single impl for 30s TTL dict caches."""
from __future__ import annotations
import time
from typing import Any, Awaitable, Callable, Dict, Tuple


class TenantScopedSettingStore:
    def __init__(self, ttl_seconds: float = 30.0):
        self._ttl = ttl_seconds
        self._cache: Dict[str, Tuple[float, Any]] = {}

    def get_cached(self, scope: str):
        now = time.monotonic()
        hit = self._cache.get(scope)
        if hit is not None and hit[0] > now:
            return hit[1]
        return None

    async def get_or_load(self, scope: str, loader: Callable[[], Awaitable[Any]]) -> Any:
        hit = self.get_cached(scope)
        if hit is not None:
            return hit
        value = await loader()
        self._cache[scope] = (time.monotonic() + self._ttl, value)
        return value

    def put(self, scope: str, value: Any) -> None:
        self._cache[scope] = (time.monotonic() + self._ttl, value)

    def invalidate(self, scope: str) -> None:
        self._cache.pop(scope, None)

    def clear(self) -> None:
        self._cache.clear()
