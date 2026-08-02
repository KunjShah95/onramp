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
from fastapi.middleware.gzip import GZipMiddleware
import logging
from contextlib import asynccontextmanager

from app.llm import LLMClient
from app.api.v1 import (
    accounts as accounts_router, admin as admin_router, ai_gateway, ask, audit as audit_router,
    auth, billing, contributor, dashboard, digest as digest_router,
    explore, feature_flags as feature_flags_router, first_pr, gamification, health,
    hr_dashboard, integrations as integrations_router,
    invites as invites_router, learn, marketplace as marketplace_router,
    notifications as notifications_router,
    dora as dora_router, onboarding_plans as onboarding_plans_router, playbooks, pr_review,
    quiz as quiz_router, reports, repositories, seed as seed_router, slack, tasks as tasks_router,
    teams, unique, webhook_handler, wiki, ws as ws_router
)
from app.middleware import AuthMiddleware, RateLimitMiddleware, LoggingMiddleware, ResponseWrapperMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
from starlette.responses import Response


_MAX_BODY_SIZE = int(os.getenv("MAX_REQUEST_BODY_BYTES", str(4 * 1024 * 1024)))  # 4 MB default


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next) -> Response:
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > _MAX_BODY_SIZE:
            return Response(
                content='{"detail":"Request body too large"}',
                status_code=413,
                media_type="application/json",
            )
        return await call_next(request)

# Configure basic logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


_LLM_KEY_VARS = (
    "OPENROUTER_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY",
    "NVIDIA_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
    "OLLAMA_BASE_URL",
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
        var for var in (
            "DATABASE_URL", "STRIPE_WEBHOOK_SECRET",
            "GITHUB_TOKEN_ENCRYPTION_KEY", "REDIS_URL",
            "JWT_SECRET", "PII_ENCRYPTION_KEY",
            "API_KEY_HMAC_SECRET",
        )
        if not os.getenv(var)
    ]
    # Also verify JWT_SECRET isn't the insecure default
    if os.getenv("JWT_SECRET") == "dev-jwt-secret-change-in-production":
        missing.append("JWT_SECRET (still using insecure default — generate a real secret)")
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


_is_production = os.getenv("ENV") == "production"

app = FastAPI(
    title="Onramp 2.0 API",
    version="1.0.0",
    description="AI-powered developer onboarding platform",
    lifespan=lifespan,
    docs_url=None if _is_production else "/docs",
    redoc_url=None if _is_production else "/redoc",
    openapi_url=None if _is_production else "/openapi.json",
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

_doc_paths = [] if _is_production else ["/docs", "/redoc", "/openapi.json"]

app.add_middleware(AuthMiddleware, public_paths=[
    "/", "/health", *_doc_paths,
    "/api/v1/auth/register",        # email/password registration
    "/api/v1/auth/login",           # email/password login
    "/api/v1/auth/check-provider",  # public provider lookup by email
    "/api/v1/auth/oauth/google/login",   # Google OAuth initiation
    "/api/v1/auth/oauth/google/callback", # Google OAuth callback
    "/api/v1/auth/oauth/github/login",    # GitHub OAuth initiation
    "/api/v1/auth/oauth/github/callback",  # GitHub OAuth callback
    "/api/v1/auth/forgot-password",       # password reset request
    "/api/v1/auth/reset-password",        # password reset submission
    "/api/v1/auth/refresh",               # refresh token exchange (auth via refresh token body)
    "/api/v1/auth/verify-email",          # email verification
    "/api/v1/webhooks/github",            # GitHub webhook (HMAC signature verified)
    "/api/v1/webhooks",                   # generic webhook deliveries
    "/api/v1/billing/webhook",   # Stripe calls this unauthenticated (signature-verified)
    "/api/v1/billing/pricing",   # public pricing config
    "/api/v1/ai/tiers",          # public tier config
    "/api/v1/explore/health",    # public health check for explore service
    "/api/v1/slack/interactive",  # Slack interactive payloads (verified by signing secret)
    "/api/v1/slack/standup",      # Slack slash commands (verified by signing secret)
])
app.add_middleware(BodySizeLimitMiddleware)
app.add_middleware(RateLimitMiddleware, requests_per_minute=200)
app.add_middleware(ResponseWrapperMiddleware)
app.add_middleware(LoggingMiddleware)
# CORS origin regex — configurable via env var for custom domains.
# Default matches Vercel preview deployments; override for custom domains.
_cors_regex = os.getenv(
    "CORS_ALLOWED_ORIGIN_REGEX",
    r"^https://(onramp|onramp-[a-z0-9]+)\.vercel\.app$",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=_cors_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Response compression (outermost — compresses the fully-built response).
# Prefer Brotli when `brotli-asgi` is installed; always fall back to gzip so
# clients that only advertise gzip still get compressed bodies. minimum_size
# skips tiny payloads where compression overhead outweighs the savings.
_COMPRESS_MIN_SIZE = int(os.getenv("COMPRESSION_MIN_SIZE", "500"))
try:
    from brotli_asgi import BrotliMiddleware

    app.add_middleware(BrotliMiddleware, minimum_size=_COMPRESS_MIN_SIZE, gzip_fallback=True)
except ImportError:
    app.add_middleware(GZipMiddleware, minimum_size=_COMPRESS_MIN_SIZE)


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
app.include_router(marketplace_router.router, prefix="/api/v1")
app.include_router(billing.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(pr_review.router, prefix="/api/v1")
app.include_router(tasks_router.router, prefix="/api/v1")
app.include_router(notifications_router.router, prefix="/api/v1")
app.include_router(integrations_router.router, prefix="/api/v1")
app.include_router(audit_router.router, prefix="/api/v1")
app.include_router(invites_router.router, prefix="/api/v1")
app.include_router(accounts_router.router, prefix="/api/v1")
app.include_router(admin_router.router, prefix="/api/v1")
app.include_router(quiz_router.router, prefix="/api/v1")
app.include_router(digest_router.router, prefix="/api/v1")
if not _is_production:
    app.include_router(seed_router.router, prefix="/api/v1")
app.include_router(feature_flags_router.router, prefix="/api/v1")
app.include_router(gamification.router, prefix="/api/v1")
app.include_router(hr_dashboard.router, prefix="/api/v1")
app.include_router(onboarding_plans_router.router, prefix="/api/v1")
app.include_router(dora_router.router, prefix="/api/v1")
# GitHub webhook receiver — HMAC-verified, registered as a public path above.
app.include_router(webhook_handler.router, prefix="/api/v1")
app.include_router(wiki.router, prefix="/api/v1")
app.include_router(ws_router.router, prefix="/api/v1")


@app.get("/")
async def root():
    return {
        "message": "Onramp 2.0 API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs"
    }


# Named health_check (not health) to avoid shadowing the imported `health`
# router module used above in include_router(health.router, ...).
@app.get("/health")
async def health_check():
    return {"status": "healthy"}
