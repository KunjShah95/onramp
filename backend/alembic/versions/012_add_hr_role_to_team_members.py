"""add 'hr' role to team_members check constraint

Revision ID: 012_add_hr_role
Revises: 011_feature_flags_roast_mode
Create Date: 2026-07-30 00:00:00.000000

The model already allows 'hr' as a valid role, but migration 007
did not include it in the CHECK constraint. This migration syncs
the constraint with the model definition.

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '012_add_hr_role'
down_revision: Union[str, None] = 'd63ba1e4a029'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Full set of roles matching the model's CheckConstraint
VALID_ROLES = ("ceo", "cto", "senior_dev", "developer", "tester", "new_dev", "member", "hr")


def upgrade() -> None:
    op.execute("ALTER TABLE team_members DROP CONSTRAINT IF EXISTS ck_team_members_role")
    op.create_check_constraint(
        "ck_team_members_role",
        "team_members",
        f"role IN {VALID_ROLES}",
    )


def downgrade() -> None:
    # Restore to the previous set (without 'hr')
    op.execute("ALTER TABLE team_members DROP CONSTRAINT IF EXISTS ck_team_members_role")
    op.create_check_constraint(
        "ck_team_members_role",
        "team_members",
        "role IN ('ceo', 'cto', 'senior_dev', 'developer', 'tester', 'new_dev', 'member')",
    )
