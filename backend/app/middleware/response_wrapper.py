import json
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, StreamingResponse
from starlette.types import Message

class ResponseWrapperMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Do not wrap error responses (handled by error handlers/routers) or non-JSON responses
        if response.status_code >= 400 or response.headers.get("content-type") != "application/json":
            return response
            
        # Do not wrap if it's already wrapped (has "success" and "data")
        # Since we cannot easily read the body of a StreamingResponse without consuming it,
        # we will capture it, inspect it, and re-stream it.
        
        body_iterator = response.body_iterator
        body_chunks = []
        async for chunk in body_iterator:
            body_chunks.append(chunk)
            
        body = b"".join(body_chunks)
        
        try:
            data = json.loads(body)
            # If it's a dict and already has "success", assume it's wrapped
            if isinstance(data, dict) and "success" in data:
                new_body = body
            else:
                wrapped_data = {
                    "success": True,
                    "data": data
                }
                new_body = json.dumps(wrapped_data).encode("utf-8")
                
            headers = dict(response.headers)
            headers.pop("content-length", None)
            return JSONResponse(
                content=json.loads(new_body),
                status_code=response.status_code,
                headers=headers
            )
        except json.JSONDecodeError:
            # If not valid JSON, just return as is
            async def new_body_iterator():
                yield body
            response.body_iterator = new_body_iterator()
            return response
