"""
SQLAlchemy Models for Onramp PostgreSQL Database
Follows security and backend best practices:
- Proper indexing for query performance
- UUID primary keys for security
- Timestamps for audit trails
- Constraints for data integrity

Note: Each __table_args__ includes {"extend_existing": True} because models
are re-imported through Base's registry when app.database.config is loaded.
Root cause is the shared Base instance — consolidation to a single import
path would eliminate the need. Investigate if time permits.
"""

import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy import (
    String,
    Text,
    Integer,
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    UniqueConstraint,
    CheckConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship, attributes
from sqlalchemy.dialects.postgresql import UUID, JSONB
from pgvector.sqlalchemy import Vector
from app.database.config import Base


def generate_uuid() -> str:
    """Generate a UUID4 string"""
    return str(uuid.uuid4())


class User(Base):
    """User model - stores registered user information"""
    
    __tablename__ = "users"
    
    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=generate_uuid
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    email_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    position: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    email_verification_token: Mapped[str | None] = mapped_column(String(128), nullable=True)
    email_verification_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    password_reset_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # GitHub identity — the developer's GitHub username and numeric account id.
    # Used to link issues/PRs to the right developer (source_issue matching).
    github_username: Mapped[str | None] = mapped_column(String(39), nullable=True, index=True)
    github_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Account deactivation timestamp — set by deactivate_user (GDPR account deletion)
    deactivated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    teams: Mapped[list["Team"]] = relationship(
        "Team", secondary="team_members", back_populates="members"
    )
    usage_records: Mapped[list["UsageRecord"]] = relationship(
        "UsageRecord", back_populates="user", cascade="all, delete-orphan"
    )
    api_keys: Mapped[list["ApiKey"]] = relationship(
        "ApiKey", back_populates="user", cascade="all, delete-orphan"
    )
    
    __table_args__ = (
        UniqueConstraint("email", name="uq_users_email"),
        CheckConstraint(
            "provider IN ('google.com', 'password', 'github.com', 'neon')",
            name="ck_users_provider"
        ),
        Index("ix_users_created_at", "created_at"),
        {"extend_existing": True}
    )
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "email": self.email,
            "name": self.name,
            "position": self.position,
            "avatar_url": self.avatar_url,
            "provider": self.provider,
            "email_verified": self.email_verified,
            "email_hash": self.email_hash,
            "password_hash": self.password_hash,
            "is_active": self.is_active,
            "is_admin": self.is_admin,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "last_login_at": self.last_login_at.isoformat() if self.last_login_at else None,
            "github_username": self.github_username,
            "github_id": self.github_id,
            "deactivated_at": self.deactivated_at.isoformat() if self.deactivated_at else None,
        }


class Team(Base):
    """Team model - for organizing users into teams"""
    
    __tablename__ = "teams"
    
    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=generate_uuid
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False
    )
    
    members: Mapped[list["User"]] = relationship(
        "User", secondary="team_members", back_populates="teams"
    )
    usage_records: Mapped[list["UsageRecord"]] = relationship(
        "UsageRecord", back_populates="team", cascade="all, delete-orphan"
    )
    api_keys: Mapped[list["ApiKey"]] = relationship(
        "ApiKey", back_populates="team", cascade="all, delete-orphan"
    )
    
    __table_args__ = (
        Index("ix_teams_name", "name"),
        Index("ix_teams_created_at", "created_at"),
        {"extend_existing": True}
    )
    
    def to_dict(self) -> dict:
        # Safely compute member_count without triggering lazy load (which would
        # raise MissingGreenlet in async contexts). Use 0 if members not loaded.
        try:
            loaded = attributes.is_loaded(self, "members")
            member_count = len(self.members) if loaded else 0
        except Exception:
            member_count = 0
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat(),
            "member_count": member_count,
        }


class TeamMember(Base):
    """Association table for many-to-many relationship between users and teams"""
    
    __tablename__ = "team_members"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    team_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(50), default="new_dev")
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    
    __table_args__ = (
        UniqueConstraint("user_id", "team_id", name="uq_team_members_user_team"),
        CheckConstraint(
            "role IN ('owner', 'ceo', 'cto', 'senior_dev', 'developer', 'tester', 'new_dev', 'member', 'hr')",
            name="ck_team_members_role"
        ),
        Index("ix_team_members_user_id", "user_id"),
        Index("ix_team_members_team_id", "team_id"),
        {"extend_existing": True}
    )

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "user_id": self.user_id,
            "team_id": self.team_id,
            "role": self.role,
            "joined_at": self.joined_at.isoformat(),
        }


