"""add senior to team_members role CHECK constraint

Revision ID: 027_add_senior_role
Revises: 026_rename_roles
Create Date: 2026-08-19 00:00:00.000000

The 'senior' role is used throughout the frontend (nav.ts, RoleGuard,
Sidebar) and backend (access_guard ROLE_HIERARCHY, require_minimum_role)
but was never added to the database CHECK constraint. This migration
drops the old constraint and recreates it with 'senior' included.

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '027_add_senior_role'
down_revision: Union[str, None] = '026_rename_roles'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Full role set — matches the frontend TeamRole type and backend ROLE_HIERARCHY.
VALID_ROLES = (
    "admin", "ceo", "cto",
    "senior_dev", "senior",
    "developer", "tester",
    "junior_dev", "member",
    "hr",
)


def upgrade() -> None:
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
        "role IN ('admin', 'ceo', 'cto', 'senior_dev', 'developer', 'tester', 'junior_dev', 'member', 'hr')",
    )
