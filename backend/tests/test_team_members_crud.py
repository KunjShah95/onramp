"""Regression tests for auto-increment PK collections (team_members).

Covers the bug where the Postgres storage layer called ``getattr(model,
pk_field)`` with ``pk_field=None`` — the sentinel for auto-increment integer
PKs — in the get/update/delete paths. That raised ``TypeError: attribute
name must be string, not 'NoneType'`` and broke any service operating on
memberships, most visibly ``deactivate_user`` (step 1 removes the user from
all teams) and role updates via ``update_document("team_members", ...)``.

By default runs against InMemoryStorage. Pass --run-postgres to also run
against PostgreSQL:
  pytest tests/test_team_members_crud.py --run-postgres
"""

import os
import uuid
from datetime import datetime, timezone

import pytest

from app.services import user_service
from app.services.postgres_db import get_storage
from tests.conftest import (
    TUID_USER_SENIOR, TUID_USER_JUNIOR1,
    TUID_TEAM_ALPHA, TUID_TEAM_BETA,
)

pytestmark = pytest.mark.usefixtures("clean_postgres_tables", "seed_test_base")


@pytest.fixture(params=["memory", "postgres"])
def storage_backend(request):
    """Parametrized storage backend (memory | postgres).

    The 'postgres' variant is skipped unless --run-postgres is passed, so the
    default run keeps the single-backend (memory) behavior.
    """
    backend = request.param
    run_postgres = request.config.getoption("--run-postgres")
    if backend == "postgres" and not run_postgres:
        pytest.skip("PostgreSQL disabled (use --run-postgres)")

    os.environ["STORAGE_BACKEND"] = "" if backend == "postgres" else "memory"
    import app.services.postgres_db as postgres_db
    postgres_db._storage = None

    yield backend

    os.environ["STORAGE_BACKEND"] = "memory"
    postgres_db._storage = None


async def _add_membership(storage, user_id, team_id, role="member"):
    """Create a membership row and return it as the storage sees it."""
    now = datetime.now(timezone.utc)
    return await storage.create_document("team_members", str(uuid.uuid4()), {
        "user_id": user_id,
        "team_id": team_id,
        "role": role,
        "joined_at": now,
    })


async def test_team_member_crud_roundtrip(storage_backend):
    """Create → query → update → get → delete a team_members row.

    Regression: update/get/delete by the auto-increment int id previously
    crashed with ``TypeError: attribute name must be string``.
    """
    storage = get_storage()
    created = await _add_membership(storage, TUID_USER_SENIOR, TUID_TEAM_ALPHA)

    # The storage returns the row with its int id exposed as a string.
    assert created["user_id"] == TUID_USER_SENIOR
    assert created["team_id"] == TUID_TEAM_ALPHA
    member_id = created["id"]
    assert member_id

    # Query by user_id (the deactivate_user path).
    rows = await storage.query_documents("team_members", [("user_id", "==", TUID_USER_SENIOR)])
    assert len(rows) == 1
    assert rows[0]["id"] == member_id

    # Update by int id (the role-change path).
    updated = await storage.update_document("team_members", member_id, {"role": "admin"})
    assert updated is not None
    assert updated["role"] == "admin"

    # Get by int id.
    fetched = await storage.get_document("team_members", member_id)
    assert fetched is not None
    assert fetched["role"] == "admin"
    assert fetched["team_id"] == TUID_TEAM_ALPHA

    # Delete by int id.
    await storage.delete_document("team_members", member_id)
    assert await storage.get_document("team_members", member_id) is None
    remaining = await storage.query_documents("team_members", [("user_id", "==", TUID_USER_SENIOR)])
    assert remaining == []


async def test_team_members_are_independent_rows(storage_backend):
    """Distinct memberships carry distinct int ids and update independently."""
    storage = get_storage()
    a = await _add_membership(storage, TUID_USER_SENIOR, TUID_TEAM_ALPHA, role="member")
    b = await _add_membership(storage, TUID_USER_SENIOR, TUID_TEAM_BETA, role="senior_dev")

    assert a["id"] != b["id"]

    await storage.update_document("team_members", a["id"], {"role": "tester"})
    still_b = await storage.get_document("team_members", b["id"])
    assert still_b["role"] == "senior_dev"


async def test_deactivate_user_removes_memberships(storage_backend):
    """End-to-end regression: deactivate_user must not crash removing the
    user from teams, and must leave no memberships behind."""
    storage = get_storage()

    # The Postgres seed creates the user; the memory backend needs one so the
    # final anonymizing update has a row to write.
    if await storage.get_document("users", TUID_USER_JUNIOR1) is None:
        await storage.create_document("users", TUID_USER_JUNIOR1, {
            "email": "junior1@test.com",
            "name": "Test Junior 1",
            "email_hash": "original-hash-junior1",
            "provider": "password",
            "password_hash": "test-hash",
            "is_active": True,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        })

    await _add_membership(storage, TUID_USER_JUNIOR1, TUID_TEAM_ALPHA)
    await _add_membership(storage, TUID_USER_JUNIOR1, TUID_TEAM_BETA)

    result = await user_service.deactivate_user(TUID_USER_JUNIOR1)

    # Memberships gone (regression: deletion previously crashed with
    # "attribute name must be string, not 'NoneType'" on the int PK).
    remaining = await storage.query_documents("team_members", [("user_id", "==", TUID_USER_JUNIOR1)])
    assert remaining == []

    # Account anonymized + deactivated.
    assert result is not None
    assert result.get("is_active") is False
    assert result.get("deactivated_at") is not None
    record = await storage.get_document("users", TUID_USER_JUNIOR1)
    assert record is not None
    assert record.get("is_active") is False
    # PII replaced: the stored email hash now fingerprints the deleted address.
    assert record.get("email_hash") != "original-hash-junior1"
    assert record.get("deactivated_at") is not None
