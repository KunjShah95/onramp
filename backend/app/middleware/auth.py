from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import logging
import os

logger = logging.getLogger(__name__)


def get_firebase_app():
    """Lazy-init and return the Firebase Admin app (or None)."""
    try:
        import firebase_admin
        from firebase_admin import credentials
        import json

        if firebase_admin._apps:
            return firebase_admin.get_app()

        project_id = os.getenv("FIREBASE_PROJECT_ID", "")
        cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
        cred_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "")

        if not project_id and not cred_path and not cred_json:
            return None

        cred = None
        if cred_json:
            cred = credentials.Certificate(json.loads(cred_json))
        elif cred_path:
            cred = credentials.Certificate(cred_path)

        opts = {"projectId": project_id} if project_id else {}
        if cred:
            return firebase_admin.initialize_app(cred, opts)
        return firebase_admin.initialize_app(options=opts)
    except Exception as e:
        logger.warning("Firebase Admin not available — auth will use dev bypass: %s", e)
        return None


_firebase_app_cache = None
_verify_inited = False
_dev_bypass_warned = False


def _get_firebase_app():
    global _firebase_app_cache, _verify_inited
    if not _verify_inited:
        _firebase_app_cache = get_firebase_app()
        _verify_inited = True
    return _firebase_app_cache


def _dev_bypass_enabled() -> bool:
    """Dev auth bypass is allowed only when explicitly enabled AND not in production.

    BOTH conditions are required, so a missing/misconfigured Firebase in
    production can never silently fall back to accepting any token.
    """
    bypass = os.getenv("AUTH_DEV_BYPASS", "false").lower() == "true"
    non_prod = os.getenv("ENV", "production").lower() != "production"
    return bypass and non_prod


async def verify_firebase_token(token: str) -> dict | None:
    """Verify a Firebase ID token. Returns decoded token dict or None."""
    global _dev_bypass_warned
    fb_app = _get_firebase_app()
    if fb_app is None:
        if _dev_bypass_enabled():
            if not _dev_bypass_warned:
                logger.warning(
                    "AUTH_DEV_BYPASS active: accepting unverified tokens as dev user. "
                    "This MUST never be enabled in production."
                )
                _dev_bypass_warned = True
            if token and len(token) > 20:
                return {"uid": "dev-user-id", "email": "dev@codeflow.ai", "firebase": {"sign_in_provider": "dev"}}
            return None
        logger.error(
            "Firebase Admin is not configured and AUTH_DEV_BYPASS is not enabled; "
            "rejecting authentication. Set FIREBASE_* credentials (or AUTH_DEV_BYPASS=true "
            "with ENV!=production for local dev)."
        )
        return None

    try:
        import firebase_admin.auth
        decoded = firebase_admin.auth.verify_id_token(token)
        return decoded
    except Exception as e:
        logger.warning("Firebase token verification failed: %s", e)
        return None


class AuthMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, public_paths=None):
        super().__init__(app)
        self.public_paths = public_paths or ["/", "/docs", "/openapi.json", "/health"]

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path
        is_public = False
        for pub in self.public_paths:
            if pub == "/":
                if path == "/":
                    is_public = True
                    break
            elif path.startswith(pub):
                is_public = True
                break

        if is_public:
            return await call_next(request)

        auth_header = request.headers.get("Authorization")

        if not auth_header or not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing or invalid Authorization header. Use: Bearer <firebase-id-token>"}
            )

        token = auth_header.split(" ", 1)[1]
        decoded = await verify_firebase_token(token)

        if decoded is None:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid or expired authentication token"}
            )

        request.state.user = {
            "uid": decoded.get("uid", "unknown"),
            "email": decoded.get("email", ""),
            "name": decoded.get("name", ""),
            "provider": decoded.get("firebase", {}).get("sign_in_provider", "unknown"),
        }

        response = await call_next(request)
        return response
