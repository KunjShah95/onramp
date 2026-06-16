from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
from dotenv import load_dotenv

from app.llm import LLMClient
from app.api.v1 import explore, learn, first_pr, ask, reports, health, slack, contributor, unique, dashboard, ai_gateway, teams, playbooks, billing, auth
from app.middleware import AuthMiddleware, RateLimitMiddleware, LoggingMiddleware, ResponseWrapperMiddleware

# Load environment variables from .env file
load_dotenv()

# Configure basic logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

app = FastAPI(
    title="CodeFlow 2.0 API",
    version="1.0.0",
    description="AI-powered developer onboarding platform"
)

# Middleware is executed in reverse order of addition (last added = outermost)
# Outermost -> Logging -> ResponseWrapper -> RateLimit -> Auth -> CORS -> Innermost (Router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://your-frontend.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(AuthMiddleware, public_paths=["/", "/docs", "/openapi.json", "/health"])
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


@app.get("/health")
async def health():
    return {"status": "healthy"}
