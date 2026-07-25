import os

# Must be set before any app module reads them at import time.
os.environ.setdefault("STORAGE_BACKEND", "memory")
os.environ.setdefault("ENV", "test")
# app.main instantiates LLMClient() at import; without at least one provider
# key it raises RuntimeError during test collection (see llm.py).
os.environ.setdefault("GROQ_API_KEY", "test-llm-key")
# Fernet key for field_encryption PII tests (32-byte base64-urlsafe key)
os.environ.setdefault("PII_ENCRYPTION_KEY", "Yk9yLVlpN1RaMkVTSnRiV3hBZ01GdWpGS2U0dUdnMkU=")
# DATABASE_URL for --run-postgres tests. The .env file would provide this at
# runtime, but at test-collection time DatabaseConfig.__init__() reads it once.
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://onramp:postgres_password@localhost:5432/onramp",
)

import pytest


# ── Deterministic UUIDs for test entities ──────────────────────────────
# These are valid UUIDs (36 chars with hyphens) used by task/notification
# tests for entities that have FK constraints in PostgreSQL.

# NOTE: all UUIDs use ONLY hex digits (0-9, a-f). PostgreSQL rejects
# non-hex characters like 'j', 's', 'u' in UUID columns.
TUID_USER_SENIOR = "f0000000-0000-4000-a000-000000000001"
TUID_USER_JUNIOR1 = "f0000000-0000-4000-a000-000000000002"
TUID_USER_JUNIOR2 = "f0000000-0000-4000-a000-000000000003"
TUID_USER_USER1 = "f0000000-0000-4000-a000-00000000000a"
TUID_USER_USER2 = "f0000000-0000-4000-a000-00000000000b"
TUID_TEAM_ALPHA = "f0000000-0000-4000-b000-000000000001"
TUID_TEAM_BETA = "f0000000-0000-4000-b000-000000000002"
TUID_TEAM_EMPTY = "f0000000-0000-4000-b000-000000000003"

# Gamification test users (alice, bob, charlie, newbie, ghost)
TUID_GAMING_ALICE = "f0000000-0000-4000-c000-000000000001"
TUID_GAMING_BOB = "f0000000-0000-4000-c000-000000000002"
TUID_GAMING_CHARLIE = "f0000000-0000-4000-c000-000000000003"
TUID_GAMING_NEWBIE = "f0000000-0000-4000-c000-000000000004"
TUID_GAMING_GHOST = "f0000000-0000-4000-c000-000000000005"
TUID_GAMING_USER0 = "f0000000-0000-4000-c000-000000000010"
TUID_GAMING_USER1 = "f0000000-0000-4000-c000-000000000011"
TUID_GAMING_USER2 = "f0000000-0000-4000-c000-000000000012"
TUID_GAMING_USER3 = "f0000000-0000-4000-c000-000000000013"
TUID_GAMING_USER4 = "f0000000-0000-4000-c000-000000000014"

# A UUID guaranteed to never exist in any test data
TUID_NONEXISTENT = "f0000000-0000-4000-ffff-000000000000"


# Tables truncated between tests when running against PostgreSQL.
_POSTGRES_CLEAN_TABLES = [
    "onramp_tasks",
    "member_modules",
    "onramp_notifications",
    "onramp_notification_preferences",
    "onramp_gamification_xp",
    "onramp_gamification_badges",
    "onramp_gamification_streaks",
]


def pytest_addoption(parser):
    parser.addoption(
        "--run-postgres", action="store_true", default=False,
        help="Also run parametrized tests against PostgreSQL (requires DATABASE_URL)",
    )


@pytest.fixture(autouse=True)
def _reset_storage():
    """Give every test a fresh storage instance.

    get_storage() caches a module-level singleton, so without this reset
    data seeded by one test (e.g. teams, memberships) would leak into the next.
    """
    import app.services.postgres_db as postgres_db

    postgres_db._storage = None
    yield
    postgres_db._storage = None


@pytest.fixture
def storage():
    from app.services.postgres_db import get_storage

    return get_storage()


