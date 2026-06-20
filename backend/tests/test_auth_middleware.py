def test_public_routes_succeed(client):
    # Root route should be public (returns 200)
    resp_root = client.get("/")
    assert resp_root.status_code == 200
    res_root = resp_root.json()
    assert res_root["success"] is True
    assert res_root["data"]["status"] == "running"

    # Health route should be public (returns 200)
    resp_health = client.get("/health")
    assert resp_health.status_code == 200
    res_health = resp_health.json()
    assert res_health["success"] is True
    assert res_health["data"]["status"] == "healthy"


def test_protected_routes_require_authentication(client):
    # 1. Accessing team endpoints without authorization header should fail with 401
    resp_team = client.get("/api/v1/teams/some-team-id")
    assert resp_team.status_code == 401
    assert "Missing or invalid Authorization header" in resp_team.json()["detail"]

    # 2. Accessing billing endpoints without authorization header should fail with 401
    resp_billing = client.get("/api/v1/billing/subscriptions/some-team-id")
    assert resp_billing.status_code == 401
    assert "Missing or invalid Authorization header" in resp_billing.json()["detail"]

    # 3. Accessing playbook endpoints without authorization header should fail with 401
    resp_playbook = client.get("/api/v1/playbooks/some-playbook-id")
    assert resp_playbook.status_code == 401
    assert "Missing or invalid Authorization header" in resp_playbook.json()["detail"]


def test_protected_routes_accept_valid_token(client, monkeypatch):
    # The dev-bypass must be explicitly enabled AND not in production. Without
    # both env vars set, an unverified token is rejected (the secure default).
    monkeypatch.setenv("AUTH_DEV_BYPASS", "true")
    monkeypatch.setenv("ENV", "development")

    dev_token = "a" * 25
    headers = {"Authorization": f"Bearer {dev_token}"}

    # Accessing team endpoint with dev token should now pass the middleware.
    # Since the team ID doesn't exist, it should hit the service/db and return 404 instead of 401.
    nonexistent_team_id = "00000000-0000-0000-0000-000000000000"
    resp = client.get(f"/api/v1/teams/{nonexistent_team_id}", headers=headers)
    assert resp.status_code == 404


def test_dev_bypass_rejected_without_env(client, monkeypatch):
    # Without AUTH_DEV_BYPASS/ENV set, an unverified token must be rejected (401),
    # closing the production auth-bypass hole.
    # .env loads AUTH_DEV_BYPASS=true in dev; explicitly unset for this test.
    monkeypatch.delenv("AUTH_DEV_BYPASS", raising=False)
    monkeypatch.setenv("ENV", "production")
    dev_token = "a" * 25
    headers = {"Authorization": f"Bearer {dev_token}"}
    resp = client.get("/api/v1/teams/some-team-id", headers=headers)
    assert resp.status_code == 401