class ApiKey(Base):
    """API Key model - for API authentication"""
    
    __tablename__ = "api_keys"
    
    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=generate_uuid
    )
    key_hash: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    user_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    team_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("teams.id", ondelete="CASCADE"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    permissions: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    
    user: Mapped["User | None"] = relationship("User", back_populates="api_keys")
    team: Mapped["Team | None"] = relationship("Team", back_populates="api_keys")
    
    __table_args__ = (
        Index("ix_api_keys_user_id", "user_id"),
        Index("ix_api_keys_team_id", "team_id"),
        Index("ix_api_keys_created_at", "created_at"),
        {"extend_existing": True}
    )
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "is_active": self.is_active,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "last_used_at": self.last_used_at.isoformat() if self.last_used_at else None,
            "created_at": self.created_at.isoformat(),
            "permissions": self.permissions,
            "user_id": self.user_id,
            "team_id": self.team_id,
        }


class UsageRecord(Base):
    """Usage Record model - for tracking API usage and billing"""
    
    __tablename__ = "usage_records"
    
    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=generate_uuid
    )
    user_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    team_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("teams.id", ondelete="SET NULL"), nullable=True
    )
    endpoint: Mapped[str] = mapped_column(String(500), nullable=False)
    method: Mapped[str] = mapped_column(String(10), nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    response_time_ms: Mapped[int] = mapped_column(BigInteger, nullable=False)
    tokens_used: Mapped[int] = mapped_column(BigInteger, default=0)
    cost_usd: Mapped[float] = mapped_column(default=0.0)
    usage_metadata: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True
    )
    
    user: Mapped["User | None"] = relationship("User", back_populates="usage_records")
    team: Mapped["Team | None"] = relationship("Team", back_populates="usage_records")
    
    __table_args__ = (
        Index("ix_usage_records_user_created", "user_id", "created_at"),
        Index("ix_usage_records_team_created", "team_id", "created_at"),
        Index("ix_usage_records_endpoint", "endpoint"),
        {"extend_existing": True}
    )
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "endpoint": self.endpoint,
            "method": self.method,
            "status_code": self.status_code,
            "response_time_ms": self.response_time_ms,
            "tokens_used": self.tokens_used,
            "cost_usd": self.cost_usd,
            "metadata": self.usage_metadata,
            "created_at": self.created_at.isoformat(),
        }

class Repository(Base):
    """Repository model - tracks repositories registered for analysis"""

    __tablename__ = "repositories"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=generate_uuid
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    owner: Mapped[str] = mapped_column(String(255), nullable=False)
    team_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("teams.id", ondelete="SET NULL"), nullable=True
    )
    url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    language: Mapped[str | None] = mapped_column(String(50), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    last_analyzed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("owner", "name", name="uq_repositories_owner_name"),
        Index("ix_repositories_team_id", "team_id"),
        Index("ix_repositories_created_at", "created_at"),
        {"extend_existing": True}
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "owner": self.owner,
            "team_id": self.team_id,
            "url": self.url,
            "language": self.language,
            "description": self.description,
            "status": self.status,
            "last_analyzed": self.last_analyzed_at.isoformat() if self.last_analyzed_at else None,
            "created_at": self.created_at.isoformat(),
        }


# ═══════════════════════════════════════════════════════════════════════════
# Task Workflow
# ═══════════════════════════════════════════════════════════════════════════


