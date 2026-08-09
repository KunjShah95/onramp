"""backfill: encrypt plaintext PII (email/name) for existing users

Revision ID: 022_backfill_encrypt_pii
Revises: 021_add_task_github_pr_columns
Create Date: 2026-08-09 00:00:00.000000

Before PII_ENCRYPTION_KEY was configured, ``users.email`` and ``users.name``
were stored in plaintext. New writes are encrypted via
``field_encryption.encrypt_field`` and reads are transparent (the app decrypts
whenever a value starts with the Fernet prefix ``gAAAAA``), so plaintext rows
remained readable — but were not encrypted at rest.

This migration encrypts every plaintext email/name in place. It is idempotent:
values already starting with ``gAAAAA`` are skipped, and it can be re-run
safely. ``email_hash`` is a deterministic SHA-256 of the plaintext email and
does not change.

Requires ``PII_ENCRYPTION_KEY`` in the environment — production refuses to
store PII in plaintext, and this migration refuses to run without the key.
"""

from typing import Sequence, Union, Callable, Any

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '022_backfill_encrypt_pii'
down_revision: Union[str, None] = '021_add_task_github_pr_columns'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_FERNET_PREFIX = "gAAAAA"


def _encrypt_plaintext_users(connection: Any, encrypt: Callable[[str], str]) -> dict:
    """Encrypt plaintext email/name columns in place (idempotent).

    ``encrypt`` is the field-encryption function (``encrypt_field`` in the app)
    so the same logic can be unit-tested without an Alembic context.

    Returns a summary dict with ``encrypted`` and ``already`` counts.
    """
    rows = connection.execute(
        sa.text("SELECT id, email, name FROM users")
    ).fetchall()

    encrypted = 0
    already = 0
    for row_id, email, name in rows:
        updates = {}

        if email and not email.startswith(_FERNET_PREFIX):
            updates["email"] = encrypt(email)
        if name and not name.startswith(_FERNET_PREFIX):
            updates["name"] = encrypt(name)

        if updates:
            # SET only the columns that actually changed so a concurrent write
            # to the untouched column (registration / profile edit during the
            # backfill) is never clobbered with a stale SELECT-time value.
            set_clause = ", ".join(f"{col} = :{col}" for col in updates)
            connection.execute(
                sa.text(f"UPDATE users SET {set_clause} WHERE id = :id"),
                {**updates, "id": row_id},
            )
            encrypted += 1
        else:
            already += 1

    return {"encrypted": encrypted, "already": already}


def upgrade() -> None:
    from app.services.field_encryption import encrypt_field

    summary = _encrypt_plaintext_users(op.get_bind(), encrypt_field)
    print(
        f"Backfill encrypt PII: encrypted {summary['encrypted']} user(s), "
        f"skipped {summary['already']} (already encrypted or empty).",
        flush=True,
    )


def downgrade() -> None:
    raise NotImplementedError(
        "022_backfill_encrypt_pii cannot be downgraded — decrypting PII back to "
        "plaintext is a deliberate security downgrade. Restore from a backup instead."
    )
