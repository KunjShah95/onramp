"""fix users provider constraint - github -> github.com

Revision ID: 003_fix_provider_constraint
Revises: 002_reconcile_schema
Create Date: 2026-07-02 00:00:00.000000

The auth system uses 'github.com' as the provider string (matching Firebase's
sign_in_provider value), but the original CHECK constraint only allowed 'github'.
This caused a DB constraint violation whenever anyone tried to register with GitHub.
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '003_fix_provider_constraint'
down_revision: Union[str, None] = '002_reconcile_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop the old constraint that used 'github' (without .com)
    op.drop_constraint('ck_users_provider', 'users', type_='check')
    # Update any existing rows BEFORE creating the new constraint
    # (Postgres validates CHECK constraints against existing rows)
    op.execute("UPDATE users SET provider = 'github.com' WHERE provider = 'github'")
    # Create the corrected constraint matching the actual provider values
    op.create_check_constraint(
        'ck_users_provider',
        'users',
        "provider IN ('google.com', 'password', 'github.com')"
    )


def downgrade() -> None:
    op.execute("UPDATE users SET provider = 'github' WHERE provider = 'github.com'")
    op.drop_constraint('ck_users_provider', 'users', type_='check')
    op.create_check_constraint(
        'ck_users_provider',
        'users',
        "provider IN ('google.com', 'password', 'github', 'microsoft')"
    )
