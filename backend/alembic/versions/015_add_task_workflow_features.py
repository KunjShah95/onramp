"""add task workflow features: actual_hours, pr_comments, peer_review, quiz gates, task templates

Revision ID: 015_add_task_workflow
Revises: 014_add_owner_role
Create Date: 2026-08-02 00:00:00.000000

Adds the columns and table backing the 2026 roadmap batch:
- onramp_tasks.actual_hours       (time tracking — estimated vs actual)
- onramp_tasks.pr_comments        (GitHub PR inline comments pulled on submit)
- onramp_tasks.peer_reviewed_by   (peer review reviewer identity)
- onramp_tasks.quiz_required      (prerequisite quiz gate flag)
- task_templates                  (reusable task blueprints per module)

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

# revision identifiers, used by Alembic.
revision: str = '015_add_task_workflow'
down_revision: Union[str, None] = '014_add_owner_role'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── onramp_tasks new columns ──────────────────────────────────────────────
    with op.batch_alter_table('onramp_tasks', schema=None) as batch_op:
        batch_op.add_column(sa.Column('actual_hours', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('pr_comments', JSONB(), nullable=True))
        batch_op.add_column(sa.Column('peer_reviewed_by', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('quiz_required', sa.Boolean(), nullable=False, server_default=sa.text('false')))
        # Source GitHub issue for imported/starter tasks (avoids overloading ai_review,
        # which the PR review agent overwrites on submit)
        batch_op.add_column(sa.Column('source_issue', JSONB(), nullable=True))

    # ── task_templates table ──────────────────────────────────────────────────
    op.create_table(
        'task_templates',
        sa.Column('template_id', UUID(as_uuid=False), primary_key=True),
        sa.Column('team_id', UUID(as_uuid=False),
                  sa.ForeignKey('teams.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('created_by', UUID(as_uuid=False),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), default=''),
        sa.Column('module', sa.String(length=100), default=''),
        sa.Column('priority', sa.String(length=20), default='medium'),
        sa.Column('repo_url', sa.String(length=1000), default=''),
        sa.Column('unlock_modules', JSONB(), nullable=False, default=list),
        sa.Column('estimated_hours', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    with op.batch_alter_table('task_templates', schema=None) as batch_op:
        batch_op.create_index('ix_task_templates_team', ['team_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('task_templates', schema=None) as batch_op:
        batch_op.drop_index('ix_task_templates_team')
    op.drop_table('task_templates')

    with op.batch_alter_table('onramp_tasks', schema=None) as batch_op:
        batch_op.drop_column('source_issue')
        batch_op.drop_column('quiz_required')
        batch_op.drop_column('peer_reviewed_by')
        batch_op.drop_column('pr_comments')
        batch_op.drop_column('actual_hours')