class Task(Base):
    """Workflow task model - drives the Senior -> Trainee state machine"""

    __tablename__ = "onramp_tasks"

    task_id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    team_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    assigned_to: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    module: Mapped[str] = mapped_column(String(100), default="")
    state: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    priority: Mapped[str] = mapped_column(String(20), default="medium")
    pr_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    branch: Mapped[str] = mapped_column(String(255), default="")
    repo_url: Mapped[str] = mapped_column(String(1000), default="")
    unlock_modules: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    review_feedback: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ai_review: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    product_signoff: Mapped[bool] = mapped_column(Boolean, default=False)
    estimated_hours: Mapped[float | None] = mapped_column(default=None)
    # Time tracking — actual hours logged by the assignee (estimated vs actual variance)
    actual_hours: Mapped[float | None] = mapped_column(default=None)
    # GitHub PR inline comments pulled on submit (PR comment sync)
    pr_comments: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # Peer review — identity of the peer who reviewed (peer_review state)
    peer_reviewed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Prerequisite quiz gate — when true, the assignee must pass the module quiz
    # before the task can be started (quiz gates on tasks)
    quiz_required: Mapped[bool] = mapped_column(Boolean, default=False)
    # Source GitHub issue for imported/starter tasks (dedicated field so the
    # PR review agent can't clobber it on submit)
    source_issue: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # GitHub PR auto-link metadata — set by the PR webhook when it matches a
    # task to an opened PR (github_pr_author + github_pr_number).
    github_pr_author: Mapped[str | None] = mapped_column(String(255), nullable=True)
    github_pr_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Task dependency DAG — prerequisite task_ids that must be completed before
    # this task can be started (start_task blocks until they are)
    depends_on: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # Review analytics timestamps + counters
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_cycles: Mapped[int] = mapped_column(Integer, default=0)
    reviewed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        Index("ix_tasks_team_state", "team_id", "state"),
        Index("ix_tasks_assigned_state", "assigned_to", "state"),
        Index("ix_tasks_created_at", "created_at"),
        {"extend_existing": True}
    )

    def to_dict(self) -> dict:
        return {
            "id": self.task_id,
            "task_id": self.task_id,
            "team_id": self.team_id,
            "created_by": self.created_by,
            "assigned_to": self.assigned_to,
            "title": self.title,
            "description": self.description,
            "module": self.module,
            "state": self.state,
            "priority": self.priority,
            "pr_url": self.pr_url,
            "branch": self.branch,
            "repo_url": self.repo_url,
            "unlock_modules": self.unlock_modules or [],
            "review_feedback": self.review_feedback,
            "ai_review": self.ai_review,
            "product_signoff": self.product_signoff,
            "estimated_hours": self.estimated_hours,
            "actual_hours": self.actual_hours,
            "pr_comments": self.pr_comments,
            "peer_reviewed_by": self.peer_reviewed_by,
            "quiz_required": self.quiz_required,
            "source_issue": self.source_issue,
            "github_pr_author": self.github_pr_author,
            "github_pr_number": self.github_pr_number,
            "depends_on": self.depends_on,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
            "reviewed_at": self.reviewed_at.isoformat() if self.reviewed_at else None,
            "review_cycles": self.review_cycles,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


# ═══════════════════════════════════════════════════════════════════════════
# Notifications
# ═══════════════════════════════════════════════════════════════════════════


class Notification(Base):
    """In-app notification model"""

    __tablename__ = "onramp_notifications"

    notification_id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(String(500), nullable=False)
    full_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    notif_metadata: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    team_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("teams.id", ondelete="CASCADE"), nullable=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        Index("ix_notifications_user_read", "user_id", "read"),
        Index("ix_notifications_created_at", "created_at"),
        {"extend_existing": True}
    )

    def to_dict(self) -> dict:
        return {
            "id": self.notification_id,
            "notification_id": self.notification_id,
            "user_id": self.user_id,
            "type": self.type,
            "title": self.title,
            "message": self.message,
            "full_message": self.full_message,
            "metadata": self.notif_metadata or {},
            "team_id": self.team_id or "",
            "read": self.read,
            "read_at": self.read_at.isoformat() if self.read_at else None,
            "created_at": self.created_at.isoformat(),
        }


class NotificationPreference(Base):
    """User notification preferences (1:1 with users)"""

    __tablename__ = "onramp_notification_preferences"

    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    channels: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    digest_frequency: Mapped[str] = mapped_column(String(20), default="daily")
    quiet_hours_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    quiet_hours_start: Mapped[str] = mapped_column(String(10), default="22:00")
    quiet_hours_end: Mapped[str] = mapped_column(String(10), default="08:00")
    email_digest_time: Mapped[str] = mapped_column(String(10), default="09:00")
    roast_mode_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = {"extend_existing": True}

    def to_dict(self) -> dict:
        return {
            "id": self.user_id,
            "user_id": self.user_id,
            "channels": self.channels,
            "digest_frequency": self.digest_frequency,
            "quiet_hours_enabled": self.quiet_hours_enabled,
            "quiet_hours_start": self.quiet_hours_start,
            "quiet_hours_end": self.quiet_hours_end,
            "email_digest_time": self.email_digest_time,
            "roast_mode_enabled": self.roast_mode_enabled,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


# ═══════════════════════════════════════════════════════════════════════════
# Gamification
# ═══════════════════════════════════════════════════════════════════════════


class XPRecord(Base):
    """Experience point award record"""

    __tablename__ = "onramp_gamification_xp"

    xp_id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    date: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    team_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("teams.id", ondelete="SET NULL"), nullable=True)
    xp_metadata: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        Index("ix_xp_user_source_date", "user_id", "source", "date"),
        Index("ix_xp_team_date", "team_id", "date"),
        {"extend_existing": True}
    )

    def to_dict(self) -> dict:
        return {
            "id": self.xp_id,
            "xp_id": self.xp_id,
            "user_id": self.user_id,
            "source": self.source,
            "amount": self.amount,
            "date": self.date,
            "team_id": self.team_id or "",
            "metadata": self.xp_metadata or {},
            "created_at": self.created_at.isoformat(),
        }


