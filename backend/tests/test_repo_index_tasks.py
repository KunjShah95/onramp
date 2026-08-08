"""Tests for the repo-index Celery tasks (pre-build + scheduled refresh).

Covers the pre-build primitive (``build_repo_index``), the nightly sweep
(``refresh_repo_indexes``) that fans out to it, and the staleness/URL
helpers — all in Celery eager mode with the clone/parse step
monkeypatched, so no network I/O ever happens.
"""

from datetime import datetime, timedelta, timezone

import asyncio

import pytest

from app.services.repo_context import RepoContextService, index_id_for
from app.services.postgres_db import get_storage
from app.tasks import repo_index_tasks
from app.tasks.repo_index_tasks import build_repo_index, refresh_repo_indexes

FRESH_URL = "https://github.com/acme/fresh"
MISSING_URL = "https://github.com/acme/missing"
STALE_URL = "https://github.com/acme/stale"


def _run(coro):
    """Run an async seeding/assertion coroutine from a sync test.

    Celery tasks run their own event loop (asyncio.new_event_loop), so they
    must be driven from sync tests — calling them from pytest-asyncio tests
    collides with the running loop (same pattern as the analytics tests).
    """
    return asyncio.run(coro)

MINI_ENTITIES = {
    "files": [
        {
            "path": "src/auth/login.py",
            "language": "python",
            "classes": [{"name": "LoginHandler"}],
            "functions": [{"name": "validate_credentials"}],
            "imports": ["flask"],
            "exports": [],
            "dependencies": ["flask"],
        },
        {
            "path": "src/db/models.py",
            "language": "python",
            "classes": [{"name": "User"}],
            "functions": [{"name": "get_user_by_email"}],
            "imports": ["sqlalchemy"],
            "exports": [],
            "dependencies": ["sqlalchemy"],
        },
    ],
    "classes": [
        {"name": "LoginHandler", "file": "src/auth/login.py", "language": "python"},
        {"name": "User", "file": "src/db/models.py", "language": "python"},
    ],
    "functions": [
        {"name": "validate_credentials", "file": "src/auth/login.py", "language": "python"},
        {"name": "get_user_by_email", "file": "src/db/models.py", "language": "python"},
    ],
    "imports": [
        {"module": "flask", "file": "src/auth/login.py", "language": "python"},
        {"module": "sqlalchemy", "file": "src/db/models.py", "language": "python"},
    ],
    "exports": [],
    "module_map": {"login": "src/auth/login.py", "models": "src/db/models.py"},
}

MINI_GRAPH = {
    "modules": ["src/auth/login.py", "src/db/models.py"],
    "dependencies": {"src/auth/login.py": ["flask"]},
    "topology": ["src/auth/login.py"],
    "circular_dependencies": [],
    "services": [],
    "architecture_pattern": "monolith",
    "architecture_diagram": "",
    "is_collapsed": False,
}


def _doc(url: str, branch: str = "main", age_hours: float = 0.0) -> dict:
    return {
        "index_id": index_id_for(url, branch),
        "repo_url": url,
        "branch": branch,
        "commit": "abc123",
        "built_at": (datetime.now(timezone.utc) - timedelta(hours=age_hours)).isoformat(),
        "cached": False,
        "stats": {"file_count": 2, "class_count": 2, "function_count": 2, "import_count": 2},
        "entities": MINI_ENTITIES,
        "graph": MINI_GRAPH,
    }


@pytest.fixture(autouse=True)
def _eager_celery():
    """Run tasks synchronously without a broker (mirrors test_celery_tasks)."""
    import importlib

    importlib.import_module("app.tasks.repo_index_tasks")
    from app.tasks.celery_app import celery_app as app

    old_eager = app.conf.task_always_eager
    old_broker = app.conf.broker_url
    try:
        app.conf.update(
            task_always_eager=True,
            broker_url="memory://",
            task_eager_propagates=True,
        )
        yield
    finally:
        app.conf.update(task_always_eager=old_eager, broker_url=old_broker)


def _patch_clone_parse(monkeypatch):
    """Replace clone/parse with fixture data; count clone calls."""
    calls = {"n": 0}

    async def fake_clone(self, url, branch="main"):
        calls["n"] += 1
        return "/tmp/fake_repo"

    async def fake_head(path):
        return "abc123"

    async def fake_parse(self, path, max_files=1000):
        return MINI_ENTITIES

    monkeypatch.setattr("app.services.github_service.GitHubService.clone_repo", fake_clone)
    monkeypatch.setattr(RepoContextService, "_head_commit", staticmethod(fake_head))
    monkeypatch.setattr("app.services.parser_service.ParserService.parse_directory", fake_parse)
    return calls


class _FakeBuilder:
    """Stand-in for the build_repo_index task; records apply_async calls.

    Patched at the MODULE level (``repo_index_tasks.build_repo_index``) so
    the sweep task's global lookup resolves to it — a Celery Task instance's
    own attributes are not a reliable interception point (its instance dict
    can be swapped when a task is finalized/run).
    """

    def __init__(self):
        self.calls = []

    def apply_async(self, args=None, kwargs=None, queue=None, **extra):
        self.calls.append({"args": list(args or []), "kwargs": kwargs or {}, "queue": queue})
        return None


