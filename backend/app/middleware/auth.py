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
            "_record": record,
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

        return {**neon_user, "_record": record}

    return None


def _looks_like_api_key(value: str) -> bool:
    """True when an Authorization header carries an API key, not a JWT."""
    return value.startswith("Bearer ") and value.split(" ", 1)[1].startswith("cf_")


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
        # API keys (X-API-Key header or cf_ Bearer token) are NOT session
        # tokens — they are validated at the route dependency
        # (get_user_or_api_key / gateway auth), never here.
        token = None

        # 1. Try HttpOnly cookie first (browser SPA path)
        cookie_token = request.cookies.get("onramp_access_token")
        if cookie_token:
            token = cookie_token

        # 2. Fall back to Authorization header (API client / mobile path)
        auth_header = request.headers.get("Authorization", "")
        if not token and auth_header.startswith("Bearer ") \
                and not _looks_like_api_key(auth_header):
            token = auth_header.split(" ", 1)[1]

        # 3. AIaaS / gateway API-key callers (checked before JWT enforcement:
        #    API keys are not JWTs). Scoped to the gateway prefixes whose
        #    route dependencies own key validation — every other path keeps
        #    JWT enforcement, and JWT-only endpoints still 401 via
        #    get_current_user when no session was established.
        if token is None and path.startswith(("/api/v1/ai/", "/v1/")) and (
            request.headers.get("X-API-Key")
            or request.headers.get("x-api-key")
            or _looks_like_api_key(auth_header)
        ):
            return await call_next(request)

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
        # Keep the verified database record for /auth/me and other handlers
        # that need profile fields without issuing a second user query.
        request.state.user_record = decoded.get("_record")

        response = await call_next(request)
        return response
