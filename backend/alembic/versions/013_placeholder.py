"""placeholder for missing revision 013 — intentional gap

Revision ID: 013_placeholder
Revises: 012_add_hr_role
Create Date: 2026-07-31 00:00:00.000000

Revision 013 was reserved during Wave 2 but never landed (its change was
squashed into 012/014). Alembic's linear history skipped from 012→014.
This placeholder exists solely to document the gap and prevent future
reuse of the 013 slot. It performs no schema change and is safe to run
idempotently. If a real 013 migration is ever needed, replace this file
and keep the revision ID stable.

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '013_placeholder'
down_revision: Union[str, None] = '012_add_hr_role'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # No-op — gap documentation only.
    pass


def downgrade() -> None:
    pass
