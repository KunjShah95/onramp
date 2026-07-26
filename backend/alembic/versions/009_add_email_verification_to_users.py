"""add email verification and password-reset columns to users table

Revision ID: 009_add_email_verification
Revises: 008_add_dynamic_tables
Create Date: 2026-07-26 00:00:00.000000

The User model gained email-verification and forced-password-reset fields
(email_verified, email_verification_token, email_verification_token_expires_at,
password_reset_required) but no migration added them, causing schema drift
(registry/table parity failure). Booleans get a server_default so existing
rows backfill cleanly under the NOT NULL constraint.

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '009_add_email_verification'
down_revision: Union[str, None] = '008_add_dynamic_tables'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('email_verified', sa.Boolean(), nullable=False,
                  server_default=sa.false()),
    )
    op.add_column(
        'users',
        sa.Column('email_verification_token', sa.String(128), nullable=True),
    )
    op.add_column(
        'users',
        sa.Column('email_verification_token_expires_at',
                  sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        'users',
        sa.Column('password_reset_required', sa.Boolean(), nullable=False,
                  server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('users', 'password_reset_required')
    op.drop_column('users', 'email_verification_token_expires_at')
    op.drop_column('users', 'email_verification_token')
    op.drop_column('users', 'email_verified')
