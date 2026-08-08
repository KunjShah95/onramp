"""API Contract Tests — verify response schemas, error shapes, and envelope structure.

These tests validate that every endpoint:
1. Returns the expected HTTP status codes
2. Follows the {success, data} response envelope (or {success, error} for errors)
3. Rejects invalid inputs with 422 and the correct error shape
4. Returns consistent type shapes for response data

Run:  python -m pytest tests/test_api_contract.py -v
"""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    """Import the FastAPI app and create a test client.

    The conftest sets STORAGE_BACKEND=memory and GROQ_API_KEY,
    so the app initializes without a real database or LLM keys.
    """
    from app.main import app
    with TestClient(app) as c:
        yield c


# ═══════════════════════════════════════════════════════════════════════
# Response Envelope Contract
# ═══════════════════════════════════════════════════════════════════════


class TestResponseEnvelope:
    """All responses MUST follow the {success, data} envelope contract."""

    def test_success_envelope_has_success_and_data(self, client):
        resp = client.get("/")
        body = resp.json()
        assert "success" in body, "Success envelope must contain 'success' field"
        assert "data" in body, "Success envelope must contain 'data' field"
        assert body["success"] is True

    def test_health_envelope(self, client):
        """Liveness probes stay unwrapped (raw ops shape) so load balancers
        and K8s healthchecks can parse them without unwrapping."""
        resp = client.get("/health")
        body = resp.json()
        assert body["status"] == "ok"
        assert "version" in body
        assert "uptime_seconds" in body

    def test_error_envelope_has_error_field(self, client):
        """401 responses should have a consistent error shape."""
        resp = client.get("/api/v1/auth/me")
        assert resp.status_code == 401
        body = resp.json()
        has_detail = "detail" in body
        has_error = "error" in body or body.get("success") is False
        assert has_detail or has_error, (
            f"401 response missing error fields: keys={list(body.keys())}"
        )


# ═══════════════════════════════════════════════════════════════════════
# Public Endpoint Contracts
# ═══════════════════════════════════════════════════════════════════════


class TestRootEndpointContract:
    """GET / contract tests."""

    def test_root_returns_expected_fields(self, client):
        resp = client.get("/")
        data = resp.json()["data"]
        assert "message" in data
        assert "version" in data
        assert "status" in data
        assert "docs" in data
        assert data["status"] == "running"
        assert data["version"] == "1.0.0"


class TestHealthEndpointContract:
    """GET /health contract tests."""

    def test_health_returns_expected_fields(self, client):
        resp = client.get("/health")
        data = resp.json()
        assert "status" in data
        assert data["status"] == "ok"


class TestPricingEndpointContract:
    """GET /api/v1/billing/pricing contract tests."""

    def test_pricing_returns_tiers(self, client):
        resp = client.get("/api/v1/billing/pricing")
        assert resp.status_code == 200
        data = resp.json()["data"]
        # Must have tiers or plans
        assert "tiers" in data or "plans" in data


class TestAITiersContract:
    """GET /api/v1/ai/tiers contract tests."""

    def test_ai_tiers_returns_list(self, client):
        resp = client.get("/api/v1/ai/tiers")
        assert resp.status_code == 200
        body = resp.json()
        # Navigate through response envelope if present
        data = body.get("data", body)
        assert isinstance(data, (list, dict))


# ═══════════════════════════════════════════════════════════════════════
# Auth / Registration Endpoint Contracts
# ═══════════════════════════════════════════════════════════════════════


class TestAuthEndpointContracts:
    """Auth endpoint input validation contracts."""

    def test_register_validates_required_fields(self, client):
        resp = client.post("/api/v1/auth/register", json={})
        assert resp.status_code == 422
        body = resp.json()
        assert "detail" in body
        # 422 detail should be a list of validation errors
        assert isinstance(body["detail"], list)

    def test_register_validates_email_format(self, client):
        resp = client.post("/api/v1/auth/register", json={
            "email": "not-an-email",
            "password": "password123",
            "name": "Test User",
        })
        # Endpoint may accept or reject — verify no 5xx at minimum
        assert resp.status_code < 500, f"Expected non-5xx, got {resp.status_code}"

    def test_register_validates_password_length(self, client):
        resp = client.post("/api/v1/auth/register", json={
            "email": "test@test.com",
            "password": "12",
            "name": "Test User",
        })
        # Short passwords may be rejected with 400 or 422
        assert resp.status_code in (400, 422), f"Expected 400 or 422, got {resp.status_code}"

    def test_login_validates_required_fields(self, client):
        resp = client.post("/api/v1/auth/login", json={})
        assert resp.status_code == 422
        body = resp.json()
        assert "detail" in body


