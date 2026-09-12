"""Request body-size limit middleware (extracted from ``app.main``).

Moved verbatim so ``main.py`` stays a wiring module. Behavior is unchanged:
- Rejects declared ``Content-Length`` over the limit with 413.
- Counts actual received bytes (prevents lying Content-Length / chunked smuggling).
"""

import os

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
from starlette.responses import Response


def get_max_body_size() -> int:
    try:
        return int(os.getenv("MAX_REQUEST_BODY_BYTES", str(4 * 1024 * 1024)))
    except ValueError:
        return 4 * 1024 * 1024


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next) -> Response:
        max_size = get_max_body_size()
        content_length = request.headers.get("content-length")
        declared_length: int | None = None
        if content_length:
            try:
                declared_length = int(content_length)
                if declared_length > max_size:
                    return Response(
                        content='{"detail":"Request body too large"}',
                        status_code=413,
                        media_type="application/json",
                    )
            except ValueError:
                pass
        # Always enforce by wrapping the receive channel and counting bytes,
        # even when Content-Length is present (prevents bypass via lying
        # Content-Length or chunked smuggling).
        received = 0
        original_receive = request.scope.get("receive")

        async def _counting_receive():
            nonlocal received
            message = await original_receive()
            body = message.get("body", b"")
            if body:
                received += len(body)
                if received > max_size:
                    raise ValueError("body too large")
                # Validate total bytes received vs declared Content-Length:
                # if declared length was valid but actual bytes exceed it,
                # still enforce max_size (already checked) and let the app
                # handle mismatch; the key is we counted actual bytes.
                if declared_length is not None and received > declared_length:
                    # Client sent more than declared — treat as oversize if
                    # it also exceeds max_size, otherwise just count; we do
                    # not trust declared_length alone.
                    pass
            return message

        if original_receive is not None:
            request.scope["receive"] = _counting_receive
            try:
                return await call_next(request)
            except ValueError as e:
                if str(e) == "body too large":
                    return Response(
                        content='{"detail":"Request body too large"}',
                        status_code=413,
                        media_type="application/json",
                    )
                raise
        return await call_next(request)
