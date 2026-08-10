"""rename stripe billing columns to razorpay on onramp_subscriptions

Revision ID: 023_razorpay_billing
Revises: 022_backfill_encrypt_pii
Create Date: 2026-08-09 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '023_razorpay_billing'
down_revision: Union[str, None] = '022_backfill_encrypt_pii'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('onramp_subscriptions', 'stripe_customer_id',
                    new_column_name='razorpay_customer_id', existing_type=sa.String(255))
    op.alter_column('onramp_subscriptions', 'stripe_subscription_id',
                    new_column_name='razorpay_subscription_id', existing_type=sa.String(255))
    op.add_column('onramp_subscriptions', sa.Column('razorpay_payment_id', sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column('onramp_subscriptions', 'razorpay_payment_id')
    op.alter_column('onramp_subscriptions', 'razorpay_subscription_id',
                    new_column_name='stripe_subscription_id', existing_type=sa.String(255))
    op.alter_column('onramp_subscriptions', 'razorpay_customer_id',
                    new_column_name='stripe_customer_id', existing_type=sa.String(255))
