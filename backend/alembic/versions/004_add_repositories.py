"""add repositories table

Revision ID: 004_add_repositories
Revises: 003_fix_provider_constraint
Create Date: 2026-07-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = '004_add_repositories'
down_revision: Union[str, None] = '003_fix_provider_constraint'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('repositories',
        sa.Column('id', UUID(as_uuid=False), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('owner', sa.String(length=255), nullable=False),
        sa.Column('team_id', UUID(as_uuid=False), nullable=True),
        sa.Column('url', sa.String(length=500), nullable=True),
        sa.Column('language', sa.String(length=50), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
        sa.Column('last_analyzed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['team_id'], ['teams.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('owner', 'name', name='uq_repositories_owner_name'),
    )
    op.create_index('ix_repositories_team_id', 'repositories', ['team_id'])
    op.create_index('ix_repositories_created_at', 'repositories', ['created_at'])


def downgrade() -> None:
    op.drop_index('ix_repositories_created_at', table_name='repositories')
    op.drop_index('ix_repositories_team_id', table_name='repositories')
    op.drop_constraint('uq_repositories_owner_name', 'repositories', type_='unique')
    op.drop_table('repositories')