class Badge(Base):
    """Achievement badge earned by a user"""

    __tablename__ = "onramp_gamification_badges"

    badge_id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    badge_key: Mapped[str] = mapped_column(String(50), nullable=False)
    badge_name: Mapped[str] = mapped_column(String(100), nullable=False)
    icon: Mapped[str] = mapped_column(String(20), default="")
    description: Mapped[str] = mapped_column(String(500), default="")
    xp_bonus: Mapped[int] = mapped_column(Integer, default=0)
    team_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("teams.id", ondelete="SET NULL"), nullable=True)
    earned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        Index("ix_badges_user_key", "user_id", "badge_key"),
        {"extend_existing": True}
    )

    def to_dict(self) -> dict:
        return {
            "id": self.badge_id,
            "badge_id": self.badge_id,
            "user_id": self.user_id,
            "badge_key": self.badge_key,
            "badge_name": self.badge_name,
            "icon": self.icon,
            "description": self.description,
            "xp_bonus": self.xp_bonus,
            "team_id": self.team_id or "",
            "earned_at": self.earned_at.isoformat(),
        }


class Streak(Base):
    """User login streak tracker"""

    __tablename__ = "onramp_gamification_streaks"

    streak_id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    current_streak: Mapped[int] = mapped_column(Integer, default=0)
    longest_streak: Mapped[int] = mapped_column(Integer, default=0)
    last_active_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    streak_frozen: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = {"extend_existing": True}

    def to_dict(self) -> dict:
        return {
            "id": self.streak_id,
            "streak_id": self.streak_id,
            "user_id": self.user_id,
            "current_streak": self.current_streak,
            "longest_streak": self.longest_streak,
            "last_active_date": self.last_active_date,
            "streak_frozen": self.streak_frozen,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


# ═══════════════════════════════════════════════════════════════════════════
# Billing & Subscriptions
# ═══════════════════════════════════════════════════════════════════════════


class Subscription(Base):
    """Team billing subscription"""

    __tablename__ = "onramp_subscriptions"

    subscription_id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    team_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    tier: Mapped[str] = mapped_column(String(50), default="free")
    billing_cycle: Mapped[str] = mapped_column(String(20), default="monthly")
    price: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    current_period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    razorpay_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    razorpay_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    razorpay_payment_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    team: Mapped["Team"] = relationship("Team", backref="subscription", uselist=False)

    __table_args__ = (
        Index("ix_subscriptions_status", "status"),
        {"extend_existing": True}
    )

    def to_dict(self) -> dict:
        return {
            "id": self.subscription_id,
            "subscription_id": self.subscription_id,
            "team_id": self.team_id,
            "tier": self.tier,
            "billing_cycle": self.billing_cycle,
            "price": self.price,
            "status": self.status,
            "current_period_start": self.current_period_start.isoformat() if self.current_period_start else None,
            "current_period_end": self.current_period_end.isoformat() if self.current_period_end else None,
            "razorpay_customer_id": self.razorpay_customer_id,
            "razorpay_subscription_id": self.razorpay_subscription_id,
            "razorpay_payment_id": self.razorpay_payment_id,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class WebhookDelivery(Base):
    """Webhook delivery attempt tracking"""

    __tablename__ = "onramp_webhook_deliveries"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    webhook_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("onramp_webhooks.webhook_id", ondelete="CASCADE"), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # success, failed, pending
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    webhook: Mapped["Webhook"] = relationship("Webhook", backref="deliveries")

    __table_args__ = (
        Index("ix_webhook_deliveries_webhook_id", "webhook_id"),
        Index("ix_webhook_deliveries_status", "status"),
        Index("ix_webhook_deliveries_created", "created_at"),
        {"extend_existing": True}
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "webhook_id": self.webhook_id,
            "event_type": self.event_type,
            "url": self.url,
            "status": self.status,
            "status_code": self.status_code,
            "response_body": self.response_body,
            "error_message": self.error_message,
            "duration_ms": self.duration_ms,
            "retry_count": self.retry_count,
            "next_retry_at": self.next_retry_at.isoformat() if self.next_retry_at else None,
            "delivered_at": self.delivered_at.isoformat() if self.delivered_at else None,
            "created_at": self.created_at.isoformat(),
        }


# ═══════════════════════════════════════════════════════════════════════════
# Webhooks & Integrations
# ═══════════════════════════════════════════════════════════════════════════


class Webhook(Base):
    """Registered webhook endpoint"""

    __tablename__ = "onramp_webhooks"

    webhook_id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    events: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    secret: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(String(500), default="")
    team_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("teams.id", ondelete="CASCADE"), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    delivery_count: Mapped[int] = mapped_column(Integer, default=0)
    failure_count: Mapped[int] = mapped_column(Integer, default=0)
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_failure_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = {"extend_existing": True}

    def to_dict(self) -> dict:
        return {
            "id": self.webhook_id,
            "webhook_id": self.webhook_id,
            "user_id": self.user_id,
            "url": self.url,
            "events": self.events,
            "secret": self.secret,
            "description": self.description,
            "team_id": self.team_id or "",
            "active": self.active,
            "delivery_count": self.delivery_count,
            "failure_count": self.failure_count,
            "last_success_at": self.last_success_at.isoformat() if self.last_success_at else None,
            "last_failure_at": self.last_failure_at.isoformat() if self.last_failure_at else None,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class IntegrationConfig(Base):
    """External integration configuration (Slack, GitHub, etc.)"""

    __tablename__ = "onramp_integrations"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    integration: Mapped[str] = mapped_column(String(50), nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "integration", name="uq_user_integration"),
        {"extend_existing": True}
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "integration": self.integration,
            "config": self.config,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


# ═══════════════════════════════════════════════════════════════════════════
# Conversations & Learning
# ═══════════════════════════════════════════════════════════════════════════


class ConversationTurn(Base):
    """Q&A conversation turn from the Ask feature"""

    __tablename__ = "onramp_conversations"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    index_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        Index("ix_conversations_user_index", "user_id", "index_id"),
        {"extend_existing": True}
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "index_id": self.index_id,
            "question": self.question,
            "answer": self.answer,
            "created_at": self.created_at.isoformat(),
        }


class LearningPath(Base):
    """Generated learning path for a user"""

    __tablename__ = "onramp_learning_paths"

    path_id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    repo_url: Mapped[str] = mapped_column(String(1000), default="")
    user_level: Mapped[str] = mapped_column(String(50), default="beginner")
    result: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        Index("ix_learning_paths_user", "user_id"),
        {"extend_existing": True}
    )

    def to_dict(self) -> dict:
        return {
            "id": self.path_id,
            "path_id": self.path_id,
            "user_id": self.user_id,
            "repo_url": self.repo_url,
            "user_level": self.user_level,
            "result": self.result,
            "created_at": self.created_at.isoformat(),
        }


# ═══════════════════════════════════════════════════════════════════════════
# Quizzes
# ═══════════════════════════════════════════════════════════════════════════


class Quiz(Base):
    """Generated quiz"""

    __tablename__ = "onramp_quizzes"

    quiz_id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    mode: Mapped[str] = mapped_column(String(20), nullable=False)
    module: Mapped[str] = mapped_column(String(100), default="full_codebase")
    difficulty: Mapped[str] = mapped_column(String(20), default="mixed")
    total_questions: Mapped[int] = mapped_column(Integer, default=0)
    questions: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        Index("ix_quizzes_user_module", "user_id", "module"),
        {"extend_existing": True}
    )

    def to_dict(self) -> dict:
        return {
            "id": self.quiz_id,
            "quiz_id": self.quiz_id,
            "user_id": self.user_id,
            "mode": self.mode,
            "module": self.module,
            "difficulty": self.difficulty,
            "total_questions": self.total_questions,
            "questions": self.questions,
            "created_at": self.created_at.isoformat(),
        }


