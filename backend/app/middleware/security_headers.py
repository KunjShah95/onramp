"""
Security headers middleware.

Adds a hardened set of HTTP response headers to every response:

  Strict-Transport-Security   (production only, 6 months + preload)
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: minimal feature set
  Content-Security-Policy:   (configurable via CSP_HEADER, off by default
                              because the SPA uses inline styles/scripts —
                              enable once the frontend emits a nonce/hash)

Headers are additive (setdefault) so they never clobber a header an
endpoint already set deliberately.
"""

import os
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

_ENV = os.getenv("ENV", "development")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault(
            "Referrer-Policy", "strict-origin-when-cross-origin"
        )
        response.headers.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
        )

        if _ENV == "production":
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=63072000; includeSubDomains; preload",
            )

        csp = os.getenv("CSP_HEADER")
        if csp:
            response.headers.setdefault("Content-Security-Policy", csp)

        return response
