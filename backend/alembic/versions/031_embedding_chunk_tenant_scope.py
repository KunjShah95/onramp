"""add tenant scope to embedding chunks

Revision ID: 031_embedding_chunk_tenant_scope
Revises: 030_agent_event_tenant_scope
Create Date: 2026-09-24
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "031_embedding_chunk_tenant_scope"
down_revision: Union[str, None] = "030_agent_event_tenant_scope"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("onramp_embedding_chunks"):
        return
    columns = {column["name"] for column in inspector.get_columns("onramp_embedding_chunks")}
    if "team_id" not in columns:
        op.add_column(
            "onramp_embedding_chunks",
            sa.Column("team_id", sa.UUID(as_uuid=False), nullable=True),
        )
        op.create_foreign_key(
            "fk_embedding_chunks_team_id",
            "onramp_embedding_chunks",
            "teams",
            ["team_id"],
            ["id"],
            ondelete="SET NULL",
        )
    indexes = {index["name"] for index in inspector.get_indexes("onramp_embedding_chunks")}
    if "ix_embedding_chunks_team_id" not in indexes:
        op.create_index("ix_embedding_chunks_team_id", "onramp_embedding_chunks", ["team_id"])


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("onramp_embedding_chunks"):
        return
    indexes = {index["name"] for index in inspector.get_indexes("onramp_embedding_chunks")}
    if "ix_embedding_chunks_team_id" in indexes:
        op.drop_index("ix_embedding_chunks_team_id", table_name="onramp_embedding_chunks")
    columns = {column["name"] for column in inspector.get_columns("onramp_embedding_chunks")}
    if "team_id" in columns:
        op.drop_constraint(
            "fk_embedding_chunks_team_id",
            "onramp_embedding_chunks",
            type_="foreignkey",
        )
        op.drop_column("onramp_embedding_chunks", "team_id")
