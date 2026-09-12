"""Tests for app.services.refresh_token_service (memory-backend paths)."""

import asyncio

import pytest

from app.services import refresh_token_service as svc


@pytest.fixture(autouse=True)
def _memory_backend(monkeypatch):
    monkeypatch.setenv("ENV", "test")
    monkeypatch.setenv("REDIS_URL", "")
    monkeypatch.setenv("JWT_SECRET", "test-secret-min-32-chars-1234567890")
    from app.core.config import reset_settings

    reset_settings()
    yield
    reset_settings()


async def test_generate_and_hash_stable():
    token = svc.generate_refresh_token()
    assert len(token) >= 32
    assert svc.hash_refresh_token(token) == svc.hash_refresh_token(token)
    assert len(svc.hash_refresh_token(token)) == 64


async def test_store_validate_revoke_memory():
    from tests.conftest import TUID_USER_JUNIOR1

    token = svc.generate_refresh_token()
    stored = await svc.store_refresh_token(TUID_USER_JUNIOR1, token, remember_me=True)
    assert stored["token_hash"] == svc.hash_refresh_token(token)
    record = await svc.validate_refresh_token(token)
    assert record is not None
    assert record["user_id"] == TUID_USER_JUNIOR1
    await svc.revoke_refresh_token(token)
    assert await svc.validate_refresh_token(token) is None


async def test_second_store_revokes_first():
    from tests.conftest import TUID_USER_JUNIOR1

    first = svc.generate_refresh_token()
    await svc.store_refresh_token(TUID_USER_JUNIOR1, first, remember_me=True)
    second = svc.generate_refresh_token()
    await svc.store_refresh_token(TUID_USER_JUNIOR1, second, remember_me=True)
    assert await svc.validate_refresh_token(first) is None
    assert await svc.validate_refresh_token(second) is not None


async def test_unknown_token_invalid():
    assert await svc.validate_refresh_token("definitely-not-a-real-token") is None


async def test_lock_serializes_concurrent_holders():
    from tests.conftest import TUID_USER_JUNIOR2

    order: list[str] = []

    async def holder(name: str):
        async with svc.acquire_refresh_lock(TUID_USER_JUNIOR2):
            order.append(f"{name}-in")
            await asyncio.sleep(0.05)
            order.append(f"{name}-out")

    await asyncio.gather(holder("a"), holder("b"))
    # One holder fully completes before the other starts (no interleave).
    assert order in (
        ["a-in", "a-out", "b-in", "b-out"],
        ["b-in", "b-out", "a-in", "a-out"],
    )
