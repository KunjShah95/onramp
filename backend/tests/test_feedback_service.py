"""Feedback service tests against the in-memory storage backend."""

import os

import pytest

os.environ.setdefault("STORAGE_BACKEND", "memory")

from app.services.feedback_service import FeedbackService, FEEDBACK_FEATURES


@pytest.fixture
def service(monkeypatch):
    monkeypatch.setenv("STORAGE_BACKEND", "memory")
    import app.services.postgres_db as pdb
    monkeypatch.setattr(pdb, "_storage", None)  # fresh in-memory store per test
    return FeedbackService()


@pytest.mark.asyncio
async def test_add_and_aggregate_feedback(service):
    await service.add_feedback("u1", "ask", 1, context={"index_id": "abc"})
    await service.add_feedback("u1", "ask", -1, comment="answer cited wrong file")
    await service.add_feedback("u2", "pr_review", 1)

    stats = await service.stats()
    assert stats["total"] == 3
    assert stats["up"] == 2
    assert stats["down"] == 1
    assert stats["by_feature"]["ask"] == {"up": 1, "down": 1}
    assert stats["by_feature"]["pr_review"] == {"up": 1, "down": 0}
    assert stats["satisfaction"] == round(2 / 3, 3)


@pytest.mark.asyncio
async def test_stats_filtered_by_feature(service):
    await service.add_feedback("u1", "ask", 1)
    await service.add_feedback("u1", "quiz", -1)

    stats = await service.stats(feature="quiz")
    assert stats["total"] == 1
    assert list(stats["by_feature"]) == ["quiz"]


@pytest.mark.asyncio
async def test_empty_stats(service):
    stats = await service.stats()
    assert stats["total"] == 0
    assert stats["satisfaction"] is None


@pytest.mark.asyncio
async def test_rejects_unknown_feature(service):
    with pytest.raises(ValueError, match="Unknown feature"):
        await service.add_feedback("u1", "not-a-feature", 1)


@pytest.mark.asyncio
async def test_rejects_invalid_rating(service):
    with pytest.raises(ValueError, match="rating"):
        await service.add_feedback("u1", "ask", 5)


@pytest.mark.asyncio
async def test_recent_returns_newest_first(service):
    for i in range(3):
        await service.add_feedback("u1", "ask", 1, context={"n": i})
    recent = await service.recent(limit=2)
    assert len(recent) == 2
    assert recent[0]["context"]["n"] == 2


def test_feature_registry_is_sane():
    assert "ask" in FEEDBACK_FEATURES
    assert "pr_review" in FEEDBACK_FEATURES
