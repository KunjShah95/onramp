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

import os
import time
import math
import logging
from dataclasses import dataclass, field
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
    "llm":    RateLimitRule("token_bucket", limit=20, window=60),
    "auth":   RateLimitRule("token_bucket", limit=10, window=60),
    "admin":  RateLimitRule("token_bucket", limit=60, window=60),
    "api":    RateLimitRule("token_bucket", limit=200, window=60),
}


ROUTE_GROUP_PREFIXES: list[tuple[str, str]] = [
    ("llm",    "/api/v1/ask/"),
    ("llm",    "/api/v1/ai/"),
    ("llm",    "/api/v1/explore/"),
    ("llm",    "/v1/"),  # OpenAI-compatible gateway gets the strict LLM bucket
    ("auth",   "/api/v1/auth/"),
    ("admin",  "/api/v1/admin/"),
]


def _resolve_rule(group: str) -> RateLimitRule:
    """Resolve a rule, checking env overrides."""
    base = DEFAULT_RULES[group]
    env_key = f"RATE_LIMIT_{group.upper()}"
    override = os.getenv(env_key)
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
            redis.call("HMSET", key, "tokens", tokens, "last_refill", now)
            redis.call("EXPIRE", key, math.ceil(capacity / refill_rate) * 2)
            return 1
        end
        return 0
        """
        try:
            return bool(await redis.eval(script, 1, key, rule.limit, rule.effective_refill, time.time()))
        except Exception as e:
            logger.warning("Redis token-bucket error: %s", e)
            return True  # fail open


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
        try:
            allowed = await redis.eval(
                RedisSlidingWindowLog._SCRIPT, 1, key,
                now, rule.window, rule.limit, member,
            )
            return bool(allowed)
        except Exception as e:
            logger.warning("Redis sliding-window error: %s", e)
            return True  # fail open


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
      llm   | 20/min   env: RATE_LIMIT_LLM=20,60
      auth  | 10/min   env: RATE_LIMIT_AUTH=10,60
      admin | 60/min   env: RATE_LIMIT_ADMIN=60,60
      api   | 200/min  env: RATE_LIMIT_API=200,60

    sliding_window (Redis sorted-set log) remains available for any group
    configured with algorithm="sliding_window".

    Production requires REDIS_URL for cross-worker global limiting.
    Falls back to per-process in-memory when Redis is unavailable.
    """

    SKIP_PATHS = frozenset({
        "/health", "/ready", "/metrics", "/docs", "/redoc", "/openapi.json",
    })

    def __init__(self, app, requests_per_minute: int = 200):
        super().__init__(app)
        self.rules: dict[str, RateLimitRule] = {}
        for group in DEFAULT_RULES:
            self.rules[group] = _resolve_rule(group)

        self.trust_proxy = os.getenv("TRUST_PROXY", "false").lower() == "true"
        self.redis_url = os.getenv("REDIS_URL") or None
        self._redis = None
        self._redis_init = False

        # In-memory state stores
        self._tb_buckets: dict[str, InMemoryTokenBucket] = {}      # ip -> bucket
        self._sw_clients: dict[str, InMemoryWindowState] = {}      # ip -> window state
        self._sw_window: int = 60
        self._last_sweep = 0

        if os.getenv("ENV") == "production" and not self.redis_url:
            raise RuntimeError(
                "REDIS_URL required when ENV=production — in-memory rate "
                "limiting is per-worker and does not enforce global limits."
            )

    # ── Redis lazy init ────────────────────────────────────────────────────

    async def _get_redis(self):
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
            logger.warning("Redis unavailable, in-memory fallback: %s", exc)
            self._redis = None
        return self._redis

    # ── IP extraction ───────────────────────────────────────────────────────

    def _get_client_ip(self, request: Request) -> str:
        if self.trust_proxy:
            forwarded = request.headers.get("X-Forwarded-For")
            if forwarded:
                return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    # ── In-memory token bucket ─────────────────────────────────────────────

    def _inmem_tb_allows(self, client_ip: str, rule: RateLimitRule, group: str) -> bool:
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
        if current_window != self._last_sweep:
            stale = [k for k, s in self._sw_clients.items() if s.current_window < current_window - 2]
            for k in stale:
                del self._sw_clients[k]
            self._last_sweep = current_window

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

    # ── Dispatch ────────────────────────────────────────────────────────────

    async def dispatch(self, request: Request, call_next):
        if os.getenv("ENV") == "test":
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
                logger.warning("Redis rate-limit error, in-memory fallback: %s", exc)
                allowed = self._inmem_allows(client_ip, rule, group)
        else:
            allowed = self._inmem_allows(client_ip, rule, group)

        if not allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "success": False,
                    "error": "Rate limit exceeded. Try again later.",
                    "code": "RATE_LIMIT_EXCEEDED",
                    "group": group,
                    "limit": rule.limit,
                    "window": rule.window,
                },
                headers=_rate_limit_headers(
                    count=0, limit=rule.limit,
                    remaining=0,
                    reset=int(time.time()) + rule.window,
                ),
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(rule.limit)
        return response

    def _inmem_allows(self, client_ip: str, rule: RateLimitRule, group: str) -> bool:
        if rule.algorithm == "token_bucket":
            return self._inmem_tb_allows(client_ip, rule, group)
        return self._inmem_sw_allows(client_ip, rule, group)
