"""make all DateTime columns timezone-aware (TIMESTAMPTZ)

Revision ID: 005_timezone_aware_datetimes
Revises: 004_add_repositories
Create Date: 2026-07-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '005_timezone_aware_datetimes'
down_revision: Union[str, None] = '004_add_repositories'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('users') as batch_op:
        batch_op.alter_column('created_at',
                              type_=sa.DateTime(timezone=True),
                              postgresql_using="created_at AT TIME ZONE 'UTC'")
        batch_op.alter_column('updated_at',
                              type_=sa.DateTime(timezone=True),
                              postgresql_using="updated_at AT TIME ZONE 'UTC'")
        batch_op.alter_column('last_login_at',
                              type_=sa.DateTime(timezone=True),
                              postgresql_using="last_login_at AT TIME ZONE 'UTC'")

    with op.batch_alter_table('teams') as batch_op:
        batch_op.alter_column('created_at',
                              type_=sa.DateTime(timezone=True),
                              postgresql_using="created_at AT TIME ZONE 'UTC'")
        batch_op.alter_column('updated_at',
                              type_=sa.DateTime(timezone=True),
                              postgresql_using="updated_at AT TIME ZONE 'UTC'")

    with op.batch_alter_table('team_members') as batch_op:
        batch_op.alter_column('joined_at',
                              type_=sa.DateTime(timezone=True),
                              postgresql_using="joined_at AT TIME ZONE 'UTC'")

    with op.batch_alter_table('api_keys') as batch_op:
        batch_op.alter_column('expires_at',
                              type_=sa.DateTime(timezone=True),
                              postgresql_using="expires_at AT TIME ZONE 'UTC'")
        batch_op.alter_column('last_used_at',
                              type_=sa.DateTime(timezone=True),
                              postgresql_using="last_used_at AT TIME ZONE 'UTC'")
        batch_op.alter_column('created_at',
                              type_=sa.DateTime(timezone=True),
                              postgresql_using="created_at AT TIME ZONE 'UTC'")

    with op.batch_alter_table('usage_records') as batch_op:
        batch_op.alter_column('created_at',
                              type_=sa.DateTime(timezone=True),
                              postgresql_using="created_at AT TIME ZONE 'UTC'")

    with op.batch_alter_table('repositories') as batch_op:
        batch_op.alter_column('last_analyzed_at',
                              type_=sa.DateTime(timezone=True),
                              postgresql_using="last_analyzed_at AT TIME ZONE 'UTC'")
        batch_op.alter_column('created_at',
                              type_=sa.DateTime(timezone=True),
                              postgresql_using="created_at AT TIME ZONE 'UTC'")
        batch_op.alter_column('updated_at',
                              type_=sa.DateTime(timezone=True),
                              postgresql_using="updated_at AT TIME ZONE 'UTC'")

    with op.batch_alter_table('dynamic_documents') as batch_op:
        batch_op.alter_column('created_at',
                              type_=sa.DateTime(timezone=True),
                              postgresql_using="created_at AT TIME ZONE 'UTC'")
        batch_op.alter_column('updated_at',
                              type_=sa.DateTime(timezone=True),
                              postgresql_using="updated_at AT TIME ZONE 'UTC'")


def downgrade() -> None:
    with op.batch_alter_table('dynamic_documents') as batch_op:
        batch_op.alter_column('updated_at',
                              type_=sa.DateTime())
        batch_op.alter_column('created_at',
                              type_=sa.DateTime())

    with op.batch_alter_table('repositories') as batch_op:
        batch_op.alter_column('updated_at',
                              type_=sa.DateTime())
        batch_op.alter_column('created_at',
                              type_=sa.DateTime())
        batch_op.alter_column('last_analyzed_at',
                              type_=sa.DateTime())

    with op.batch_alter_table('usage_records') as batch_op:
        batch_op.alter_column('created_at',
                              type_=sa.DateTime())

    with op.batch_alter_table('api_keys') as batch_op:
        batch_op.alter_column('created_at',
                              type_=sa.DateTime())
        batch_op.alter_column('last_used_at',
                              type_=sa.DateTime())
        batch_op.alter_column('expires_at',
                              type_=sa.DateTime())

    with op.batch_alter_table('team_members') as batch_op:
        batch_op.alter_column('joined_at',
                              type_=sa.DateTime())

    with op.batch_alter_table('teams') as batch_op:
        batch_op.alter_column('updated_at',
                              type_=sa.DateTime())
        batch_op.alter_column('created_at',
                              type_=sa.DateTime())

    with op.batch_alter_table('users') as batch_op:
        batch_op.alter_column('last_login_at',
                              type_=sa.DateTime())
        batch_op.alter_column('updated_at',
                              type_=sa.DateTime())
        batch_op.alter_column('created_at',
                              type_=sa.DateTime())
