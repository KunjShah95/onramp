"""Move product feature collections out of the generic JSON document table.

Revision ID: 037_product_data_tables
Revises: 036_subscription_lifecycle
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "037_product_data_tables"
down_revision: Union[str, None] = "036_subscription_lifecycle"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    now = sa.text("now()")
    op.create_table(
        "comprehension_states",
        sa.Column("id", sa.String(255), primary_key=True),
        sa.Column("uid", sa.String(255), nullable=False),
        sa.Column("repo_key", sa.String(500), nullable=False),
        sa.Column("branch", sa.String(255), nullable=False, server_default="main"),
        sa.Column("team_id", sa.String(255), nullable=True),
        sa.Column("lit", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("attempts", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
    )
    op.create_index("ix_comprehension_states_uid", "comprehension_states", ["uid"])
    op.create_index("ix_comprehension_states_repo_branch", "comprehension_states", ["repo_key", "branch"])
    op.create_index("ix_comprehension_states_team", "comprehension_states", ["team_id"])

    op.create_table(
        "walkthroughs",
        sa.Column("id", sa.String(255), primary_key=True),
        sa.Column("repo_key", sa.String(500), nullable=False),
        sa.Column("branch", sa.String(255), nullable=False, server_default="main"),
        sa.Column("team_id", sa.String(255), nullable=True),
        sa.Column("author_uid", sa.String(255), nullable=True),
        sa.Column("author_name", sa.String(255), nullable=False, server_default=""),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("steps", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("pinned_commit", sa.String(100), nullable=True),
        sa.Column("completed_by", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("verified_by", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
    )
    op.create_index("ix_walkthroughs_repo_branch", "walkthroughs", ["repo_key", "branch"])
    op.create_index("ix_walkthroughs_team", "walkthroughs", ["team_id"])

    op.create_table(
        "module_discussions",
        sa.Column("id", sa.String(255), primary_key=True),
        sa.Column("repo_key", sa.String(500), nullable=False),
        sa.Column("path", sa.Text(), nullable=False),
        sa.Column("entries", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
    )
    op.create_index("ix_module_discussions_repo_path", "module_discussions", ["repo_key", "path"])

    op.create_table(
        "leads",
        sa.Column("id", sa.String(255), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("company", sa.String(120), nullable=True),
        sa.Column("subject", sa.String(160), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("utm_source", sa.String(64), nullable=True),
        sa.Column("utm_medium", sa.String(64), nullable=True),
        sa.Column("utm_campaign", sa.String(64), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="new"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
    )
    op.create_index("ix_leads_created_at", "leads", ["created_at"])
    op.create_index("ix_leads_utm_source", "leads", ["utm_source"])

    op.create_table(
        "signup_attribution",
        sa.Column("id", sa.String(255), primary_key=True),
        sa.Column("user_id", sa.String(255), nullable=False, unique=True),
        sa.Column("utm_source", sa.String(64), nullable=True),
        sa.Column("utm_medium", sa.String(64), nullable=True),
        sa.Column("utm_campaign", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
    )

    # Keep the generic JSON copies during the rollout. This protects rollback
    # and lets a mixed-version deployment continue to read its old schema.
    op.get_bind().execute(sa.text("""
        INSERT INTO comprehension_states
            (id, uid, repo_key, branch, team_id, lit, attempts, created_at, updated_at)
        SELECT id, COALESCE(data->>'uid', ''), COALESCE(data->>'repo_key', ''),
               COALESCE(NULLIF(data->>'branch', ''), 'main'), data->>'team_id',
               COALESCE(data->'lit', '{}'::jsonb), COALESCE(data->'attempts', '{}'::jsonb),
               created_at, updated_at
          FROM dynamic_documents WHERE collection = 'comprehension_states'
        ON CONFLICT (id) DO NOTHING
    """))
    op.get_bind().execute(sa.text("""
        INSERT INTO walkthroughs
            (id, repo_key, branch, team_id, author_uid, author_name, title, summary,
             steps, pinned_commit, completed_by, verified_by, created_at, updated_at)
        SELECT id, COALESCE(data->>'repo_key', ''),
               COALESCE(NULLIF(data->>'branch', ''), 'main'), data->>'team_id',
               data->>'author_uid', COALESCE(data->>'author_name', ''),
               COALESCE(data->>'title', ''), COALESCE(data->>'summary', ''),
               COALESCE(data->'steps', '[]'::jsonb), data->>'pinned_commit',
               COALESCE(data->'completed_by', '[]'::jsonb), data->>'verified_by',
               created_at, updated_at
          FROM dynamic_documents WHERE collection = 'walkthroughs'
        ON CONFLICT (id) DO NOTHING
    """))
    op.get_bind().execute(sa.text("""
        INSERT INTO module_discussions (id, repo_key, path, entries, created_at, updated_at)
        SELECT id, COALESCE(data->>'repo_key', ''), COALESCE(data->>'path', ''),
               COALESCE(data->'entries', '[]'::jsonb), created_at, updated_at
          FROM dynamic_documents WHERE collection = 'module_discussions'
        ON CONFLICT (id) DO NOTHING
    """))
    op.get_bind().execute(sa.text("""
        INSERT INTO leads
            (id, name, email, company, subject, message, utm_source, utm_medium,
             utm_campaign, status, created_at, updated_at)
        SELECT id, COALESCE(data->>'name', ''), COALESCE(data->>'email', ''),
               data->>'company', data->>'subject', COALESCE(data->>'message', ''),
               data->>'utm_source', data->>'utm_medium', data->>'utm_campaign',
               COALESCE(data->>'status', 'new'),
               COALESCE(NULLIF(data->>'created_at', '')::timestamptz, created_at), updated_at
          FROM dynamic_documents WHERE collection = 'leads'
        ON CONFLICT (id) DO NOTHING
    """))
    op.get_bind().execute(sa.text("""
        INSERT INTO signup_attribution
            (id, user_id, utm_source, utm_medium, utm_campaign, created_at, updated_at)
        SELECT id, COALESCE(data->>'user_id', id), data->>'utm_source',
               data->>'utm_medium', data->>'utm_campaign',
               COALESCE(NULLIF(data->>'created_at', '')::timestamptz, created_at), updated_at
          FROM dynamic_documents WHERE collection = 'signup_attribution'
        ON CONFLICT (id) DO NOTHING
    """))


def downgrade() -> None:
    # Re-materialize current typed rows before dropping the tables so downgrade
    # preserves any writes made after upgrade, not only the initial backfill.
    op.get_bind().execute(sa.text("""
        INSERT INTO dynamic_documents (id, collection, data)
        SELECT id, 'comprehension_states', jsonb_build_object(
            'uid', uid, 'repo_key', repo_key, 'branch', branch, 'team_id', team_id,
            'lit', lit, 'attempts', attempts, 'updated_at', updated_at)
        FROM comprehension_states
        ON CONFLICT (id, collection) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
    """))
    op.get_bind().execute(sa.text("""
        INSERT INTO dynamic_documents (id, collection, data)
        SELECT id, 'walkthroughs', jsonb_build_object(
            'repo_key', repo_key, 'branch', branch, 'team_id', team_id,
            'author_uid', author_uid, 'author_name', author_name, 'title', title,
            'summary', summary, 'steps', steps, 'pinned_commit', pinned_commit,
            'completed_by', completed_by, 'verified_by', verified_by,
            'created_at', created_at, 'updated_at', updated_at)
        FROM walkthroughs
        ON CONFLICT (id, collection) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
    """))
    op.get_bind().execute(sa.text("""
        INSERT INTO dynamic_documents (id, collection, data)
        SELECT id, 'module_discussions', jsonb_build_object(
            'repo_key', repo_key, 'path', path, 'entries', entries, 'updated_at', updated_at)
        FROM module_discussions
        ON CONFLICT (id, collection) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
    """))
    op.get_bind().execute(sa.text("""
        INSERT INTO dynamic_documents (id, collection, data)
        SELECT id, 'leads', jsonb_build_object(
            'name', name, 'email', email, 'company', company, 'subject', subject,
            'message', message, 'utm_source', utm_source, 'utm_medium', utm_medium,
            'utm_campaign', utm_campaign, 'status', status, 'created_at', created_at)
        FROM leads
        ON CONFLICT (id, collection) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
    """))
    op.get_bind().execute(sa.text("""
        INSERT INTO dynamic_documents (id, collection, data)
        SELECT id, 'signup_attribution', jsonb_build_object(
            'user_id', user_id, 'utm_source', utm_source, 'utm_medium', utm_medium,
            'utm_campaign', utm_campaign, 'created_at', created_at)
        FROM signup_attribution
        ON CONFLICT (id, collection) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
    """))

    op.drop_table("signup_attribution")
    op.drop_index("ix_leads_utm_source", table_name="leads")
    op.drop_index("ix_leads_created_at", table_name="leads")
    op.drop_table("leads")
    op.drop_index("ix_module_discussions_repo_path", table_name="module_discussions")
    op.drop_table("module_discussions")
    op.drop_index("ix_walkthroughs_team", table_name="walkthroughs")
    op.drop_index("ix_walkthroughs_repo_branch", table_name="walkthroughs")
    op.drop_table("walkthroughs")
    op.drop_index("ix_comprehension_states_team", table_name="comprehension_states")
    op.drop_index("ix_comprehension_states_repo_branch", table_name="comprehension_states")
    op.drop_index("ix_comprehension_states_uid", table_name="comprehension_states")
    op.drop_table("comprehension_states")
