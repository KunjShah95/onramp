"""Validate _MODEL_REGISTRY table parity against the dev Postgres database.

These tests run against the REAL Postgres dev DB (not the in-memory backend),
so they are skipped automatically when the DB is unreachable or when
STORAGE_BACKEND=memory cannot be overridden.

They prove two things:

1. Every model registered in ``postgres_db._MODEL_REGISTRY`` has a matching
   table in the database whose columns are a superset of the model's columns
   (``create_all`` / migration parity).

2. The datetime-string coercion + duplicate-PK-drop fixes in postgres_db hold
   for the promoted collections ``member_modules``, ``onramp_tasks`` and
   ``onramp_notifications`` via a create -> read -> delete smoke write done
   through ``get_storage()``.

Convention note: the tests package has no ``__init__.py``; this module follows
that (no package init added).
"""

import asyncio
import os
import uuid
from pathlib import Path

import pytest

# ── Load backend/.env WITHOUT mutating STORAGE_BACKEND / ENV ─────────────────
# IMPORTANT: this module must NOT change os.environ at import/collection time.
# conftest.py forces STORAGE_BACKEND=memory for the rest of the suite; flipping
# it here would leak into every other test module (they'd hit real Postgres).
# We read DATABASE_URL locally and only switch the storage backend inside the
# pg_storage fixture (via monkeypatch, auto-restored on teardown).
_BACKEND_DIR = Path(__file__).resolve().parent.parent


def _read_env_file() -> dict:
    """Parse backend/.env into a dict without touching os.environ."""
    values: dict[str, str] = {}
    env_path = _BACKEND_DIR / ".env"
    if not env_path.exists():
        return values
    for raw in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        values[key.strip()] = val.strip().strip('"').strip("'")
    return values


_ENV = _read_env_file()


def _async_url() -> str | None:
    url = os.environ.get("DATABASE_URL") or _ENV.get("DATABASE_URL")
    if not url:
        return None
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if "?" in url:
        url = url.split("?", 1)[0]
    return url


def _raw_dsn() -> str | None:
    url = _async_url()
    if not url:
        return None
    return url.replace("postgresql+asyncpg://", "postgresql://").replace("+asyncpg", "")


import app.services.postgres_db as postgres_db  # noqa: E402
from app.database.config import db_config  # noqa: E402
from app.database import models as db_models  # noqa: E402
from app.services.postgres_db import _MODEL_REGISTRY, PostgresStorage  # noqa: E402

_DB_URL = _async_url()


def _configure_db_config() -> None:
    """Point the shared db_config singleton at the dev DB (dev-safe values)."""
    db_config.database_url = _DB_URL
    db_config.env = "development"
    db_config.is_production = False
    db_config.ssl_mode = _ENV.get("DB_SSL_MODE", "disable")
    db_config._engine = None
    db_config._session_factory = None
    db_config._engine_loop = None


async def _db_reachable() -> bool:
    """Standalone connectivity probe via raw asyncpg (no app engine touched)."""
    dsn = _raw_dsn()
    if not dsn:
        return False
    try:
        import asyncpg

        conn = await asyncpg.connect(dsn)
        try:
            await conn.execute("SELECT 1")
        finally:
            await conn.close()
        return True
    except Exception:
        return False


_LOOP: asyncio.AbstractEventLoop | None = None


def _get_loop() -> asyncio.AbstractEventLoop:
    """One persistent event loop for the whole module.

    asyncpg connections are bound to the loop that created them, and the
    SQLAlchemy engine pools those connections. Using a single long-lived loop
    (instead of a fresh ``asyncio.run`` per call) keeps the pooled connections
    valid across every create/read/delete step and avoids the Windows
    Proactor 'greenlet_spawn'/'NoneType.send' cross-loop teardown errors.
    """
    global _LOOP
    if _LOOP is None or _LOOP.is_closed():
        _LOOP = asyncio.new_event_loop()
    return _LOOP


def _run(coro):
    return _get_loop().run_until_complete(coro)


_SKIP_REASON = "Dev Postgres DB not reachable / DATABASE_URL unset"
_DB_OK = bool(_DB_URL) and _run(_db_reachable())

pytestmark = pytest.mark.skipif(not _DB_OK, reason=_SKIP_REASON)


# ── Test 1: table + column existence for every registry model ────────────────


def test_every_registry_model_has_matching_table():
    _configure_db_config()

    async def check():
        engine = await db_config.ensure_engine()
        from sqlalchemy import inspect as sa_inspect

        def _collect(sync_conn):
            insp = sa_inspect(sync_conn)
            existing = set(insp.get_table_names())
            report = {}
            for coll, entry in _MODEL_REGISTRY.items():
                model = entry[0]
                table = model.__tablename__
                expected = {c.name for c in model.__table__.columns}
                if table not in existing:
                    report[coll] = ("MISSING_TABLE", table, sorted(expected))
                    continue
                actual = {c["name"] for c in insp.get_columns(table)}
                missing = expected - actual
                if missing:
                    report[coll] = ("MISSING_COLUMNS", table, sorted(missing))
            return report

        async with engine.connect() as conn:
            return await conn.run_sync(_collect)

    failures = _run(check())
    assert not failures, f"Registry/table parity failures: {failures}"


# ── Test 2: create -> read -> delete smoke writes through get_storage() ──────


