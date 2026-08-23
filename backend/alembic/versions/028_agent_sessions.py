"""agent sessions + messages + events (stateful inter-agent comms)

Revision ID: 028_agent_sessions
Revises: d82af5364a0c
Create Date: 2026-08-23
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "028_agent_sessions"
down_revision: Union[str, None] = "d82af5364a0c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())

    if not inspector.has_table("onramp_agent_sessions"):
        op.create_table(
            "onramp_agent_sessions",
            sa.Column("id", UUID(as_uuid=False), primary_key=True),
            sa.Column("agent_type", sa.String(100), nullable=False),
            sa.Column("parent_id", UUID(as_uuid=False), sa.ForeignKey("onramp_agent_sessions.id", ondelete="SET NULL"), nullable=True),
            sa.Column("root_task_id", UUID(as_uuid=False), sa.ForeignKey("onramp_tasks.task_id", ondelete="SET NULL"), nullable=True),
            sa.Column("team_id", UUID(as_uuid=False), sa.ForeignKey("teams.id", ondelete="SET NULL"), nullable=True),
            sa.Column("user_id", UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("index_id", sa.String(64), nullable=True),
            sa.Column("state", sa.String(30), nullable=False, server_default="active"),
            sa.Column("system_prompt", sa.Text, nullable=True),
            sa.Column("system_prompt_version", sa.Integer, nullable=False, server_default="1"),
            sa.Column("scratchpad", JSONB, nullable=True),
            sa.Column("turn_count", sa.Integer, nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )

    if not inspector.has_table("onramp_agent_messages"):
        op.create_table(
            "onramp_agent_messages",
            sa.Column("id", UUID(as_uuid=False), primary_key=True),
            sa.Column("session_id", UUID(as_uuid=False), sa.ForeignKey("onramp_agent_sessions.id", ondelete="CASCADE"), nullable=False),
            sa.Column("role", sa.String(20), nullable=False),
            sa.Column("agent_type", sa.String(100), nullable=True),
            sa.Column("content", sa.Text, nullable=False),
            sa.Column("tool_calls", JSONB, nullable=True),
            sa.Column("token_count", sa.Integer, nullable=True),
            sa.Column("handoff_to", sa.String(100), nullable=True),
            sa.Column("handoff_payload", JSONB, nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )

    if not inspector.has_table("onramp_agent_events"):
        op.create_table(
            "onramp_agent_events",
            sa.Column("id", UUID(as_uuid=False), primary_key=True),
            sa.Column("event_type", sa.String(100), nullable=False),
            sa.Column("source_session_id", UUID(as_uuid=False), sa.ForeignKey("onramp_agent_sessions.id", ondelete="SET NULL"), nullable=True),
            sa.Column("source_agent", sa.String(100), nullable=True),
            sa.Column("target_agent", sa.String(100), nullable=True),
            sa.Column("payload", JSONB, nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )

    # Indexes — create IF NOT EXISTS via raw SQL for idempotency
    op.execute("CREATE INDEX IF NOT EXISTS ix_agent_sessions_agent_type ON onramp_agent_sessions (agent_type)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_agent_sessions_parent ON onramp_agent_sessions (parent_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_agent_sessions_root_task ON onramp_agent_sessions (root_task_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_agent_sessions_index ON onramp_agent_sessions (index_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_agent_sessions_agent_state ON onramp_agent_sessions (agent_type, state)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_agent_messages_session_created ON onramp_agent_messages (session_id, created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_agent_events_type_created ON onramp_agent_events (event_type, created_at)")


def downgrade() -> None:
    op.drop_table("onramp_agent_events", if_exists=True)
    op.drop_table("onramp_agent_messages", if_exists=True)
    op.drop_table("onramp_agent_sessions", if_exists=True)
