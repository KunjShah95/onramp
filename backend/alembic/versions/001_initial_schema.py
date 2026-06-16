"""initial schema

Revision ID: initial
Revises: 
Create Date: 2026-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

# revision identifiers, used by Alembic.
revision: str = 'initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create users table
    op.create_table('users',
        sa.Column('id', UUID(as_uuid=False), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('provider', sa.String(length=50), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, default=True),
        sa.Column('is_admin', sa.Boolean(), nullable=False, default=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('last_login_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email', name='uq_users_email'),
        sa.CheckConstraint(
            "provider IN ('google.com', 'password', 'github', 'microsoft')",
            name='ck_users_provider'
        )
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=False)
    op.create_index('ix_users_created_at', 'users', ['created_at'], unique=False)

    # Create teams table
    op.create_table('teams',
        sa.Column('id', UUID(as_uuid=False), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, default=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_teams_name', 'teams', ['name'], unique=False)
    op.create_index('ix_teams_created_at', 'teams', ['created_at'], unique=False)

    # Create team_members association table
    op.create_table('team_members',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', UUID(as_uuid=False), nullable=False),
        sa.Column('team_id', UUID(as_uuid=False), nullable=False),
        sa.Column('role', sa.String(length=50), nullable=False, default='member'),
        sa.Column('joined_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['team_id'], ['teams.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'team_id', name='uq_team_members_user_team')
    )
    op.create_index('ix_team_members_user_id', 'team_members', ['user_id'], unique=False)
    op.create_index('ix_team_members_team_id', 'team_members', ['team_id'], unique=False)

    # Create api_keys table
    op.create_table('api_keys',
        sa.Column('id', UUID(as_uuid=False), nullable=False),
        sa.Column('key_hash', sa.String(length=255), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('user_id', UUID(as_uuid=False), nullable=True),
        sa.Column('team_id', UUID(as_uuid=False), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, default=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('last_used_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('permissions', JSONB(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint(
            '(user_id IS NOT NULL AND team_id IS NULL) OR (user_id IS NULL AND team_id IS NOT NULL)',
            name='ck_api_keys_owner'
        )
    )
    op.create_index('ix_api_keys_key_hash', 'api_keys', ['key_hash'], unique=False)
    op.create_index('ix_api_keys_user_id', 'api_keys', ['user_id'], unique=False)
    op.create_index('ix_api_keys_team_id', 'api_keys', ['team_id'], unique=False)
    op.create_index('ix_api_keys_created_at', 'api_keys', ['created_at'], unique=False)

    # Create usage_records table
    op.create_table('usage_records',
        sa.Column('id', UUID(as_uuid=False), nullable=False),
        sa.Column('user_id', UUID(as_uuid=False), nullable=True),
        sa.Column('team_id', UUID(as_uuid=False), nullable=True),
        sa.Column('endpoint', sa.String(length=500), nullable=False),
        sa.Column('method', sa.String(length=10), nullable=False),
        sa.Column('status_code', sa.Integer(), nullable=False),
        sa.Column('response_time_ms', sa.BigInteger(), nullable=False),
        sa.Column('tokens_used', sa.BigInteger(), nullable=False, default=0),
        sa.Column('cost_usd', sa.Float(), nullable=False, default=0.0),
        sa.Column('metadata', JSONB(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['team_id'], ['teams.id'], ondelete='SET NULL')
    )
    op.create_index('ix_usage_records_created_at', 'usage_records', ['created_at'], unique=False)
    op.create_index('ix_usage_records_user_created', 'usage_records', ['user_id', 'created_at'], unique=False)
    op.create_index('ix_usage_records_team_created', 'usage_records', ['team_id', 'created_at'], unique=False)
    op.create_index('ix_usage_records_endpoint', 'usage_records', ['endpoint'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_usage_records_endpoint', table_name='usage_records')
    op.drop_index('ix_usage_records_team_created', table_name='usage_records')
    op.drop_index('ix_usage_records_user_created', table_name='usage_records')
    op.drop_index('ix_usage_records_created_at', table_name='usage_records')
    op.drop_table('usage_records')
    
    op.drop_index('ix_api_keys_created_at', table_name='api_keys')
    op.drop_index('ix_api_keys_team_id', table_name='api_keys')
    op.drop_index('ix_api_keys_user_id', table_name='api_keys')
    op.drop_index('ix_api_keys_key_hash', table_name='api_keys')
    op.drop_table('api_keys')
    
    op.drop_index('ix_team_members_team_id', table_name='team_members')
    op.drop_index('ix_team_members_user_id', table_name='team_members')
    op.drop_table('team_members')
    
    op.drop_index('ix_teams_created_at', table_name='teams')
    op.drop_index('ix_teams_name', table_name='teams')
    op.drop_table('teams')
    
    op.drop_index('ix_users_created_at', table_name='users')
    op.drop_index('ix_users_email', table_name='users')
    op.drop_table('users')