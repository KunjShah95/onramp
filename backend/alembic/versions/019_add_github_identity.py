"""Add github_username and github_id columns to users

Revision ID: 019_add_github_identity
Revises: 018_add_user_profile_fields
Create Date: 2026-08-09 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "019_add_github_identity"
down_revision: Union[str, None] = "018_add_user_profile_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _offline() -> bool:
    return getattr(op.get_context(), "as_sql", False)


def _has_column(table: str, column: str) -> bool:
    if _offline():
        return False
    insp = sa.inspect(op.get_bind())
    if not insp.has_table(table):
        return False
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if not _has_column("users", "github_username"):
        op.add_column("users", sa.Column("github_username", sa.String(39), nullable=True))
    if not _has_column("users", "github_id"):
        op.add_column("users", sa.Column("github_id", sa.String(64), nullable=True))
    if _offline():
        op.create_index("ix_users_github_username", "users", ["github_username"], unique=False)
    else:
        indexes = {ix["name"] for ix in sa.inspect(op.get_bind()).get_indexes("users")}
        if "ix_users_github_username" not in indexes:
            op.create_index("ix_users_github_username", "users", ["github_username"], unique=False)


def downgrade() -> None:
    if _offline() or _has_column("users", "github_id"):
        op.drop_column("users", "github_id")
    if _offline() or _has_column("users", "github_username"):
        op.drop_index("ix_users_github_username", table_name="users")
        op.drop_column("users", "github_username")
