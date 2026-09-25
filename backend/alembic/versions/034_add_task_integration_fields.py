"""add task integration and merge fields

Revision ID: 034_task_integration_fields
Revises: 033_billing_oauth_integrity
Create Date: 2026-09-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "034_task_integration_fields"
down_revision: Union[str, None] = "033_billing_oauth_integrity"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("onramp_tasks", sa.Column("pr_merged_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("onramp_tasks", sa.Column("jira_issue_key", sa.String(length=255), nullable=True))
    op.add_column("onramp_tasks", sa.Column("linear_issue_id", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("onramp_tasks", "linear_issue_id")
    op.drop_column("onramp_tasks", "jira_issue_key")
    op.drop_column("onramp_tasks", "pr_merged_at")
