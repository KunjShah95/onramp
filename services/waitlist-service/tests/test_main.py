import json
import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from fastapi.testclient import TestClient


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def mock_env(monkeypatch):
    monkeypatch.setenv("GOOGLE_CREDENTIALS_JSON", json.dumps({
        "type": "service_account",
        "project_id": "test",
        "private_key_id": "key-id",
        "private_key": "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----\n",
        "client_email": "test@test.iam.gserviceaccount.com",
        "client_id": "123",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
    }))
    monkeypatch.setenv("GOOGLE_SHEET_ID", "sheet-id-123")
    monkeypatch.setenv("SENDGRID_API_KEY", "SG.test-key")
    monkeypatch.setenv("SENDGRID_FROM_EMAIL", "noreply@codeflow.dev")
    monkeypatch.setenv("ADMIN_EMAIL", "admin@codeflow.dev")


@pytest.fixture
def mock_sheet():
    sheet = MagicMock()
    sheet.col_values.return_value = ["Email", "existing@test.com"]
    sheet.get_all_values.return_value = [
        ["Timestamp", "Name", "Email", "Role", "Company", "Team Size", "Use Case", "Position"],
        ["2026-06-20", "Alice", "existing@test.com", "developer", "Acme", "1-10", "test", "1"],
    ]
    return sheet


@pytest.fixture
def mock_gspread(mock_sheet):
    with patch("app.main.get_sheet", return_value=mock_sheet):
        yield mock_sheet


@pytest.fixture
def client(mock_gspread):
    from app.main import app
    return TestClient(app)


VALID_PAYLOAD = {
    "email": "new@example.com",
    "name": "Jane Dev",
    "role": "developer",
    "company": "Acme Corp",
    "team_size": "1-10",
    "use_case": "Onboard new engineers faster",
}


# ── Health ────────────────────────────────────────────────────────────────────

def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# ── Join ──────────────────────────────────────────────────────────────────────

def test_join_success(client, mock_gspread):
    mock_gspread.col_values.return_value = ["Email", "existing@test.com"]
    with patch("app.main.send_emails") as mock_send:
        mock_send.return_value = None
        r = client.post("/api/v1/waitlist/join", json=VALID_PAYLOAD)
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert data["position"] == 2
    assert "2" in data["message"]


def test_join_duplicate_email(client, mock_gspread):
    payload = {**VALID_PAYLOAD, "email": "existing@test.com"}
    r = client.post("/api/v1/waitlist/join", json=payload)
    assert r.status_code == 409
    assert "already" in r.json()["detail"].lower()


def test_join_missing_field(client, mock_gspread):
    payload = {k: v for k, v in VALID_PAYLOAD.items() if k != "name"}
    r = client.post("/api/v1/waitlist/join", json=payload)
    assert r.status_code == 422


def test_join_invalid_role(client, mock_gspread):
    payload = {**VALID_PAYLOAD, "role": "intern"}
    r = client.post("/api/v1/waitlist/join", json=payload)
    assert r.status_code == 422


def test_join_invalid_team_size(client, mock_gspread):
    payload = {**VALID_PAYLOAD, "team_size": "lots"}
    r = client.post("/api/v1/waitlist/join", json=payload)
    assert r.status_code == 422


def test_join_use_case_too_long(client, mock_gspread):
    payload = {**VALID_PAYLOAD, "use_case": "x" * 501}
    r = client.post("/api/v1/waitlist/join", json=payload)
    assert r.status_code == 422


# ── Count ─────────────────────────────────────────────────────────────────────

def test_count(client, mock_gspread):
    r = client.get("/api/v1/waitlist/count")
    assert r.status_code == 200
    assert r.json()["count"] == 1
