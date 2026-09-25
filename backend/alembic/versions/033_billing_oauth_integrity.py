"""billing idempotency status and immutable GitHub identity uniqueness

Revision ID: 033_billing_oauth_integrity
Revises: 032_backfill_team_roles
Create Date: 2026-09-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "033_billing_oauth_integrity"
down_revision: Union[str, None] = "032_backfill_team_roles"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _offline() -> bool:
    return getattr(op.get_context(), "as_sql", False)


def _has_column(table: str, column: str) -> bool:
    if _offline():
        return False
    inspector = sa.inspect(op.get_bind())
    return inspector.has_table(table) and column in {
        item["name"] for item in inspector.get_columns(table)
    }


def _has_constraint(name: str) -> bool:
    if _offline():
        return False
    inspector = sa.inspect(op.get_bind())
    return any(item.get("name") == name for item in inspector.get_unique_constraints("users"))


def upgrade() -> None:
    if not _has_column("onramp_webhook_idempotency", "status"):
        op.add_column(
            "onramp_webhook_idempotency",
            sa.Column(
                "status",
                sa.String(length=20),
                nullable=False,
                server_default="done",
            ),
        )
    if not _has_column("onramp_webhook_idempotency", "claim_token"):
        op.add_column(
            "onramp_webhook_idempotency",
            sa.Column("claim_token", sa.String(length=64), nullable=True),
        )

    if _offline():
        op.create_index(
            "ix_webhook_idempotency_status",
            "onramp_webhook_idempotency",
            ["status"],
            unique=False,
        )
    else:
        indexes = {
            item["name"]
            for item in sa.inspect(op.get_bind()).get_indexes(
                "onramp_webhook_idempotency"
            )
        }
        if "ix_webhook_idempotency_status" not in indexes:
            op.create_index(
                "ix_webhook_idempotency_status",
                "onramp_webhook_idempotency",
                ["status"],
                unique=False,
            )

    # A non-null GitHub account id is immutable and globally identifies one
    # account. Multiple NULL values remain valid because the constraint is not
    # partial; PostgreSQL permits any number of NULLs in a unique constraint.
    if not _has_constraint("uq_users_github_id"):
        with op.batch_alter_table("users", schema=None) as batch_op:
            batch_op.create_unique_constraint("uq_users_github_id", ["github_id"])


def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_constraint("uq_users_github_id", type_="unique")
    op.drop_index(
        "ix_webhook_idempotency_status",
        table_name="onramp_webhook_idempotency",
    )
    op.drop_column("onramp_webhook_idempotency", "claim_token")
    op.drop_column("onramp_webhook_idempotency", "status")
