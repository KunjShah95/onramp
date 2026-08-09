"""Add position and avatar_url columns to users

Revision ID: 018_add_user_profile_fields
Revises: 017_add_embedding_chunks
Create Date: 2026-08-09 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "018_add_user_profile_fields"
down_revision: Union[str, None] = "017_add_embedding_chunks"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    if not insp.has_table(table):
        return False
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if not _has_column("users", "position"):
        op.add_column("users", sa.Column("position", sa.String(255), nullable=True))
    if not _has_column("users", "avatar_url"):
        op.add_column("users", sa.Column("avatar_url", sa.String(2048), nullable=True))


def downgrade() -> None:
    if _has_column("users", "avatar_url"):
        op.drop_column("users", "avatar_url")
    if _has_column("users", "position"):
        op.drop_column("users", "position")
