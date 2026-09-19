"""Org identifier handling on the AI key-management endpoints.

``org_name`` accepts a team UUID, a caller-scoped team display name
(``"Foundation"`` resolves to the caller's own team), or a test-style org
slug. Unresolvable input must be a clean 404 — previously a display name
fell through to the team lookup and surfaced as a bare 500 (asyncpg
``invalid UUID`` DataError).
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient

API_PREFIX = "/api/v1"


def _app():
    from app.api.v1 import ai_gateway

    application = FastAPI()
    application.state.llm = None

    @application.middleware("http")
    async def _set_user(request, call_next):
        request.state.user = {
            "uid": "u-org-validation",
            "email": "senior@test.com",
            "name": "Test Senior",
        }
        return await call_next(request)

    application.include_router(ai_gateway.router, prefix=API_PREFIX)
    return application


class TestOrgIdentifierValidation:
    def test_unknown_team_name_returns_404_not_500(self):
        resp = TestClient(_app()).post(f"{API_PREFIX}/ai/keys", json={
            "org_name": "No-Such-Org",
            "name": "should-not-exist",
        })
        assert resp.status_code == 404

    def test_garbage_org_returns_404_not_500(self):
        resp = TestClient(_app()).get(
            f"{API_PREFIX}/ai/keys", params={"org_name": "not-a-uuid!!!"}
        )
        assert resp.status_code == 404
