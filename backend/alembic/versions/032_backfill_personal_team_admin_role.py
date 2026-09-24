"""backfill personal team creators from junior_dev to admin

Revision ID: 032_backfill_personal_team_admin_role
Revises: 031_embedding_chunk_tenant_scope
Create Date: 2026-09-24

Registration used to assign junior_dev (level 2) to the personal team
creator. approve/review endpoints require senior (level 5), so every
self-registered user got 403. Registration is now fixed to assign admin,
but existing rows need backfilling.

Logic: any team_member with role='junior_dev' who is the sole member of
their team is the personal-team owner — upgrade to admin.
"""

from typing import Sequence, Union
from alembic import op

revision: str = "032_backfill_team_roles"
down_revision: Union[str, None] = "031_embedding_chunk_tenant_scope"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        UPDATE team_members
        SET role = 'admin'
        WHERE role = 'junior_dev'
          AND team_id IN (
              SELECT team_id
              FROM team_members
              GROUP BY team_id
              HAVING COUNT(*) = 1
          )
    """)


def downgrade() -> None:
    # Cannot safely reverse — we don't know which admins were junior_dev.
    pass
