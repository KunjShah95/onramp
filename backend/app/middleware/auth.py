from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import logging
import os
from sqlalchemy import text
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_dev_bypass_warned = False


def _dev_bypass_enabled() -> bool:
    """Dev auth bypass is allowed only when explicitly enabled AND not in production."""
    bypass = os.getenv("AUTH_DEV_BYPASS", "false").lower() == "true"
    non_prod = os.getenv("ENV", "production").lower() != "production"
    return bypass and non_prod


async def verify_session_token(token: str) -> dict | None:
    """Verify a Neon Auth session token."""
    global _dev_bypass_warned
    
    # Check dev bypass
    if _dev_bypass_enabled():
        if not _dev_bypass_warned:
            logger.warning(
                "AUTH_DEV_BYPASS active: accepting unverified tokens as dev user. "
                "This MUST never be enabled in production."
            )
            _dev_bypass_warned = True
        if token and len(token) > 20:
            return {
                "uid": "00000000-0000-0000-0000-000000000001",
                "email": "dev@codeflow.ai",
                "name": "Dev User",
                "provider": "password"
            }
        return None

    # Verify Neon Auth session token against the database
    from app.database.config import db_config
    
    try:
        await db_config.ensure_engine()
        factory = db_config.get_session_factory()
    except Exception as e:
        logger.error("Failed to connect to database for session verification: %s", e)
        return None

    async with factory() as session:
        # Better Auth stores sessions in neon_auth.session and users in neon_auth.user.
        # We try standard snake_case columns first, then fallback to camelCase.
        row = None
        try:
            result = await session.execute(text("""
                SELECT s.expires_at, u.id, u.email, u.name
                FROM neon_auth.session s
                JOIN neon_auth.user u ON s.user_id = u.id
                WHERE s.token = :token
            """), {"token": token})
            row = result.fetchone()
        except Exception:
            try:
                result = await session.execute(text("""
                    SELECT s."expiresAt", u.id, u.email, u.name
                    FROM neon_auth.session s
                    JOIN neon_auth.user u ON s."userId" = u.id
                    WHERE s.token = :token
                """), {"token": token})
                row = result.fetchone()
            except Exception as inner_e:
                logger.error("Failed to query neon_auth tables: %s", inner_e)
                return None

        if not row:
            logger.warning("No active session found for token")
            return None

        expires_at, user_id, email, name = row
        
        # Query provider from neon_auth.account
        provider = "password"
        try:
            acc_result = await session.execute(text("""
                SELECT provider_id FROM neon_auth.account WHERE user_id = :user_id LIMIT 1
            """), {"user_id": user_id})
            acc_row = acc_result.fetchone()
            if acc_row:
                provider = acc_row[0]
        except Exception:
            try:
                acc_result = await session.execute(text("""
                    SELECT "providerId" FROM neon_auth.account WHERE "userId" = :user_id LIMIT 1
                """), {"user_id": user_id})
                acc_row = acc_result.fetchone()
                if acc_row:
                    provider = acc_row[0]
            except Exception as acc_e:
                logger.warning("Failed to query neon_auth.account: %s", acc_e)

        if provider == "google":
            provider = "google.com"
        elif provider == "github":
            provider = "github.com"

        # Check expiration
        if expires_at.tzinfo is not None:
            now = datetime.now(timezone.utc)
        else:
            now = datetime.now(timezone.utc)

        if expires_at < now:
            logger.warning("Neon Auth session has expired")
            return None

        return {
            "uid": user_id,
            "email": email,
            "name": name or email.split("@")[0],
            "provider": provider,
        }


class AuthMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, public_paths=None):
        super().__init__(app)
        self.public_paths = set(public_paths or ["/", "/docs", "/openapi.json", "/health"])

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path.rstrip("/") or "/"
        if path in self.public_paths:
            return await call_next(request)

        auth_header = request.headers.get("Authorization")

        if not auth_header or not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing or invalid Authorization header. Use: Bearer <session-token>"}
            )

        token = auth_header.split(" ", 1)[1]
        decoded = await verify_session_token(token)

        if decoded is None:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid or expired authentication token"}
            )

        request.state.user = {
            "uid": decoded.get("uid", "unknown"),
            "email": decoded.get("email", ""),
            "name": decoded.get("name", ""),
            "provider": decoded.get("provider", "unknown"),
        }

        response = await call_next(request)
        return response
