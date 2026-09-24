"""scope agent events to teams

Revision ID: 030_agent_event_tenant_scope
Revises: 029_add_refresh_tokens
Create Date: 2026-09-23
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "030_agent_event_tenant_scope"
down_revision: Union[str, None] = "029_add_refresh_tokens"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    offline = getattr(op.get_context(), "as_sql", False)
    inspector = None if offline else sa.inspect(op.get_bind())
    if not offline and not inspector.has_table("onramp_agent_events"):
        return

    if offline:
        op.add_column(
            "onramp_agent_events",
            sa.Column("team_id", sa.UUID(as_uuid=False), nullable=True),
        )
        op.create_foreign_key(
            "fk_agent_events_team_id",
            "onramp_agent_events",
            "teams",
            ["team_id"],
            ["id"],
            ondelete="SET NULL",
        )
        op.create_index("ix_agent_events_team_id", "onramp_agent_events", ["team_id"])
        op.create_index(
            "ix_agent_events_team_created",
            "onramp_agent_events",
            ["team_id", "created_at"],
        )
        return

    columns = {column["name"] for column in inspector.get_columns("onramp_agent_events")}
    if "team_id" not in columns:
        op.add_column(
            "onramp_agent_events",
            sa.Column("team_id", sa.UUID(as_uuid=False), nullable=True),
        )
        op.create_foreign_key(
            "fk_agent_events_team_id",
            "onramp_agent_events",
            "teams",
            ["team_id"],
            ["id"],
            ondelete="SET NULL",
        )

    indexes = {index["name"] for index in inspector.get_indexes("onramp_agent_events")}
    if "ix_agent_events_team_id" not in indexes:
        op.create_index("ix_agent_events_team_id", "onramp_agent_events", ["team_id"])
    if "ix_agent_events_team_created" not in indexes:
        op.create_index(
            "ix_agent_events_team_created",
            "onramp_agent_events",
            ["team_id", "created_at"],
        )


def downgrade() -> None:
    offline = getattr(op.get_context(), "as_sql", False)
    inspector = None if offline else sa.inspect(op.get_bind())
    if not offline and not inspector.has_table("onramp_agent_events"):
        return

    if offline:
        op.drop_index("ix_agent_events_team_created", table_name="onramp_agent_events")
        op.drop_index("ix_agent_events_team_id", table_name="onramp_agent_events")
        op.drop_constraint("fk_agent_events_team_id", "onramp_agent_events", type_="foreignkey")
        op.drop_column("onramp_agent_events", "team_id")
        return

    indexes = {index["name"] for index in inspector.get_indexes("onramp_agent_events")}
    if "ix_agent_events_team_created" in indexes:
        op.drop_index("ix_agent_events_team_created", table_name="onramp_agent_events")
    if "ix_agent_events_team_id" in indexes:
        op.drop_index("ix_agent_events_team_id", table_name="onramp_agent_events")

    columns = {column["name"] for column in inspector.get_columns("onramp_agent_events")}
    if "team_id" in columns:
        op.drop_constraint(
            "fk_agent_events_team_id",
            "onramp_agent_events",
            type_="foreignkey",
        )
        op.drop_column("onramp_agent_events", "team_id")
