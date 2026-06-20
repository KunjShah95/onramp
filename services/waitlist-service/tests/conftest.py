"""
pytest configuration for waitlist-service tests.
Resets module-level state between tests to prevent cross-test interference.
"""
import pytest


@pytest.fixture(autouse=True)
def reset_rate_limit_store():
    """Clear the in-memory rate-limit store before each test."""
    import app.main as main_module
    main_module._rate_limit_store.clear()
    yield
    main_module._rate_limit_store.clear()
