"""Central application settings (stdlib only — no new dependencies).

Why this exists (first principles): 113 scattered ``os.getenv`` calls across
``services/`` and ``api/v1/`` meant defaults drifted per file (JWT issuer,
expiry, cookie domain, LLM timeouts). Every new module should read
:class:`Settings` via :func:`get_settings` instead of ``os.getenv`` directly.

Migration is incremental: old ``os.getenv`` call sites keep working. New code
(``app.core.security``, ``app.services.refresh_token_service``) uses this.

``pydantic-settings`` is deliberately NOT required — it is not in
``requirements.txt`` and adding a dependency for this would force a
requirements + lockfile change. This module is stdlib-only.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


def _str_env(key: str, default: str) -> str:
    value = os.getenv(key)
    if value is None or value == "":
        return default
    return value


def _int_env(key: str, default: int) -> int:
    raw = os.getenv(key)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except (ValueError, TypeError):
        return default


def _float_env(key: str, default: float) -> float:
    raw = os.getenv(key)
    if raw is None or raw == "":
        return default
    try:
        return float(raw)
    except (ValueError, TypeError):
        return default


@dataclass
class Settings:
    """Single source of truth for environment-driven configuration."""

    env: str = "development"
    # -- Auth / JWT ------------------------------------------------------
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "onramp"
    jwt_audience: str = "onramp-api"
    jwt_access_expiry_minutes: int = 15
    jwt_refresh_expiry_days: int = 30
    # -- Cookies ---------------------------------------------------------
    cookie_domain: str = ""
    # -- Infra -----------------------------------------------------------
    database_url: str = ""
    redis_url: str = ""
    # -- Lockout (mirrors lockout_service defaults) ----------------------
    lockout_max_attempts: int = 5
    lockout_duration_minutes: int = 15
    lockout_window_minutes: int = 30
    # -- LLM timeouts (mirrors llm.py defaults) ---------------------------
    llm_timeout_openrouter: float = 30.0
    llm_timeout_anthropic: float = 30.0
    llm_timeout_openrouter_stream: float = 60.0
    llm_timeout_anthropic_stream: float = 60.0
    # -- Rate limits ------------------------------------------------------
    rate_limit_api_per_minute: int = 200

    @property
    def is_production(self) -> bool:
        return self.env.lower() == "production"

    @property
    def is_test(self) -> bool:
        return self.env.lower() == "test"


def _load_settings() -> Settings:
    env = _str_env("ENV", _str_env("ENVIRONMENT", "development"))
    return Settings(
        env=env,
        jwt_secret=_str_env("JWT_SECRET", ""),
        jwt_algorithm="HS256",
        jwt_issuer=_str_env("JWT_ISSUER", "onramp"),
        jwt_audience=_str_env("JWT_AUDIENCE", "onramp-api"),
        jwt_access_expiry_minutes=_int_env("JWT_ACCESS_EXPIRY_MINUTES", 15),
        jwt_refresh_expiry_days=_int_env("JWT_REFRESH_EXPIRY_DAYS", 30),
        cookie_domain=_str_env("COOKIE_DOMAIN", ""),
        database_url=_str_env("DATABASE_URL", ""),
        redis_url=_str_env("REDIS_URL", ""),
        lockout_max_attempts=_int_env("LOCKOUT_MAX_ATTEMPTS", 5),
        lockout_duration_minutes=_int_env("LOCKOUT_DURATION_MINUTES", 15),
        lockout_window_minutes=_int_env("LOCKOUT_WINDOW_MINUTES", 30),
        llm_timeout_openrouter=_float_env("LLM_TIMEOUT_OPENROUTER", 30.0),
        llm_timeout_anthropic=_float_env("LLM_TIMEOUT_ANTHROPIC", 30.0),
        llm_timeout_openrouter_stream=_float_env("LLM_TIMEOUT_OPENROUTER_STREAM", 60.0),
        llm_timeout_anthropic_stream=_float_env("LLM_TIMEOUT_ANTHROPIC_STREAM", 60.0),
        rate_limit_api_per_minute=_int_env("RATE_LIMIT_REQUESTS_PER_MINUTE", 200),
    )


_cached: Settings | None = None


def get_settings() -> Settings:
    """Return the cached settings (loaded once per process)."""
    global _cached
    if _cached is None:
        _cached = _load_settings()
    return _cached


def reset_settings() -> None:
    """Clear the cache so the next :func:`get_settings` re-reads the env.

    Intended for tests that monkeypatch env vars. Not for request paths.
    """
    global _cached
    _cached = None
