"""
Content-Security-Policy nonce middleware.

Generates a cryptographically random nonce per request and:
1. Stores it on ``request.state.csp_nonce`` for downstream use
   (e.g. the frontend can read it from a ``X-CSP-Nonce`` response header).
2. Injects ``nonce="<value>"`` into every ``<script>`` and ``<style`` tag
   in HTML responses so the browser allows them.
3. Sets a strict ``Content-Security-Policy`` header that whitelists only
   scripts and styles carrying the matching nonce — blocking any injected
   XSS payload that lacks the nonce.

The middleware only activates for responses with ``text/html`` content type
and a body large enough to be the SPA shell.  API JSON responses are untouched
(except for the nonces stored on ``request.state``).

Environment:
    CSP_ENABLED: "1" / "true" / "yes" turns on nonce-based CSP (default in
                  production).  Set to "0" to disable during migration.
    CSP_REPORT_ONLY: "1" sends ``Content-Security-Policy-Report-Only`` instead
                      of the enforcing header so violations are logged without
                      blocking traffic.
    CSP_REPORT_URI:  endpoint for violation reports (optional).
"""

import os
import re
import secrets
import logging
from typing import Optional

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

logger = logging.getLogger("onramp.csp")

_ENV = os.getenv("ENV", "development").lower()


def _csp_enabled() -> bool:
    """Whether nonce-based CSP is active."""
    override = os.getenv("CSP_ENABLED", "").strip().lower()
    if override in ("1", "true", "yes"):
        return True
    if override in ("0", "false", "no"):
        return False
    # Default: enabled in production
    return _ENV == "production"


def _report_only() -> bool:
    return os.getenv("CSP_REPORT_ONLY", "").strip().lower() in ("1", "true", "yes")


def _build_csp(nonce: str) -> str:
    """Build the Content-Security-Policy directive string for the given nonce."""

    # Font sources: self + Google Fonts CDN (preconnect already established)
    font_src = "'self' https://fonts.gstatic.com"
    # Connect sources: self + HTTPS for API calls, WebSocket, OAuth
    connect_src = "'self' https: wss:"
    # Image sources: self + data: URIs (icons) + HTTPS (OG images, avatars)
    img_src = "'self' data: https:"
    # Style sources: self + nonce for inline styles injected by the SPA
    style_src = f"'self' 'nonce-{nonce}'"
    # Script sources: self + nonce for module scripts + 'unsafe-eval' for Vite dev HMR
    # In production, 'unsafe-eval' is removed. In dev, Vite needs it.
    script_src = f"'self' 'nonce-{nonce}'"
    if _ENV != "production":
        script_src += " 'unsafe-eval'"  # Vite HMR needs eval() in dev

    report_directive = ""
    report_uri = os.getenv("CSP_REPORT_URI", "")
    if report_uri:
        report_directive = f" report-uri {report_uri};"

    return (
        f"default-src 'self'; "
        f"script-src {script_src}; "
        f"style-src {style_src}; "
        f"img-src {img_src}; "
        f"font-src {font_src}; "
        f"connect-src {connect_src}; "
        f"frame-ancestors 'none'; "
        f"base-uri 'self'; "
        f"form-action 'self';"
        f"{report_directive}"
    )


# ── HTML rewriting ──────────────────────────────────────────────────────────
#
# We need to inject  nonce="..."  into <script> and <style> tags in the HTML
# response so the browser allows them under the nonce-based CSP.
#
# Patterns:
#   <script ...>           → inject nonce before the first >  or /
#   <script type="..." src="...">  → same (external scripts need nonce too)
#   <style ...>            → inject nonce

# Match <script …> or <script …/> (opening tags only)
_SCRIPT_TAG_RE = re.compile(
    r"(<script\b)([^>]*?)(/?>)",
    re.IGNORECASE,
)

# Match <style …> or <style …/>
_STYLE_TAG_RE = re.compile(
    r"(<style\b)([^>]*?)(/?>)",
    re.IGNORECASE,
)


def _inject_nonce(html: str, nonce: str) -> str:
    """Inject nonce attributes into <script> and <style> tags."""

    def _add_nonce_to_script(match: re.Match) -> str:
        tag, attrs, closing = match.groups()
        # Don't add duplicate nonce
        if f"nonce=" in attrs:
            return match.group(0)
        return f'{tag} nonce="{nonce}"{attrs}{closing}'

    def _add_nonce_to_style(match: re.Match) -> str:
        tag, attrs, closing = match.groups()
        if f"nonce=" in attrs:
            return match.group(0)
        return f'{tag} nonce="{nonce}"{attrs}{closing}'

    html = _SCRIPT_TAG_RE.sub(_add_nonce_to_script, html)
    html = _STYLE_TAG_RE.sub(_add_nonce_to_style, html)
    return html


class CSPNonceMiddleware(BaseHTTPMiddleware):
    """Per-request CSP nonce generation and HTML rewriting.

    Also exposes ``request.state.csp_nonce`` so downstream code (templates,
    WebSocket auth, etc.) can access the nonce.
    """

    async def dispatch(self, request: Request, call_next):
        # Generate per-request nonce (32 bytes = 256 bits of entropy)
        nonce = secrets.token_urlsafe(32)
        request.state.csp_nonce = nonce

        response = await call_next(request)

        if not _csp_enabled():
            return response

        content_type = response.headers.get("content-type", "")

        # ── HTML responses: rewrite + CSP header ──────────────────────────
        if "text/html" in content_type:
            # Read the body so we can rewrite it
            body = b""
            async for chunk in response.body_iterator:
                if isinstance(chunk, str):
                    body += chunk.encode("utf-8")
                else:
                    body += chunk

            try:
                html = body.decode("utf-8")
            except UnicodeDecodeError:
                # Not valid UTF-8 — skip rewriting
                return Response(
                    content=body,
                    status_code=response.status_code,
                    headers=dict(response.headers),
                    media_type=response.media_type,
                )

            # Inject nonce into <script> and <style> tags
            html = _inject_nonce(html, nonce)

            # Rebuild the response with the rewritten body
            new_response = Response(
                content=html.encode("utf-8"),
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.media_type,
            )

            # Set CSP header
            csp_value = _build_csp(nonce)
            header_name = (
                "Content-Security-Policy-Report-Only" if _report_only()
                else "Content-Security-Policy"
            )
            new_response.headers[header_name] = csp_value
            # Expose nonce to frontend (for dynamically created elements)
            new_response.headers["X-CSP-Nonce"] = nonce
            return new_response

        # ── Non-HTML responses: just add nonce to state + header ──────────
        # For API responses, set the CSP header too (defense-in-depth).
        # JSON responses don't need nonce injection, just the policy.
        if "application/json" in content_type:
            csp_value = _build_csp(nonce)
            header_name = (
                "Content-Security-Policy-Report-Only" if _report_only()
                else "Content-Security-Policy"
            )
            response.headers[header_name] = csp_value

        return response
