import os
import logging

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.services.user_service import get_user_by_uid
from app.services.neon_auth import verify_neon_session
from app.core import security as _core_security

logger = logging.getLogger(__name__)

JWT_ALGORITHM = _core_security.JWT_ALGORITHM


def _get_jwt_secret() -> str:
    """Single-source JWT secret (delegates to app.core.security)."""
    return _core_security.get_jwt_secret()


async def verify_session_token(token: str) -> dict | None:
    """Verify a JWT and return the user payload.

    Tries custom JWT (HS256) first, then falls back to Neon Auth (RS256).
    """
    payload = None
    try:
        # Gate expensive Neon JWKS path: only fall through if token looks like RS256 (kid header)
        # Caller handles fallback after HS256 failure; we keep fast-path here.
        payload = _core_security.decode_access_token(token)
    except Exception as e:
        logger.warning("Invalid JWT token: %s", e)

    if payload:
        uid = payload.get("uid")
        if not uid:
            return None

        record = await get_user_by_uid(uid)
        if record is None:
            logger.warning("User not found for uid: %s", uid)
            return None
        if not record.get("is_active", True):
            logger.warning("User account is deactivated: %s", uid)
            return None

        return {
            "uid": payload.get("uid", ""),
            "email": payload.get("email", ""),
            "name": payload.get("name", ""),
            "provider": payload.get("provider", "password"),
        }

    neon_user = await verify_neon_session(token)
    if neon_user:
        uid = neon_user.get("uid", "")
        record = await get_user_by_uid(uid)
        if record is None:
            logger.warning("Neon Auth user not found in database: %s", uid)
            return None
        if not record.get("is_active", True):
            logger.warning("Neon Auth user account is deactivated: %s", uid)
            return None

        return neon_user

    return None


class AuthMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, public_paths=None):
        super().__init__(app)
        self.public_paths = set(public_paths or ["/", "/docs", "/openapi.json", "/health"])

    def _cors_error_response(self, request: Request, status_code: int, detail: str):
        """Return error response with CORS headers from the allowed origins list."""
        origin = request.headers.get("origin")
        response = JSONResponse(status_code=status_code, content={"detail": detail})
        # Only reflect origins that are explicitly allowed — never mirror arbitrary
        # origins, which would bypass CORS restrictions.
        allowed_origins = os.getenv(
            "CORS_ALLOWED_ORIGINS",
            "http://localhost:5173,http://localhost:3000",
        ).split(",")
        allowed_origins = [o.strip() for o in allowed_origins if o.strip()]
        if origin and origin in allowed_origins:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        return response

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path.rstrip("/") or "/"
        if path in self.public_paths:
            return await call_next(request)

        # ── Extract token from cookie OR Authorization header ───────────
        # Browser SPA sends tokens via HttpOnly cookies (credentials:include).
        # API clients / mobile apps send tokens via Authorization header.
        # Both paths are supported for backward compatibility.
        token = None

        # 1. Try HttpOnly cookie first (browser SPA path)
        cookie_token = request.cookies.get("onramp_access_token")
        if cookie_token:
            token = cookie_token

        # 2. Fall back to Authorization header (API client / mobile path)
        if not token:
            auth_header = request.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                token = auth_header.split(" ", 1)[1]

        if not token:
            return self._cors_error_response(
                request, 401,
                "Missing authentication. Provide a Bearer token or ensure cookies are enabled."
            )

        decoded = await verify_session_token(token)

        if decoded is None:
            return self._cors_error_response(request, 401, "Invalid or expired authentication token")

        request.state.user = {
            "uid": decoded.get("uid", "unknown"),
            "email": decoded.get("email", ""),
            "name": decoded.get("name", ""),
            "provider": decoded.get("provider", "unknown"),
        }

        response = await call_next(request)
        return response
