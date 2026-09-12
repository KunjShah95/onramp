"""
In-memory TTL cache for GitHub API responses.
Thread-safe, expires entries after a configurable time-to-live.

Persistence: none — entries live only in this process and are lost on
restart/redeploy. Callers must treat a miss as normal (graceful degradation):
``get`` returns None for missing/expired keys and ``get_or_set`` recomputes
via the factory. Do not store anything that can't be recomputed.
"""

import time
import threading
from typing import Any, Optional, Callable


class TTLCache:
    """Simple thread-safe in-memory cache with time-to-live expiration."""

    def __init__(self, default_ttl: int = 300):
        """
        Args:
            default_ttl: Default time-to-live in seconds (default: 300 = 5 minutes).
        """
        self._default_ttl = default_ttl
        self._cache: dict[str, tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        """Get a value from cache. Returns None if missing or expired."""
        with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                return None
            expires_at, value = entry
            if time.time() > expires_at:
                del self._cache[key]
                return None
            return value

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set a value in cache with TTL in seconds."""
        expires_at = time.time() + (ttl if ttl is not None else self._default_ttl)
        with self._lock:
            self._cache[key] = (expires_at, value)

    def get_or_set(self, key: str, factory: Callable[[], Any], ttl: Optional[int] = None) -> Any:
        """Get from cache or compute and store using the factory function."""
        existing = self.get(key)
        if existing is not None:
            return existing
        value = factory()
        self.set(key, value, ttl)
        return value

    def invalidate(self, key: str) -> None:
        """Remove a key from cache."""
        with self._lock:
            self._cache.pop(key, None)

    def invalidate_prefix(self, prefix: str) -> int:
        """Remove all keys starting with prefix. Returns count removed."""
        with self._lock:
            matched = [k for k in self._cache.keys() if k.startswith(prefix)]
            for k in matched:
                self._cache.pop(k, None)
            return len(matched)

    def clear(self) -> None:
        """Clear all cached entries."""
        with self._lock:
            self._cache.clear()


# Global cache instance shared across services
github_cache = TTLCache(default_ttl=300)  # 5 minutes