class QuizResult(Base):
    """User quiz submission result"""

    __tablename__ = "onramp_quiz_results"

    result_id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    quiz_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("onramp_quizzes.quiz_id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    module: Mapped[str] = mapped_column(String(100), default="")
    answers: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    score: Mapped[int] = mapped_column(Integer, default=0)
    total: Mapped[int] = mapped_column(Integer, default=0)
    percentage: Mapped[float] = mapped_column(default=0.0)
    passed: Mapped[bool] = mapped_column(Boolean, default=False)
    results: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        Index("ix_quiz_results_user_quiz", "user_id", "quiz_id"),
        {"extend_existing": True}
    )

    def to_dict(self) -> dict:
        return {
            "id": self.result_id,
            "result_id": self.result_id,
            "quiz_id": self.quiz_id,
            "user_id": self.user_id,
            "module": self.module,
            "answers": self.answers,
            "score": self.score,
            "total": self.total,
            "percentage": self.percentage,
            "passed": self.passed,
            "results": self.results,
            "summary": self.summary,
            "submitted_at": self.submitted_at.isoformat(),
        }


# ═══════════════════════════════════════════════════════════════════════════
# Access Control
# ═══════════════════════════════════════════════════════════════════════════


class MemberModule(Base):
    """Module-level access permission for a team member"""

    __tablename__ = "member_modules"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    team_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    module: Mapped[str] = mapped_column(String(100), nullable=False)
    granted_by: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    source: Mapped[str] = mapped_column(String(20), default="manual")

    __table_args__ = (
        UniqueConstraint("team_id", "user_id", "module", name="uq_member_module"),
        Index("ix_member_modules_team_user", "team_id", "user_id"),
        {"extend_existing": True}
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "team_id": self.team_id,
            "user_id": self.user_id,
            "module": self.module,
            "granted_by": self.granted_by,
            "granted_at": self.granted_at.isoformat(),
            "source": self.source,
        }


