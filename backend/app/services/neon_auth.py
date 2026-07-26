"""Neon Auth service — validates JWTs issued by Neon's managed Better Auth."""
import asyncio
import os
import jwt
import httpx
import logging
from datetime import datetime, timezone

logger = logging.getLogger("onramp.neon_auth")

JWKS_URL = os.getenv("NEON_AUTH_JWKS_URL", "")
ISSUER = os.getenv("NEON_AUTH_ISSUER", "")

_cached_jwks: dict | None = None
_cached_jwks_at: datetime | None = None
_jwks_lock = asyncio.Lock()
JWKS_CACHE_TTL = 3600


async def _fetch_jwks() -> dict:
    """Fetch JWKS from Neon Auth endpoint, with caching."""
    global _cached_jwks, _cached_jwks_at
    now = datetime.now(timezone.utc)

    if _cached_jwks and _cached_jwks_at and (now - _cached_jwks_at).total_seconds() < JWKS_CACHE_TTL:
        return _cached_jwks

    async with _jwks_lock:
        if _cached_jwks and _cached_jwks_at and (now - _cached_jwks_at).total_seconds() < JWKS_CACHE_TTL:
            return _cached_jwks

        if not JWKS_URL:
            raise ValueError("NEON_AUTH_JWKS_URL is not configured")

        async with httpx.AsyncClient() as client:
            resp = await client.get(JWKS_URL)
            resp.raise_for_status()
            _cached_jwks = resp.json()
            _cached_jwks_at = datetime.now(timezone.utc)
            return _cached_jwks


async def validate_neon_token(token: str) -> dict | None:
    """Validate a Neon Auth JWT. Returns the payload if valid, None otherwise."""
    try:
        jwks = await _fetch_jwks()
        header = jwt.get_unverified_header(token)
        key_data = None
        for k in jwks.get("keys", []):
            if k.get("kid") == header.get("kid"):
                key_data = k
                break

        if not key_data:
            logger.warning("No matching JWK key for kid: %s", header.get("kid"))
            return None

        public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key_data)

        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            issuer=ISSUER,
            options={"verify_exp": True},
        )
        return payload
    except jwt.ExpiredSignatureError:
        logger.debug("Token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.debug("Invalid token: %s", e)
        return None
    except Exception as e:
        logger.error("Neon Auth validation error: %s", e)
        return None


async def verify_neon_session(token: str) -> dict | None:
    """Verify a Neon Auth session token. Returns user info or None."""
    if not JWKS_URL or not ISSUER:
        logger.warning("Neon Auth not configured — set NEON_AUTH_JWKS_URL and NEON_AUTH_ISSUER")
        return None

    payload = await validate_neon_token(token)
    if not payload:
        return None

    uid = payload.get("sub", "")
    if not uid:
        logger.warning("Neon Auth token missing 'sub' claim")
        return None

    return {
        "uid": payload.get("sub", ""),
        "email": payload.get("email", ""),
        "name": payload.get("name", ""),
        "provider": "neon",
        "role": payload.get("role", "member"),
    }
