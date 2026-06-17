import os
import time
import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

logger = logging.getLogger("codeflow.ratelimit")


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Sliding-window rate limiter.

    Uses Redis (fixed-window counters) when REDIS_URL is set, giving accurate
    limiting across multiple workers/instances. Falls back to a per-process
    in-memory sliding window when Redis is unavailable.
    """

    def __init__(self, app, requests_per_minute: int = 100):
        super().__init__(app)
        self.limit = requests_per_minute
        self.window_size = 60  # seconds
        self.clients = {}
        # Trust X-Forwarded-For only when explicitly enabled (i.e. when the
        # app sits behind a trusted reverse proxy / load balancer).
        self.trust_proxy = os.getenv("TRUST_PROXY", "false").lower() == "true"
        # Throttle how often we sweep stale entries to bound memory growth.
        self._last_sweep_window = 0
        # Optional distributed backend.
        self.redis_url = os.getenv("REDIS_URL") or None
        self._redis = None
        self._redis_init = False

    async def _get_redis(self):
        """Lazily create a Redis client (best-effort; None if unavailable)."""
        if self._redis_init:
            return self._redis
        self._redis_init = True
        if not self.redis_url:
            return None
        try:
            import redis.asyncio as aioredis
            client = aioredis.from_url(self.redis_url, encoding="utf-8", decode_responses=True)
            await client.ping()
            self._redis = client
            logger.info("Rate limiter using Redis backend.")
        except Exception as exc:
            logger.warning(f"Redis unavailable, falling back to in-memory rate limiting: {exc}")
            self._redis = None
        return self._redis

    async def _redis_allows(self, redis, client_ip: str, current_window: int) -> bool:
        """Fixed-window counter in Redis. Returns True if under the limit."""
        key = f"rl:{client_ip}:{current_window}"
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, self.window_size)
        return count <= self.limit

    def _get_client_ip(self, request: Request) -> str:
        if self.trust_proxy:
            forwarded = request.headers.get("X-Forwarded-For")
            if forwarded:
                # First hop is the original client when set by a trusted proxy.
                return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def _sweep_stale(self, current_window: int) -> None:
        """Evict clients whose data is older than 2 windows to bound memory."""
        stale = [
            ip
            for ip, c in self.clients.items()
            if c["current_window"] < current_window - 2
        ]
        for ip in stale:
            del self.clients[ip]

    async def dispatch(self, request: Request, call_next):
        # We skip rate limiting for internal health checks
        if request.url.path == "/health":
            return await call_next(request)

        # Sliding Window Counter rate limiting
        client_ip = self._get_client_ip(request)
        current_time = time.time()
        current_window = int(current_time // self.window_size)

        # Distributed path: use Redis when configured/available.
        redis = await self._get_redis()
        if redis is not None:
            try:
                if not await self._redis_allows(redis, client_ip, current_window):
                    return JSONResponse(
                        status_code=429,
                        content={"success": False, "error": "Rate limit exceeded. Try again later.", "code": "RATE_LIMIT_EXCEEDED"},
                    )
                return await call_next(request)
            except Exception as exc:
                logger.warning(f"Redis rate-limit error, using in-memory fallback: {exc}")

        # Lightweight periodic sweep: at most once per window.
        if current_window != self._last_sweep_window:
            self._sweep_stale(current_window)
            self._last_sweep_window = current_window

        if client_ip not in self.clients:
            self.clients[client_ip] = {
                "previous_window": current_window - 1,
                "previous_count": 0,
                "current_window": current_window,
                "current_count": 0
            }

        client = self.clients[client_ip]

        # Advance windows if time has passed
        if current_window != client["current_window"]:
            if current_window == client["current_window"] + 1:
                client["previous_window"] = client["current_window"]
                client["previous_count"] = client["current_count"]
            else:
                client["previous_window"] = current_window - 1
                client["previous_count"] = 0

            client["current_window"] = current_window
            client["current_count"] = 0

        # Calculate sliding window weighted count
        window_elapsed = current_time % self.window_size
        weight = (self.window_size - window_elapsed) / self.window_size
        estimated_count = (client["previous_count"] * weight) + client["current_count"]

        if estimated_count >= self.limit:
            return JSONResponse(
                status_code=429,
                content={"success": False, "error": "Rate limit exceeded. Try again later.", "code": "RATE_LIMIT_EXCEEDED"}
            )

        # Increment current window count
        client["current_count"] += 1

        response = await call_next(request)
        return response
