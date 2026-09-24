"""dedicated refresh_tokens table (replaces dynamic_documents collection)

Revision ID: 029_add_refresh_tokens
Revises: 028_agent_sessions
Create Date: 2026-09-12

Moves server-side rotating refresh tokens out of the generic
``dynamic_documents`` collection (``onramp_refresh_tokens``) into a typed
``refresh_tokens`` table: UNIQUE index on ``token_hash`` for O(1) rotation
lookups, FK to ``users.id`` with CASCADE, explicit revocation columns.

Pre-migration rows in ``dynamic_documents`` are NOT backfilled (they hold only
HMAC hashes, and most expire within 30 days). The service layer dual-reads the
legacy collection, so old sessions keep working until natural expiry.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = "029_add_refresh_tokens"
down_revision: Union[str, None] = "028_agent_sessions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    offline = getattr(op.get_context(), "as_sql", False)
    inspector = None if offline else sa.inspect(op.get_bind())
    if offline or not inspector.has_table("refresh_tokens"):
        op.create_table(
            "refresh_tokens",
            sa.Column("id", UUID(as_uuid=False), primary_key=True),
            sa.Column(
                "user_id",
                UUID(as_uuid=False),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("replaced_by", sa.String(64), nullable=True),
            sa.Column(
                "remember_me",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
        )
        op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
        op.create_index(
            "ix_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"]
        )


def downgrade() -> None:
    offline = getattr(op.get_context(), "as_sql", False)
    inspector = None if offline else sa.inspect(op.get_bind())
    if offline or inspector.has_table("refresh_tokens"):
        op.drop_index("ix_refresh_tokens_token_hash", table_name="refresh_tokens")
        op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
        op.drop_table("refresh_tokens")
