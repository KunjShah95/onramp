"""Add onramp_feature_flags table and roast_mode_enabled column

Revision ID: 011_feature_flags_roast_mode
Revises: 010_backfill_email_hash
Create Date: 2026-07-27 00:00:00.000000

Adds the onramp_feature_flags table (FeatureFlag model) that was defined
in models.py but never created in the database, and adds the
roast_mode_enabled column to onramp_notification_preferences that was added
to the model after migration 008 was written.

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


# revision identifiers, used by Alembic.
revision: str = "011_feature_flags_roast_mode"
down_revision: Union[str, None] = "010_backfill_email_hash"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(name)


def _existing_indexes(table: str) -> set:
    if not _has_table(table):
        return set()
    return {ix["name"] for ix in sa.inspect(op.get_bind()).get_indexes(table)}


def _create_index(name: str, table: str, cols: list, unique: bool = False) -> None:
    if not _has_table(table):
        return
    if name in _existing_indexes(table):
        return
    op.create_index(name, table, cols, unique=unique)


def upgrade() -> None:
    # ── onramp_feature_flags (new table) ────────────────────────────────────
    if not _has_table("onramp_feature_flags"):
        op.create_table(
            "onramp_feature_flags",
            sa.Column("id", UUID(as_uuid=False), primary_key=True),
            sa.Column("team_id", UUID(as_uuid=False), sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False),
            sa.Column("flag_name", sa.String(255), nullable=False),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_by", UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("team_id", "flag_name", name="uq_team_feature_flag"),
        )
    _create_index("ix_onramp_feature_flags_team_id", "onramp_feature_flags", ["team_id"])
    _create_index("ix_feature_flags_team", "onramp_feature_flags", ["team_id"])

    # ── roast_mode_enabled column (added to existing notification_preferences) ──
    if _has_table("onramp_notification_preferences"):
        insp = sa.inspect(op.get_bind())
        columns = {c["name"] for c in insp.get_columns("onramp_notification_preferences")}
        if "roast_mode_enabled" not in columns:
            op.add_column(
                "onramp_notification_preferences",
                sa.Column("roast_mode_enabled", sa.Boolean(), nullable=False,
                          server_default=sa.false()),
            )


def downgrade() -> None:
    # Drop onramp_feature_flags table
    op.drop_table("onramp_feature_flags", if_exists=True)

    # Remove roast_mode_enabled column
    if _has_table("onramp_notification_preferences"):
        insp = sa.inspect(op.get_bind())
        columns = {c["name"] for c in insp.get_columns("onramp_notification_preferences")}
        if "roast_mode_enabled" in columns:
            op.drop_column("onramp_notification_preferences", "roast_mode_enabled")
