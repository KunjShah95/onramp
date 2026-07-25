"""Add proper SQLAlchemy tables for previously DynamicDocument-only collections

Revision ID: 008_add_dynamic_tables
Revises: 007_expand_roles
Create Date: 2026-07-23 00:00:00.000000

Adds dedicated PostgreSQL tables for the collections that were previously
stored as JSONB blobs in the dynamic_documents table:

  - onramp_tasks              (workflow tasks)
  - onramp_notifications      (in-app notifications)
  - onramp_notification_preferences (notification settings)
  - onramp_gamification_xp    (experience points)
  - onramp_gamification_badges (earned badges)
  - onramp_gamification_streaks (login streaks)
  - onramp_subscriptions      (team billing subscriptions)
  - onramp_webhooks           (webhook endpoints)
  - onramp_integrations       (Slack/GitHub integration configs)
  - onramp_conversations      (Ask Q&A history)
  - onramp_learning_paths     (generated learning paths)
  - onramp_quizzes            (quiz definitions)
  - onramp_quiz_results       (quiz submissions)
  - member_modules            (module-level access permissions)
  - team_invites              (email-based team invitations)
  - onramp_playbooks          (onboarding playbooks)
  - onramp_milestones         (contribution milestones)
  - onramp_audit_log          (security audit events)
  - onramp_webhook_idempotency (Stripe idempotency keys)
  - onramp_webhook_events     (Stripe webhook event log)
  - onramp_webhook_deliveries (webhook delivery attempts)

This migration targets ``Base.metadata.create_all`` parity: every table,
column, primary key, unique constraint and index that the SQLAlchemy models
in ``app.database.models`` would produce is created here explicitly.

IMPORTANT: ``op.create_table`` ignores the ``index=True`` keyword on a
``sa.Column`` — those single-column indexes must be created explicitly with
``op.create_index``. All such auto-named ``ix_<table>_<column>`` indexes are
created below so the migration matches ``create_all`` exactly.

Safety: every ``create_table``/``create_index`` is guarded against objects
that already exist (e.g. a dev database bootstrapped via ``create_all``), so
re-running the migration is a no-op rather than an error.

Data migration: Existing dynamic_documents rows for these collections are NOT
auto-migrated. To migrate existing data, run the companion script
scripts/migrate_dynamic_to_tables.py.

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

# revision identifiers, used by Alembic.
revision: str = "008_add_dynamic_tables"
down_revision: Union[str, None] = "007_expand_roles"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ── Idempotency helpers ──────────────────────────────────────────────────────


def _inspector():
    return sa.inspect(op.get_bind())


def _has_table(name: str) -> bool:
    return _inspector().has_table(name)


def _existing_indexes(table: str) -> set:
    if not _has_table(table):
        return set()
    return {ix["name"] for ix in _inspector().get_indexes(table)}


def _create_index(name: str, table: str, cols: list, unique: bool = False) -> None:
    """Create an index only if the table exists and the index does not."""
    if not _has_table(table):
        return
    if name in _existing_indexes(table):
        return
    op.create_index(name, table, cols, unique=unique)


def upgrade() -> None:
    # ── onramp_tasks ────────────────────────────────────────────────────────
    if not _has_table("onramp_tasks"):
        op.create_table(
            "onramp_tasks",
            sa.Column("task_id", UUID(as_uuid=False), primary_key=True),
            sa.Column("team_id", UUID(as_uuid=False), sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False),
            sa.Column("created_by", UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("assigned_to", UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("title", sa.String(500), nullable=False),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("module", sa.String(100), nullable=True),
            sa.Column("state", sa.String(20), nullable=True),
            sa.Column("priority", sa.String(20), nullable=True),
            sa.Column("pr_url", sa.String(1000), nullable=True),
            sa.Column("branch", sa.String(255), nullable=True),
            sa.Column("repo_url", sa.String(1000), nullable=True),
            sa.Column("unlock_modules", JSONB, nullable=False),
            sa.Column("review_feedback", JSONB, nullable=True),
            sa.Column("ai_review", JSONB, nullable=True),
            sa.Column("product_signoff", sa.Boolean, nullable=True),
            sa.Column("estimated_hours", sa.Float, nullable=True),
            sa.Column("reviewed_by", sa.String(255), nullable=True),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
    _create_index("ix_onramp_tasks_team_id", "onramp_tasks", ["team_id"])
    _create_index("ix_onramp_tasks_assigned_to", "onramp_tasks", ["assigned_to"])
    _create_index("ix_onramp_tasks_state", "onramp_tasks", ["state"])
    _create_index("ix_tasks_team_state", "onramp_tasks", ["team_id", "state"])
    _create_index("ix_tasks_assigned_state", "onramp_tasks", ["assigned_to", "state"])
    _create_index("ix_tasks_created_at", "onramp_tasks", ["created_at"])

    # ── onramp_notifications ────────────────────────────────────────────────
    if not _has_table("onramp_notifications"):
        op.create_table(
            "onramp_notifications",
            sa.Column("notification_id", UUID(as_uuid=False), primary_key=True),
            sa.Column("user_id", UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("type", sa.String(50), nullable=False),
            sa.Column("title", sa.String(255), nullable=False),
            sa.Column("message", sa.String(500), nullable=False),
            sa.Column("full_message", sa.Text, nullable=True),
            sa.Column("metadata", JSONB, nullable=True),
            sa.Column("team_id", UUID(as_uuid=False), sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=True),
            sa.Column("read", sa.Boolean, nullable=True),
            sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
    _create_index("ix_onramp_notifications_user_id", "onramp_notifications", ["user_id"])
    _create_index("ix_onramp_notifications_type", "onramp_notifications", ["type"])
    _create_index("ix_notifications_user_read", "onramp_notifications", ["user_id", "read"])
    _create_index("ix_notifications_created_at", "onramp_notifications", ["created_at"])

    # ── onramp_notification_preferences ─────────────────────────────────────
    if not _has_table("onramp_notification_preferences"):
        op.create_table(
            "onramp_notification_preferences",
            sa.Column("user_id", UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("channels", JSONB, nullable=False),
            sa.Column("digest_frequency", sa.String(20), nullable=True),
            sa.Column("quiet_hours_enabled", sa.Boolean, nullable=True),
            sa.Column("quiet_hours_start", sa.String(10), nullable=True),
            sa.Column("quiet_hours_end", sa.String(10), nullable=True),
            sa.Column("email_digest_time", sa.String(10), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )

    # ── onramp_gamification_xp ─────────────────────────────────────────────
    if not _has_table("onramp_gamification_xp"):
        op.create_table(
            "onramp_gamification_xp",
            sa.Column("xp_id", UUID(as_uuid=False), primary_key=True),
            sa.Column("user_id", UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("source", sa.String(50), nullable=False),
            sa.Column("amount", sa.Integer, nullable=False),
            sa.Column("date", sa.String(20), nullable=False),
            sa.Column("team_id", UUID(as_uuid=False), sa.ForeignKey("teams.id", ondelete="SET NULL"), nullable=True),
            sa.Column("metadata", JSONB, nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
    _create_index("ix_onramp_gamification_xp_user_id", "onramp_gamification_xp", ["user_id"])
    _create_index("ix_onramp_gamification_xp_date", "onramp_gamification_xp", ["date"])
    _create_index("ix_xp_user_source_date", "onramp_gamification_xp", ["user_id", "source", "date"])
    _create_index("ix_xp_team_date", "onramp_gamification_xp", ["team_id", "date"])

    # ── onramp_gamification_badges ──────────────────────────────────────────
    if not _has_table("onramp_gamification_badges"):
        op.create_table(
            "onramp_gamification_badges",
            sa.Column("badge_id", UUID(as_uuid=False), primary_key=True),
            sa.Column("user_id", UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("badge_key", sa.String(50), nullable=False),
            sa.Column("badge_name", sa.String(100), nullable=False),
            sa.Column("icon", sa.String(20), nullable=True),
            sa.Column("description", sa.String(500), nullable=True),
            sa.Column("xp_bonus", sa.Integer, nullable=True),
            sa.Column("team_id", UUID(as_uuid=False), sa.ForeignKey("teams.id", ondelete="SET NULL"), nullable=True),
            sa.Column("earned_at", sa.DateTime(timezone=True), nullable=False),
        )
    _create_index("ix_onramp_gamification_badges_user_id", "onramp_gamification_badges", ["user_id"])
    _create_index("ix_badges_user_key", "onramp_gamification_badges", ["user_id", "badge_key"])

    # ── onramp_gamification_streaks ─────────────────────────────────────────
    if not _has_table("onramp_gamification_streaks"):
        op.create_table(
            "onramp_gamification_streaks",
            sa.Column("streak_id", UUID(as_uuid=False), primary_key=True),
            sa.Column("user_id", UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
            sa.Column("current_streak", sa.Integer, nullable=True),
            sa.Column("longest_streak", sa.Integer, nullable=True),
            sa.Column("last_active_date", sa.String(20), nullable=True),
            sa.Column("streak_frozen", sa.Boolean, nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
    _create_index("ix_onramp_gamification_streaks_user_id", "onramp_gamification_streaks", ["user_id"], unique=True)

    # ── onramp_subscriptions ────────────────────────────────────────────────
    if not _has_table("onramp_subscriptions"):
        op.create_table(
            "onramp_subscriptions",
            sa.Column("subscription_id", UUID(as_uuid=False), primary_key=True),
            sa.Column("team_id", UUID(as_uuid=False), sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, unique=True),
            sa.Column("tier", sa.String(50), nullable=True),
            sa.Column("billing_cycle", sa.String(20), nullable=True),
            sa.Column("price", sa.Integer, nullable=True),
            sa.Column("status", sa.String(20), nullable=True),
            sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=True),
            sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
            sa.Column("stripe_customer_id", sa.String(255), nullable=True),
            sa.Column("stripe_subscription_id", sa.String(255), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
    _create_index("ix_onramp_subscriptions_team_id", "onramp_subscriptions", ["team_id"], unique=True)
    _create_index("ix_onramp_subscriptions_status", "onramp_subscriptions", ["status"])
    _create_index("ix_subscriptions_status", "onramp_subscriptions", ["status"])

    # ── onramp_webhooks ─────────────────────────────────────────────────────
    if not _has_table("onramp_webhooks"):
        op.create_table(
            "onramp_webhooks",
            sa.Column("webhook_id", UUID(as_uuid=False), primary_key=True),
            sa.Column("user_id", UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("url", sa.String(1000), nullable=False),
            sa.Column("events", JSONB, nullable=False),
            sa.Column("secret", sa.String(255), nullable=False),
            sa.Column("description", sa.String(500), nullable=True),
            sa.Column("team_id", UUID(as_uuid=False), sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=True),
            sa.Column("active", sa.Boolean, nullable=True),
            sa.Column("delivery_count", sa.Integer, nullable=True),
            sa.Column("failure_count", sa.Integer, nullable=True),
            sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_failure_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
    _create_index("ix_onramp_webhooks_user_id", "onramp_webhooks", ["user_id"])

    # ── onramp_integrations ─────────────────────────────────────────────────
    if not _has_table("onramp_integrations"):
        op.create_table(
            "onramp_integrations",
            sa.Column("id", UUID(as_uuid=False), primary_key=True),
            sa.Column("user_id", UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("integration", sa.String(50), nullable=False),
            sa.Column("config", JSONB, nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("user_id", "integration", name="uq_user_integration"),
        )
    _create_index("ix_onramp_integrations_user_id", "onramp_integrations", ["user_id"])

    # ── onramp_conversations ────────────────────────────────────────────────
    if not _has_table("onramp_conversations"):
        op.create_table(
            "onramp_conversations",
            sa.Column("id", UUID(as_uuid=False), primary_key=True),
            sa.Column("user_id", UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("index_id", sa.String(255), nullable=False),
            sa.Column("question", sa.Text, nullable=False),
            sa.Column("answer", sa.Text, nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
    _create_index("ix_onramp_conversations_user_id", "onramp_conversations", ["user_id"])
    _create_index("ix_onramp_conversations_index_id", "onramp_conversations", ["index_id"])
    _create_index("ix_conversations_user_index", "onramp_conversations", ["user_id", "index_id"])

    # ── onramp_learning_paths ───────────────────────────────────────────────
    if not _has_table("onramp_learning_paths"):
        op.create_table(
            "onramp_learning_paths",
            sa.Column("path_id", UUID(as_uuid=False), primary_key=True),
            sa.Column("user_id", UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("repo_url", sa.String(1000), nullable=True),
            sa.Column("user_level", sa.String(50), nullable=True),
            sa.Column("result", JSONB, nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
    _create_index("ix_onramp_learning_paths_user_id", "onramp_learning_paths", ["user_id"])
    _create_index("ix_learning_paths_user", "onramp_learning_paths", ["user_id"])

    # ── onramp_quizzes ──────────────────────────────────────────────────────
    if not _has_table("onramp_quizzes"):
        op.create_table(
            "onramp_quizzes",
            sa.Column("quiz_id", UUID(as_uuid=False), primary_key=True),
            sa.Column("user_id", UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("mode", sa.String(20), nullable=False),
            sa.Column("module", sa.String(100), nullable=True),
            sa.Column("difficulty", sa.String(20), nullable=True),
            sa.Column("total_questions", sa.Integer, nullable=True),
            sa.Column("questions", JSONB, nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
    _create_index("ix_onramp_quizzes_user_id", "onramp_quizzes", ["user_id"])
    _create_index("ix_quizzes_user_module", "onramp_quizzes", ["user_id", "module"])

    # ── onramp_quiz_results ─────────────────────────────────────────────────
    if not _has_table("onramp_quiz_results"):
        op.create_table(
            "onramp_quiz_results",
            sa.Column("result_id", UUID(as_uuid=False), primary_key=True),
            sa.Column("quiz_id", UUID(as_uuid=False), sa.ForeignKey("onramp_quizzes.quiz_id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("module", sa.String(100), nullable=True),
            sa.Column("answers", JSONB, nullable=False),
            sa.Column("score", sa.Integer, nullable=True),
            sa.Column("total", sa.Integer, nullable=True),
            sa.Column("percentage", sa.Float, nullable=True),
            sa.Column("passed", sa.Boolean, nullable=True),
            sa.Column("results", JSONB, nullable=True),
            sa.Column("summary", sa.Text, nullable=True),
            sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        )
    _create_index("ix_onramp_quiz_results_quiz_id", "onramp_quiz_results", ["quiz_id"])
    _create_index("ix_onramp_quiz_results_user_id", "onramp_quiz_results", ["user_id"])
    _create_index("ix_quiz_results_user_quiz", "onramp_quiz_results", ["user_id", "quiz_id"])

    # ── member_modules ──────────────────────────────────────────────────────
    if not _has_table("member_modules"):
        op.create_table(
            "member_modules",
            sa.Column("id", UUID(as_uuid=False), primary_key=True),
            sa.Column("team_id", UUID(as_uuid=False), sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("module", sa.String(100), nullable=False),
            sa.Column("granted_by", UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("source", sa.String(20), nullable=True),
            sa.UniqueConstraint("team_id", "user_id", "module", name="uq_member_module"),
        )
    _create_index("ix_member_modules_team_id", "member_modules", ["team_id"])
    _create_index("ix_member_modules_user_id", "member_modules", ["user_id"])
    _create_index("ix_member_modules_team_user", "member_modules", ["team_id", "user_id"])

    # ── team_invites ────────────────────────────────────────────────────────
    if not _has_table("team_invites"):
        op.create_table(
            "team_invites",
            sa.Column("id", UUID(as_uuid=False), primary_key=True),
            sa.Column("team_id", UUID(as_uuid=False), sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False),
            sa.Column("email", sa.String(255), nullable=False),
            sa.Column("invited_by", UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("token", sa.String(255), nullable=False, unique=True),
            sa.Column("role", sa.String(50), nullable=True),
            sa.Column("status", sa.String(20), nullable=True),
            sa.Column("message", sa.Text, nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
    _create_index("ix_team_invites_team_id", "team_invites", ["team_id"])
    _create_index("ix_team_invites_token", "team_invites", ["token"], unique=True)
    _create_index("ix_team_invites_status", "team_invites", ["status"])
    _create_index("ix_invites_email_status", "team_invites", ["email", "status"])

    # ── onramp_playbooks ────────────────────────────────────────────────────
    if not _has_table("onramp_playbooks"):
        op.create_table(
            "onramp_playbooks",
            sa.Column("playbook_id", UUID(as_uuid=False), primary_key=True),
            sa.Column("team_id", UUID(as_uuid=False), sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False),
            sa.Column("title", sa.String(255), nullable=False),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("steps", JSONB, nullable=False),
            sa.Column("tags", JSONB, nullable=False),
            sa.Column("created_by", UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("version", sa.Integer, nullable=True),
            sa.Column("is_archived", sa.Boolean, nullable=True),
            sa.Column("use_count", sa.Integer, nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
    _create_index("ix_onramp_playbooks_team_id", "onramp_playbooks", ["team_id"])
    _create_index("ix_playbooks_team", "onramp_playbooks", ["team_id", "is_archived"])

    # ── onramp_milestones ───────────────────────────────────────────────────
    if not _has_table("onramp_milestones"):
        op.create_table(
            "onramp_milestones",
            sa.Column("id", UUID(as_uuid=False), primary_key=True),
            sa.Column("user", sa.String(255), nullable=False),
            sa.Column("repo", sa.String(500), nullable=False),
            sa.Column("type", sa.String(50), nullable=False),
            sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
            sa.Column("metadata", JSONB, nullable=True),
        )
    _create_index("ix_onramp_milestones_user", "onramp_milestones", ["user"])
    _create_index("ix_onramp_milestones_repo", "onramp_milestones", ["repo"])
    _create_index("ix_onramp_milestones_type", "onramp_milestones", ["type"])
    _create_index("ix_milestones_user_type", "onramp_milestones", ["user", "type"])

    # ── onramp_audit_log ────────────────────────────────────────────────────
    if not _has_table("onramp_audit_log"):
        op.create_table(
            "onramp_audit_log",
            sa.Column("event_id", UUID(as_uuid=False), primary_key=True),
            sa.Column("event_type", sa.String(50), nullable=False),
            sa.Column("actor_id", UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("target_id", sa.String(500), nullable=True),
            sa.Column("team_id", UUID(as_uuid=False), sa.ForeignKey("teams.id", ondelete="SET NULL"), nullable=True),
            sa.Column("metadata", JSONB, nullable=True),
            sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        )
    _create_index("ix_onramp_audit_log_event_type", "onramp_audit_log", ["event_type"])
    _create_index("ix_onramp_audit_log_actor_id", "onramp_audit_log", ["actor_id"])
    _create_index("ix_onramp_audit_log_team_id", "onramp_audit_log", ["team_id"])
    _create_index("ix_onramp_audit_log_timestamp", "onramp_audit_log", ["timestamp"])
    _create_index("ix_audit_team_type", "onramp_audit_log", ["team_id", "event_type"])

    # ── onramp_webhooks must exist before onramp_webhook_deliveries FK ──────
    # ── onramp_webhook_deliveries ───────────────────────────────────────────
    if not _has_table("onramp_webhook_deliveries"):
        op.create_table(
            "onramp_webhook_deliveries",
            sa.Column("id", UUID(as_uuid=False), primary_key=True),
            sa.Column("webhook_id", UUID(as_uuid=False), sa.ForeignKey("onramp_webhooks.webhook_id", ondelete="CASCADE"), nullable=False),
            sa.Column("event_type", sa.String(100), nullable=False),
            sa.Column("url", sa.String(1000), nullable=False),
            sa.Column("status", sa.String(20), nullable=False),
            sa.Column("status_code", sa.Integer, nullable=True),
            sa.Column("response_body", sa.Text, nullable=True),
            sa.Column("error_message", sa.Text, nullable=True),
            sa.Column("duration_ms", sa.Integer, nullable=True),
            sa.Column("retry_count", sa.Integer, nullable=True),
            sa.Column("next_retry_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
    _create_index("ix_onramp_webhook_deliveries_webhook_id", "onramp_webhook_deliveries", ["webhook_id"])
    _create_index("ix_onramp_webhook_deliveries_status", "onramp_webhook_deliveries", ["status"])
    _create_index("ix_webhook_deliveries_webhook_id", "onramp_webhook_deliveries", ["webhook_id"])
    _create_index("ix_webhook_deliveries_status", "onramp_webhook_deliveries", ["status"])
    _create_index("ix_webhook_deliveries_created", "onramp_webhook_deliveries", ["created_at"])

    # ── onramp_webhook_idempotency ──────────────────────────────────────────
    if not _has_table("onramp_webhook_idempotency"):
        op.create_table(
            "onramp_webhook_idempotency",
            sa.Column("id", UUID(as_uuid=False), primary_key=True),
            sa.Column("idempotency_key", sa.String(255), nullable=False, unique=True),
            sa.Column("event_id", sa.String(255), nullable=False),
            sa.Column("event_type", sa.String(100), nullable=False),
            sa.Column("processed_at", sa.DateTime(timezone=True), nullable=False),
        )
    _create_index("ix_onramp_webhook_idempotency_idempotency_key", "onramp_webhook_idempotency", ["idempotency_key"], unique=True)

    # ── onramp_webhook_events ───────────────────────────────────────────────
    if not _has_table("onramp_webhook_events"):
        op.create_table(
            "onramp_webhook_events",
            sa.Column("event_id", sa.String(255), primary_key=True),
            sa.Column("event_type", sa.String(100), nullable=False),
            sa.Column("status", sa.String(20), nullable=False),
            sa.Column("details", JSONB, nullable=True),
            sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        )
    _create_index("ix_onramp_webhook_events_event_type", "onramp_webhook_events", ["event_type"])
    _create_index("ix_webhook_events_type", "onramp_webhook_events", ["event_type"])


def downgrade() -> None:
    """Drop all newly created tables in reverse dependency order."""
    tables_to_drop = [
        "onramp_webhook_deliveries",
        "onramp_webhook_events",
        "onramp_webhook_idempotency",
        "onramp_audit_log",
        "onramp_milestones",
        "onramp_playbooks",
        "team_invites",
        "member_modules",
        "onramp_quiz_results",
        "onramp_quizzes",
        "onramp_learning_paths",
        "onramp_conversations",
        "onramp_integrations",
        "onramp_webhooks",
        "onramp_subscriptions",
        "onramp_gamification_streaks",
        "onramp_gamification_badges",
        "onramp_gamification_xp",
        "onramp_notification_preferences",
        "onramp_notifications",
        "onramp_tasks",
    ]
    for table in tables_to_drop:
        op.drop_table(table, if_exists=True)
