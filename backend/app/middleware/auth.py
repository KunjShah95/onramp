import os
import logging

import jwt
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.services.user_service import get_user_by_uid
from app.services.neon_auth import verify_neon_session

logger = logging.getLogger(__name__)

JWT_SECRET = os.getenv("JWT_SECRET", "dev-jwt-secret-change-in-production")
JWT_ALGORITHM = "HS256"


async def verify_session_token(token: str) -> dict | None:
    """Verify a JWT and return the user payload.

    Tries custom JWT (HS256) first, then falls back to Neon Auth (RS256).
    """
    payload = None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        logger.warning("JWT token has expired")
    except jwt.InvalidTokenError as e:
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
                content={"detail": "Missing or invalid Authorization header. Use: Bearer <token>"}
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
