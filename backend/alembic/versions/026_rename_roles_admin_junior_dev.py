"""rename team roles: owner→admin, new_dev→junior_dev

Revision ID: 026_rename_roles
Revises: 025_repository_file_count
Create Date: 2026-08-16 00:00:00.000000

The RBAC role set is renamed across the app: the team-owner role becomes
'admin' and the entry-level role becomes 'junior_dev'. This updates the
team_members CHECK constraint (which would otherwise reject the new names)
and migrates any existing rows holding the old names.

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '026_rename_roles'
down_revision: Union[str, None] = '025_repository_file_count'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# New role set — matches the model's CheckConstraint after the rename
VALID_ROLES = ("admin", "ceo", "cto", "senior_dev", "developer", "tester", "junior_dev", "member", "hr")


def upgrade() -> None:
    # Migrate existing rows first (constraint still allows the old names).
    op.execute("UPDATE team_members SET role = 'admin' WHERE role = 'owner'")
    op.execute("UPDATE team_members SET role = 'junior_dev' WHERE role = 'new_dev'")
    # Swap the constraint to the renamed set.
    op.execute("ALTER TABLE team_members DROP CONSTRAINT IF EXISTS ck_team_members_role")
    op.create_check_constraint(
        "ck_team_members_role",
        "team_members",
        f"role IN {VALID_ROLES}",
    )


def downgrade() -> None:
    op.execute("ALTER TABLE team_members DROP CONSTRAINT IF EXISTS ck_team_members_role")
    op.create_check_constraint(
        "ck_team_members_role",
        "team_members",
        "role IN ('owner', 'ceo', 'cto', 'senior_dev', 'developer', 'tester', 'new_dev', 'member', 'hr')",
    )
    op.execute("UPDATE team_members SET role = 'owner' WHERE role = 'admin'")
    op.execute("UPDATE team_members SET role = 'new_dev' WHERE role = 'junior_dev'")
