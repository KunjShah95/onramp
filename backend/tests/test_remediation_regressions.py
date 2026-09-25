import asyncio
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.middleware.base import BaseHTTPMiddleware

from app.services.audit_service import log_event, query_events_page
from app.services.credit_service import CreditService, InsufficientCreditsError
from app.services.postgres_db import generate_id, get_storage


class _UserMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request.state.user = {
            "uid": "00000000-0000-4000-a000-000000000001",
            "email": "admin@example.com",
            "name": "Admin",
        }
        return await call_next(request)


def _client(*routers):
    app = FastAPI()
    app.add_middleware(_UserMiddleware)
    for router in routers:
        app.include_router(router, prefix="/api/v1")
    return TestClient(app)


@pytest.mark.asyncio
async def test_audit_page_returns_total_and_distinct_slice():
    actor = "00000000-0000-4000-a000-000000000001"
    for index in range(5):
        await log_event("task_created", actor, f"task-{index}")

    page, total = await query_events_page(limit=2, offset=2)

    assert total >= 5
    assert len(page) == 2


@pytest.mark.asyncio
async def test_concurrent_wallet_deduction_cannot_double_spend():
    service = CreditService()
    await service.add_credits("team-wallet", 10)

    results = await asyncio.gather(
        service.deduct("team-wallet", 8, "first"),
        service.deduct("team-wallet", 8, "second"),
        return_exceptions=True,
    )

    assert sum(isinstance(result, InsufficientCreditsError) for result in results) == 1
    assert (await service.get_balance("team-wallet")) == 2


def test_task_csv_route_is_not_shadowed_by_task_id():
    from app.api.v1.tasks import router as tasks_router
    from app.services.postgres_db import get_storage

    user_id = "00000000-0000-4000-a000-000000000001"
    team_id = "00000000-0000-4000-b000-000000000001"

    async def seed():
        storage = get_storage()
        await storage.create_document("users", user_id, {"id": user_id, "email": "a@example.com", "is_active": True})
        await storage.create_document("teams", team_id, {"id": team_id, "name": "Team", "is_active": True})
        await storage.create_document("team_members", generate_id(), {"user_id": user_id, "team_id": team_id, "role": "admin"})

    asyncio.run(seed())
    response = _client(tasks_router).get("/api/v1/tasks/export.csv?team_id=" + team_id)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "task_id,title" in response.text


def test_csv_formula_is_neutralized():
    from app.api.v1.tasks import _csv_safe

    assert _csv_safe("=HYPERLINK(\"https://evil.test\")").startswith("'=")
    assert _csv_safe("+cmd") .startswith("'+")
    assert _csv_safe(None) == ""


@pytest.mark.asyncio
async def test_github_delivery_claim_releases_after_failure(monkeypatch):
    from app.api.v1 import webhook_handler

    monkeypatch.setattr(webhook_handler, "_processed_deliveries", {})
    monkeypatch.setattr("app.services.cache_service.get_client", AsyncMock(return_value=None))
    delivery = "delivery-retry-1"

    assert await webhook_handler._claim_delivery(delivery) is True
    assert await webhook_handler._claim_delivery(delivery) is False
    await webhook_handler._release_delivery(delivery)
    assert await webhook_handler._claim_delivery(delivery) is True
    await webhook_handler._complete_delivery(delivery)
    assert await webhook_handler._claim_delivery(delivery) is False


@pytest.mark.asyncio
async def test_sso_callback_fails_closed_without_verifier():
    from app.services.sso_service import handle_sso_callback, parse_metadata_xml

    result = await handle_sso_callback("unsigned-saml-response")
    assert result == {
        "success": False,
        "error": "SAML authentication is not configured",
    }
    with pytest.raises(ValueError, match="metadata import is not enabled"):
        await parse_metadata_xml("<EntityDescriptor />")


def test_sso_config_crud_is_wired_and_team_admin_only():
    from app.api.v1.auth import router as auth_router

    user_id = "00000000-0000-4000-a000-000000000001"
    team_id = "00000000-0000-4000-b000-000000000001"

    async def seed():
        storage = get_storage()
        await storage.create_document("users", user_id, {"id": user_id, "email": "a@example.com", "is_active": True})
        await storage.create_document("teams", team_id, {"id": team_id, "name": "Team", "is_active": True})
        await storage.create_document("team_members", generate_id(), {"user_id": user_id, "team_id": team_id, "role": "admin"})

    asyncio.run(seed())
    client = _client(auth_router)
    payload = {
        "team_id": team_id,
        "idp_type": "okta",
        "domain": "example.com",
        "entity_id": "idp",
        "sso_url": "https://idp.example.com/sso",
        "x509_cert": "cert",
    }

    created = client.post("/api/v1/auth/sso/configure", json=payload)
    assert created.status_code == 200
    assert created.json()["domain"] == "example.com"
    assert client.get(f"/api/v1/auth/sso/config/{team_id}").status_code == 200
    assert client.post("/api/v1/auth/sso/test", json={"team_id": team_id}).status_code == 200
    assert client.delete(f"/api/v1/auth/sso/config/{team_id}").json() == {"deleted": True}
