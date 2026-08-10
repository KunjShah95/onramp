"""add per-team BYOK provider keys table

Revision ID: 024_team_provider_keys
Revises: 023_razorpay_billing
Create Date: 2026-08-10 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '024_team_provider_keys'
down_revision: Union[str, None] = '023_razorpay_billing'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'onramp_team_provider_keys',
        sa.Column('id', sa.UUID(as_uuid=False), primary_key=True),
        sa.Column('team_id', sa.String(255), nullable=False),
        sa.Column('provider', sa.String(50), nullable=False),
        sa.Column('api_key_encrypted', sa.Text(), nullable=False),
        sa.Column('created_by', sa.String(255), nullable=True),
        sa.Column('updated_by', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('team_id', 'provider', name='uq_team_provider_key'),
    )
    op.create_index('ix_team_provider_keys_team_id', 'onramp_team_provider_keys', ['team_id'])
    op.create_index('ix_team_provider_keys_provider', 'onramp_team_provider_keys', ['provider'])


def downgrade() -> None:
    op.drop_index('ix_team_provider_keys_provider', table_name='onramp_team_provider_keys')
    op.drop_index('ix_team_provider_keys_team_id', table_name='onramp_team_provider_keys')
    op.drop_table('onramp_team_provider_keys')
