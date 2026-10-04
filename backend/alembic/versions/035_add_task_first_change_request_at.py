"""add onramp_tasks.first_change_request_at for DORA MTTR

Revision ID: 035_task_first_change_request
Revises: 034_task_integration_fields
Create Date: 2026-10-04
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "035_task_first_change_request"
down_revision: Union[str, None] = "034_task_integration_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "onramp_tasks",
        sa.Column("first_change_request_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("onramp_tasks", "first_change_request_at")
