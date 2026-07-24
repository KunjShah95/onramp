"""Debug script: test API endpoints with a throwaway token."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

os.environ.setdefault("DATABASE_URL", os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/onramp"))
os.environ.setdefault("ENV", "development")

from fastapi.testclient import TestClient
from app.main import app
from app.database.config import db_config

print("env=", db_config.env, flush=True)
print("db_url=", db_config.database_url, flush=True)

# Import sentry AFTER env vars are set to avoid issues
os.environ.setdefault("GROQ_API_KEY", "test-llm-key")

with TestClient(app) as client:
    print("client created", flush=True)
    resp = client.get(
        "/api/v1/teams/nonexistent-team-id",
        headers={"Authorization": "Bearer " + "a" * 25},
    )
    print("status=", resp.status_code, flush=True)
    print("body=", resp.text, flush=True)