# ═══════════════════════════════════════════════════════════════════════════
# Teams & Invites
# ═══════════════════════════════════════════════════════════════════════════


class TeamInvite(Base):
    """Team invitation with token"""

    __tablename__ = "team_invites"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    team_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    invited_by: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    token: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    role: Mapped[str] = mapped_column(String(50), default="member")
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    message: Mapped[str] = mapped_column(Text, default="")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        Index("ix_invites_email_status", "email", "status"),
        {"extend_existing": True}
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "team_id": self.team_id,
            "email": self.email,
            "invited_by": self.invited_by,
            "token": self.token,
            "role": self.role,
            "status": self.status,
            "message": self.message,
            "expires_at": self.expires_at.isoformat(),
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


# ═══════════════════════════════════════════════════════════════════════════
# Playbooks
# ═══════════════════════════════════════════════════════════════════════════


class Playbook(Base):
    """Onboarding playbook template"""

    __tablename__ = "onramp_playbooks"

    playbook_id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    team_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    steps: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    tags: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    created_by: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    use_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        Index("ix_playbooks_team", "team_id", "is_archived"),
        {"extend_existing": True}
    )

    def to_dict(self) -> dict:
        return {
            "id": self.playbook_id,
            "playbook_id": self.playbook_id,
            "team_id": self.team_id,
            "title": self.title,
            "description": self.description,
            "steps": self.steps,
            "tags": self.tags,
            "created_by": self.created_by,
            "version": self.version,
            "is_archived": self.is_archived,
            "use_count": self.use_count,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


# ═══════════════════════════════════════════════════════════════════════════
# Milestones & Audit
# ═══════════════════════════════════════════════════════════════════════════


class ContributionMilestone(Base):
    """Developer contribution milestone (first PR, first commit, etc.)"""

    __tablename__ = "onramp_milestones"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    user: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    repo: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    milestone_metadata: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)

    __table_args__ = (
        Index("ix_milestones_user_type", "user", "type"),
        {"extend_existing": True}
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user": self.user,
            "repo": self.repo,
            "type": self.type,
            "timestamp": self.timestamp.isoformat(),
            "metadata": self.milestone_metadata,
        }


class AuditEvent(Base):
    """Security audit log entry"""

    __tablename__ = "onramp_audit_log"

    event_id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    actor_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    target_id: Mapped[str] = mapped_column(String(500), default="")
    team_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("teams.id", ondelete="SET NULL"), nullable=True, index=True)
    audit_metadata: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)

    __table_args__ = (
        Index("ix_audit_team_type", "team_id", "event_type"),
        {"extend_existing": True}
    )

    def to_dict(self) -> dict:
        return {
            "id": self.event_id,
            "event_id": self.event_id,
            "event_type": self.event_type,
            "actor_id": self.actor_id,
            "target_id": self.target_id,
            "team_id": self.team_id or "",
            "metadata": self.audit_metadata or {},
            "timestamp": self.timestamp.isoformat(),
        }


# ═══════════════════════════════════════════════════════════════════════════
# Idempotency & Event Logs
# ═══════════════════════════════════════════════════════════════════════════


class WebhookIdempotency(Base):
    """Webhook idempotency tracker"""

    __tablename__ = "onramp_webhook_idempotency"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    event_id: Mapped[str] = mapped_column(String(255), nullable=False)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    processed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = {"extend_existing": True}

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "idempotency_key": self.idempotency_key,
            "event_id": self.event_id,
            "event_type": self.event_type,
            "processed_at": self.processed_at.isoformat(),
        }


class WebhookEventLog(Base):
    """Webhook event log"""

    __tablename__ = "onramp_webhook_events"

    event_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        Index("ix_webhook_events_type", "event_type"),
        {"extend_existing": True}
    )

    def to_dict(self) -> dict:
        return {
            "id": self.event_id,
            "event_id": self.event_id,
            "event_type": self.event_type,
            "status": self.status,
            "details": self.details,
            "received_at": self.received_at.isoformat(),
        }


# ═══════════════════════════════════════════════════════════════════════════
# Onboarding Plans (30-60-90 Day Milestone Framework)
# ═══════════════════════════════════════════════════════════════════════════


