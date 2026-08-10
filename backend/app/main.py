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
from typing import Optional

from app.logging_config import configure_logging
from app.llm import LLMClient
from app.embeddings import EmbeddingRouter
from app.api.v1 import (
    repo_index as repo_index,
    accounts as accounts_router, admin as admin_router, ai_gateway, ask, audit as audit_router,
    auth, billing, contributor, dashboard, digest as digest_router,
    explore, feature_flags as feature_flags_router, first_pr, gamification, health,
    hr_dashboard, integrations as integrations_router,
    invites as invites_router, learn, marketplace as marketplace_router,
    notifications as notifications_router,
    dora as dora_router, onboarding_plans as onboarding_plans_router, openai_gateway, ops as ops_router,
    playbooks, pr_review,
    quiz as quiz_router, reports, repositories, seed as seed_router, slack, tasks as tasks_router,
    teams, unique, webhook_handler, wiki, ws as ws_router
)
from app.middleware import AuthMiddleware, RateLimitMiddleware, LoggingMiddleware, ResponseWrapperMiddleware
from app.middleware.metrics import MetricsMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
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

# Structured logging — JSON in production (LOG_FORMAT=json), text locally.
configure_logging()


_LLM_KEY_VARS = (
    "OPENROUTER_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY",
    "NVIDIA_API_KEY", "MISTRAL_API_KEY", "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY", "HUGGINGFACE_API_KEY", "OLLAMA_BASE_URL",
)

# Fernet keys are 32-byte urlsafe-base64 — the cryptography lib base64-decodes
# and enforces the 32-byte payload length, so a structurally wrong key fails
# here instead of on the first encrypt/decrypt.
_FERNET_KEY_VARS = ("PII_ENCRYPTION_KEY", "GITHUB_TOKEN_ENCRYPTION_KEY")


def _is_valid_fernet_key(value: Optional[str]) -> bool:
    """Return True if ``value`` parses as a Fernet-compatible key."""
    if not value:
        return False
    try:
        from cryptography.fernet import Fernet

        Fernet(value.encode() if isinstance(value, str) else value)
        return True
    except Exception:
        return False


def _is_valid_postgres_url(value: Optional[str]) -> bool:
    """Return True if ``value`` looks like a usable asyncpg PostgreSQL URL."""
    if not value:
        return False
    scheme = value.lower().split("://", 1)[0]
    return scheme in ("postgresql", "postgres", "postgresql+asyncpg")


