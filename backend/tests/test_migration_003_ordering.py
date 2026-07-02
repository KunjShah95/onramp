"""Regression test for critical 1.3: migration 003 must UPDATE existing rows
to the new provider value BEFORE creating the CHECK constraint that enforces
it — Postgres validates CHECK constraints against existing rows, so doing it
in the other order breaks any deploy with a pre-existing 'github' row.
"""
import importlib.util
from pathlib import Path

_MIGRATION_PATH = (
    Path(__file__).resolve().parent.parent
    / "alembic" / "versions" / "003_fix_provider_constraint.py"
)


def _load_migration_source() -> str:
    return _MIGRATION_PATH.read_text(encoding="utf-8")


def _upgrade_body(source: str) -> str:
    start = source.index("def upgrade")
    end = source.index("def downgrade")
    return source[start:end]


def test_data_fix_runs_before_constraint_creation():
    body = _upgrade_body(_load_migration_source())

    update_pos = body.index("UPDATE users SET provider")
    constraint_pos = body.index("create_check_constraint")

    assert update_pos < constraint_pos, (
        "Migration 003 must run the data-fixing UPDATE before "
        "create_check_constraint, or it will fail against rows with the old value"
    )


def test_new_constraint_permits_github_dot_com():
    body = _upgrade_body(_load_migration_source())
    assert "'github.com'" in body
