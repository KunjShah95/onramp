"""Org identifier validation on the AI key-management endpoints.

``org_name`` is a team UUID on the wire (the frontend sends ``activeTeamId``).
A display name such as ``"Foundation"`` must be rejected with a clean 400 —
previously it fell through to the team lookup and surfaced as a bare 500
(asyncpg ``invalid UUID`` DataError).
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
    def test_create_key_with_team_name_returns_400_not_500(self):
        resp = TestClient(_app()).post(f"{API_PREFIX}/ai/keys", json={
            "org_name": "Foundation",
            "name": "should-not-exist",
        })
        assert resp.status_code == 400
        assert "organization" in resp.json()["detail"].lower()

    def test_list_keys_with_team_name_returns_400_not_500(self):
        resp = TestClient(_app()).get(
            f"{API_PREFIX}/ai/keys", params={"org_name": "not-a-uuid"}
        )
        assert resp.status_code == 400
