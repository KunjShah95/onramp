import os
from dotenv import load_dotenv

# Load environment variables BEFORE importing any modules that read them.
load_dotenv()

# Sentry error monitoring (initializes only if SENTRY_DSN is set)
import sentry_sdk
_sentry_dsn = os.getenv("SENTRY_DSN")
if _sentry_dsn:
    sentry_sdk.init(
        dsn=_sentry_dsn,
        environment=os.getenv("ENV", "development"),
        traces_sample_rate=0.1 if os.getenv("ENV") == "production" else 0.0,
        send_default_pii=False,
    )

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
from contextlib import asynccontextmanager

from app.llm import LLMClient
from app.api.v1 import (
    admin as admin_router, ai_gateway, ask, audit as audit_router,
    auth, billing, contributor, dashboard, digest as digest_router,
    explore, first_pr, gamification, health, integrations as integrations_router,
    invites as invites_router, learn, notifications as notifications_router,
    playbooks, pr_review, quiz as quiz_router, reports, repositories,
    seed as seed_router, slack, tasks as tasks_router, teams, unique, waitlist
)
from app.middleware import AuthMiddleware, RateLimitMiddleware, LoggingMiddleware, ResponseWrapperMiddleware

# Configure basic logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


_LLM_KEY_VARS = (
    "OPENROUTER_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY",
    "NVIDIA_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
)


def _validate_production_env() -> None:
    """Fail fast on boot if production is missing config it needs at runtime.

    Each of these already hard-fails at call time (Stripe webhook, GitHub
    token encryption, rate limiter), but discovering that on the first
    request is worse than refusing to start.
    """
    if os.getenv("ENV") != "production":
        return
    missing = [
        var for var in ("DATABASE_URL", "STRIPE_WEBHOOK_SECRET", "GITHUB_TOKEN_ENCRYPTION_KEY", "REDIS_URL")
        if not os.getenv(var)
    ]
    if not any(os.getenv(var) for var in _LLM_KEY_VARS):
        missing.append("at least one of " + "/".join(_LLM_KEY_VARS))
    if missing:
        raise RuntimeError(
            "Refusing to start with ENV=production — missing required config: "
            + ", ".join(missing)
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    _validate_production_env()
    from app.services.postgres_db import initialize_db
    await initialize_db()
    if os.getenv("REDIS_URL"):
        from app.services.cache_service import get_client
        await get_client()
    yield
    from app.services.cache_service import close as close_cache
    await close_cache()


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
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000").split(",")
    if origin.strip()
]

app.add_middleware(AuthMiddleware, public_paths=[
    "/", "/docs", "/openapi.json", "/health",
    "/api/v1/auth/register",     # email/password registration
    "/api/v1/auth/login",        # email/password login
    "/api/v1/auth/check-provider", # public provider lookup by email
    "/api/v1/billing/webhook",   # Stripe calls this unauthenticated (signature-verified)
    "/api/v1/billing/pricing",   # public pricing config
    "/api/v1/ai/tiers",          # public tier config
    "/api/v1/explore/health",    # public health check for explore service
    "/api/v1/waitlist/join",     # public waitlist join
    "/api/v1/waitlist/count",    # public waitlist count
])
app.add_middleware(RateLimitMiddleware, requests_per_minute=200)
app.add_middleware(ResponseWrapperMiddleware)
app.add_middleware(LoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=r"^https://(codeflow|codeflow-[a-z0-9]+)\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


llm_client = LLMClient()
app.state.llm = llm_client

app.include_router(explore.router, prefix="/api/v1")
app.include_router(learn.router, prefix="/api/v1")
app.include_router(first_pr.router, prefix="/api/v1")
app.include_router(ask.router, prefix="/api/v1")
app.include_router(repositories.router, prefix="/api/v1")
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
app.include_router(pr_review.router, prefix="/api/v1")
app.include_router(tasks_router.router, prefix="/api/v1")
app.include_router(notifications_router.router, prefix="/api/v1")
app.include_router(integrations_router.router, prefix="/api/v1")
app.include_router(audit_router.router, prefix="/api/v1")
app.include_router(invites_router.router, prefix="/api/v1")
app.include_router(admin_router.router, prefix="/api/v1")
app.include_router(quiz_router.router, prefix="/api/v1")
app.include_router(digest_router.router, prefix="/api/v1")
app.include_router(waitlist.router, prefix="/api/v1")
app.include_router(seed_router.router, prefix="/api/v1")
app.include_router(gamification.router, prefix="/api/v1")


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