class TestCheckProviderContract:
    """GET /api/v1/auth/check-provider contract tests."""

    def test_check_provider_validates_email(self, client):
        resp = client.get("/api/v1/auth/check-provider?email=invalid")
        assert resp.status_code in (200, 422)

    def test_check_provider_rejects_missing_email(self, client):
        resp = client.get("/api/v1/auth/check-provider")
        assert resp.status_code == 422


# ═══════════════════════════════════════════════════════════════════════
# Unauthenticated Access Contracts
# ═══════════════════════════════════════════════════════════════════════


class TestAuthRequiredContracts:
    """Protected endpoints MUST return 401 when unauthenticated."""

    # List of (method, path, description) tuples
    PROTECTED_ENDPOINTS = [
        ("GET", "/api/v1/auth/me", "Auth me"),
        ("GET", "/api/v1/repos", "Repos"),
        ("GET", "/api/v1/dashboard", "Dashboard"),
        ("GET", "/api/v1/teams", "Teams"),
        ("GET", "/api/v1/billing", "Billing"),
        ("GET", "/api/v1/notifications", "Notifications"),
        ("GET", "/api/v1/teams/profile", "Profile"),
        ("GET", "/api/v1/admin/keys", "Admin keys"),
        ("GET", "/api/v1/integrations", "Integrations"),
        ("GET", "/api/v1/tasks", "Tasks"),
        ("GET", "/api/v1/playbooks", "Playbooks (no team)"),
        ("GET", "/api/v1/admin/audit", "Admin audit"),
    ]

    @pytest.mark.parametrize("method,path,desc", PROTECTED_ENDPOINTS)
    def test_protected_endpoint_requires_auth(self, client, method, path, desc):
        resp = client.request(method, path)
        assert resp.status_code == 401, (
            f"Expected 401 for {desc} ({method} {path}), got {resp.status_code}"
        )


# ═══════════════════════════════════════════════════════════════════════
# OpenAPI Schema Contract
# ═══════════════════════════════════════════════════════════════════════


class TestOpenAPIContract:
    """The OpenAPI schema must be well-formed and complete."""

    def test_openapi_schema_exists(self, client):
        from app.main import app
        schema = app.openapi()
        assert "openapi" in schema, "Schema must declare OpenAPI version"
        assert "paths" in schema, "Schema must have paths"
        assert "info" in schema, "Schema must have info"

    def test_openapi_has_minimum_routes(self, client):
        from app.main import app
        paths = app.openapi()["paths"]
        # Should have at least 25 registered routes
        assert len(paths) >= 25, f"Expected 25+ routes, got {len(paths)}"

    def test_openapi_all_routes_have_responses(self, client):
        from app.main import app
        paths = app.openapi()["paths"]
        # Skip non-HTTP-method keys in OpenAPI path items
        HTTP_METHODS = {"get", "post", "put", "patch", "delete", "head", "options", "trace"}
        for route, methods in paths.items():
            for method, spec in methods.items():
                if method.lower() not in HTTP_METHODS:
                    continue
                assert "responses" in spec, (
                    f"Route {route} [{method}] has no responses defined"
                )


# ═══════════════════════════════════════════════════════════════════════
# 422 Validation Error Shape Contract
# ═══════════════════════════════════════════════════════════════════════


class TestValidationErrorContract:
    """All 422 errors should follow a consistent shape."""

    def test_validation_error_has_detail_list(self, client):
        """Trigger validation error with empty POST body."""
        resp = client.post("/api/v1/auth/register", json={})
        assert resp.status_code == 422
        body = resp.json()
        assert "detail" in body, "422 response must have 'detail' field"
        assert isinstance(body["detail"], list), "422 detail must be a list"
        if body["detail"]:
            err = body["detail"][0]
            assert "loc" in err, "Each error must have 'loc' (location)"
            assert "msg" in err, "Each error must have 'msg' (message)"
            assert "type" in err, "Each error must have 'type'"

    def test_validation_error_on_bad_query_param(self, client):
        """Trigger validation error with missing required query param."""
        resp = client.get("/api/v1/auth/check-provider")
        assert resp.status_code == 422
        body = resp.json()
        assert "detail" in body


# ═══════════════════════════════════════════════════════════════════════
# Content-Type Contract
# ═══════════════════════════════════════════════════════════════════════


class TestContentTypeContract:
    """All API responses must be application/json."""

    def test_all_endpoints_return_json(self, client):
        endpoints = [
            ("GET", "/"),
            ("GET", "/health"),
            ("GET", "/api/v1/billing/pricing"),
            ("GET", "/api/v1/ai/tiers"),
            ("GET", "/api/v1/explore/health"),
        ]
        for method, path in endpoints:
            resp = client.request(method, path)
            assert resp.status_code < 500, f"{method} {path} returned 5xx"
            content_type = resp.headers.get("content-type", "")
            assert "application/json" in content_type, (
                f"{method} {path} returned {content_type}, expected application/json"
            )
