"""add onramp_subscriptions lifecycle fields (scheduled cancel, trial, pending downgrade)

Revision ID: 036_subscription_lifecycle
Revises: 035_task_first_change_request
Create Date: 2026-10-11
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "036_subscription_lifecycle"
down_revision: Union[str, None] = "035_task_first_change_request"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "onramp_subscriptions",
        sa.Column("cancel_at_period_end", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column("onramp_subscriptions", sa.Column("trial_end", sa.DateTime(timezone=True), nullable=True))
    op.add_column("onramp_subscriptions", sa.Column("pending_tier", sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column("onramp_subscriptions", "pending_tier")
    op.drop_column("onramp_subscriptions", "trial_end")
    op.drop_column("onramp_subscriptions", "cancel_at_period_end")
