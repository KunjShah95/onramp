"""Phase-2 auth hardening: logout revocation, refresh reuse detection,
password policy, credit atomicity, keyed email_hash. TDD RED first."""

import asyncio
import hashlib
import uuid

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    from app.main import app
    with TestClient(app) as c:
        yield c


def _unique_email(prefix="ph2"):
    return f"{prefix}-{uuid.uuid4().hex[:8]}@onramp.dev"


# ── Password policy (pure function) ──────────────────────────────────────────

class TestPasswordPolicy:
    def test_rejects_short(self):
        from app.core import security as sec
        with pytest.raises(ValueError):
            sec.validate_password("Pw1")

    def test_requires_letter_and_digit(self):
        from app.core import security as sec
        with pytest.raises(ValueError):
            sec.validate_password("allletters")
        with pytest.raises(ValueError):
            sec.validate_password("12345678")

    def test_rejects_overlong_bcrypt_cap(self):
        from app.core import security as sec
        with pytest.raises(ValueError):
            sec.validate_password("Aa1" + "x" * 80)

    def test_accepts_strong(self):
        from app.core import security as sec
        sec.validate_password("password123")

    def test_hash_password_rejects_overlong(self):
        from app.core import security as sec
        with pytest.raises(ValueError):
            sec.hash_password("Aa1" + "x" * 80)


# ── Logout revokes refresh token (endpoint) ──────────────────────────────────

class TestLogoutRevocation:
    async def _seed_session(self, prefix):
        from app.services.user_service import create_user
        from app.services import refresh_token_service as svc
        uid = f"ph2-{prefix}-{uuid.uuid4().hex[:8]}"
        await create_user(uid=uid, email=_unique_email(prefix), name="Ph2", provider="password")
        token = svc.generate_refresh_token()
        await svc.store_refresh_token(uid, token, remember_me=True)
        return uid, token

    async def test_logout_revokes_refresh_token(self, client):
        from app.services import refresh_token_service as svc
        _, token = await self._seed_session("logout")
        assert await svc.validate_refresh_token(token) is not None

        lo = client.post(
            "/api/v1/auth/logout",
            headers={"Cookie": f"onramp_refresh_token={token}"},
        )
        assert lo.status_code == 200

        # Presented refresh token must be dead after logout
        assert await svc.validate_refresh_token(token) is None

    async def test_refresh_reuse_revokes_family(self, client):
        _, t1 = await self._seed_session("reuse")

        r1 = client.post("/api/v1/auth/refresh", json={"refresh_token": t1})
        assert r1.status_code == 200, r1.text
        t2 = r1.json()["data"]["refresh_token"]
        assert t2 and t2 != t1

        # Replay the rotated-out token: must 401 ...
        replay = client.post("/api/v1/auth/refresh", json={"refresh_token": t1})
        assert replay.status_code == 401
        # ... and the whole family (t2) must be wiped (theft response)
        r3 = client.post("/api/v1/auth/refresh", json={"refresh_token": t2})
        assert r3.status_code == 401, r3.text


# ── Refresh service: revoked lookup + family wipe ────────────────────────────

async def test_revoked_token_lookup_finds_record():
    from tests.conftest import TUID_USER_JUNIOR1
    from app.services import refresh_token_service as svc
    token = svc.generate_refresh_token()
    await svc.store_refresh_token(TUID_USER_JUNIOR1, token, remember_me=True)
    await svc.revoke_refresh_token(token)
    assert await svc.validate_refresh_token(token) is None
    record = await svc.find_revoked_record(token)
    assert record is not None
    assert record["user_id"] == TUID_USER_JUNIOR1


async def test_reuse_wipes_family():
    from tests.conftest import TUID_USER_JUNIOR2
    from app.services import refresh_token_service as svc
    t1 = svc.generate_refresh_token()
    await svc.store_refresh_token(TUID_USER_JUNIOR2, t1, remember_me=True)
    t2 = svc.generate_refresh_token()
    await svc.store_refresh_token(TUID_USER_JUNIOR2, t2, remember_me=True)
    assert await svc.validate_refresh_token(t1) is None
    assert await svc.validate_refresh_token(t2) is not None
    wiped = await svc.revoke_all_user_tokens(TUID_USER_JUNIOR2)
    assert wiped >= 1
    assert await svc.validate_refresh_token(t2) is None


# ── Credit atomicity: forced-interleave deducts never overdraft ──────────────

async def test_concurrent_deducts_never_overdraft():
    from app.services.credit_service import CreditService, InsufficientCreditsError
    scope = f"ph2-{uuid.uuid4().hex[:8]}"
    svc = CreditService()
    await svc.add_credits(scope, 10, reason="test")

    orig_save = svc._save_wallet
    arrived = 0
    second_arrived = asyncio.Event()

    async def gated_save(s, wallet):
        # Force both deducts to read before either writes (pre-fix double
        # spend). Post-fix the scope lock serializes them, so the first
        # holder times out waiting and proceeds alone — then the second
        # correctly sees the depleted balance and raises.
        nonlocal arrived
        arrived += 1
        if arrived == 1:
            try:
                await asyncio.wait_for(second_arrived.wait(), timeout=0.5)
            except asyncio.TimeoutError:
                pass
        else:
            second_arrived.set()
        return await orig_save(s, wallet)

    svc._save_wallet = gated_save
    results = await asyncio.gather(
        svc.deduct(scope, 10, action="q1"),
        svc.deduct(scope, 10, action="q2"),
        return_exceptions=True,
    )
    ok = [r for r in results if not isinstance(r, Exception)]
    failed = [r for r in results if isinstance(r, InsufficientCreditsError)]
    # Exactly one winner, one insufficient-funds loser — never two charges on 10 credits
    assert len(ok) == 1, results
    assert len(failed) == 1, results

    svc2 = CreditService()
    assert await svc2.get_balance(scope) == 0
    ledger = await svc2.get_ledger(scope)
    charges = [e for e in ledger if int(e.get("delta", 0)) < 0]
    assert len(charges) == 1, ledger


# ── Keyed email_hash ─────────────────────────────────────────────────────────

class TestKeyedEmailHash:
    def test_hash_is_keyed_not_plain_sha256(self):
        from app.services.field_encryption import email_hash
        legacy = hashlib.sha256(b"user@example.com").hexdigest()
        assert email_hash("user@example.com") != legacy

    def test_hash_stays_deterministic_and_normalized(self):
        from app.services.field_encryption import email_hash
        assert email_hash("User@Example.com") == email_hash("  user@example.com  ")

    def test_candidates_include_legacy(self):
        from app.services.field_encryption import (
            email_hash, email_hash_candidates, email_hash_legacy,
        )
        cands = email_hash_candidates("User@X.com ")
        assert email_hash("user@x.com") in cands
        assert email_hash_legacy("user@x.com") in cands

    async def test_lookup_finds_legacy_hash_user(self):
        import hashlib as _hl
        from app.services.postgres_db import get_storage, generate_id
        from app.services.user_service import get_user_by_email
        email = _unique_email("legacy")
        legacy_hash = _hl.sha256(email.lower().strip().encode()).hexdigest()
        storage = get_storage()
        uid = generate_id()
        await storage.create_document("users", uid, {
            "email": email, "name": "Legacy", "email_hash": legacy_hash,
            "provider": "password",
        })
        found = await get_user_by_email(email)
        assert found is not None
        assert found["uid"] == uid
