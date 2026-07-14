import time
import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("onramp")

class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        # Generate a request ID or read from header
        request_id = request.headers.get("X-Request-ID", "req_generate")
        
        try:
            response = await call_next(request)
            process_time = (time.time() - start_time) * 1000
            
            # Log successful requests
            logger.info(
                f"method={request.method} path={request.url.path} "
                f"status={response.status_code} duration={process_time:.2f}ms "
                f"ip={request.client.host if request.client else 'unknown'}"
            )
            
            # Inject process time into response header
            response.headers["X-Process-Time"] = f"{process_time:.2f}ms"
            return response
            
        except Exception as e:
            process_time = (time.time() - start_time) * 1000
            # Sentry mock: In a real environment, we'd call sentry_sdk.capture_exception(e)
            logger.error(
                f"method={request.method} path={request.url.path} "
                f"status=500 duration={process_time:.2f}ms "
                f"error='{str(e)}'",
                exc_info=True
            )
            raise
