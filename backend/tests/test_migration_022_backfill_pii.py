"""Tests for migration 022 (backfill: encrypt plaintext PII).

Runs the migration's core ``_encrypt_plaintext_users`` against an in-memory
SQLite ``users`` table so the logic is verified without needing PostgreSQL.
"""

import importlib.util
import os
from pathlib import Path

import sqlalchemy as sa

from app.services.field_encryption import encrypt_field, decrypt_field

_MIGRATION_PATH = (
    Path(__file__).resolve().parents[1] / "alembic" / "versions" / "022_backfill_encrypt_pii.py"
)


def _load_migration():
    spec = importlib.util.spec_from_file_location("migration_022", _MIGRATION_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _make_users_table():
    engine = sa.create_engine("sqlite://")
    conn = engine.connect()
    conn.execute(sa.text(
        "CREATE TABLE users ("
        "  id TEXT PRIMARY KEY,"
        "  email TEXT NOT NULL,"
        "  name TEXT NOT NULL,"
        "  email_hash TEXT"
        ")"
    ))
    conn.execute(sa.text(
        "INSERT INTO users (id, email, name, email_hash) VALUES "
        "('u1', 'alice@example.com', 'Alice Example', 'hash-alice'), "
        "('u2', 'bob@example.com', 'Bob Example', 'hash-bob'), "
        "('u3', 'carol@example.com', 'Carol Example', 'hash-carol'), "
        "('u4', 'dave@example.com', 'Dave Example', 'hash-dave')"
    ))
    return conn


def _seed_encrypted_row(conn):
    """Insert a row that is already fully encrypted (must be skipped)."""
    enc_email = encrypt_field("erin@example.com")
    enc_name = encrypt_field("Erin Example")
    conn.execute(sa.text(
        "INSERT INTO users (id, email, name, email_hash) VALUES (:id, :email, :name, :hash)"
    ), {"id": "u5", "email": enc_email, "name": enc_name, "hash": "hash-erin"})


def test_backfill_encrypts_plaintext_and_skips_encrypted():
    migration = _load_migration()
    conn = _make_users_table()
    _seed_encrypted_row(conn)

    summary = migration._encrypt_plaintext_users(conn, encrypt_field)

    assert summary["encrypted"] == 4
    assert summary["already"] == 1

    rows = {
        r[0]: r
        for r in conn.execute(sa.text("SELECT id, email, name, email_hash FROM users")).fetchall()
    }

    expected_hashes = {"u1": "hash-alice", "u2": "hash-bob", "u3": "hash-carol", "u4": "hash-dave"}

    # Plaintext rows are now encrypted and decrypt back to the originals.
    for uid, plain_email, plain_name in (
        ("u1", "alice@example.com", "Alice Example"),
        ("u2", "bob@example.com", "Bob Example"),
        ("u3", "carol@example.com", "Carol Example"),
        ("u4", "dave@example.com", "Dave Example"),
    ):
        email, name = rows[uid][1], rows[uid][2]
        assert email.startswith("gAAAAA"), uid
        assert name.startswith("gAAAAA"), uid
        assert decrypt_field(email) == plain_email
        assert decrypt_field(name) == plain_name
        # Deterministic email_hash is preserved (unchanged by encryption).
        assert rows[uid][3] == expected_hashes[uid]

    # Already-encrypted row is untouched.
    assert rows["u5"][1].startswith("gAAAAA")
    assert rows["u5"][2].startswith("gAAAAA")
    assert decrypt_field(rows["u5"][1]) == "erin@example.com"


def test_backfill_is_idempotent():
    migration = _load_migration()
    conn = _make_users_table()

    first = migration._encrypt_plaintext_users(conn, encrypt_field)
    second = migration._encrypt_plaintext_users(conn, encrypt_field)

    assert first["encrypted"] == 4
    assert second["encrypted"] == 0
    assert second["already"] == 4


def test_backfill_requires_encryption_key_in_production(monkeypatch):
    """With no PII_ENCRYPTION_KEY, encrypt_field refuses to run in production —
    the migration must not silently leave plaintext behind."""
    monkeypatch.setenv("ENV", "production")
    monkeypatch.delenv("PII_ENCRYPTION_KEY", raising=False)
    migration = _load_migration()
    conn = _make_users_table()

    import pytest
    with pytest.raises(RuntimeError):
        migration._encrypt_plaintext_users(conn, encrypt_field)