def _validate_production_env() -> None:
    """Fail fast on boot if production is missing config it needs at runtime.

    Each of these already hard-fails at call time (Razorpay webhook, GitHub
    token encryption, rate limiter), but discovering that on the first
    request is worse than refusing to start.
    """
    if os.getenv("ENV") != "production":
        return
    
    errors = []
    warnings = []
    
    # Required environment variables. RAZORPAY_WEBHOOK_SECRET is only required
    # when billing is actually enabled — without RAZORPAY_KEY_ID the billing
    # service runs in metadata-only stub mode and never verifies a signature.
    required_vars = [
        "DATABASE_URL",
        "GITHUB_TOKEN_ENCRYPTION_KEY", "REDIS_URL",
        "JWT_SECRET", "PII_ENCRYPTION_KEY",
        "API_KEY_HMAC_SECRET",
    ]
    razorpay_enabled = any(
        os.getenv(v) for v in ("RAZORPAY_KEY_ID", "RAZORPAY_PLAN_STARTUP", "RAZORPAY_PLAN_PROFESSIONAL")
    )
    if razorpay_enabled:
        required_vars.append("RAZORPAY_WEBHOOK_SECRET")
    
    for var in required_vars:
        value = os.getenv(var)
        if not value:
            errors.append(f"{var} is required in production")
        elif var == "JWT_SECRET" and value == "dev-jwt-secret-change-in-production":
            errors.append("JWT_SECRET is using the insecure default value - must be changed in production")
    
    # At least one LLM provider must be configured
    if not any(os.getenv(var) for var in _LLM_KEY_VARS):
        errors.append(f"At least one LLM provider API key is required: {', '.join(_LLM_KEY_VARS)}")
    
    # Validate DATABASE_URL format
    database_url = os.getenv("DATABASE_URL")
    if database_url and not _is_valid_postgres_url(database_url):
        errors.append("DATABASE_URL must be a PostgreSQL connection string")
    
    # Validate Redis URL format if provided
    redis_url = os.getenv("REDIS_URL")
    if redis_url:
        if not redis_url.startswith(("redis://", "rediss://")):
            errors.append("REDIS_URL must be a valid Redis connection string")

    # OAuth social login (optional — email/password auth works without it) but
    # when enabled the client id/secret pair must be configured together and
    # the callback URLs must be reachable. Warnings, not errors: OAuth is a
    # feature toggle and its absence must not block booting the API.
    for var in ("GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"):
        if os.getenv(var):
            break
    else:
        warnings.append(
            "GitHub OAuth login is not configured (GITHUB_CLIENT_ID / "
            "GITHUB_CLIENT_SECRET unset) — GitHub sign-in and account linking "
            "will be unavailable"
        )
    if bool(os.getenv("GITHUB_CLIENT_ID")) != bool(os.getenv("GITHUB_CLIENT_SECRET")):
        warnings.append("GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be configured together")

    for var in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"):
        if os.getenv(var):
            break
    else:
        warnings.append(
            "Google OAuth login is not configured (GOOGLE_CLIENT_ID / "
            "GOOGLE_CLIENT_SECRET unset)"
        )
    if bool(os.getenv("GOOGLE_CLIENT_ID")) != bool(os.getenv("GOOGLE_CLIENT_SECRET")):
        warnings.append("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured together")

    # OAuth redirect URIs must exactly match what is registered in the GitHub /
    # Google app: ``{BACKEND_URL}/api/v1/auth/oauth/{provider}/callback``. A
    # plain-http backend URL (or a missing FRONTEND_URL for the post-consent
    # redirect) silently breaks the whole flow, so surface it at boot.
    backend_url = os.getenv("BACKEND_URL", "")
    if backend_url and not backend_url.startswith("https://"):
        warnings.append(
            "BACKEND_URL should use https:// in production — OAuth callback "
            "URLs must match the registered redirect URI exactly"
        )
    frontend_url = os.getenv("FRONTEND_URL", "")
    if frontend_url and not frontend_url.startswith("https://"):
        warnings.append("FRONTEND_URL should use https:// in production")

    # Fernet keys must be structurally valid — an invalid key fails on the
    # first encrypt/decrypt, which is worse to discover at request time.
    for var in _FERNET_KEY_VARS:
        value = os.getenv(var)
        if value and not _is_valid_fernet_key(value):
            errors.append(
                f"{var} is not a valid Fernet key — generate with: "
                "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
    
    # Validate numeric environment variables
    numeric_vars = {
        "DB_POOL_SIZE": (1, 100),
        "DB_MAX_OVERFLOW": (0, 50),
        "DB_POOL_TIMEOUT": (1, 300),
        "RATE_LIMIT_REQUESTS_PER_MINUTE": (1, 10000),
    }
    
    for var, (min_val, max_val) in numeric_vars.items():
        value = os.getenv(var)
        if value:
            try:
                num_value = int(value)
                if num_value < min_val or num_value > max_val:
                    errors.append(f"{var} must be between {min_val} and {max_val}")
            except ValueError:
                errors.append(f"{var} must be a valid integer")
    
    # Validate CORS origins
    cors_origins = os.getenv("CORS_ALLOWED_ORIGINS", "")
    if cors_origins:
        origins = [origin.strip() for origin in cors_origins.split(",") if origin.strip()]
        for origin in origins:
            if origin and not origin.startswith(("http://", "https://")):
                warnings.append(f"CORS origin '{origin}' should use http:// or https:// scheme")
    
    # Log warnings but don't fail on them
    if warnings:
        import logging
        logger = logging.getLogger("onramp.startup")
        for warning in warnings:
            logger.warning(f"Production configuration warning: {warning}")
    
    # Fail if there are any errors
    if errors:
        raise RuntimeError(
            "Refusing to start with ENV=production — configuration errors:\n"
            + "\n".join(f"  - {error}" for error in errors)
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

# Dev-only surfaces (Swagger docs, the demo/seed router) are OFF in production
# by default but can be opted back in explicitly (staging, ops debugging) via
# ENABLE_API_DOCS=true / ENABLE_SEED_ROUTER=true.
_show_api_docs = (not _is_production) or os.getenv("ENABLE_API_DOCS", "").lower() in ("1", "true", "yes")
_show_seed_router = (not _is_production) or os.getenv("ENABLE_SEED_ROUTER", "").lower() in ("1", "true", "yes")

app = FastAPI(
    title="Onramp 2.0 API",
    version="1.0.0",
    description="AI-powered developer onboarding platform",
    lifespan=lifespan,
    docs_url="/docs" if _show_api_docs else None,
    redoc_url="/redoc" if _show_api_docs else None,
    openapi_url="/openapi.json" if _show_api_docs else None,
)

# Declare the auth scheme in the OpenAPI document so /docs shows an
# "Authorize" button and API consumers can generate typed clients. Auth is
# enforced by AuthMiddleware (JWT) and per-endpoint key checks (get_user_or_api_key).
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi import Depends
from fastapi.openapi.utils import get_openapi

_bearer_scheme = HTTPBearer(
    auto_error=False,
    description="JWT access token (Authorization: Bearer <token>) or Onramp API key (cf_...)",
)


def _custom_openapi():
    """Extend the default OpenAPI schema with the bearer security scheme."""
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    schema.setdefault("components", {}).setdefault("securitySchemes", {})
    schema["components"]["securitySchemes"]["BearerAuth"] = {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
        "description": "JWT access token (Authorization: Bearer <token>) or Onramp API key.",
    }
    # NOTE: we deliberately do NOT apply a global "security: [{BearerAuth: []}]"
    # requirement — many routes are public (/health, auth, webhooks, billing
    # webhook, Slack, the OpenAI-compatible gateway which checks keys
    # in-endpoint). Auth is enforced by AuthMiddleware + per-endpoint key
    # checks; declaring the scheme in components is enough to give /docs an
    # Authorize button and let consumers generate typed clients.
    app.openapi_schema = schema
    return schema


app.openapi = _custom_openapi

# Middleware is executed in reverse order of addition (last added = outermost)
# Outermost -> Logging -> ResponseWrapper -> RateLimit -> Auth -> CORS -> Innermost (Router)
# Allowed CORS origins are configured via the CORS_ALLOWED_ORIGINS env var
# (comma-separated). Defaults to the local dev frontend.
_cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000").split(",")
    if origin.strip()
]

_doc_paths = ["/docs", "/redoc", "/openapi.json"] if _show_api_docs else []

app.add_middleware(AuthMiddleware, public_paths=[
    "/", "/health", "/ready", "/metrics", *_doc_paths,
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
    "/api/v1/billing/webhook",   # Razorpay calls this unauthenticated (signature-verified)
    "/api/v1/billing/pricing",   # public pricing config
    "/api/v1/ai/tiers",          # public tier config
    "/v1/chat/completions",      # OpenAI-compatible gateway (auth enforced in-endpoint)
    "/v1/models",                # OpenAI-compatible model list (auth enforced in-endpoint)
    "/v1/embeddings",            # OpenAI-compatible embeddings (auth enforced in-endpoint)
    "/api/v1/explore/health",    # public health check for explore service
    "/api/v1/slack/interactive",  # Slack interactive payloads (verified by signing secret)
    "/api/v1/slack/standup",      # Slack slash commands (verified by signing secret)
])
app.add_middleware(BodySizeLimitMiddleware)
app.add_middleware(RateLimitMiddleware, requests_per_minute=200)
app.add_middleware(ResponseWrapperMiddleware)
app.add_middleware(LoggingMiddleware)
app.add_middleware(MetricsMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
# CORS origin regex — configurable via env var for custom domains.
# Default matches Vercel preview deployments; override for custom domains.
_cors_regex = os.getenv(
    "CORS_ALLOWED_ORIGIN_REGEX",
    r"^https://[a-z0-9][a-z0-9-]*\.vercel\.app$",
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

embeddings = EmbeddingRouter()
app.state.embeddings = embeddings

app.include_router(explore.router, prefix="/api/v1")
app.include_router(learn.router, prefix="/api/v1")
app.include_router(first_pr.router, prefix="/api/v1")
app.include_router(ask.router, prefix="/api/v1")
app.include_router(repositories.router, prefix="/api/v1")
app.include_router(repo_index.router, prefix="/api/v1")
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
if _show_seed_router:
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
# OpenAI-compatible gateway — mounted at /v1 (no /api/v1 prefix) so OpenAI
# SDK clients can set base_url="<host>/v1" directly.
app.include_router(openai_gateway.router)
# Ops endpoints (/health, /ready, /metrics) — mounted at root, public.
app.include_router(ops_router.router)


@app.get("/")
async def root():
    return {
        "message": "Onramp 2.0 API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs"
    }


