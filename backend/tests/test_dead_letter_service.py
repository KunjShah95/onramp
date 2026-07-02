"""Dead-letter queue tests against the in-memory storage backend."""

import os
from datetime import datetime, timedelta, timezone

import pytest

os.environ.setdefault("STORAGE_BACKEND", "memory")

from app.services.dead_letter_service import DeadLetterService, PENDING, RESOLVED, DEAD


@pytest.fixture
def service(monkeypatch):
    monkeypatch.setenv("STORAGE_BACKEND", "memory")
    import app.services.postgres_db as pdb
    monkeypatch.setattr(pdb, "_storage", None)  # fresh in-memory store per test
    return DeadLetterService(max_attempts=3, base_backoff_seconds=60)


def make_due(entry_time=None):
    """next_retry_at in the past so replay_due picks the entry up."""
    return (entry_time or datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()


async def force_due(service, entry_id):
    await service.storage.update_document(
        service.COLLECTION, entry_id, {"next_retry_at": make_due()}
    )


@pytest.mark.asyncio
async def test_record_failure_creates_pending_entry(service):
    entry = await service.record_failure("email", {"to": "a@b.c"}, "boom")
    assert entry["status"] == PENDING
    assert entry["attempts"] == 1
    assert entry["next_retry_at"] > datetime.now(timezone.utc).isoformat()
    assert (await service.stats())[PENDING] == 1


@pytest.mark.asyncio
async def test_replay_success_resolves_entry(service):
    entry = await service.record_failure("email", {"to": "a@b.c"}, "boom")
    await force_due(service, entry["id"])

    async def handler(payload):
        assert payload == {"to": "a@b.c"}
        return True

    result = await service.replay_due({"email": handler})
    assert result == {"replayed": 1, "succeeded": 1, "failed": 0, "buried": 0}
    assert (await service.stats())[RESOLVED] == 1


@pytest.mark.asyncio
async def test_replay_failure_backs_off_then_buries(service):
    entry = await service.record_failure("email", {"to": "a@b.c"}, "boom")

    async def handler(payload):
        return False

    # attempt 2: still pending with pushed-out retry time
    await force_due(service, entry["id"])
    result = await service.replay_due({"email": handler})
    assert result["failed"] == 1 and result["buried"] == 0
    stored = await service.storage.get_document(service.COLLECTION, entry["id"])
    assert stored["status"] == PENDING
    assert stored["attempts"] == 2
    assert stored["next_retry_at"] > datetime.now(timezone.utc).isoformat()

    # attempt 3 hits max_attempts: buried
    await force_due(service, entry["id"])
    result = await service.replay_due({"email": handler})
    assert result["buried"] == 1
    stored = await service.storage.get_document(service.COLLECTION, entry["id"])
    assert stored["status"] == DEAD


@pytest.mark.asyncio
async def test_replay_skips_not_yet_due_entries(service):
    await service.record_failure("email", {"to": "a@b.c"}, "boom")  # retry in the future

    async def handler(payload):
        return True

    result = await service.replay_due({"email": handler})
    assert result["replayed"] == 0


@pytest.mark.asyncio
async def test_replay_skips_unknown_job_types(service):
    entry = await service.record_failure("carrier_pigeon", {}, "flew away")
    await force_due(service, entry["id"])

    async def handler(payload):
        return True

    result = await service.replay_due({"email": handler})
    assert result["replayed"] == 0


@pytest.mark.asyncio
async def test_handler_exception_counts_as_failure(service):
    entry = await service.record_failure("email", {"to": "a@b.c"}, "boom")
    await force_due(service, entry["id"])

    async def handler(payload):
        raise RuntimeError("still broken")

    result = await service.replay_due({"email": handler})
    assert result["failed"] == 1
    stored = await service.storage.get_document(service.COLLECTION, entry["id"])
    assert "still broken" in stored["last_error"]


@pytest.mark.asyncio
async def test_list_entries_newest_first_with_status_filter(service):
    await service.record_failure("email", {"n": 1}, "e1")
    await service.record_failure("email", {"n": 2}, "e2")
    entries = await service.list_entries(status=PENDING)
    assert len(entries) == 2
    assert entries[0]["created_at"] >= entries[1]["created_at"]
