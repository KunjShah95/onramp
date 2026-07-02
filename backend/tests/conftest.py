import os

# Must be set before any app module reads them at import time.
os.environ.setdefault("STORAGE_BACKEND", "memory")
os.environ.setdefault("ENV", "test")
# app.main instantiates LLMClient() at import; without at least one provider
# key it raises RuntimeError during test collection (see llm.py).
os.environ.setdefault("GROQ_API_KEY", "test-llm-key")

import pytest


@pytest.fixture(autouse=True)
def _reset_storage():
    """Give every test a fresh InMemoryStorage instance.

    get_storage() caches a module-level singleton, so without this reset
    data seeded by one test (e.g. teams, memberships) would leak into the next.
    """
    import app.services.postgres_db as postgres_db

    postgres_db._storage = None
    yield
    postgres_db._storage = None


@pytest.fixture
def storage():
    from app.services.postgres_db import get_storage

    return get_storage()
