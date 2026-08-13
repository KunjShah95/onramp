"""add file_count to repositories for token-efficiency benchmark

Revision ID: 025_repository_file_count
Revises: 024_team_provider_keys
Create Date: 2026-08-13 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '025_repository_file_count'
down_revision: Union[str, None] = '024_team_provider_keys'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('repositories', sa.Column('file_count', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('repositories', 'file_count')
