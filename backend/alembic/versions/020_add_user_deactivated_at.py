"""Add deactivated_at column to users

Revision ID: 020_add_user_deactivated_at
Revises: 019_add_github_identity
Create Date: 2026-08-09 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "020_add_user_deactivated_at"
down_revision: Union[str, None] = "019_add_github_identity"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    if not insp.has_table(table):
        return False
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if not _has_column("users", "deactivated_at"):
        op.add_column(
            "users",
            sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    if _has_column("users", "deactivated_at"):
        op.drop_column("users", "deactivated_at")
