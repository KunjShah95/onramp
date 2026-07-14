"""add email_hash column to users table for login lookups

Revision ID: 006_add_email_hash
Revises: 005_timezone_aware_datetimes
Create Date: 2026-07-14 00:00:00.000000

The email_hash column stores a SHA-256 hash of the user's email for
efficient lookup during login without exposing the encrypted email in
queries. It is nullable because existing rows may not have a hash yet
(the backend populates it on the next write).

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '006_add_email_hash'
down_revision: Union[str, None] = '005_timezone_aware_datetimes'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('email_hash', sa.String(64), nullable=True)
    )
    op.create_index(
        'ix_users_email_hash',
        'users',
        ['email_hash'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index('ix_users_email_hash', table_name='users')
    op.drop_column('users', 'email_hash')