class OnboardingPlan(Base):
    """Structured 30-60-90 day onboarding plan for a team member."""

    __tablename__ = "onboarding_plans"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=generate_uuid
    )
    team_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_by: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    buddy_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(50), default="active")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc), nullable=False
    )

    __table_args__ = (
        CheckConstraint("status IN ('draft', 'active', 'completed', 'cancelled')", name="ck_onboarding_plan_status"),
        Index("ix_onboarding_plans_team", "team_id"),
        Index("ix_onboarding_plans_user", "user_id"),
        {"extend_existing": True}
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "team_id": self.team_id,
            "user_id": self.user_id,
            "created_by": self.created_by,
            "start_date": self.start_date.isoformat(),
            "buddy_id": self.buddy_id,
            "status": self.status,
            "notes": self.notes,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class OnboardingMilestone(Base):
    """Individual milestone within an onboarding plan (30/60/90 day targets)."""

    __tablename__ = "onboarding_milestones"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=generate_uuid
    )
    plan_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("onboarding_plans.id", ondelete="CASCADE"), nullable=False
    )
    day_target: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(50), default="technical")
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    # Roadmap DAG — prerequisite milestone ids that must be completed before
    # this milestone is available
    depends_on_milestones: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    __table_args__ = (
        CheckConstraint("day_target IN (30, 60, 90)", name="ck_milestone_day_target"),
        CheckConstraint("category IN ('technical', 'cultural', 'process', 'product', 'social')", name="ck_milestone_category"),
        Index("ix_onboarding_milestones_plan", "plan_id"),
        {"extend_existing": True}
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "plan_id": self.plan_id,
            "day_target": self.day_target,
            "title": self.title,
            "description": self.description,
            "category": self.category,
            "is_completed": self.is_completed,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "sort_order": self.sort_order,
            "depends_on_milestones": self.depends_on_milestones,
        }


# ═══════════════════════════════════════════════════════════════════════════
# Pre-Boarding Tasks (Day -7 to Day 0)
# ═══════════════════════════════════════════════════════════════════════════


class PreBoardingTask(Base):
    """Tasks to complete before the developer's first day."""

    __tablename__ = "pre_boarding_tasks"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=generate_uuid
    )
    plan_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("onboarding_plans.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    assignee: Mapped[str] = mapped_column(String(50), default="developer")
    is_required: Mapped[bool] = mapped_column(Boolean, default=True)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    __table_args__ = (
        CheckConstraint("assignee IN ('developer', 'hr', 'it', 'manager', 'buddy')", name="ck_preboarding_assignee"),
        Index("ix_preboarding_plan", "plan_id"),
        {"extend_existing": True}
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "plan_id": self.plan_id,
            "title": self.title,
            "description": self.description,
            "assignee": self.assignee,
            "is_required": self.is_required,
            "is_completed": self.is_completed,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "sort_order": self.sort_order,
        }


# ═══════════════════════════════════════════════════════════════════════════
# Pulse Surveys (Developer Sentiment & Confidence Tracking)
# ═══════════════════════════════════════════════════════════════════════════


class PulseSurvey(Base):
    """Weekly pulse survey sent to developers during onboarding."""

    __tablename__ = "pulse_surveys"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=generate_uuid
    )
    plan_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("onboarding_plans.id", ondelete="CASCADE"), nullable=False
    )
    week_number: Mapped[int] = mapped_column(Integer, nullable=False)
    confidence_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    clarity_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    support_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    workload_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sentiment: Mapped[str | None] = mapped_column(String(20), nullable=True)
    open_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    __table_args__ = (
        CheckConstraint("confidence_score BETWEEN 1 AND 10", name="ck_pulse_confidence"),
        CheckConstraint("clarity_score BETWEEN 1 AND 10", name="ck_pulse_clarity"),
        CheckConstraint("support_score BETWEEN 1 AND 10", name="ck_pulse_support"),
        CheckConstraint("workload_score BETWEEN 1 AND 10", name="ck_pulse_workload"),
        CheckConstraint("sentiment IN ('very_happy', 'happy', 'neutral', 'frustrated', 'very_frustrated')", name="ck_pulse_sentiment"),
        UniqueConstraint("plan_id", "week_number", name="uq_pulse_week"),
        Index("ix_pulse_surveys_plan", "plan_id"),
        {"extend_existing": True}
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "plan_id": self.plan_id,
            "week_number": self.week_number,
            "confidence_score": self.confidence_score,
            "clarity_score": self.clarity_score,
            "support_score": self.support_score,
            "workload_score": self.workload_score,
            "sentiment": self.sentiment,
            "open_feedback": self.open_feedback,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
        }


# ═══════════════════════════════════════════════════════════════════════════
# Feature Flags
# ═══════════════════════════════════════════════════════════════════════════


