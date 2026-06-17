import os
from dotenv import load_dotenv

# Load environment variables BEFORE importing any modules that read them.
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
from contextlib import asynccontextmanager

from app.llm import LLMClient
from app.api.v1 import explore, learn, first_pr, ask, reports, health, slack, contributor, unique, dashboard, ai_gateway, teams, playbooks, billing, auth
from app.middleware import AuthMiddleware, RateLimitMiddleware, LoggingMiddleware, ResponseWrapperMiddleware

# Configure basic logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.services.postgres_db import initialize_db
    await initialize_db()
    yield


app = FastAPI(
    title="CodeFlow 2.0 API",
    version="1.0.0",
    description="AI-powered developer onboarding platform",
    lifespan=lifespan
)

# Middleware is executed in reverse order of addition (last added = outermost)
# Outermost -> Logging -> ResponseWrapper -> RateLimit -> Auth -> CORS -> Innermost (Router)
# Allowed CORS origins are configured via the CORS_ALLOWED_ORIGINS env var
# (comma-separated). Defaults to the local dev frontend.
_cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(AuthMiddleware, public_paths=[
    "/", "/docs", "/openapi.json", "/health",
    "/api/v1/billing/webhook",   # Stripe calls this unauthenticated (signature-verified)
    "/api/v1/billing/pricing",   # public pricing config
    "/api/v1/ai/tiers",          # public tier config
])
app.add_middleware(RateLimitMiddleware, requests_per_minute=200)
app.add_middleware(ResponseWrapperMiddleware)
app.add_middleware(LoggingMiddleware)

llm_client = LLMClient()
app.state.llm = llm_client

app.include_router(explore.router, prefix="/api/v1")
app.include_router(learn.router, prefix="/api/v1")
app.include_router(first_pr.router, prefix="/api/v1")
app.include_router(ask.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")
app.include_router(health.router, prefix="/api/v1")
app.include_router(slack.router, prefix="/api/v1")
app.include_router(contributor.router, prefix="/api/v1")
app.include_router(unique.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(ai_gateway.router, prefix="/api/v1")
app.include_router(teams.router, prefix="/api/v1")
app.include_router(playbooks.router, prefix="/api/v1")
app.include_router(billing.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")


@app.get("/")
async def root():
    return {
        "message": "CodeFlow 2.0 API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs"
    }


# Named health_check (not health) to avoid shadowing the imported `health`
# router module used above in include_router(health.router, ...).
@app.get("/health")
async def health_check():
    return {"status": "healthy"}
