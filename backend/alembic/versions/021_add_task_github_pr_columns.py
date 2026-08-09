"""Add github_pr_author and github_pr_number columns to onramp_tasks

Revision ID: 021_add_task_github_pr_columns
Revises: 020_add_user_deactivated_at
Create Date: 2026-08-09 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "021_add_task_github_pr_columns"
down_revision: Union[str, None] = "020_add_user_deactivated_at"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    if not insp.has_table(table):
        return False
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if not _has_column("onramp_tasks", "github_pr_author"):
        op.add_column(
            "onramp_tasks",
            sa.Column("github_pr_author", sa.String(255), nullable=True),
        )
    if not _has_column("onramp_tasks", "github_pr_number"):
        op.add_column(
            "onramp_tasks",
            sa.Column("github_pr_number", sa.Integer(), nullable=True),
        )


def downgrade() -> None:
    if _has_column("onramp_tasks", "github_pr_number"):
        op.drop_column("onramp_tasks", "github_pr_number")
    if _has_column("onramp_tasks", "github_pr_author"):
        op.drop_column("onramp_tasks", "github_pr_author")
