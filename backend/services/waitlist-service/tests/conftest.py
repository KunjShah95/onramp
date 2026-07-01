"""
pytest configuration for waitlist-service tests.
Resets module-level state between tests to prevent cross-test interference.
"""
import pytest
import app.main as main_module


@pytest.fixture(autouse=True)
def reset_state():
    main_module._worksheet = None
    main_module._rate_limit_store.clear()
    yield
    main_module._worksheet = None
    main_module._rate_limit_store.clear()