def _patch_builder(monkeypatch):
    fake = _FakeBuilder()
    monkeypatch.setattr(repo_index_tasks, "build_repo_index", fake)
    return fake


class TestBuildRepoIndexTask:
    def test_prebuilds_and_persists_document(self, monkeypatch):
        calls = _patch_clone_parse(monkeypatch)
        url = "https://github.com/acme/app"

        result = build_repo_index.delay(url, branch="main").get(timeout=10)

        assert result["repo_url"] == url
        assert result["branch"] == "main"
        assert result["cached"] is False
        assert result["file_count"] == 2
        assert result["index_id"] == index_id_for(url, "main")

        # Second build serves from cache — clone must NOT be called again.
        result2 = build_repo_index.delay(url, branch="main").get(timeout=10)
        assert result2["cached"] is True
        assert calls["n"] == 1

    def test_force_rebuilds(self, monkeypatch):
        calls = _patch_clone_parse(monkeypatch)
        url = "https://github.com/acme/app"

        build_repo_index.delay(url).get(timeout=10)
        build_repo_index.delay(url, force=True).get(timeout=10)

        # force=True bypasses the cache — the repo is re-cloned + re-parsed.
        assert calls["n"] == 2
        # ...and the cache holds a fresh document afterwards.
        doc = _run(RepoContextService().get(index_id_for(url, "main")))
        assert doc is not None
        assert doc["stats"]["file_count"] == 2


class TestRefreshRepoIndexes:
    def test_sweep_enqueues_missing_and_stale_only(self, monkeypatch):
        async def _seed():
            storage = get_storage()
            svc = RepoContextService()
            await storage.create_document(
                "repositories", "r1", {"owner": "acme", "name": "fresh", "url": FRESH_URL}
            )
            await storage.create_document(
                "repositories", "r2", {"owner": "acme", "name": "missing", "url": MISSING_URL}
            )
            await storage.create_document(
                "repositories", "r3", {"owner": "acme", "name": "stale", "url": STALE_URL}
            )
            # r1 fresh (just built), r3 stale (25h old — past the 20h threshold).
            await svc.set(index_id_for(FRESH_URL, "main"), _doc(FRESH_URL))
            await svc.set(index_id_for(STALE_URL, "main"), _doc(STALE_URL, age_hours=25))

        _run(_seed())
        fake = _patch_builder(monkeypatch)

        result = refresh_repo_indexes.delay().get(timeout=10)

        assert result["total_repos"] == 3
        assert result["fresh_indexes"] == 1
        assert result["enqueued_builds"] == 2
        assert result["skipped"] == 0
        assert result["failed"] == 0

        urls = [c["args"][0] for c in fake.calls]
        assert MISSING_URL in urls
        assert STALE_URL in urls
        assert FRESH_URL not in urls
        # A present-but-stale doc must be forced (or build(force=False) would
        # just return the cached doc without re-cloning); a missing doc can
        # build unforced since there is no cache to short-circuit.
        by_url = {c["args"][0]: c for c in fake.calls}
        assert by_url[STALE_URL]["kwargs"]["force"] is True
        assert by_url[MISSING_URL]["kwargs"]["force"] is False

    def test_sweep_force_rebuilds_everything(self, monkeypatch):
        async def _seed():
            storage = get_storage()
            await storage.create_document(
                "repositories", "r1", {"owner": "acme", "name": "fresh", "url": FRESH_URL}
            )
            await RepoContextService().set(index_id_for(FRESH_URL, "main"), _doc(FRESH_URL))

        _run(_seed())
        fake = _patch_builder(monkeypatch)

        result = refresh_repo_indexes.delay(force=True).get(timeout=10)

        assert result["fresh_indexes"] == 0
        assert result["enqueued_builds"] == 1
        assert len(fake.calls) == 1
        assert fake.calls[0]["kwargs"]["force"] is True

    def test_sweep_skips_repos_without_url(self, monkeypatch):
        async def _seed():
            await get_storage().create_document(
                "repositories", "r1", {"owner": "", "name": "", "url": ""}
            )

        _run(_seed())
        fake = _patch_builder(monkeypatch)

        result = refresh_repo_indexes.delay().get(timeout=10)

        assert result["total_repos"] == 1
        assert result["skipped"] == 1
        assert result["enqueued_builds"] == 0
        assert fake.calls == []

    def test_synthesizes_url_from_owner_name(self):
        assert repo_index_tasks._repo_url_from(
            {"owner": "acme", "name": "app"}
        ) == "https://github.com/acme/app"
        assert repo_index_tasks._repo_url_from(
            {"owner": "acme", "name": "app", "url": "https://git.example.com/x"}
        ) == "https://git.example.com/x"
        assert repo_index_tasks._repo_url_from({"owner": "", "name": ""}) is None

    def test_staleness_helpers(self):
        assert repo_index_tasks._index_is_stale(None, 20) is True
        assert repo_index_tasks._index_is_stale({}, 20) is True
        assert repo_index_tasks._index_is_stale(
            _doc("https://github.com/acme/app", age_hours=25), 20
        ) is True
        assert repo_index_tasks._index_is_stale(
            _doc("https://github.com/acme/app", age_hours=1), 20
        ) is False
        # Malformed timestamps count as stale.
        bad = _doc("https://github.com/acme/app")
        bad["built_at"] = "not-a-timestamp"
        assert repo_index_tasks._index_is_stale(bad, 20) is True

    def test_cold_window_docs_count_as_stale(self):
        """Docs about to TTL out (within the 2h cold window) rebuild now.

        A fixed nightly sweep is the only chance to rebuild until the next
        night: a doc just under max_age at sweep time would otherwise expire
        before the next sweep and go cold. Default TTL is 24h, so anything
        older than ~22h is treated as stale by the sweep (max_age 20h is a
        no-op here because the cold window comes first).
        """
        # 19h old: under max_age (20h) and outside the cold window (22h+) -> fresh.
        assert repo_index_tasks._index_is_stale(
            _doc("https://github.com/acme/app", age_hours=19), 20
        ) is False
        # 23h old: inside the cold window (22-24h of a 24h TTL) -> stale.
        assert repo_index_tasks._index_is_stale(
            _doc("https://github.com/acme/app", age_hours=23), 20
        ) is True
        # 25h old: past max_age -> stale (the plain age rule).
        assert repo_index_tasks._index_is_stale(
            _doc("https://github.com/acme/app", age_hours=25), 20
        ) is True
        # A custom cold window shifts the threshold.
        assert repo_index_tasks._index_is_stale(
            _doc("https://github.com/acme/app", age_hours=10), 12, ttl_hours=12,
            cold_window_hours=12,
        ) is True  # 10h into a 12h TTL = within the last 12h

    def test_sweep_rebuilds_cold_window_docs(self, monkeypatch):
        """A 23h-old doc (about to TTL out of the 24h cache) is enqueued."""
        async def _seed():
            await get_storage().create_document(
                "repositories", "r1", {"owner": "acme", "name": "cooling", "url": FRESH_URL}
            )
            await RepoContextService().set(
                index_id_for(FRESH_URL, "main"), _doc(FRESH_URL, age_hours=23)
            )

        _run(_seed())
        fake = _patch_builder(monkeypatch)

        result = refresh_repo_indexes.delay().get(timeout=10)

        assert result["fresh_indexes"] == 0
        assert result["enqueued_builds"] == 1
        # It has a cached doc, so the refresh must force the re-clone.
        assert fake.calls[0]["kwargs"]["force"] is True

    def test_sweep_to_build_integration(self, monkeypatch):
        """Sweep -> real build task -> persisted index, end to end.

        The sweep's enqueue decision is captured, then the real build task is
        executed via the proven eager ``.delay()`` path and its output is
        verified in the cache — proving the composition the nightly sweep
        relies on: stale doc -> forced rebuild -> fresh persisted index.
        """
        _patch_clone_parse(monkeypatch)

        async def _seed():
            await get_storage().create_document(
                "repositories", "r1", {"owner": "acme", "name": "app", "url": STALE_URL}
            )
            # Stale (25h) so the sweep enqueues a FORCED rebuild of a real doc.
            await RepoContextService().set(
                index_id_for(STALE_URL, "main"), _doc(STALE_URL, age_hours=25)
            )

        _run(_seed())
        fake = _patch_builder(monkeypatch)

        result = refresh_repo_indexes.delay().get(timeout=10)
        assert result["enqueued_builds"] == 1
        assert result["failed"] == 0

        # The sweep decided on a FORCED rebuild of the real repo.
        call = fake.calls[0]
        assert call["args"][0] == STALE_URL
        assert call["kwargs"]["force"] is True
        assert call["queue"] == "agent-tasks"

        # Execute exactly what the sweep enqueued, through the real task.
        # NOTE: the module-level import above binds the REAL task object, so
        # .delay() hits Celery's registry even though the sweep saw the fake.
        built = build_repo_index.delay(
            call["args"][0],
            branch=call["kwargs"]["branch"],
            force=call["kwargs"]["force"],
        ).get(timeout=10)
        assert built["cached"] is False

        # The cache now holds a FRESH document, not the 25h stub.
        doc = _run(RepoContextService().get(index_id_for(STALE_URL, "main")))
        assert doc is not None
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(doc["built_at"]))
        assert age.total_seconds() / 3600 < 1
        assert doc["stats"]["file_count"] == 2


class TestBuildRepoIndexRetry:
    def test_build_retries_on_failure(self, monkeypatch):
        """A failed clone surfaces Celery's retry/exception semantics."""
        from celery.exceptions import Retry

        async def failing_clone(self, url, branch="main"):
            raise RuntimeError("clone exploded")

        monkeypatch.setattr(
            "app.services.github_service.GitHubService.clone_repo", failing_clone
        )

        with pytest.raises(Retry):
            build_repo_index.delay("https://github.com/acme/fail").get(timeout=10)