@pytest.fixture
def pg_storage(monkeypatch):
    """A PostgresStorage bound to the dev DB.

    The env override is applied via monkeypatch so it is auto-reverted at the
    end of the test — it never leaks into other modules that rely on the
    conftest-forced in-memory backend.
    """
    monkeypatch.setenv("STORAGE_BACKEND", "postgres")
    _configure_db_config()
    postgres_db._storage = None
    storage = postgres_db.get_storage()
    assert isinstance(storage, PostgresStorage), (
        "Expected PostgresStorage; got "
        f"{type(storage).__name__}. STORAGE_BACKEND override failed."
    )
    yield storage
    # Dispose the dev engine and drop the singleton so the next (memory-backend)
    # test rebuilds cleanly.
    if db_config._engine is not None:
        _run(db_config._engine.dispose())
        db_config._engine = None
        db_config._session_factory = None
        db_config._engine_loop = None
    postgres_db._storage = None


@pytest.fixture
def temp_user_and_team(pg_storage):
    """Create a throwaway user + team (satisfy FKs) and clean up afterwards."""
    user_id = str(uuid.uuid4())
    team_id = str(uuid.uuid4())

    async def setup():
        # Insert FK parents via raw SQL rather than storage.create_document.
        # (Team.to_dict() lazily loads the `members` relationship, which raises
        # MissingGreenlet under a plain asyncpg session — unrelated to what we
        # are testing. The child-row smoke writes below still go through
        # get_storage() as required.)
        from sqlalchemy import text

        from datetime import datetime, timezone

        engine = await db_config.ensure_engine()
        now = datetime.now(timezone.utc)
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    "INSERT INTO users (id, email, name, provider, is_active,"
                    " is_admin, created_at, updated_at) VALUES (:id, :email,"
                    " :name, 'password', true, false, :now, :now)"
                ),
                {"id": user_id, "email": f"reg-test-{user_id}@example.test",
                 "name": "Registry Test User", "now": now},
            )
            await conn.execute(
                text(
                    "INSERT INTO teams (id, name, is_active, created_at,"
                    " updated_at) VALUES (:id, :name, true, :now, :now)"
                ),
                {"id": team_id, "name": f"reg-test-team-{team_id}", "now": now},
            )

    async def teardown():
        # child rows cascade on team+user delete
        from sqlalchemy import text

        engine = await db_config.ensure_engine()
        async with engine.begin() as conn:
            await conn.execute(text("DELETE FROM teams WHERE id=:id"), {"id": team_id})
            await conn.execute(text("DELETE FROM users WHERE id=:id"), {"id": user_id})

    _run(setup())
    yield user_id, team_id
    _run(teardown())


def test_member_modules_crud_smoke(pg_storage, temp_user_and_team):
    user_id, team_id = temp_user_and_team
    doc_id = str(uuid.uuid4())

    async def flow():
        created = await pg_storage.create_document("member_modules", doc_id, {
            "team_id": team_id,
            "user_id": user_id,
            "module": "auth",
            "granted_by": user_id,
            # datetime supplied as ISO STRING -> exercises datetime coercion fix
            "granted_at": "2026-07-24T10:00:00Z",
            "source": "manual",
        })
        assert created["id"] == doc_id
        fetched = await pg_storage.get_document("member_modules", doc_id)
        assert fetched is not None and fetched["module"] == "auth"
        await pg_storage.delete_document("member_modules", doc_id)
        assert await pg_storage.get_document("member_modules", doc_id) is None

    _run(flow())


def test_onramp_tasks_crud_smoke(pg_storage, temp_user_and_team):
    user_id, team_id = temp_user_and_team
    doc_id = str(uuid.uuid4())

    async def flow():
        # Pass the PK inside data too (DynamicDocument-era callers do this) to
        # exercise the duplicate-PK-drop fix, plus ISO-string timestamps.
        created = await pg_storage.create_document("onramp_tasks", doc_id, {
            "task_id": doc_id,
            "team_id": team_id,
            "created_by": user_id,
            "assigned_to": user_id,
            "title": "Registry smoke task",
            "description": "",
            "unlock_modules": [],
            "created_at": "2026-07-24T10:00:00Z",
            "updated_at": "2026-07-24T10:00:00Z",
        })
        assert created["task_id"] == doc_id
        fetched = await pg_storage.get_document("onramp_tasks", doc_id)
        assert fetched is not None and fetched["title"] == "Registry smoke task"
        await pg_storage.delete_document("onramp_tasks", doc_id)
        assert await pg_storage.get_document("onramp_tasks", doc_id) is None

    _run(flow())


def test_onramp_notifications_crud_smoke(pg_storage, temp_user_and_team):
    user_id, team_id = temp_user_and_team
    doc_id = str(uuid.uuid4())

    async def flow():
        created = await pg_storage.create_document("onramp_notifications", doc_id, {
            "notification_id": doc_id,
            "user_id": user_id,
            "type": "task_assigned",
            "title": "Registry smoke notification",
            "message": "hello",
            "team_id": team_id,
            # 'metadata' key -> translated to notif_metadata ORM attr
            "metadata": {"k": "v"},
            "created_at": "2026-07-24T10:00:00Z",
        })
        assert created["notification_id"] == doc_id
        fetched = await pg_storage.get_document("onramp_notifications", doc_id)
        assert fetched is not None
        assert fetched["metadata"] == {"k": "v"}
        await pg_storage.delete_document("onramp_notifications", doc_id)
        assert await pg_storage.get_document("onramp_notifications", doc_id) is None

    _run(flow())
