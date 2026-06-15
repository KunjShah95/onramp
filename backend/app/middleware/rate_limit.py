import time
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, requests_per_minute: int = 100):
        super().__init__(app)
        self.limit = requests_per_minute
        self.window_size = 60  # seconds
        self.clients = {}
        
    async def dispatch(self, request: Request, call_next):
        # We skip rate limiting for internal health checks
        if request.url.path == "/health":
            return await call_next(request)

        # Sliding Window Counter rate limiting
        client_ip = request.client.host if request.client else "unknown"
        current_time = time.time()
        current_window = int(current_time // self.window_size)
        
        if client_ip not in self.clients:
            self.clients[client_ip] = {
                "previous_window": current_window - 1,
                "previous_count": 0,
                "current_window": current_window,
                "current_count": 0
            }
            
        client = self.clients[client_ip]
        
        # Advance windows if time has passed
        if current_window != client["current_window"]:
            if current_window == client["current_window"] + 1:
                client["previous_window"] = client["current_window"]
                client["previous_count"] = client["current_count"]
            else:
                client["previous_window"] = current_window - 1
                client["previous_count"] = 0
            
            client["current_window"] = current_window
            client["current_count"] = 0
            
        # Calculate sliding window weighted count
        window_elapsed = current_time % self.window_size
        weight = (self.window_size - window_elapsed) / self.window_size
        estimated_count = (client["previous_count"] * weight) + client["current_count"]
        
        if estimated_count >= self.limit:
            return JSONResponse(
                status_code=429,
                content={"success": False, "error": "Rate limit exceeded. Try again later.", "code": "RATE_LIMIT_EXCEEDED"}
            )
            
        # Increment current window count
        client["current_count"] += 1
        
        response = await call_next(request)
        return response