class FeatureFlag(Base):
    """Team-level feature flag toggles"""

    __tablename__ = "onramp_feature_flags"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    team_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    flag_name: Mapped[str] = mapped_column(String(255), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        UniqueConstraint("team_id", "flag_name", name="uq_team_feature_flag"),
        Index("ix_feature_flags_team", "team_id"),
        {"extend_existing": True}
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "team_id": self.team_id,
            "flag_name": self.flag_name,
            "enabled": self.enabled,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


# ═══════════════════════════════════════════════════════════════════════════
# Task Templates (reusable task blueprints per module)
# ═══════════════════════════════════════════════════════════════════════════


class TaskTemplate(Base):
    """Reusable task blueprint that a senior can instantiate into real tasks.

    Backs the "task templates" quick win — seniors create a template once per
    module (title, description, repo, unlock modules, estimate) and later
    instantiate it for a trainee in one click (bulk assignment).
    """

    __tablename__ = "task_templates"

    template_id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    team_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    module: Mapped[str] = mapped_column(String(100), default="")
    priority: Mapped[str] = mapped_column(String(20), default="medium")
    repo_url: Mapped[str] = mapped_column(String(1000), default="")
    unlock_modules: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    estimated_hours: Mapped[float | None] = mapped_column(default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        Index("ix_task_templates_team", "team_id"),
        {"extend_existing": True}
    )

    def to_dict(self) -> dict:
        return {
            "id": self.template_id,
            "template_id": self.template_id,
            "team_id": self.team_id,
            "created_by": self.created_by,
            "name": self.name,
            "description": self.description,
            "module": self.module,
            "priority": self.priority,
            "repo_url": self.repo_url,
            "unlock_modules": self.unlock_modules or [],
            "estimated_hours": self.estimated_hours,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


# ═══════════════════════════════════════════════════════════════════════════
# Dynamic Document (fallback for unmigrated/adhoc collections)
# ═══════════════════════════════════════════════════════════════════════════


class TeamProviderKey(Base):
    """Per-team BYOK provider API key (Fernet-encrypted at rest).

    Lets a team supply its own LLM/embedding provider keys from the
    Developer Portal. The raw key is encrypted with PII_ENCRYPTION_KEY before
    storage; only masked metadata is ever returned to clients. When present,
    a team key overrides the platform-level env var for that provider for that
    team's gateway requests.
    """

    __tablename__ = "onramp_team_provider_keys"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=generate_uuid
    )
    team_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    api_key_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    updated_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("team_id", "provider", name="uq_team_provider_key"),
        {"extend_existing": True},
    )

    def to_dict(self) -> dict:
        """Public shape — presence metadata only, never the raw key."""
        return {
            "id": self.id,
            "team_id": self.team_id,
            "provider": self.provider,
            "configured": True,
            "updated_by": self.updated_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class DynamicDocument(Base):
    """Fallback model for generic or unmigrated collections"""
    
    __tablename__ = "dynamic_documents"
    
    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    collection: Mapped[str] = mapped_column(String(255), primary_key=True)
    data: Mapped[dict] = mapped_column(JSONB, nullable=False, default={})
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
    
    __table_args__ = (
        Index("ix_dynamic_documents_collection", "collection"),
        {"extend_existing": True}
    )
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "collection": self.collection,
            **self.data,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


# ═══════════════════════════════════════════════════════════════════════════
# Embedding chunks (pgvector semantic search)
# ═══════════════════════════════════════════════════════════════════════════


class EmbeddingChunk(Base):
    """One vectorized chunk of an indexed repository.

    Fixed-dimension pgvector column: the deployment must set
    ``EMBEDDING_DIMENSIONS`` (default 1536, OpenAI ``text-embedding-3-small``)
    to match the model chosen via ``EMBEDDINGS_PROVIDER`` before running the
    migration. Rows with a ``NULL`` vector are legal — they index keyword-only.
    """

    __tablename__ = "onramp_embedding_chunks"

    chunk_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    index_id: Mapped[str] = mapped_column(String(255), nullable=False)
    filename: Mapped[str] = mapped_column(String(1000), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    doc_type: Mapped[str] = mapped_column(String(20), nullable=False, default="code")
    vector: Mapped[Optional[list]] = mapped_column(
        Vector(int(os.getenv("EMBEDDING_DIMENSIONS", "1536"))), nullable=True
    )
    embedding_model: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    embedding_dims: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        Index("ix_embedding_chunks_index_id", "index_id"),
        {"extend_existing": True},
    )

    def to_dict(self) -> dict:
        return {
            "chunk_id": self.chunk_id,
            "index_id": self.index_id,
            "filename": self.filename,
            "content": self.content,
            "doc_type": self.doc_type,
            "vector": list(self.vector) if self.vector is not None else None,
            "embedding_model": self.embedding_model,
            "embedding_dims": self.embedding_dims,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }