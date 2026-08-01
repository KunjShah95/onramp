"""add 'owner' role to team_members check constraint

Revision ID: 014_add_owner_role
Revises: 012_add_hr_role
Create Date: 2026-08-01 00:00:00.000000

TeamService.create_team inserts the team creator with role='owner', and the
RBAC layer (ROLE_HIERARCHY in access_guard, owner/ceo/cto checks in
access_control_service) treats 'owner' as a first-class role. But the CHECK
constraint from migration 007/012 never allowed 'owner', so every team
creation failed with a CheckViolationError. This syncs the constraint with
the code.

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '014_add_owner_role'
down_revision: Union[str, None] = '012_add_hr_role'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Full set of roles matching the model's CheckConstraint
VALID_ROLES = ("owner", "ceo", "cto", "senior_dev", "developer", "tester", "new_dev", "member", "hr")


def upgrade() -> None:
    op.execute("ALTER TABLE team_members DROP CONSTRAINT IF EXISTS ck_team_members_role")
    op.create_check_constraint(
        "ck_team_members_role",
        "team_members",
        f"role IN {VALID_ROLES}",
    )


def downgrade() -> None:
    # Restore to the previous set (without 'owner')
    op.execute("ALTER TABLE team_members DROP CONSTRAINT IF EXISTS ck_team_members_role")
    op.create_check_constraint(
        "ck_team_members_role",
        "team_members",
        "role IN ('ceo', 'cto', 'senior_dev', 'developer', 'tester', 'new_dev', 'member', 'hr')",
    )
