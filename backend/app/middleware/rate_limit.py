"""
Rate-limit middleware with multi-algorithm support.

Algorithms:
  token_bucket  — LLM & auth routes (allows bursts up to capacity, then refills)
  sliding_window — general API routes (accurate per-window count via Redis sorted sets,
                   falling back to in-memory sliding-window counter)

Redis path uses sorted sets (sliding window log) + token bucket keys.
In-memory fallback per-process is accurate only within a single worker.
Production deployments MUST set REDIS_URL to enforce global limits.
"""

import asyncio
import os
import time
import math
import logging
from dataclasses import dataclass
from typing import Optional
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

logger = logging.getLogger("onramp.ratelimit")


# ── Configuration ───────────────────────────────────────────────────────────

@dataclass
class RateLimitRule:
    """Single rate-limit rule."""
    algorithm: str                           # "token_bucket" | "sliding_window"
    limit: int                               # bucket capacity (token_bucket) or max per window
    window: int = 60                         # seconds
    refill_rate: Optional[float] = None      # tokens/sec (token_bucket only, defaults to limit/window)

    @property
    def effective_refill(self) -> float:
        return self.refill_rate if self.refill_rate is not None else self.limit / self.window


# Default rule sets — env overrides supported per group
DEFAULT_RULES: dict[str, RateLimitRule] = {
    "llm":        RateLimitRule("token_bucket", limit=20, window=60),
    "auth":       RateLimitRule("token_bucket", limit=10, window=60),
    "auth_reset": RateLimitRule("token_bucket", limit=3, window=900),   # 3 per 15 min
    "admin":      RateLimitRule("token_bucket", limit=60, window=60),
    "api":        RateLimitRule("token_bucket", limit=200, window=60),
}


# Order matters: more-specific prefixes must come BEFORE the general "auth" prefix
# so they match first.  The forgot-password endpoints get the stricter auth_reset bucket.
ROUTE_GROUP_PREFIXES: list[tuple[str, str]] = [
    ("llm",        "/api/v1/ask/"),
    ("llm",        "/api/v1/ai/"),
    ("llm",        "/api/v1/explore/"),
    ("llm",        "/api/v1/agent-sessions"),
    ("llm",        "/api/v1/repo"),
    ("llm",        "/api/v1/learn"),
    ("llm",        "/v1/"),  # OpenAI-compatible gateway gets the strict LLM bucket
    ("auth_reset", "/api/v1/auth/forgot-password"),
    ("auth_reset", "/api/v1/auth/reset-password"),
    ("auth",       "/api/v1/auth/"),
    ("admin",      "/api/v1/admin/"),
]


def _resolve_rule(group: str) -> RateLimitRule:
    """Resolve a rule, checking env overrides."""
    base = DEFAULT_RULES[group]
    env_key = f"RATE_LIMIT_{group.upper()}"
    override = os.getenv(env_key)
    # Keep the central legacy setting effective for the default API bucket.
    # Group-specific RATE_LIMIT_API still takes precedence when present.
    if group == "api" and not override:
        override = os.getenv("RATE_LIMIT_REQUESTS_PER_MINUTE")
    if override:
        try:
            parts = override.split(",")
            limit = int(parts[0])
            window = int(parts[1]) if len(parts) > 1 else base.window
            return RateLimitRule(base.algorithm, limit, window)
        except (ValueError, IndexError):
            logger.warning("Invalid env override %s=%s", env_key, override)
    return base


def _match_group(path: str) -> str:
    for group, prefix in ROUTE_GROUP_PREFIXES:
        if path.startswith(prefix):
            return group
    return "api"


# ── In-memory token bucket (per-process burst limiter) ────────────────────

class InMemoryTokenBucket:
    """In-memory token bucket for burst control — per-process only."""

    def __init__(self, capacity: int, refill_rate: float):
        self.capacity = capacity
        self.tokens = float(capacity)
        self.refill_rate = refill_rate
        self.last_refill = time.time()

    def _refill(self) -> None:
        now = time.time()
        elapsed = now - self.last_refill
        self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_rate)
        self.last_refill = now

    def try_consume(self) -> bool:
        self._refill()
        if self.tokens >= 1.0:
            self.tokens -= 1.0
            return True
        return False

    def reset(self) -> None:
        self.tokens = float(self.capacity)
        self.last_refill = time.time()


# ── In-memory sliding-window counter (existing algorithm, cleaned up) ─────

