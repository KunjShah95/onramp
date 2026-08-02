"""add task dependencies, review analytics timestamps, milestone dependencies

Revision ID: 016_add_deps_refresh
Revises: 015_add_task_workflow
Create Date: 2026-08-02 00:00:00.000000

Backs the second roadmap wave:
- onramp_tasks.depends_on          (task dependency DAG — prerequisites block start)
- onramp_tasks.submitted_at        (review analytics: turnaround = reviewed - submitted)
- onramp_tasks.reviewed_at         (review analytics: last review outcome time)
- onramp_tasks.review_cycles       (review analytics: rework rate / review cycles)
- onboarding_milestones.depends_on_milestones  (roadmap DAG: milestone prerequisites)

Refresh tokens are stored in the generic dynamic_documents table (collection
'onramp_refresh_tokens') so no schema change is required for them.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

# revision identifiers, used by Alembic.
revision: str = '016_add_deps_refresh'
down_revision: Union[str, None] = '015_add_task_workflow'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── onramp_tasks new columns ──────────────────────────────────────────────
    with op.batch_alter_table('onramp_tasks', schema=None) as batch_op:
        batch_op.add_column(sa.Column('depends_on', JSONB(), nullable=True))
        batch_op.add_column(sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('review_cycles', sa.Integer(), nullable=False, server_default=sa.text('0')))

    # ── onboarding_milestones new column (roadmap DAG) ───────────────────────
    with op.batch_alter_table('onboarding_milestones', schema=None) as batch_op:
        batch_op.add_column(sa.Column('depends_on_milestones', JSONB(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('onboarding_milestones', schema=None) as batch_op:
        batch_op.drop_column('depends_on_milestones')

    with op.batch_alter_table('onramp_tasks', schema=None) as batch_op:
        batch_op.drop_column('review_cycles')
        batch_op.drop_column('reviewed_at')
        batch_op.drop_column('submitted_at')
        batch_op.drop_column('depends_on')
