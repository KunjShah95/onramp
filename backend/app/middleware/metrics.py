"""
Metrics middleware — instruments every HTTP request into the global
Prometheus registry (app.metrics). Emits:

  onramp_http_requests_total{method, route, status}
  onramp_http_request_duration_seconds{method, route}   (histogram)
  onramp_http_inflight_requests                         (gauge)

The ``/metrics`` endpoint itself is excluded so scrapes don't self-inflate.
"""

import time
import uuid
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from app import metrics


class MetricsMiddleware(BaseHTTPMiddleware):
    """Records request counts, latency histograms and an in-flight gauge."""

    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/metrics":
            return await call_next(request)

        # Generate a request id early (used by logging + response header).
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:16]
        request.state.request_id = request_id

        start = time.perf_counter()
        metrics.HTTP_INFLIGHT.inc()
        try:
            response = await call_next(request)
        except Exception:
            # Unhandled exceptions bubble up to Starlette (500). Record them
            # so server errors are visible in Prometheus, then re-raise.
            duration = time.perf_counter() - start
            metrics.HTTP_INFLIGHT.dec()
            metrics.record_http(request.method, request.url.path, 500, duration)
            raise

        metrics.HTTP_INFLIGHT.dec()
        duration = time.perf_counter() - start
        status = response.status_code
        metrics.record_http(request.method, request.url.path, status, duration)

        # Echo the request id back for distributed tracing correlation.
        try:
            response.headers.setdefault("X-Request-ID", request_id)
        except Exception:
            pass
        return response