class InMemoryWindowState:
    """Per-client sliding-window state."""

    def __init__(self, window: int):
        self.previous_window: int = 0
        self.previous_count: int = 0
        self.current_window: int = int(time.time() // window)
        self.current_count: int = 0


# ── Redis token bucket ─────────────────────────────────────────────────────

class RedisTokenBucket:
    """Redis-backed token bucket using a key + TTL."""

    @staticmethod
    def key(client_ip: str, group: str) -> str:
        return f"rlb:{group}:{client_ip}"

    @staticmethod
    async def try_consume(redis, client_ip: str, rule: RateLimitRule, group: str) -> bool:
        """Atomic token bucket via Lua script. Returns True if allowed."""
        key = RedisTokenBucket.key(client_ip, group)
        script = """
        local key = KEYS[1]
        local capacity = tonumber(ARGV[1])
        local refill_rate = tonumber(ARGV[2])
        local now = tonumber(ARGV[3])
        local cost = 1

        local bucket = redis.call("HMGET", key, "tokens", "last_refill")
        local tokens = tonumber(bucket[1] or capacity)
        local last_refill = tonumber(bucket[2] or now)

        local elapsed = math.max(0, now - last_refill)
        tokens = math.min(capacity, tokens + elapsed * refill_rate)

        if tokens >= cost then
            tokens = tokens - cost
            redis.call("HSET", key, "tokens", tokens)
            redis.call("HSET", key, "last_refill", now)
            redis.call("EXPIRE", key, math.ceil(capacity / refill_rate) * 2)
            return 1
        end
        return 0
        """
        # Let Redis failures propagate to the middleware. The middleware owns
        # the fallback policy; returning False here would turn a backend outage
        # into a misleading 429 response for every endpoint.
        return bool(await redis.eval(
            script, 1, key, rule.limit, rule.effective_refill, time.time()
        ))


# ── Redis sliding window log (sorted set) ─────────────────────────────────

class RedisSlidingWindowLog:
    """Accurate sliding window via Redis sorted set of timestamps."""

    @staticmethod
    def key(client_ip: str, group: str) -> str:
        return f"rls:{group}:{client_ip}"

    # Atomic: purge expired, count, and only ADD when under the limit — so a
    # rejected request never inflates the window or extends the lockout.
    _SCRIPT = """
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local window = tonumber(ARGV[2])
    local limit = tonumber(ARGV[3])
    local member = ARGV[4]
    redis.call("ZREMRANGEBYSCORE", key, 0, now - window)
    local count = redis.call("ZCARD", key)
    if count < limit then
        redis.call("ZADD", key, now, member)
        redis.call("EXPIRE", key, math.ceil(window) * 2)
        return 1
    end
    return 0
    """

    @staticmethod
    async def allows(redis, client_ip: str, rule: RateLimitRule, group: str) -> bool:
        """Sliding-window log via Redis sorted set. Returns True if under limit."""
        key = RedisSlidingWindowLog.key(client_ip, group)
        now = time.time()
        # Unique member so concurrent requests in the same tick don't collide.
        member = f"{now}:{os.urandom(6).hex()}"
        # Let Redis failures propagate to the middleware. The middleware owns
        # the fallback policy; returning False here would turn a backend outage
        # into a misleading 429 response for every endpoint.
        allowed = await redis.eval(
            RedisSlidingWindowLog._SCRIPT, 1, key,
            now, rule.window, rule.limit, member,
        )
        return bool(allowed)


# ── Middleware ──────────────────────────────────────────────────────────────

def _rate_limit_headers(count: int, limit: int, remaining: int, reset: int) -> dict:
    return {
        "X-RateLimit-Limit": str(limit),
        "X-RateLimit-Remaining": str(max(0, remaining)),
        "X-RateLimit-Reset": str(reset),
    }


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Multi-algorithm rate limiter.

    Groups (all token_bucket — burst-tolerant, O(1) memory per client):
      llm        | 20/min   env: RATE_LIMIT_LLM=20,60
      auth       | 10/min   env: RATE_LIMIT_AUTH=10,60
      auth_reset | 3/15min  env: RATE_LIMIT_AUTH_RESET=3,900  (forgot/reset password)
      admin      | 60/min   env: RATE_LIMIT_ADMIN=60,60
      api        | 200/min  env: RATE_LIMIT_API=200,60

    sliding_window (Redis sorted-set log) remains available for any group
    configured with algorithm="sliding_window".

    Production requires REDIS_URL for cross-worker global limiting.
    Falls back to per-process in-memory when Redis is unavailable.
    """

    SKIP_PATHS = frozenset({
        "/health", "/ready", "/metrics", "/docs", "/redoc", "/openapi.json",
        "/api/v1/explore/health",
    })

    def __init__(self, app, requests_per_minute: int = 200):
        super().__init__(app)
        self.rules: dict[str, RateLimitRule] = {}
        for group in DEFAULT_RULES:
            self.rules[group] = _resolve_rule(group)

        self.trust_proxy = os.getenv("TRUST_PROXY", "false").lower() == "true"
        self.redis_url = os.getenv("REDIS_URL") or None
        self._redis = None
        self._redis_retry_at = 0.0
        self._redis_lock = asyncio.Lock()
        self.is_production = os.getenv("ENV", "development").strip().lower() == "production"
        # In production, a dead Redis must not silently switch to a per-process
        # limiter: that would allow a multi-worker deployment to bypass the
        # configured global limit. Development keeps the fail-open fallback for
        # a usable local environment.
        self.redis_fail_closed = self.is_production and os.getenv(
            "RATE_LIMIT_REDIS_FAIL_OPEN", "false"
        ).strip().lower() not in {"1", "true", "yes", "on"}

        # In-memory state stores
        self._tb_buckets: dict[str, InMemoryTokenBucket] = {}      # ip -> bucket
        self._sw_clients: dict[str, InMemoryWindowState] = {}      # ip -> window state
        self._sw_window: int = 60
        self._last_tb_sweep: float = 0
        self._last_sw_sweep: int = 0

        if self.is_production and not self.redis_url:
            raise RuntimeError(
                "REDIS_URL required when ENV=production — in-memory rate "
                "limiting is per-worker and does not enforce global limits."
            )

    # ── Redis lazy init ────────────────────────────────────────────────────

    async def _get_redis(self):
        if self._redis is not None:
            return self._redis
        if not self.redis_url or time.monotonic() < self._redis_retry_at:
            return None

        # Multiple requests can arrive together after startup or a Redis
        # restart. Serialize connection attempts so they do not create a burst
        # of clients and so a successful connection is shared by all requests.
        async with self._redis_lock:
            if self._redis is not None:
                return self._redis
            if not self.redis_url or time.monotonic() < self._redis_retry_at:
                return None

            client = None
            try:
                import redis.asyncio as aioredis
                # Use RESP2 for compatibility with older Redis-compatible
                # servers. redis-py defaults to RESP3 and sends HELLO, which
                # fails on Redis 3.x even though basic commands work.
                client = aioredis.from_url(
                    self.redis_url,
                    encoding="utf-8",
                    decode_responses=True,
                    protocol=2,
                )
                await client.ping()
                self._redis = client
                self._redis_retry_at = 0.0
                logger.info("Rate limiter using Redis backend.")
            except Exception as exc:
                self._redis = None
                self._redis_retry_at = time.monotonic() + 5.0
                logger.warning(
                    "Redis unavailable (%s): %s",
                    "production requests will fail closed" if self.redis_fail_closed else "using in-memory fallback",
                    exc,
                )
                if client is not None:
                    try:
                        close = getattr(client, "aclose", None) or client.close
                        result = close()
                        if result is not None and hasattr(result, "__await__"):
                            await result
                    except Exception:
                        logger.debug("Failed to close unusable Redis client", exc_info=True)
            return self._redis

    async def _invalidate_redis(self, client) -> None:
        """Drop a broken client and allow a later request to reconnect."""
        if self._redis is not client:
            return
        self._redis = None
        self._redis_retry_at = time.monotonic() + 5.0
        try:
            close = getattr(client, "aclose", None) or client.close
            result = close()
            if result is not None and hasattr(result, "__await__"):
                await result
        except Exception:
            logger.debug("Failed to close broken Redis client", exc_info=True)

    # ── IP extraction ───────────────────────────────────────────────────────

    def _get_client_ip(self, request: Request) -> str:
        if self.trust_proxy:
            forwarded = request.headers.get("X-Forwarded-For")
            if forwarded:
                return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    # ── In-memory token bucket with TTL eviction ───────────────────────────

    def _inmem_tb_allows(self, client_ip: str, rule: RateLimitRule, group: str) -> bool:
        # Evict stale buckets every ~60s to prevent unbounded growth
        now = time.time()
        if now - self._last_tb_sweep > 60:
            # Use each bucket's own window (capacity/refill_rate) so a fast
            # group (llm, window=60) sweep never evicts slow-group buckets
            # (auth_reset, window=900) that are still within their TTL.
            stale_keys = [
                k for k, b in self._tb_buckets.items()
                if now - b.last_refill > (b.capacity / b.refill_rate) * 2
            ]
            for k in stale_keys:
                del self._tb_buckets[k]
            self._last_tb_sweep = now
        bkey = f"{group}:{client_ip}"
        bucket = self._tb_buckets.get(bkey)
        if not bucket:
            bucket = InMemoryTokenBucket(rule.limit, rule.effective_refill)
            self._tb_buckets[bkey] = bucket
        return bucket.try_consume()

    # ── In-memory sliding window ──────────────────────────────────────────

    def _inmem_sw_allows(self, client_ip: str, rule: RateLimitRule, group: str) -> bool:
        now = time.time()
        current_window = int(now // self._sw_window)
        skey = f"{group}:{client_ip}"

        # Sweep stale entries every window
        if current_window != self._last_sw_sweep:
            stale = [k for k, s in self._sw_clients.items() if s.current_window < current_window - 2]
            for k in stale:
                del self._sw_clients[k]
            self._last_sw_sweep = current_window

        state = self._sw_clients.get(skey)
        if not state:
            state = InMemoryWindowState(self._sw_window)
            self._sw_clients[skey] = state

        if current_window != state.current_window:
            if current_window == state.current_window + 1:
                state.previous_window = state.current_window
                state.previous_count = state.current_count
            else:
                state.previous_window = current_window - 1
                state.previous_count = 0
            state.current_window = current_window
            state.current_count = 0

        elapsed = now % self._sw_window
        weight = (self._sw_window - elapsed) / self._sw_window
        estimated = (state.previous_count * weight) + state.current_count

        if estimated >= rule.limit:
            return False
        state.current_count += 1
        return True

    def _redis_unavailable_response(self) -> JSONResponse:
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "error": "Rate-limit service temporarily unavailable. Please retry.",
                "code": "RATE_LIMIT_BACKEND_UNAVAILABLE",
                "retry_after": 1,
            },
            headers={"Retry-After": "1"},
        )

    # ── Dispatch ────────────────────────────────────────────────────────────

    async def dispatch(self, request: Request, call_next):
        if os.getenv("ENV", "development").strip().lower() == "test":
            return await call_next(request)
        if request.url.path in self.SKIP_PATHS:
            return await call_next(request)

        client_ip = self._get_client_ip(request)
        group = _match_group(request.url.path)
        rule = self.rules[group]

        redis = await self._get_redis()
        allowed = True

        if redis is not None:
            try:
                if rule.algorithm == "token_bucket":
                    allowed = await RedisTokenBucket.try_consume(redis, client_ip, rule, group)
                else:
                    allowed = await RedisSlidingWindowLog.allows(redis, client_ip, rule, group)
            except Exception as exc:
                await self._invalidate_redis(redis)
                if self.redis_fail_closed:
                    logger.error("Redis rate-limit backend unavailable: %s", exc)
                    return self._redis_unavailable_response()
                logger.warning("Redis rate-limit error, in-memory fallback: %s", exc)
                allowed = self._inmem_allows(client_ip, rule, group)
        else:
            # A configured Redis that cannot connect is an outage, not a
            # successful rate-limit decision. Keep production fail-closed so
            # multiple workers cannot bypass the global limit.
            if self.redis_fail_closed and self.redis_url:
                logger.error("Redis rate-limit backend unavailable during initialization")
                return self._redis_unavailable_response()
            allowed = self._inmem_allows(client_ip, rule, group)

        if not allowed:
            reset_at = int(time.time()) + rule.window
            headers = _rate_limit_headers(
                count=0, limit=rule.limit,
                remaining=0,
                reset=reset_at,
            )
            # Add Retry-After so clients know exactly when to retry
            headers["Retry-After"] = str(rule.window)

            # Stricter message for password-reset endpoints
            if group == "auth_reset":
                error_msg = f"Too many password reset requests. Try again in {rule.window // 60} minutes."
            else:
                error_msg = "Rate limit exceeded. Try again later."

            return JSONResponse(
                status_code=429,
                content={
                    "success": False,
                    "error": error_msg,
                    "code": "RATE_LIMIT_EXCEEDED",
                    "group": group,
                    "limit": rule.limit,
                    "window": rule.window,
                    "retry_after": rule.window,
                },
                headers=headers,
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(rule.limit)
        return response

    def _inmem_allows(self, client_ip: str, rule: RateLimitRule, group: str) -> bool:
        if rule.algorithm == "token_bucket":
            return self._inmem_tb_allows(client_ip, rule, group)
        return self._inmem_sw_allows(client_ip, rule, group)
