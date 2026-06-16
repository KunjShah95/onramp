import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session")
def client():
    """Shared TestClient that triggers the app's lifespan once per session."""
    with TestClient(app) as c:
        yield c