# ═══════════════════════════════════════════════════════════════════════
# Dual-backend testing fixtures
# ═══════════════════════════════════════════════════════════════════════
#
# Test files override `storage_backend` with a parametrized version and
# use `pytestmark` to include `clean_postgres_tables`. Example:
#
#   # At top of test_task_service.py:
#   pytestmark = pytest.mark.usefixtures("clean_postgres_tables")
#
#   @pytest.fixture(params=["memory", "postgres"])
#   def storage_backend(request):
#       ...
#


@pytest.fixture
def storage_backend():
    """Return the current storage backend type ('memory' or 'postgres').

    Override this in a test file with a parametrized version to run tests
    against multiple backends. Default is 'memory'.
    """
    return os.environ.get("STORAGE_BACKEND", "memory") or "postgres"


@pytest.fixture
async def clean_postgres_tables(storage_backend):
    """Truncate dynamic tables before each test when running against PostgreSQL.

    Include via pytestmark in test files that test against PostgresStorage.
    Depends on storage_backend (parametrized or not) to determine the backend.
    """
    if storage_backend != "postgres":
        return

    from app.database.config import db_config
    from sqlalchemy import text

    await db_config.ensure_engine()
    factory = db_config.get_session_factory()
    async with factory() as session:
        for table in _POSTGRES_CLEAN_TABLES:
            await session.execute(text(f"TRUNCATE TABLE {table} CASCADE"))
        await session.commit()


@pytest.fixture
async def seed_test_base(storage_backend, clean_postgres_tables):
    """Seed minimal users and teams for FK constraint satisfaction.

    Creates entities with the deterministic UUIDs defined above so that
    task and notification tests can reference them when running against
    PostgreSQL (where FK constraints are enforced).

    This fixture is a no-op for InMemoryStorage (no FK constraints there).
    """
    if storage_backend != "postgres":
        return

    from app.services.postgres_db import get_storage, generate_id
    from datetime import datetime, timezone

    storage = get_storage()
    now = datetime.now(timezone.utc)

    # Create test users (password not needed for FK-only references)
    test_users = [
        (TUID_USER_SENIOR, "Test Senior"),
        (TUID_USER_JUNIOR1, "Test Junior 1"),
        (TUID_USER_JUNIOR2, "Test Junior 2"),
        (TUID_USER_USER1, "Test User 1"),
        (TUID_USER_USER2, "Test User 2"),
        # Gamification test users
        (TUID_GAMING_ALICE, "Alice"),
        (TUID_GAMING_BOB, "Bob"),
        (TUID_GAMING_CHARLIE, "Charlie"),
        (TUID_GAMING_NEWBIE, "Newbie"),
        (TUID_GAMING_GHOST, "Ghost"),
        (TUID_GAMING_USER0, "User 0"),
        (TUID_GAMING_USER1, "User 1"),
        (TUID_GAMING_USER2, "User 2"),
        (TUID_GAMING_USER3, "User 3"),
        (TUID_GAMING_USER4, "User 4"),
    ]
    for uid, name in test_users:
        existing = await storage.get_document("users", uid)
        if not existing:
            await storage.create_document("users", uid, {
                "email": f"{name.lower().replace(' ', '.')}@test.com",
                "name": name,
                "email_hash": f"hash-{uid[:8]}",
                "provider": "password",
                "password_hash": "test-hash",
                "is_active": True,
                "is_admin": False,
                "created_at": now,
                "updated_at": now,
            })

    # Create test teams
    test_teams = [
        (TUID_TEAM_ALPHA, "Alpha Team", "Test team alpha"),
        (TUID_TEAM_BETA, "Beta Team", "Test team beta"),
        (TUID_TEAM_EMPTY, "Empty Team", "Empty team for edge-case tests"),
    ]
    for tid, tname, tdesc in test_teams:
        existing = await storage.get_document("teams", tid)
        if not existing:
            await storage.create_document("teams", tid, {
                "name": tname,
                "description": tdesc,
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            })
