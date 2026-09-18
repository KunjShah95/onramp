"""Regression coverage for auth.py paths that previously had zero tests:

- ``GET /auth/check-provider`` anti-enumeration: password-only accounts and
  unknown emails must return the *same* shape (registered=False, provider=None)
  so the endpoint is not an account/provider oracle.
- ``POST /auth/reset-password`` single-use claim: a well-signed token whose
  nonce is absent (already claimed / never issued) must be rejected with 400
  before the ORM password update runs.

Kept hermetic (memory storage) by only exercising the branches that short-circuit
ahead of the Postgres session, and by staying under the shared ``auth`` /
``auth_reset`` rate-limit buckets.
"""

import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    from app.main import app

    with TestClient(app) as c:
        yield c


def _unique_email(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}@onramp.dev"


async def _seed_user(email: str, provider: str) -> str:
    from app.services.user_service import create_user

    uid = f"cov-{uuid.uuid4().hex[:8]}"
    await create_user(uid=uid, email=email, name="Coverage", provider=provider)
    return uid


class TestCheckProviderAntiEnumeration:
    async def test_password_account_is_not_revealed(self, client):
        email = _unique_email("cov-pw")
        await _seed_user(email, "password")
        r = client.get("/api/v1/auth/check-provider", params={"email": email})
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        assert data["registered"] is False
        assert data["provider"] is None

    async def test_oauth_account_is_surfaced(self, client):
        email = _unique_email("cov-gh")
        await _seed_user(email, "github")
        r = client.get("/api/v1/auth/check-provider", params={"email": email})
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        assert data["registered"] is True
        assert data["provider"] == "github"

    async def test_unknown_email_shape_matches_password_account(self, client):
        # An unknown email must be indistinguishable from a password account
        # (the whole point of the anti-enumeration change).
        r = client.get("/api/v1/auth/check-provider", params={"email": _unique_email("cov-unknown")})
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        assert data["registered"] is False
        assert data["provider"] is None


class TestResetPasswordSingleUse:
    def _forge_reset_token(self, uid: str, nonce: str) -> str:
        from app.core import security as sec

        now = datetime.now(timezone.utc)
        payload = {
            "purpose": "password_reset",
            "uid": uid,
            "nonce": nonce,
            "jti": nonce,
            "iat": now,
            "exp": now + timedelta(minutes=60),
        }
        return jwt.encode(payload, sec.get_jwt_secret(), algorithm=sec.JWT_ALGORITHM)

    def test_invalid_token_rejected(self, client):
        r = client.post(
            "/api/v1/auth/reset-password",
            json={"token": "not-a-real-jwt", "password": "Newpass123"},
        )
        assert r.status_code == 400, r.text

    def test_wrong_purpose_rejected(self, client):
        from app.core import security as sec

        now = datetime.now(timezone.utc)
        token = jwt.encode(
            {"purpose": "access", "uid": "u", "jti": "j", "iat": now, "exp": now + timedelta(minutes=5)},
            sec.get_jwt_secret(),
            algorithm=sec.JWT_ALGORITHM,
        )
        r = client.post(
            "/api/v1/auth/reset-password",
            json={"token": token, "password": "Newpass123"},
        )
        assert r.status_code == 400, r.text

    async def test_already_claimed_nonce_rejected_before_db(self, client):
        # Well-signed token whose nonce was never issued (or was consumed by an
        # earlier reset) must 400 with the single-use message — this branch is
        # reached ahead of the ORM password update, so no DB is required.
        nonce = uuid.uuid4().hex
        token = self._forge_reset_token(f"cov-{uuid.uuid4().hex[:8]}", nonce)
        r = client.post(
            "/api/v1/auth/reset-password",
            json={"token": token, "password": "Newpass123"},
        )
        assert r.status_code == 400, r.text
        assert "already been used" in r.text.lower()
