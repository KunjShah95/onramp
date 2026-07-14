"""add expanded role check constraint for TeamMember roles

Revision ID: 007_expand_roles
Revises: 006_add_email_hash
Create Date: 2026-07-14 00:00:00.000000

Adds a CHECK constraint to team_members.role to enforce the new
RBAC role set: ceo, cto, senior_dev, developer, tester, new_dev, member.

The previous default "member" is kept for backward compatibility;
migration does not alter existing data.

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '007_expand_roles'
down_revision: Union[str, None] = '006_add_email_hash'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


VALID_ROLES = ("ceo", "cto", "senior_dev", "developer", "tester", "new_dev", "member")


def upgrade() -> None:
    # Drop if already exists (e.g. created by dev mode's create_all) before creating
    op.execute("ALTER TABLE team_members DROP CONSTRAINT IF EXISTS ck_team_members_role")
    op.create_check_constraint(
        "ck_team_members_role",
        "team_members",
        f"role IN {VALID_ROLES}",
    )


def downgrade() -> None:
    op.drop_constraint("ck_team_members_role", "team_members", type_="check")
