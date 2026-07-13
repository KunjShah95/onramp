import json
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

class ResponseWrapperMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Skip streaming routes explicitly — don't buffer SSE or large responses
        if request.url.path.startswith(("/api/v1/ask/", "/api/v1/explore/")):
            return await call_next(request)

        response = await call_next(request)

        # Do not wrap error responses or non-JSON responses
        if response.status_code >= 400 or response.headers.get("content-type") != "application/json":
            return response

        body_iterator = response.body_iterator
        body_chunks = []
        async for chunk in body_iterator:
            body_chunks.append(chunk)

        body = b"".join(body_chunks)

        try:
            data = json.loads(body)
            if not (isinstance(data, dict) and "success" in data):
                data = {"success": True, "data": data}
                body = json.dumps(data).encode("utf-8")

            headers = dict(response.headers)
            headers.pop("content-length", None)
            return JSONResponse(content=data, status_code=response.status_code, headers=headers)
        except json.JSONDecodeError:
            async def new_body_iterator():
                yield body
            response.body_iterator = new_body_iterator()
            return response
