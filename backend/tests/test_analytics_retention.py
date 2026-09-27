"""Retention enforcement for first-party analytics events.

The Privacy page tells visitors this data does not accumulate indefinitely.
That claim is only true if something deletes it, so these tests cover the sweep
itself rather than the schedule that triggers it.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.api.v1 import analytics as analytics_mod
from app.tasks import analytics_tasks


class FakeStorage:
    def __init__(self, rows):
        self.rows = rows
        self.deleted_ids = []
        self.deleted_collections = []

    async def query_documents(self, collection, filters):
        assert collection == analytics_mod.COLLECTION
        field, op, value = filters[0]
        assert field == "day" and op == "<"
        return [r for r in self.rows if r.get("day", "") < value]

    async def delete_documents(self, collection, doc_ids):
        self.deleted_collections.append(collection)
        self.deleted_ids.extend(doc_ids)
        return len(doc_ids)


def _row(day: str, i: int):
    return {"id": f"doc-{day}-{i}", "day": day}


@pytest.fixture
def fake_storage(monkeypatch):
    holder = {}

    def install(rows):
        fake = FakeStorage(rows)
        holder["fake"] = fake
        return fake

    import app.services.postgres_db as pg

    original = pg.get_storage

    def _patched():
        return holder["fake"]

    monkeypatch.setattr(pg, "get_storage", _patched)
    return install, original


def _run_task():
    return analytics_tasks.purge_analytics_events.run()


def test_deletes_only_events_past_the_retention_window(fake_storage):
    today = datetime.now(timezone.utc)
    fresh = (today - timedelta(days=1)).strftime("%Y-%m-%d")
    edge = (today - timedelta(days=analytics_mod.RETENTION_DAYS)).strftime("%Y-%m-%d")
    stale = (today - timedelta(days=analytics_mod.RETENTION_DAYS + 5)).strftime("%Y-%m-%d")
    ancient = (today - timedelta(days=900)).strftime("%Y-%m-%d")

    install, _ = fake_storage
    fake = install([_row(fresh, 1), _row(edge, 2), _row(stale, 3), _row(ancient, 4)])

    result = _run_task()

    # Fresh and exactly-at-the-boundary rows survive; only older ones go.
    assert set(fake.deleted_ids) == {"doc-%s-3" % stale, "doc-%s-4" % ancient}
    assert result["deleted"] == 2
    assert fake.deleted_collections == [analytics_mod.COLLECTION]


def test_noop_when_nothing_is_stale(fake_storage):
    today = datetime.now(timezone.utc)
    install, _ = fake_storage
    fake = install([_row((today - timedelta(days=1)).strftime("%Y-%m-%d"), 1)])

    result = _run_task()

    assert result["deleted"] == 0
    assert fake.deleted_ids == []


def test_default_retention_window_is_sane():
    # Long enough to analyse a cohort, short enough to be defensible.
    assert 30 <= analytics_mod.RETENTION_DAYS <= 400
