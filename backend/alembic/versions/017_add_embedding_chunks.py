"""add embedding chunks pgvector table

Revision ID: 017_add_embedding_chunks
Revises: 016_add_deps_refresh
Create Date: 2026-08-08 00:00:00.000000

Adds the ``onramp_embedding_chunks`` table (pgvector-backed semantic search)
and the ``vector`` extension it depends on. Guarded so re-runs are no-ops.

IMPORTANT: the vector column is fixed-dimension. The deployment must set
``EMBEDDING_DIMENSIONS`` to match the chosen embedding provider's output
dimension BEFORE running this migration (default 1536 = OpenAI
``text-embedding-3-small``). Changing it afterwards requires a new migration.
"""

import os
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision: str = "017_add_embedding_chunks"
down_revision: Union[str, None] = "016_add_deps_refresh"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _dimensions() -> int:
    return int(os.getenv("EMBEDDING_DIMENSIONS", "1536"))


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("onramp_embedding_chunks"):
        op.create_table(
            "onramp_embedding_chunks",
            sa.Column("chunk_id", sa.String(255), primary_key=True),
            sa.Column("index_id", sa.String(255), nullable=False),
            sa.Column("filename", sa.String(1000), nullable=False),
            sa.Column("content", sa.Text, nullable=False),
            sa.Column("doc_type", sa.String(20), nullable=False, server_default="code"),
            sa.Column("vector", Vector(_dimensions()), nullable=True),
            sa.Column("embedding_model", sa.String(255), nullable=True),
            sa.Column("embedding_dims", sa.Integer, nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
    indexes = {ix["name"] for ix in inspector.get_indexes("onramp_embedding_chunks")}
    if "ix_embedding_chunks_index_id" not in indexes:
        op.create_index(
            "ix_embedding_chunks_index_id",
            "onramp_embedding_chunks",
            ["index_id"],
        )
    # HNSW ANN index over the vector column (cosine distance). Requires the
    # vector extension and a fixed-dimension column.
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_embedding_chunks_vector "
        "ON onramp_embedding_chunks USING hnsw (vector vector_cosine_ops)"
    )


def downgrade() -> None:
    op.drop_index("ix_embedding_chunks_vector", table_name="onramp_embedding_chunks", if_exists=True)
    op.drop_index("ix_embedding_chunks_index_id", table_name="onramp_embedding_chunks", if_exists=True)
    op.drop_table("onramp_embedding_chunks", if_exists=True)
    # The `vector` extension is intentionally NOT dropped — it may be shared.
