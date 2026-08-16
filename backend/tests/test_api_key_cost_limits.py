"""API key cost-limit tests — per-key budgets (name + credit_limit).

Covers:
  - Creating a key with a label + cost budget (stored + returned).
  - Listing keys surfaces the enriched budget fields.
  - execute_agent rejects (402) calls that would exceed the key's budget.
  - Charges within budget are tracked on the key's credits_used counter.
  - Negative budgets are rejected at the endpoint.
"""

from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

API_PREFIX = "/api/v1"

# The key-management endpoints enforced RBAC (CEO/CTO/senior/HR) against
# live team membership in `ai_gateway._require_key_manager_role`. These tests
# exercise key CRUD/budget/expiry logic, not team auth, so they mock the team
# layer deterministically instead of coupling to a database.
TEST_UID = "u-cost-limit-test"


@pytest.fixture(autouse=True)
def _mock_team_rbac(monkeypatch):
    """Grant TEST_UID owner role for any org, bypassing DB team lookups."""
    from app.api.v1 import ai_gateway

    async def _member_of_any_org(team_id):
        return [{"id": TEST_UID, "user_id": TEST_UID, "role": "admin"}]

    async def _teams_for_user(user_id):
        return [{"id": "acme", "team_id": "acme", "role": "admin"}]

    async def _add_member(team_id, user_id, role="junior_dev"):
        return {"id": team_id, "team_id": team_id, "user_id": user_id, "role": role}

    monkeypatch.setattr(ai_gateway, "get_team_members", _member_of_any_org)
    monkeypatch.setattr(ai_gateway, "get_user_teams", _teams_for_user)
    monkeypatch.setattr(ai_gateway, "add_member", _add_member)


def _app(user: bool = True):
    """FastAPI app with the ai-gateway router.

    ``user=True`` attaches a JWT user to ``request.state`` (the create/list
    endpoints authenticate via ``get_current_user``). ``user=False`` leaves it
    unset so the ``X-API-Key`` path in ``get_user_or_api_key`` is exercised.
    """
    from app.api.v1 import ai_gateway

    application = FastAPI()
    application.state.llm = None

    if user:
        @application.middleware("http")
        async def _set_user(request, call_next):
            request.state.user = {
                "uid": "u-cost-limit-test",
                "email": "cto@test.com",
                "name": "Test CTO",
            }
            return await call_next(request)

    application.include_router(ai_gateway.router, prefix=API_PREFIX)
    return application


@pytest.fixture
def client():
    return TestClient(_app(user=True))


class TestCreateKeyWithBudget:
    def test_create_key_with_name_and_credit_limit(self, client):
        resp = client.post(f"{API_PREFIX}/ai/keys", json={
            "org_name": "acme",
            "tier": "pro",
            "name": "CI pipeline",
            "credit_limit": 500,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "CI pipeline"
        assert data["credit_limit"] == 500
        assert data["tier"] == "pro"
        assert data["raw_key"].startswith("cf_")

    def test_create_key_defaults_name_and_no_limit(self, client):
        resp = client.post(f"{API_PREFIX}/ai/keys", json={"org_name": "acme"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "acme"
        assert data["credit_limit"] is None

    def test_negative_credit_limit_rejected(self, client):
        resp = client.post(f"{API_PREFIX}/ai/keys", json={
            "org_name": "acme",
            "credit_limit": -1,
        })
        assert resp.status_code == 400

    def test_invalid_tier_rejected(self, client):
        resp = client.post(f"{API_PREFIX}/ai/keys", json={
            "org_name": "acme",
            "tier": "bogus",
        })
        assert resp.status_code == 400


class TestListKeysBudgetFields:
    def test_list_keys_includes_budget_fields(self, client):
        created = client.post(f"{API_PREFIX}/ai/keys", json={
            "org_name": "acme",
            "tier": "team",
            "name": "Analytics",
            "credit_limit": 1000,
        }).json()
        resp = client.get(f"{API_PREFIX}/ai/keys?org_name=acme")
        assert resp.status_code == 200
        keys = resp.json()["keys"]
        assert len(keys) == 1
        k = keys[0]
        assert k["key_id"] == created["key_id"]
        assert k["name"] == "Analytics"
        assert k["tier"] == "team"
        assert k["credit_limit"] == 1000
        assert k["credits_used"] == 0
        assert k["org_name"] == "acme"


class TestCostLimitEnforcement:
    """execute_agent must refuse calls that would blow the key's budget.

    The 'health' agent is used because it runs without an LLM (scores an
    empty repo structure) and its credit action ('analyze') costs 10 credits.
    """

    @staticmethod
    def _execute_health(raw_key: str):
        # user=False: no JWT on request.state, so the X-API-Key auth path runs.
        return TestClient(_app(user=False)).post(
            f"{API_PREFIX}/ai/agents/health",
            headers={"X-API-Key": raw_key},
            json={"repo_structure": {"files": [], "classes": [], "functions": []}},
        )

    def test_budget_exceeded_returns_402(self):
        client = TestClient(_app(user=True))
        created = client.post(f"{API_PREFIX}/ai/keys", json={
            "org_name": "acme",
            "credit_limit": 5,  # health costs 10 credits
        }).json()
        resp = self._execute_health(created["raw_key"])
        assert resp.status_code == 402
        assert "cost limit" in resp.json()["detail"].lower()

    def test_within_budget_charges_and_increments(self):
        client = TestClient(_app(user=True))
        created = client.post(f"{API_PREFIX}/ai/keys", json={
            "org_name": "acme",
            "credit_limit": 100,
        }).json()
        resp = self._execute_health(created["raw_key"])
        assert resp.status_code == 200
        # The health agent's credit action ('analyze') costs 10 credits.
        listed = client.get(f"{API_PREFIX}/ai/keys?org_name=acme").json()["keys"]
        assert listed[0]["credits_used"] == 10
        # A second call is still within the 100-credit budget.
        assert self._execute_health(created["raw_key"]).status_code == 200

    def test_no_budget_never_blocks(self):
        client = TestClient(_app(user=True))
        created = client.post(f"{API_PREFIX}/ai/keys", json={"org_name": "acme"}).json()
        assert self._execute_health(created["raw_key"]).status_code == 200


class TestKeyExpiry:
    def test_create_key_with_expiry_returns_future_expires_at(self, client):
        resp = client.post(f"{API_PREFIX}/ai/keys", json={
            "org_name": "acme",
            "tier": "pro",
            "name": "short-lived",
            "expires_in_days": 30,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["expires_at"] is not None
        expires = datetime.fromisoformat(str(data["expires_at"]).replace("Z", "+00:00"))
        assert expires > datetime.now(timezone.utc)

    def test_create_key_without_expiry(self, client):
        resp = client.post(f"{API_PREFIX}/ai/keys", json={"org_name": "acme"})
        assert resp.status_code == 200
        assert resp.json()["expires_at"] is None

    def test_non_positive_expiry_rejected(self, client):
        for bad in (0, -5):
            resp = client.post(f"{API_PREFIX}/ai/keys", json={
                "org_name": "acme",
                "expires_in_days": bad,
            })
            assert resp.status_code == 400

    def test_list_keys_includes_expiry(self, client):
        client.post(f"{API_PREFIX}/ai/keys", json={
            "org_name": "acme",
            "expires_in_days": 7,
        })
        listed = client.get(f"{API_PREFIX}/ai/keys?org_name=acme").json()["keys"]
        assert listed[0]["expires_at"] is not None
