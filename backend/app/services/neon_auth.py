"""Neon Auth service — validates JWTs issued by Neon's managed Better Auth."""
import asyncio
import os
import jwt
import httpx
import logging
from datetime import datetime, timezone

logger = logging.getLogger("onramp.neon_auth")

def _get_jwks_url() -> str:
    return os.getenv("NEON_AUTH_JWKS_URL", "")

def _get_issuer() -> str:
    return os.getenv("NEON_AUTH_ISSUER", "")

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

        jwks_url = _get_jwks_url()
        if not jwks_url:
            raise ValueError("NEON_AUTH_JWKS_URL is not configured")

        async with httpx.AsyncClient() as client:
            resp = await client.get(jwks_url)
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

        # Validate issuer lazily — empty at import no longer disables verification
        issuer = _get_issuer()
        if not issuer:
            logger.warning("NEON_AUTH_ISSUER not configured — skipping issuer check")
            payload = jwt.decode(
                token,
                public_key,
                algorithms=["RS256"],
                options={"verify_exp": True, "verify_aud": False},
            )
        else:
            # Only enforce RS256 and kty RSA
            if key_data.get("kty") != "RSA" or key_data.get("alg", "RS256") not in ("RS256",):
                logger.warning("JWK key type/alg mismatch for kid %s", header.get("kid"))
                return None
            payload = jwt.decode(
                token,
                public_key,
                algorithms=["RS256"],
                issuer=issuer,
                audience=os.getenv("NEON_AUTH_AUDIENCE", None),
                options={"verify_exp": True, "verify_aud": bool(os.getenv("NEON_AUTH_AUDIENCE"))},
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
    if not _get_jwks_url() or not _get_issuer():
        logger.debug("Neon Auth not configured — skipping RS256 fallback")
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
