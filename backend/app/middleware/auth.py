from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import logging

logger = logging.getLogger(__name__)

class AuthMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, public_paths=None):
        super().__init__(app)
        self.public_paths = public_paths or ["/", "/docs", "/openapi.json", "/health"]

    async def dispatch(self, request: Request, call_next):
        # Allow OPTIONS requests for CORS
        if request.method == "OPTIONS":
            return await call_next(request)

        # Allow public paths
        if any(request.url.path.startswith(path) for path in self.public_paths):
            return await call_next(request)

        auth_header = request.headers.get("Authorization")
        
        # For the MVP, we loosely enforce auth unless it's strictly a team/dashboard route.
        # But for full auth, we'd validate the Firebase JWT here.
        if not auth_header or not auth_header.startswith("Bearer "):
            # We'll log a warning and let it pass for the current testing phase, 
            # or we could enforce it. We'll let it pass for easy MVP deployment,
            # but mark the user state as unauthenticated.
            request.state.user = None
            logger.warning(f"Unauthenticated request to {request.url.path}")
        else:
            token = auth_header.split(" ")[1]
            # Mock Firebase validation
            if token == "test-token" or len(token) > 10:
                request.state.user = {"uid": "mvp-user-123", "role": "admin"}
            else:
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Invalid authentication token"}
                )

        response = await call_next(request)
        return response
