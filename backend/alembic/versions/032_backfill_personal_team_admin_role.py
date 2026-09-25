"""Safely backfill roles for explicitly identified personal teams.

Revision ID: 032_backfill_personal_team_admin_role
Revises: 031_embedding_chunk_tenant_scope
Create Date: 2026-09-24

Older registration code could create a one-person team and assign its owner
``junior_dev``.  It is not safe to infer that a sole member makes a team
personal: a deliberately one-person *organization* is a valid team and must
retain its role.

The current ``teams`` schema has no explicit ``is_personal``/team-kind field,
and the description/name used by the old registration code is not sufficiently
authoritative to identify a personal workspace.  Therefore this migration is
intentionally a safe no-op rather than an escalation of arbitrary one-person
teams.  A future migration may backfill only teams carrying an explicit
personal marker (for example ``is_personal = true``) after that marker has
been populated and reviewed.  Keep this revision in the chain so deployments
that already recorded it can apply the corrected, no-op behavior.
"""

from typing import Sequence, Union

revision: str = "032_backfill_team_roles"
down_revision: Union[str, None] = "031_embedding_chunk_tenant_scope"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Do not infer personal ownership from team cardinality.

    Once an explicit personal marker exists, a later reviewed migration can
    update only members of those marked teams.  Until then, changing roles here
    could grant admin access to arbitrary one-person organizations.
    """
    return None


def downgrade() -> None:
    # No rows are changed, so there is nothing safe to reverse.
    return None
