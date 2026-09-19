"""Regression tests for two shipped reliability fixes.

1. ``audit_service.log_event`` must store ``team_id=None`` (never ``""``) when
   no team is given — Postgres rejects ``""`` for the nullable UUID column
   (``invalid UUID '': length must be between 32..36 characters``), which
   turned every ``POST /auth/login`` into a 500.
2. ``cache_service._cache_key`` must return ``"<prefix>:<md5>"`` so
   ``invalidate_prefix("tasks")`` (which deletes ``"tasks:*"``) actually
   clears cached GET responses. The old bare-md5 keys never matched, leaving
   stale responses (e.g. empty task lists) for the full TTL.
"""

from types import SimpleNamespace

import pytest

from app.services import audit_service, cache_service


def _stub_request(uid="u1", path="/api/v1/tasks", query=None):
    return SimpleNamespace(
        method="GET",
        headers={},
        state=SimpleNamespace(user={"uid": uid} if uid else {}),
        url=SimpleNamespace(path=path),
        query_params=dict(query or {}),
    )


class TestLogEventTeamId:
    async def test_missing_team_id_stored_as_none(self, storage):
        event = await audit_service.log_event("login_success", "actor-1", "actor-1")
        assert event["team_id"] is None
        stored = await storage.get_document(audit_service.COLLECTION, event["event_id"])
        assert stored["team_id"] is None

    async def test_empty_team_id_normalized_to_none(self, storage):
        for blank in ("", "   "):
            event = await audit_service.log_event(
                "login_success", "actor-1", "actor-1", team_id=blank
            )
            assert event["team_id"] is None
            stored = await storage.get_document(audit_service.COLLECTION, event["event_id"])
            assert stored["team_id"] is None

    async def test_valid_team_id_preserved(self, storage):
        team_id = "1f7e47fe-591e-4183-bf81-4aac27bf5e2f"
        event = await audit_service.log_event(
            "task_created", "actor-1", "task-1", team_id=team_id
        )
        assert event["team_id"] == team_id


class FakeRedis:
    """Minimal async Redis surface used by cache_service (get/setex/keys/delete)."""

    def __init__(self):
        self.store = {}

    async def get(self, key):
        return self.store.get(key)

    async def setex(self, key, ttl, value):
        self.store[key] = value
        return True

    async def keys(self, pattern):
        import fnmatch

        return [k for k in self.store if fnmatch.fnmatch(k, pattern)]

    async def delete(self, *keys):
        removed = 0
        for k in keys:
            if k in self.store:
                del self.store[k]
                removed += 1
        return removed


@pytest.fixture
def fake_redis(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(cache_service, "_client", fake)
    return fake


class TestCacheKeyPrefix:
    def test_key_carries_prefix(self):
        key = cache_service._cache_key("tasks", _stub_request())
        assert key.startswith("tasks:")

    def test_keys_isolate_users_and_queries(self):
        a = cache_service._cache_key("tasks", _stub_request(uid="u1"))
        b = cache_service._cache_key("tasks", _stub_request(uid="u2"))
        c = cache_service._cache_key("tasks", _stub_request(query={"team_id": "t1"}))
        d = cache_service._cache_key("tasks", _stub_request())
        assert len({a, b, c}) == 3
        assert d == a  # deterministic for identical inputs

    async def test_set_get_invalidate_roundtrip(self, fake_redis):
        req = _stub_request()
        assert await cache_service.get_cached("tasks", req) is None
        assert await cache_service.set_cached("tasks", req, '{"ok": true}') is True
        assert await cache_service.get_cached("tasks", req) == '{"ok": true}'

        # An unrelated prefix must survive invalidation.
        other = _stub_request(path="/api/v1/teams")
        await cache_service.set_cached("dashboard", other, '{"teams": []}')

        assert await cache_service.invalidate_prefix("tasks") >= 1
        assert await cache_service.get_cached("tasks", req) is None
        assert await cache_service.get_cached("dashboard", other) == '{"teams": []}'
