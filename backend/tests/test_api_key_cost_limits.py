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


class TestDailyCapEnforcement:
    """Per-key DAILY caps must bind: pre-request 402 gate + charged counter.

    The 'health' agent costs 10 credits, so a daily cap of 15 allows exactly
    one call per UTC day.
    """

    def test_daily_cap_exceeded_returns_402(self):
        client = TestClient(_app(user=True))
        created = client.post(f"{API_PREFIX}/ai/keys", json={
            "org_name": "acme",
            "credit_limit": 1000,  # monthly budget is not the binding limit here
            "daily_credit_cap": 15,
        }).json()
        assert self._execute_health(created["raw_key"]).status_code == 200
        resp = self._execute_health(created["raw_key"])
        assert resp.status_code == 402
        assert "daily" in resp.json()["detail"].lower()

    @staticmethod
    def _execute_health(raw_key: str):
        return TestClient(_app(user=False)).post(
            f"{API_PREFIX}/ai/agents/health",
            headers={"X-API-Key": raw_key},
            json={"repo_structure": {"files": [], "classes": [], "functions": []}},
        )

    def test_daily_counter_charged_on_success(self):
        client = TestClient(_app(user=True))
        created = client.post(f"{API_PREFIX}/ai/keys", json={
            "org_name": "acme",
            "credit_limit": 1000,
            "daily_credit_cap": 100,
        }).json()
        assert self._execute_health(created["raw_key"]).status_code == 200
        listed = client.get(f"{API_PREFIX}/ai/keys?org_name=acme").json()["keys"]
        assert listed[0]["daily_credits_used"] == 10
        assert listed[0]["credits_used"] == 10

    async def test_daily_counter_resets_on_rollover(self, storage):
        """A stale daily_usage_date reads as zero and re-stamps on charge."""
        from datetime import timedelta
        from app.services import api_key_service as aks

        plain, _ = await aks.create_api_key(
            name="rollover", user_id=TEST_UID,
            credit_limit=1000, daily_credit_cap=15,
        )
        svc = aks.APIKeyService()
        validated = await svc.validate_key(plain)
        key_id = validated["key_id"]
        assert (await svc.reserve_credits(key_id, 10))["outcome"] == "ok"

        # Backdate the counter to yesterday (simulating spend on a prior day).
        rec = await storage.get_document("api_keys", key_id)
        perms = dict(rec["permissions"])
        perms["daily_usage_date"] = (
            datetime.now(timezone.utc) - timedelta(days=1)
        ).strftime("%Y-%m-%d")
        perms["daily_credits_used"] = 10
        await storage.update_document("api_keys", key_id, {"permissions": perms})

        # Yesterday's 10 no longer counts: charging 10 today must succeed…
        assert (await svc.reserve_credits(key_id, 10))["outcome"] == "ok"
        validated = await svc.validate_key(plain)
        assert validated["daily_credits_used"] == 10
        # …but the day's budget is now spent: a further charge is rejected.
        rejected = await svc.reserve_credits(key_id, 10)
        assert rejected["outcome"] == "exhausted"
        assert rejected["scope"] == "daily"

    async def test_reserve_reports_monthly_scope(self, storage):
        """Monthly exhaustion names its scope (drives the 402 message)."""
        from app.services import api_key_service as aks

        plain, _ = await aks.create_api_key(
            name="monthly-scope", user_id=TEST_UID, credit_limit=15,
        )
        svc = aks.APIKeyService()
        key_id = (await svc.validate_key(plain))["key_id"]
        assert (await svc.reserve_credits(key_id, 10))["outcome"] == "ok"
        rejected = await svc.reserve_credits(key_id, 10)
        assert rejected == {"outcome": "exhausted", "scope": "monthly"}

    async def test_refund_restores_budget(self, storage):
        """Refunds compensate failed executions (floored at zero)."""
        from app.services import api_key_service as aks

        plain, _ = await aks.create_api_key(
            name="refund", user_id=TEST_UID,
            credit_limit=100, daily_credit_cap=50,
        )
        svc = aks.APIKeyService()
        key_id = (await svc.validate_key(plain))["key_id"]
        assert (await svc.reserve_credits(key_id, 10))["outcome"] == "ok"
        assert (await svc.refund_credits(key_id, 10))["outcome"] == "ok"
        validated = await svc.validate_key(plain)
        assert validated["credits_used"] == 0
        assert validated["daily_credits_used"] == 0
        # Unknown keys report not_found (gateway maps to 401).
        assert (await svc.reserve_credits("nope", 10))["outcome"] == "not_found"

    def test_duplicate_team_names_require_uuid(self, client, monkeypatch):
        """Ambiguous display names are rejected, not silently misrouted."""
        from app.api.v1 import ai_gateway

        async def _teams(user_id):
            return [
                {"id": "t1", "team_id": "t1", "name": "Acme", "role": "admin"},
                {"id": "t2", "team_id": "t2", "name": "acme", "role": "admin"},
            ]

        async def _no_members(team_id):
            return []

        async def _add_member(team_id, user_id, role="junior_dev"):
            raise AssertionError("must not create membership on ambiguity")

        monkeypatch.setattr(ai_gateway, "get_user_teams", _teams)
        monkeypatch.setattr(ai_gateway, "get_team_members", _no_members)
        monkeypatch.setattr(ai_gateway, "add_member", _add_member)
        resp = client.post(f"{API_PREFIX}/ai/keys", json={
            "org_name": "ACME", "name": "ambiguous",
        })
        assert resp.status_code == 409

    def test_no_daily_cap_never_blocks(self):
        client = TestClient(_app(user=True))
        created = client.post(f"{API_PREFIX}/ai/keys", json={
            "org_name": "acme",
            "credit_limit": 1000,
        }).json()
        assert self._execute_health(created["raw_key"]).status_code == 200
        assert self._execute_health(created["raw_key"]).status_code == 200

    def test_rotate_preserves_daily_cap(self):
        client = TestClient(_app(user=True))
        created = client.post(f"{API_PREFIX}/ai/keys", json={
            "org_name": "acme",
            "credit_limit": 1000,
            "daily_credit_cap": 15,
        }).json()
        resp = client.post(
            f"{API_PREFIX}/ai/keys/{created['key_id']}/rotate",
            json={"key_id": created["key_id"]})
        assert resp.status_code == 200
        rotated = resp.json()
        assert rotated["daily_credit_cap"] == 15
        # Old key is dead, new key works within the preserved cap.
        assert self._execute_health(created["raw_key"]).status_code == 401
        assert self._execute_health(rotated["raw_key"]).status_code == 200


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
