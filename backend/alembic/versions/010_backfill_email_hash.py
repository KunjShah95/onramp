"""backfill email_hash for existing users whose email_hash is NULL

Revision ID: 010_backfill_email_hash
Revises: 009_add_email_verification
Create Date: 2026-07-26 00:00:00.000000

Migration 006_add_email_hash added the column as nullable but never backfilled
existing rows. The login endpoint looks up users by email_hash, so pre-migration
users get "Invalid email or password" even with correct credentials.

This migration computes and stores email_hash for every user whose email_hash is
NULL (or empty). It handles both plaintext and Fernet-encrypted emails.

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '010_backfill_email_hash'
down_revision: Union[str, None] = '009_add_email_verification'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _email_hash(email: str) -> str:
    """Pure SHA-256 hash matching app.services.field_encryption.email_hash."""
    import hashlib
    return hashlib.sha256(email.lower().strip().encode()).hexdigest()


def _decrypt_field(ciphertext: str) -> str:
    """Decrypt a Fernet-encrypted field, or return as-is if key is missing."""
    import os
    from cryptography.fernet import Fernet
    key = os.getenv("PII_ENCRYPTION_KEY")
    if not key:
        return ciphertext
    try:
        return Fernet(key.encode()).decrypt(ciphertext.encode()).decode()
    except Exception:
        return ciphertext


def upgrade() -> None:
    connection = op.get_bind()

    # Find all users that need a hash
    rows = connection.execute(
        sa.text(
            "SELECT id, email FROM users WHERE email_hash IS NULL OR email_hash = ''"
        )
    ).fetchall()

    updated = 0
    skipped = 0

    for row_id, row_email in rows:
        if not row_email:
            skipped += 1
            continue

        # Decrypt if Fernet-encrypted
        email = row_email
        if email.startswith("gAAAAA"):
            email = _decrypt_field(email)

        h = _email_hash(email)
        connection.execute(
            sa.text("UPDATE users SET email_hash = :hash WHERE id = :id"),
            {"hash": h, "id": row_id},
        )
        updated += 1

    print(f"Backfilled email_hash for {updated} user(s). Skipped {skipped} (empty email).", flush=True)


def downgrade() -> None:
    # Revert: set email_hash back to NULL for all rows that have an email_hash
    # (makes the downgrade re-runnable without affecting newly created users).
    connection = op.get_bind()
    result = connection.execute(
        sa.text("UPDATE users SET email_hash = NULL WHERE email_hash IS NOT NULL")
    )
    print(f"Cleared email_hash on {result.rowcount} user(s).", flush=True)
