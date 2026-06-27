import os

# Use the in-memory storage backend for all tests (no live PostgreSQL needed).
os.environ.setdefault("STORAGE_BACKEND", "memory")

# Set a mock LLM key so LLMClient doesn't raise at import time
os.environ.setdefault("OPENAI_API_KEY", "sk-test")

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session")
def client():
    """Shared TestClient that triggers the app's lifespan once per session."""
    with TestClient(app) as c:
        yield c
