"""Single-source JWT + password + refresh-token hashing helpers.

Why this exists: the JWT secret was read in three places
(``api/v1/auth.py`` import-time global, ``middleware/auth.py`` local helper,
``main.py`` production validator) and ``JWT_SECRET`` was frozen at import time
in ``auth.py`` — an env reload (tests, worker restarts) could leave stale
secrets in memory. All auth code must call :func:`get_jwt_secret` (fresh env
read with caching discipline owned by the caller) or the token helpers below.

Behavioral contract (must not drift from legacy ``auth.py`` semantics):
- HS256, ``iss``/``aud`` claims (``onramp`` / ``onramp-api`` defaults).
- Access tokens: 15-min default expiry.
- Refresh tokens: opaque 48-byte urlsafe strings, stored as HMAC-SHA256 hex
  with the JWT secret as pepper (matches legacy ``_hash_refresh_token``).
- Passwords: bcrypt via ``bcrypt.hashpw/gensalt/checkpw``.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from app.core.config import get_settings

logger = logging.getLogger(__name__)

JWT_ALGORITHM = "HS256"
DEV_JWT_SECRET = "dev-jwt-secret-change-in-production"

WEAK_JWT_SECRETS = frozenset(
    {
        "dev-jwt-secret-change-in-production",
        "test-secret-key-min-32-chars",
        "change-me-to-a-random-secret-min-32-chars",
        "change_me_to_a_random_secret_min_32_chars",
    }
)


def _current_env() -> str:
    return get_settings().env.lower()


def get_jwt_secret() -> str:
    """Return the JWT HMAC secret, failing fast on weak production config.

    - Production with missing/weak/short (<32 chars) secret → RuntimeError.
    - Non-production with missing secret → insecure dev default + warning
      (matches legacy behavior so local dev/tests keep working).
    """
    secret = os.getenv("JWT_SECRET", "") or get_settings().jwt_secret
    if not secret:
        if _current_env() == "production":
            raise RuntimeError(
                "JWT_SECRET must be set in production — refusing to start "
                "with an insecure default."
            )
        logger.warning(
            "JWT_SECRET not set — using insecure dev default "
            "(DO NOT use in production)"
        )
        return DEV_JWT_SECRET
    if _current_env() == "production" and (
        secret in WEAK_JWT_SECRETS or len(secret) < 32
    ):
        raise RuntimeError(
            "JWT_SECRET is using an insecure/default value - must be a strong "
            "random secret (>=32 chars) in production"
        )
    return secret


def create_access_token(
    uid: str,
    email: str,
    name: str,
    provider: str,
    remember_me: bool = False,
) -> str:
    """Issue a short-lived access token with iss/aud claims."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "uid": uid,
        "email": email,
        "name": name,
        "provider": provider,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "exp": now + timedelta(minutes=settings.jwt_access_expiry_minutes),
        "iat": now,
        "remember_me": remember_me,
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any] | None:
    """Verify a JWT (iss/aud/expiry) and return its payload, else None."""
    settings = get_settings()
    try:
        return jwt.decode(
            token,
            get_jwt_secret(),
            algorithms=[JWT_ALGORITHM],
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
        )
    except jwt.ExpiredSignatureError:
        logger.warning("JWT token has expired")
        return None
    except jwt.InvalidTokenError as exc:
        logger.warning("Invalid JWT token: %s", exc)
        return None


MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_BYTES = 72  # bcrypt silently truncates past 72 bytes — reject instead


def validate_password(plaintext: str) -> None:
    """Enforce the password policy. Raises ValueError with a user-safe message."""
    if not isinstance(plaintext, str) or len(plaintext) < MIN_PASSWORD_LENGTH:
        raise ValueError(
            f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
        )
    if len(plaintext.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError("Password must be 72 bytes or fewer")
    if not any(c.isalpha() for c in plaintext):
        raise ValueError("Password must contain at least one letter")
    if not any(c.isdigit() for c in plaintext):
        raise ValueError("Password must contain at least one number")


def hash_password(plaintext: str) -> str:
    """Hash a password with bcrypt."""
    if len(plaintext.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError("Password must be 72 bytes or fewer")
    return bcrypt.hashpw(plaintext.encode(), bcrypt.gensalt()).decode()


def verify_password(plaintext: str, password_hash: str) -> bool:
    """Verify a password against a bcrypt hash (False on any error)."""
    try:
        return bcrypt.checkpw(plaintext.encode(), password_hash.encode())
    except Exception:
        return False


def generate_refresh_token() -> str:
    """Generate a cryptographically random opaque refresh token."""
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    """HMAC-SHA256 hash of a refresh token (pepper = JWT secret).

    Matches legacy ``auth._hash_refresh_token`` semantics, including the
    ``dev-refresh-pepper`` fallback when no secret is configured outside
    production (so pre-existing dev rows keep validating).
    """
    pepper = os.getenv("JWT_SECRET", "") or get_settings().jwt_secret
    if not pepper:
        if _current_env() == "production":
            raise RuntimeError("JWT_SECRET must be set in production")
        pepper = "dev-refresh-pepper"
    return hmac.new(pepper.encode(), token.encode(), hashlib.sha256).hexdigest()
