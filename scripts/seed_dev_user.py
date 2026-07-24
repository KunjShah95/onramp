"""Seed the database with sample data across ALL tables for MVP demo/dev.

Usage:
    python scripts/seed_dev_user.py                  # Full seed
    python scripts/seed_dev_user.py --quick           # Minimal seed (users + teams only)
    python scripts/seed_dev_user.py --dry-run         # Preview mode
    python scripts/seed_dev_user.py --force           # Re-create existing data

Seeds ALL 39 tables in the onramp database:
  users, teams, team_members, repositories,
  onramp_tasks, onramp_notifications, onramp_notification_preferences,
  onramp_gamification_xp, onramp_gamification_badges, onramp_gamification_streaks,
  onramp_subscriptions, onramp_webhooks, onramp_integrations,
  onramp_conversations, onramp_learning_paths,
  onramp_quizzes, onramp_quiz_results,
  member_modules, team_invites, onramp_playbooks,
  onramp_milestones, onramp_audit_log,
  onramp_webhook_idempotency, onramp_webhook_events, onramp_webhook_deliveries,
  api_keys, usage_records, dynamic_documents

Sample Users (all passwords: demo123):
  - Kunj Shah (kunj@onramp.dev)        - owner       (is_admin)
  - Varad Karandikar (varad@onramp.dev) - cto         (is_admin)
  - Sarah Chen (sarah@onramp.dev)       - senior_dev
  - Marcus Johnson (marcus@onramp.dev)  - senior_dev
  - Alisha Patel (alisha@onramp.dev)    - developer
  - David Kim (david@onramp.dev)        - developer
  - Emma Wilson (emma@onramp.dev)       - new_dev
  - James Thompson (james@onramp.dev)   - new_dev
  - Priya Sharma (priya@onramp.dev)     - tester
"""

import asyncio
import logging
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))
os.environ.setdefault("DATABASE_URL", os.getenv("DATABASE_URL", ""))
os.environ.setdefault("STORAGE_BACKEND", os.getenv("STORAGE_BACKEND", ""))
os.environ.setdefault("ENV", os.getenv("ENV", "development"))
os.environ.setdefault(
    "PII_ENCRYPTION_KEY",
    "Yk9yLVlpN1RaMkVTSnRiV3hBZ01GdWpGS2U0dUdnMkU=",
)

from app.services.postgres_db import get_storage, generate_id
from app.services.field_encryption import encrypt_field, email_hash

logger = logging.getLogger("onramp.seed_script")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)


def _dt(year, month, day, hour=0, minute=0, second=0):
    """Create a timezone-aware UTC datetime."""
    return datetime(year, month, day, hour, minute, second, tzinfo=timezone.utc)


def _now():
    """Current UTC datetime."""
    return datetime.now(timezone.utc)


def _hash_password(password: str) -> str:
    """Hash a password using bcrypt (fast rounds for testing)."""
    import bcrypt
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=4)).decode("utf-8")


# ═══════════════════════════════════════════════════════════════════════════
# Sample Data: Core Entities
# ═══════════════════════════════════════════════════════════════════════════

SAMPLE_USERS = [
    {"id": "00000000-0000-4000-a000-000000000001", "email": "kunj@onramp.dev",     "name": "Kunj Shah",        "provider": "password", "role": "owner",     "is_admin": True},
    {"id": "00000000-0000-4000-a000-000000000002", "email": "varad@onramp.dev",    "name": "Varad Karandikar", "provider": "password", "role": "cto",       "is_admin": True},
    {"id": "00000000-0000-4000-a000-000000000003", "email": "sarah@onramp.dev",    "name": "Sarah Chen",       "provider": "password", "role": "senior_dev","is_admin": False},
    {"id": "00000000-0000-4000-a000-000000000004", "email": "marcus@onramp.dev",   "name": "Marcus Johnson",   "provider": "password", "role": "senior_dev","is_admin": False},
    {"id": "00000000-0000-4000-a000-000000000005", "email": "alisha@onramp.dev",   "name": "Alisha Patel",     "provider": "password", "role": "developer", "is_admin": False},
    {"id": "00000000-0000-4000-a000-000000000006", "email": "david@onramp.dev",    "name": "David Kim",        "provider": "password", "role": "developer", "is_admin": False},
    {"id": "00000000-0000-4000-a000-000000000007", "email": "emma@onramp.dev",     "name": "Emma Wilson",      "provider": "password", "role": "new_dev",   "is_admin": False},
    {"id": "00000000-0000-4000-a000-000000000008", "email": "james@onramp.dev",    "name": "James Thompson",   "provider": "password", "role": "new_dev",   "is_admin": False},
    {"id": "00000000-0000-4000-a000-000000000009", "email": "priya@onramp.dev",    "name": "Priya Sharma",     "provider": "password", "role": "tester",    "is_admin": False},
]

SAMPLE_TEAMS = [
    {"id": "00000000-0000-4000-b000-000000000001", "name": "InnovateHub",          "description": "Flagship product team building the next-gen developer platform"},
    {"id": "00000000-0000-4000-b000-000000000002", "name": "Platform Engineering", "description": "Building and maintaining internal tools and infrastructure"},
]

TEAM_MEMBERSHIPS = [
    # InnovateHub (team 001): Kunj is CEO, Varad is CTO
    {"user_id": "00000000-0000-4000-a000-000000000001", "team_id": "00000000-0000-4000-b000-000000000001", "role": "ceo"},
    {"user_id": "00000000-0000-4000-a000-000000000002", "team_id": "00000000-0000-4000-b000-000000000001", "role": "cto"},
    {"user_id": "00000000-0000-4000-a000-000000000003", "team_id": "00000000-0000-4000-b000-000000000001", "role": "senior_dev"},
    {"user_id": "00000000-0000-4000-a000-000000000004", "team_id": "00000000-0000-4000-b000-000000000001", "role": "senior_dev"},
    {"user_id": "00000000-0000-4000-a000-000000000005", "team_id": "00000000-0000-4000-b000-000000000001", "role": "developer"},
    {"user_id": "00000000-0000-4000-a000-000000000006", "team_id": "00000000-0000-4000-b000-000000000001", "role": "developer"},
    {"user_id": "00000000-0000-4000-a000-000000000007", "team_id": "00000000-0000-4000-b000-000000000001", "role": "new_dev"},
    {"user_id": "00000000-0000-4000-a000-000000000008", "team_id": "00000000-0000-4000-b000-000000000001", "role": "new_dev"},
    {"user_id": "00000000-0000-4000-a000-000000000009", "team_id": "00000000-0000-4000-b000-000000000001", "role": "tester"},
    # Platform Engineering (team 002): Sarah is senior_dev, David and James are devs
    {"user_id": "00000000-0000-4000-a000-000000000003", "team_id": "00000000-0000-4000-b000-000000000002", "role": "senior_dev"},
    {"user_id": "00000000-0000-4000-a000-000000000006", "team_id": "00000000-0000-4000-b000-000000000002", "role": "developer"},
    {"user_id": "00000000-0000-4000-a000-000000000008", "team_id": "00000000-0000-4000-b000-000000000002", "role": "new_dev"},
]

SAMPLE_REPOS = [
    {"name": "backend-api",    "owner": "onramp",         "language": "Python",     "team_id": "00000000-0000-4000-b000-000000000001",
     "description": "Main FastAPI backend service with PostgreSQL, Redis, and Celery task queue",
     "url": "https://github.com/onramp/backend-api"},
    {"name": "web-frontend",   "owner": "onramp",         "language": "TypeScript", "team_id": "00000000-0000-4000-b000-000000000001",
     "description": "React + Vite frontend dashboard with Tailwind CSS and Framer Motion",
     "url": "https://github.com/onramp/web-frontend"},
    {"name": "auth-service",   "owner": "onramp",         "language": "Go",         "team_id": "00000000-0000-4000-b000-000000000002",
     "description": "Authentication microservice with OAuth2, JWT, and session management",
     "url": "https://github.com/onramp/auth-service"},
    {"name": "data-pipeline",  "owner": "onramp",         "language": "Python",     "team_id": "00000000-0000-4000-b000-000000000002",
     "description": "Batch and streaming data processing with Apache Beam and BigQuery",
     "url": "https://github.com/onramp/data-pipeline"},
    {"name": "mobile-app",     "owner": "acme-platform",  "language": "TypeScript", "team_id": "00000000-0000-4000-b000-000000000001",
     "description": "React Native cross-platform mobile application for ACME Platform",
     "url": "https://github.com/acme-platform/mobile-app"},
    {"name": "oss-lib",        "owner": "community",      "language": "Python",     "team_id": None,
     "description": "Open source utility library for async data processing",
     "url": "https://github.com/community/oss-lib"},
]

# ═══════════════════════════════════════════════════════════════════════════
# Sample Data: Tasks
# ═══════════════════════════════════════════════════════════════════════════

SAMPLE_TASKS = [
    {"team_id": "00000000-0000-4000-b000-000000000001", "created_by": "00000000-0000-4000-a000-000000000003", "assigned_to": "00000000-0000-4000-a000-000000000007",
     "title": "Implement user authentication middleware", "description": "Create a middleware that validates JWT tokens for all protected routes",
     "module": "api-core", "priority": "high", "state": "assigned", "unlock_modules": ["auth-flow"]},
    {"team_id": "00000000-0000-4000-b000-000000000001", "created_by": "00000000-0000-4000-a000-000000000003", "assigned_to": "00000000-0000-4000-a000-000000000008",
     "title": "Set up database migration for user preferences", "description": "Create Alembic migration for storing user theme and notification preferences",
     "module": "database", "priority": "medium", "state": "in_progress", "unlock_modules": []},
    {"team_id": "00000000-0000-4000-b000-000000000001", "created_by": "00000000-0000-4000-a000-000000000001", "assigned_to": "00000000-0000-4000-a000-000000000005",
     "title": "Build dashboard API endpoint for team metrics", "description": "Create a GET /dashboard/team-analytics endpoint with aggregated stats",
     "module": "api-core", "priority": "medium", "state": "submitted", "unlock_modules": []},
    {"team_id": "00000000-0000-4000-b000-000000000001", "created_by": "00000000-0000-4000-a000-000000000003", "assigned_to": "00000000-0000-4000-a000-000000000006",
     "title": "Implement repository health scoring algorithm", "description": "Build the heuristic algorithm that computes health scores from GitHub API data",
     "module": "api-core", "priority": "high", "state": "under_review", "unlock_modules": ["testing"]},
    {"team_id": "00000000-0000-4000-b000-000000000001", "created_by": "00000000-0000-4000-a000-000000000003", "assigned_to": "00000000-0000-4000-a000-000000000007",
     "title": "Complete onboarding checklist widget", "description": "Build the frontend component for the onboarding progress checklist",
     "module": "frontend-basics", "priority": "low", "state": "completed", "unlock_modules": []},
]

# ═══════════════════════════════════════════════════════════════════════════
# Sample Data: Module Permissions
# ═══════════════════════════════════════════════════════════════════════════

MODULE_PERMISSIONS = [
    {"user_id": "00000000-0000-4000-a000-000000000007", "module": "api-core",       "team_id": "00000000-0000-4000-b000-000000000001", "source": "manual"},
    {"user_id": "00000000-0000-4000-a000-000000000007", "module": "frontend-basics","team_id": "00000000-0000-4000-b000-000000000001", "source": "manual"},
    {"user_id": "00000000-0000-4000-a000-000000000008", "module": "api-core",       "team_id": "00000000-0000-4000-b000-000000000001", "source": "manual"},
    {"user_id": "00000000-0000-4000-a000-000000000008", "module": "database",       "team_id": "00000000-0000-4000-b000-000000000001", "source": "manual"},
]

# ═══════════════════════════════════════════════════════════════════════════
# Sample Data: Subscriptions
# ═══════════════════════════════════════════════════════════════════════════

TEAM_SUBSCRIPTIONS = [
    {"team_id": "00000000-0000-4000-b000-000000000001", "tier": "professional", "billing_cycle": "monthly", "price": 299, "status": "active"},
    {"team_id": "00000000-0000-4000-b000-000000000002", "tier": "startup",      "billing_cycle": "yearly",  "price": 499, "status": "active"},
]

# ═══════════════════════════════════════════════════════════════════════════
# Sample Data: Notifications
# ═══════════════════════════════════════════════════════════════════════════

SAMPLE_NOTIFICATIONS = [
    {"user_id": "00000000-0000-4000-a000-000000000007", "type": "task_assigned",
     "title": "Your first task is ready", "message": "Implement user authentication middleware — module: api-core",
     "team_id": "00000000-0000-4000-b000-000000000001"},
    {"user_id": "00000000-0000-4000-a000-000000000008", "type": "task_assigned",
     "title": "Task assigned", "message": "Set up database migration for user preferences",
     "team_id": "00000000-0000-4000-b000-000000000001"},
    {"user_id": "00000000-0000-4000-a000-000000000005", "type": "task_submitted",
     "title": "Task submitted for review", "message": "Build dashboard API endpoint — awaiting review",
     "team_id": "00000000-0000-4000-b000-000000000001"},
    {"user_id": "00000000-0000-4000-a000-000000000007", "type": "task_completed",
     "title": "Task completed", "message": "Complete onboarding checklist widget — great work!",
     "team_id": "00000000-0000-4000-b000-000000000001"},
    {"user_id": "00000000-0000-4000-a000-000000000003", "type": "review_requested",
     "title": "Review required", "message": "Health scoring algorithm needs your review",
     "team_id": "00000000-0000-4000-b000-000000000001"},
    {"user_id": "00000000-0000-4000-a000-000000000001", "type": "system_alert",
     "title": "Welcome to Onramp", "message": "Your team InnovateHub has been set up successfully",
     "team_id": "00000000-0000-4000-b000-000000000001"},
]

SAMPLE_NOTIFICATION_PREFERENCES = [
    {"user_id": "00000000-0000-4000-a000-000000000001", "channels": {"in_app": True, "email": True, "slack": True}, "digest_frequency": "daily"},
    {"user_id": "00000000-0000-4000-a000-000000000003", "channels": {"in_app": True, "email": True, "slack": False}, "digest_frequency": "daily"},
    {"user_id": "00000000-0000-4000-a000-000000000007", "channels": {"in_app": True, "email": False, "slack": False}, "digest_frequency": "weekly"},
]

# ═══════════════════════════════════════════════════════════════════════════
# Sample Data: Gamification
# ═══════════════════════════════════════════════════════════════════════════

SAMPLE_XP = [
    {"user_id": "00000000-0000-4000-a000-000000000001", "amount": 100, "source": "playbook_created",              "team_id": "00000000-0000-4000-b000-000000000001"},
    {"user_id": "00000000-0000-4000-a000-000000000003", "amount": 50,  "source": "learning_module_completed",    "team_id": "00000000-0000-4000-b000-000000000001"},
    {"user_id": "00000000-0000-4000-a000-000000000005", "amount": 15,  "source": "pr_review_completed",         "team_id": "00000000-0000-4000-b000-000000000001"},
    {"user_id": "00000000-0000-4000-a000-000000000006", "amount": 20,  "source": "repo_analyzed",               "team_id": "00000000-0000-4000-b000-000000000001"},
    {"user_id": "00000000-0000-4000-a000-000000000007", "amount": 30,  "source": "task_completed",               "team_id": "00000000-0000-4000-b000-000000000001"},
]

SAMPLE_BADGES = [
    {"badge_key": "first_task",  "badge_name": "First Task Completed",   "icon": "🎯", "description": "Complete your first assigned task",
     "user_id": "00000000-0000-4000-a000-000000000007", "xp_bonus": 50,  "team_id": "00000000-0000-4000-b000-000000000001"},
    {"badge_key": "week_streak", "badge_name": "7-Day Streak",           "icon": "🔥", "description": "Log in for 7 consecutive days",
     "user_id": "00000000-0000-4000-a000-000000000003", "xp_bonus": 100, "team_id": "00000000-0000-4000-b000-000000000001"},
    {"badge_key": "team_leader", "badge_name": "Team Leader",            "icon": "👑", "description": "Lead a team to complete a milestone",
     "user_id": "00000000-0000-4000-a000-000000000001", "xp_bonus": 200, "team_id": "00000000-0000-4000-b000-000000000001"},
]

SAMPLE_STREAKS = [
    {"user_id": "00000000-0000-4000-a000-000000000001", "current_streak": 7,  "longest_streak": 7,  "last_active_date": (_now() - timedelta(hours=2)).strftime("%Y-%m-%d")},
    {"user_id": "00000000-0000-4000-a000-000000000003", "current_streak": 12, "longest_streak": 12, "last_active_date": (_now() - timedelta(hours=4)).strftime("%Y-%m-%d")},
    {"user_id": "00000000-0000-4000-a000-000000000005", "current_streak": 3,  "longest_streak": 5,  "last_active_date": (_now() - timedelta(hours=8)).strftime("%Y-%m-%d")},
    {"user_id": "00000000-0000-4000-a000-000000000007", "current_streak": 5,  "longest_streak": 5,  "last_active_date": (_now() - timedelta(hours=1)).strftime("%Y-%m-%d")},
]

# ═══════════════════════════════════════════════════════════════════════════
# Sample Data: Integrations
# ═══════════════════════════════════════════════════════════════════════════

SAMPLE_INTEGRATIONS = [
    {"user_id": "00000000-0000-4000-a000-000000000001", "integration": "slack",  "config": {"webhook_url": "https://hooks.slack.com/services/T00/B00/xxx", "channel": "#dev-team"}},
    {"user_id": "00000000-0000-4000-a000-000000000003", "integration": "github", "config": {"username": "sarah-chen", "auto_import": True}},
]

# ═══════════════════════════════════════════════════════════════════════════
# Sample Data: Conversations (Q&A)
# ═══════════════════════════════════════════════════════════════════════════

SAMPLE_CONVERSATIONS = [
    {"user_id": "00000000-0000-4000-a000-000000000007", "index_id": "repo:onramp/backend-api",
     "question": "How do I set up a new endpoint in the backend API?",
     "answer": "Create a new router in app/api/v1/, add the route handler, then register it in app/main.py under the appropriate prefix."},
    {"user_id": "00000000-0000-4000-a000-000000000008", "index_id": "repo:onramp/backend-api",
     "question": "What database ORM do we use?",
     "answer": "We use SQLAlchemy with asyncpg. Check app/database/models.py for the schema definitions."},
    {"user_id": "00000000-0000-4000-a000-000000000005", "index_id": "repo:onramp/web-frontend",
     "question": "How do I add a new page to the frontend?",
     "answer": "Create the page component in web/src/pages/, add the route in App.tsx, and link it from the sidebar."},
]

# ═══════════════════════════════════════════════════════════════════════════
# Sample Data: Learning Paths
# ═══════════════════════════════════════════════════════════════════════════

SAMPLE_LEARNING_PATHS = [
    {"user_id": "00000000-0000-4000-a000-000000000007", "repo_url": "https://github.com/onramp/backend-api", "user_level": "beginner",
     "result": {"modules": ["api-core", "database", "testing"], "estimated_duration_days": 21, "topics": ["FastAPI", "SQLAlchemy", "Pytest"]}},
    {"user_id": "00000000-0000-4000-a000-000000000008", "repo_url": "https://github.com/onramp/backend-api", "user_level": "beginner",
     "result": {"modules": ["api-core", "database"], "estimated_duration_days": 14, "topics": ["REST APIs", "PostgreSQL", "Auth"]}},
]

# ═══════════════════════════════════════════════════════════════════════════
# Sample Data: Quizzes
# ═══════════════════════════════════════════════════════════════════════════

SAMPLE_QUIZZES = [
    {"user_id": "00000000-0000-4000-a000-000000000007", "mode": "practice", "module": "api-core", "difficulty": "beginner",
     "total_questions": 5, "questions": [
         {"q": "What is FastAPI?", "options": ["A web framework", "A database", "A testing tool"], "answer": 0},
         {"q": "What does asyncpg do?", "options": ["Async PostgreSQL driver", "Async HTTP client", "Task queue"], "answer": 0},
     ]},
]

SAMPLE_QUIZ_RESULTS = [
    {"user_id": "00000000-0000-4000-a000-000000000007", "module": "api-core",
     "answers": {"0": 0, "1": 0}, "score": 2, "total": 2, "percentage": 100.0, "passed": True,
     "results": [{"question_idx": 0, "correct": True}, {"question_idx": 1, "correct": True}],
     "summary": "Perfect score! You have a strong understanding of the basics."},
]

# ═══════════════════════════════════════════════════════════════════════════
# Sample Data: Playbooks
# ═══════════════════════════════════════════════════════════════════════════

SAMPLE_PLAYBOOKS = [
    {"team_id": "00000000-0000-4000-b000-000000000001", "title": "React Developer Onboarding",
     "description": "Standard onboarding playbook for new React developers joining the frontend team",
     "steps": [
         {"order": 1, "title": "Environment Setup", "description": "Install Node 20, pnpm, and clone the repo"},
         {"order": 2, "title": "Hello World PR", "description": "Make a small change and submit your first PR"},
         {"order": 3, "title": "Component Patterns", "description": "Learn our Tailwind + Framer Motion component patterns"},
     ], "tags": ["react", "frontend", "onboarding"], "created_by": "00000000-0000-4000-a000-000000000001",
     "version": 1, "is_archived": False, "use_count": 3},
    {"team_id": "00000000-0000-4000-b000-000000000001", "title": "Backend API Quickstart",
     "description": "Get new backend developers productive with the FastAPI codebase fast",
     "steps": [
         {"order": 1, "title": "Local Setup", "description": "Set up Python 3.12, PostgreSQL, and redis"},
         {"order": 2, "title": "Run the tests", "description": "Run pytest to verify your environment"},
         {"order": 3, "title": "Add an endpoint", "description": "Add a GET /api/v1/hello endpoint"},
     ], "tags": ["python", "fastapi", "backend"], "created_by": "00000000-0000-4000-a000-000000000003",
     "version": 2, "is_archived": False, "use_count": 5},
]

# ═══════════════════════════════════════════════════════════════════════════
# Sample Data: Milestones
# ═══════════════════════════════════════════════════════════════════════════

SAMPLE_MILESTONES = [
    {"user": "Kunj Shah",    "repo": "onramp/backend-api",  "type": "first_commit",  "metadata": {"hash": "a1b2c3d4"}},
    {"user": "Sarah Chen",   "repo": "onramp/backend-api",  "type": "first_pr",      "metadata": {"pr_number": 42}},
    {"user": "Emma Wilson",  "repo": "onramp/web-frontend", "type": "task_completed","metadata": {"task": "Build ProfileCard"}},
    {"user": "David Kim",    "repo": "onramp/backend-api",  "type": "first_review",  "metadata": {"pr_number": 47}},
]

# ═══════════════════════════════════════════════════════════════════════════
# Sample Data: Webhooks
# ═══════════════════════════════════════════════════════════════════════════

SAMPLE_WEBHOOKS = [
    {"user_id": "00000000-0000-4000-a000-000000000001", "url": "https://hooks.example.com/onramp-events",
     "events": ["task.assigned", "task.completed", "review.submitted"],
     "description": "Onramp event webhook for external integration",
     "team_id": "00000000-0000-4000-b000-000000000001", "active": True,
     "delivery_count": 15, "failure_count": 1},
]

# ═══════════════════════════════════════════════════════════════════════════
# Sample Data: Audit Log
# ═══════════════════════════════════════════════════════════════════════════

SAMPLE_AUDIT_EVENTS = [
    {"event_type": "user.login",       "actor_id": "00000000-0000-4000-a000-000000000001", "target_id": "session:abc123",  "team_id": None, "metadata": {"ip": "192.168.1.1", "user_agent": "Chrome/120"}},
    {"event_type": "team.created",     "actor_id": "00000000-0000-4000-a000-000000000001", "target_id": "00000000-0000-4000-b000-000000000001", "team_id": "00000000-0000-4000-b000-000000000001", "metadata": {"team_name": "InnovateHub"}},
    {"event_type": "task.assigned",    "actor_id": "00000000-0000-4000-a000-000000000003", "target_id": "placeholder",   "team_id": "00000000-0000-4000-b000-000000000001", "metadata": {"task_title": "Implement auth middleware"}},
    {"event_type": "module.granted",   "actor_id": "00000000-0000-4000-a000-000000000001", "target_id": "00000000-0000-4000-a000-000000000007", "team_id": "00000000-0000-4000-b000-000000000001", "metadata": {"module": "api-core"}},
    {"event_type": "subscription.change", "actor_id": "00000000-0000-4000-a000-000000000001", "target_id": "00000000-0000-4000-b000-000000000001", "team_id": "00000000-0000-4000-b000-000000000001", "metadata": {"tier": "professional", "price": 299}},
]

# ═══════════════════════════════════════════════════════════════════════════
# Sample Data: API Keys
# ═══════════════════════════════════════════════════════════════════════════

SAMPLE_API_KEYS = [
    {"key_hash": "dev-key-hash-001", "name": "CI/CD Pipeline Key",  "user_id": "00000000-0000-4000-a000-000000000001", "team_id": "00000000-0000-4000-b000-000000000001",
     "is_active": True, "permissions": {"read": True, "write": True}},
    {"key_hash": "dev-key-hash-002", "name": "Read-only Analytics", "user_id": "00000000-0000-4000-a000-000000000003", "team_id": "00000000-0000-4000-b000-000000000001",
     "is_active": True, "permissions": {"read": True, "write": False}},
]

# ═══════════════════════════════════════════════════════════════════════════
# Sample Data: Usage Records
# ═══════════════════════════════════════════════════════════════════════════

SAMPLE_USAGE = [
    {"user_id": "00000000-0000-4000-a000-000000000005", "team_id": "00000000-0000-4000-b000-000000000001",
     "endpoint": "/api/v1/ask", "method": "POST", "status_code": 200, "response_time_ms": 345, "tokens_used": 150, "cost_usd": 0.003},
    {"user_id": "00000000-0000-4000-a000-000000000007", "team_id": "00000000-0000-4000-b000-000000000001",
     "endpoint": "/api/v1/explore", "method": "GET", "status_code": 200, "response_time_ms": 120, "tokens_used": 0, "cost_usd": 0.0},
    {"user_id": "00000000-0000-4000-a000-000000000001", "team_id": "00000000-0000-4000-b000-000000000001",
     "endpoint": "/api/v1/teams", "method": "POST", "status_code": 201, "response_time_ms": 89, "tokens_used": 0, "cost_usd": 0.0},
]

# ═══════════════════════════════════════════════════════════════════════════
# Sample Data: Team Invites
# ═══════════════════════════════════════════════════════════════════════════

SAMPLE_INVITES = [
    {"team_id": "00000000-0000-4000-b000-000000000001", "email": "new.hire@onramp.dev", "invited_by": "00000000-0000-4000-a000-000000000001",
     "token": "invite-token-innovate-001", "role": "developer", "status": "pending", "message": "Welcome to the InnovateHub team!"},
    {"team_id": "00000000-0000-4000-b000-000000000002", "email": "platform.eng@onramp.dev", "invited_by": "00000000-0000-4000-a000-000000000003",
     "token": "invite-token-platform-001", "role": "developer", "status": "accepted", "message": "Join the Platform Engineering team!"},
]

# ═══════════════════════════════════════════════════════════════════════════
# Seed Functions
# ═══════════════════════════════════════════════════════════════════════════

async def seed_users(storage, dry_run: bool, force: bool = False) -> int:
    """Create sample users with deterministic IDs."""
    created = 0
    base_dt = _dt(2026, 1, 15, 8, 0, 0)
    for user_data in SAMPLE_USERS:
        uid = user_data["id"]
        existing = await storage.get_document("users", uid)
        if existing:
            if force:
                logger.info("  [FORCE] Re-creating user %s (%s)", user_data["name"], user_data["email"])
                await storage.delete_document("users", uid)
            else:
                logger.info("  [SKIP] User %s (%s) already exists", user_data["name"], user_data["email"])
                continue
        record = {
            "email": encrypt_field(user_data["email"]),
            "name": encrypt_field(user_data["name"]),
            "email_hash": email_hash(user_data["email"]),
            "provider": user_data["provider"],
            "password_hash": _hash_password("demo123"),
            "is_active": True,
            "is_admin": user_data["is_admin"],
            "created_at": base_dt,
            "updated_at": base_dt,
        }
        if not dry_run:
            await storage.create_document("users", uid, record)
        created += 1
        logger.info("  [OK] Created user: %-22s (%s) - role: %s", user_data["name"], user_data["email"], user_data["role"])
    return created


async def seed_teams(storage, dry_run: bool, force: bool = False) -> int:
    """Create sample teams."""
    created = 0
    base_dt = _dt(2026, 1, 15, 8, 0, 0)
    for team_data in SAMPLE_TEAMS:
        existing = await storage.get_document("teams", team_data["id"])
        if existing:
            if force:
                logger.info("  [FORCE] Re-creating team '%s'", team_data["name"])
                if hasattr(storage, "run_in_transaction"):
                    async def _replace_team(session):
                        members = await storage._query_in_session(
                            session, "team_members",
                            [("team_id", "==", team_data["id"])],
                        )
                        for m in members:
                            await storage._delete_in_session(session, "team_members", m["id"])
                        await storage._delete_in_session(session, "teams", team_data["id"])
                    await storage.run_in_transaction(_replace_team)
                else:
                    members = await storage.query_documents("team_members", [("team_id", "==", team_data["id"])])
                    for m in members:
                        await storage.delete_document("team_members", m["id"])
                    await storage.delete_document("teams", team_data["id"])
            else:
                logger.info("  [SKIP] Team '%s' already exists", team_data["name"])
                continue
        record = {
            "name": team_data["name"],
            "description": team_data["description"],
            "is_active": True,
            "created_at": base_dt,
            "updated_at": base_dt,
        }
        if not dry_run:
            await storage.create_document("teams", team_data["id"], record)
        created += 1
        logger.info("  [OK] Created team: %s", team_data["name"])
    return created


async def seed_memberships(storage, dry_run: bool, force: bool = False) -> int:
    """Create team memberships."""
    created = 0
    base_dt = _dt(2026, 1, 15, 8, 0, 0)
    for membership in TEAM_MEMBERSHIPS:
        filters = [("user_id", "==", membership["user_id"]), ("team_id", "==", membership["team_id"])]
        existing = await storage.query_documents("team_members", filters)
        if existing:
            logger.info("  [SKIP] Membership for user %s in team %s already exists",
                        membership["user_id"][:12], membership["team_id"][:12])
            continue
        record = {"user_id": membership["user_id"], "team_id": membership["team_id"],
                  "role": membership["role"], "joined_at": base_dt}
        if not dry_run:
            await storage.create_document("team_members", generate_id(), record)
        created += 1
        user_name = next((u["name"] for u in SAMPLE_USERS if u["id"] == membership["user_id"]), membership["user_id"][:12])
        team_name = next((t["name"] for t in SAMPLE_TEAMS if t["id"] == membership["team_id"]), membership["team_id"][:12])
        logger.info("  [OK] Added %-22s -> %s (as %s)", user_name, team_name, membership["role"])
    return created


async def seed_repos(storage, dry_run: bool, force: bool = False) -> int:
    """Create sample repositories."""
    created = 0
    base_dt = _dt(2026, 1, 15, 8, 30, 0)
    for repo_data in SAMPLE_REPOS:
        filters = [("owner", "==", repo_data["owner"]), ("name", "==", repo_data["name"])]
        existing = await storage.query_documents("repositories", filters)
        if existing:
            if force:
                logger.info("  [FORCE] Re-creating repo %s/%s", repo_data["owner"], repo_data["name"])
                await storage.delete_document("repositories", existing[0]["id"])
            else:
                logger.info("  [SKIP] Repo %s/%s already exists", repo_data["owner"], repo_data["name"])
                continue
        record = {
            "name": repo_data["name"], "owner": repo_data["owner"], "team_id": repo_data["team_id"],
            "url": repo_data["url"], "language": repo_data["language"], "description": repo_data["description"],
            "status": "pending", "created_at": base_dt, "updated_at": base_dt, "last_analyzed_at": None,
        }
        if not dry_run:
            await storage.create_document("repositories", generate_id(), record)
        created += 1
        team_label = repo_data["team_id"][:12] if repo_data["team_id"] else "unassigned"
        logger.info("  [OK] Created repo: %s/%-30s (%-12s) - team: %s",
                    repo_data["owner"], repo_data["name"], repo_data["language"], team_label)
    return created


async def seed_tasks(storage, dry_run: bool, force: bool = False) -> int:
    """Create sample tasks with various states."""
    created = 0
    for task_data in SAMPLE_TASKS:
        task_id = generate_id()
        now_dt = _dt(2026, 1, 20, 10, 0, 0)
        completed_dt = _dt(2026, 1, 22, 14, 0, 0) if task_data["state"] == "completed" else None
        started_dt = (_dt(2026, 1, 20, 14, 0, 0)
                      if task_data["state"] in ("in_progress", "submitted", "under_review", "completed")
                      else None)
        record = {
            "team_id": task_data["team_id"],
            "created_by": task_data["created_by"], "assigned_to": task_data["assigned_to"],
            "title": task_data["title"], "description": task_data["description"],
            "module": task_data["module"], "state": task_data["state"], "priority": task_data["priority"],
            "pr_url": None, "branch": "main", "repo_url": "https://github.com/onramp/backend-api",
            "unlock_modules": task_data["unlock_modules"], "review_feedback": None,
            "ai_review": None, "product_signoff": False,
            "estimated_hours": 4.0 if task_data["priority"] == "high" else 2.0,
            "started_at": started_dt,
            "completed_at": completed_dt,
            "created_at": now_dt,
            "updated_at": now_dt,
        }
        if not dry_run:
            await storage.create_document("onramp_tasks", task_id, record)
        created += 1
        assignee = next((u["name"] for u in SAMPLE_USERS if u["id"] == task_data["assigned_to"]), task_data["assigned_to"][:12])
        logger.info("  [OK] Created task '%-50s' -> %s [%s]", task_data["title"], assignee, task_data["state"])
    return created


async def seed_module_permissions(storage, dry_run: bool, force: bool = False) -> int:
    """Create module permissions."""
    created = 0
    grant_dt = _dt(2026, 1, 15, 9, 0, 0)
    for perm in MODULE_PERMISSIONS:
        filters = [("team_id", "==", perm["team_id"]), ("user_id", "==", perm["user_id"]), ("module", "==", perm["module"])]
        existing = await storage.query_documents("member_modules", filters)
        if existing:
            logger.info("  [SKIP] Module '%s' for user %s already exists", perm["module"], perm["user_id"][:12])
            continue
        record = {
            "team_id": perm["team_id"], "user_id": perm["user_id"], "module": perm["module"],
            "granted_by": "00000000-0000-4000-a000-000000000001",
            "granted_at": grant_dt, "source": perm["source"],
        }
        if not dry_run:
            await storage.create_document("member_modules", generate_id(), record)
        created += 1
        user_name = next((u["name"] for u in SAMPLE_USERS if u["id"] == perm["user_id"]), perm["user_id"][:12])
        logger.info("  [OK] Granted module '%-20s' -> %s", perm["module"], user_name)
    return created


async def seed_subscriptions(storage, dry_run: bool, force: bool = False) -> int:
    """Create billing subscriptions."""
    created = 0
    now_dt = _dt(2026, 1, 15, 8, 0, 0)
    period_end_dt = now_dt + timedelta(days=30)
    for sub_data in TEAM_SUBSCRIPTIONS:
        sub_id = generate_id()
        existing = await storage.query_documents("onramp_subscriptions", [("team_id", "==", sub_data["team_id"])])
        if existing:
            if force:
                logger.info("  [FORCE] Re-creating subscription for team %s", sub_data["team_id"][:12])
                for sub in existing:
                    await storage.delete_document("onramp_subscriptions", sub.get("subscription_id") or sub.get("id"))
            else:
                logger.info("  [SKIP] Subscription for team %s already exists", sub_data["team_id"][:12])
                continue
        record = {
            "team_id": sub_data["team_id"],
            "tier": sub_data["tier"], "billing_cycle": sub_data["billing_cycle"],
            "price": sub_data["price"], "status": sub_data["status"],
            "current_period_start": now_dt, "current_period_end": period_end_dt,
            "stripe_customer_id": None, "stripe_subscription_id": None,
            "created_at": now_dt, "updated_at": now_dt,
        }
        if not dry_run:
            await storage.create_document("onramp_subscriptions", sub_id, record)
        created += 1
        team_name = next((t["name"] for t in SAMPLE_TEAMS if t["id"] == sub_data["team_id"]), sub_data["team_id"][:12])
        logger.info("  [OK] Created subscription: %-25s -> %s ($%d/%s)",
                    team_name, sub_data["tier"], sub_data["price"], sub_data["billing_cycle"])
    if created > 0:
        mrr = sum(s["price"] for s in TEAM_SUBSCRIPTIONS if s["billing_cycle"] == "monthly")
        mrr += sum(round(s["price"] / 12) for s in TEAM_SUBSCRIPTIONS if s["billing_cycle"] == "yearly")
        logger.info("  Total MRR (from seeded subscriptions): $%d/mo", mrr)
    return created


async def seed_notifications(storage, dry_run: bool, force: bool = False) -> int:
    """Create sample in-app notifications."""
    created = 0
    base_dt = _dt(2026, 1, 20, 10, 0, 0)
    for i, notif in enumerate(SAMPLE_NOTIFICATIONS):
        nid = generate_id()
        record = {
            "user_id": notif["user_id"],
            "type": notif["type"],
            "title": notif["title"],
            "message": notif["message"],
            "full_message": None,
            "metadata": {},
            "team_id": notif["team_id"],
            "read": False,
            "read_at": None,
            "created_at": base_dt + timedelta(hours=i),
        }
        if not dry_run:
            await storage.create_document("onramp_notifications", nid, record)
        created += 1
        user_name = next((u["name"] for u in SAMPLE_USERS if u["id"] == notif["user_id"]), notif["user_id"][:12])
        logger.info("  [OK] Created notification: %-20s -> %s", notif["title"][:20], user_name)
    return created


async def seed_notification_preferences(storage, dry_run: bool, force: bool = False) -> int:
    """Create notification preferences (1:1 with users)."""
    created = 0
    base_dt = _dt(2026, 1, 15, 8, 0, 0)
    for pref in SAMPLE_NOTIFICATION_PREFERENCES:
        existing = await storage.get_document("onramp_notification_preferences", pref["user_id"])
        if existing:
            logger.info("  [SKIP] Notification preferences for %s already exist", pref["user_id"][:12])
            continue
        record = {
            "user_id": pref["user_id"],
            "channels": pref["channels"],
            "digest_frequency": pref["digest_frequency"],
            "quiet_hours_enabled": False,
            "quiet_hours_start": "22:00",
            "quiet_hours_end": "08:00",
            "email_digest_time": "09:00",
            "created_at": base_dt,
            "updated_at": base_dt,
        }
        if not dry_run:
            await storage.create_document("onramp_notification_preferences", pref["user_id"], record)
        created += 1
        logger.info("  [OK] Created notification preferences for user %s", pref["user_id"][:12])
    return created


async def seed_gamification_xp(storage, dry_run: bool, force: bool = False) -> int:
    """Create XP records."""
    created = 0
    base_dt = _dt(2026, 1, 22, 10, 0, 0)
    for xp in SAMPLE_XP:
        xpid = generate_id()
        record = {
            "user_id": xp["user_id"], "source": xp["source"],
            "amount": xp["amount"], "date": "2026-01-22",
            "team_id": xp["team_id"], "metadata": {},
            "created_at": base_dt,
        }
        if not dry_run:
            await storage.create_document("onramp_gamification_xp", xpid, record)
        created += 1
    logger.info("  [OK] Created %d XP records", len(SAMPLE_XP))
    return created


async def seed_badges(storage, dry_run: bool, force: bool = False) -> int:
    """Create achievement badges."""
    created = 0
    base_dt = _dt(2026, 1, 22, 10, 0, 0)
    for badge in SAMPLE_BADGES:
        bid = generate_id()
        record = {
            "user_id": badge["user_id"], "badge_key": badge["badge_key"],
            "badge_name": badge["badge_name"], "icon": badge["icon"],
            "description": badge["description"], "xp_bonus": badge["xp_bonus"],
            "team_id": badge["team_id"], "earned_at": base_dt,
        }
        if not dry_run:
            await storage.create_document("onramp_gamification_badges", bid, record)
        created += 1
    logger.info("  [OK] Created %d badges", len(SAMPLE_BADGES))
    return created


async def seed_streaks(storage, dry_run: bool, force: bool = False) -> int:
    """Create login streaks."""
    created = 0
    base_dt = _dt(2026, 1, 22, 10, 0, 0)
    for streak in SAMPLE_STREAKS:
        sid = generate_id()
        record = {
            "user_id": streak["user_id"],
            "current_streak": streak["current_streak"],
            "longest_streak": streak["longest_streak"],
            "last_active_date": streak["last_active_date"],
            "streak_frozen": False,
            "created_at": base_dt,
            "updated_at": base_dt,
        }
        if not dry_run:
            await storage.create_document("onramp_gamification_streaks", sid, record)
        created += 1
    logger.info("  [OK] Created %d streaks", len(SAMPLE_STREAKS))
    return created


async def seed_integrations(storage, dry_run: bool, force: bool = False) -> int:
    """Create integration configs (Slack, GitHub)."""
    created = 0
    base_dt = _dt(2026, 1, 15, 8, 0, 0)
    for intg in SAMPLE_INTEGRATIONS:
        iid = generate_id()
        record = {
            "user_id": intg["user_id"], "integration": intg["integration"],
            "config": intg["config"],
            "created_at": base_dt, "updated_at": base_dt,
        }
        if not dry_run:
            await storage.create_document("onramp_integrations", iid, record)
        created += 1
        logger.info("  [OK] Created %s integration for user %s", intg["integration"], intg["user_id"][:12])
    return created


async def seed_conversations(storage, dry_run: bool, force: bool = False) -> int:
    """Create sample Q&A conversations."""
    created = 0
    base_dt = _dt(2026, 1, 22, 11, 0, 0)
    for i, conv in enumerate(SAMPLE_CONVERSATIONS):
        cid = generate_id()
        record = {
            "user_id": conv["user_id"], "index_id": conv["index_id"],
            "question": conv["question"], "answer": conv["answer"],
            "created_at": base_dt + timedelta(hours=i),
        }
        if not dry_run:
            await storage.create_document("onramp_conversations", cid, record)
        created += 1
    logger.info("  [OK] Created %d conversations", len(SAMPLE_CONVERSATIONS))
    return created


async def seed_learning_paths(storage, dry_run: bool, force: bool = False) -> int:
    """Create learning paths."""
    created = 0
    base_dt = _dt(2026, 1, 18, 9, 0, 0)
    for path in SAMPLE_LEARNING_PATHS:
        pid = generate_id()
        record = {
            "user_id": path["user_id"], "repo_url": path["repo_url"],
            "user_level": path["user_level"], "result": path["result"],
            "created_at": base_dt,
        }
        if not dry_run:
            await storage.create_document("onramp_learning_paths", pid, record)
        created += 1
    logger.info("  [OK] Created %d learning paths", len(SAMPLE_LEARNING_PATHS))
    return created


async def seed_quiz_data(storage, dry_run: bool, force: bool = False) -> int:
    """Create quizzes and quiz results."""
    created = 0
    base_dt = _dt(2026, 1, 22, 14, 0, 0)
    quiz_id = generate_id()
    for quiz in SAMPLE_QUIZZES:
        record = {
            "user_id": quiz["user_id"], "mode": quiz["mode"],
            "module": quiz["module"], "difficulty": quiz["difficulty"],
            "total_questions": quiz["total_questions"], "questions": quiz["questions"],
            "created_at": base_dt,
        }
        if not dry_run:
            await storage.create_document("onramp_quizzes", quiz_id, record)
        created += 1
    logger.info("  [OK] Created quiz: %s", quiz_id[:12])

    for result in SAMPLE_QUIZ_RESULTS:
        rid = generate_id()
        record = {
            "quiz_id": quiz_id, "user_id": result["user_id"],
            "module": result["module"], "answers": result["answers"],
            "score": result["score"], "total": result["total"],
            "percentage": result["percentage"], "passed": result["passed"],
            "results": result["results"], "summary": result["summary"],
            "submitted_at": base_dt + timedelta(minutes=30),
        }
        if not dry_run:
            await storage.create_document("onramp_quiz_results", rid, record)
        created += 1
    logger.info("  [OK] Created quiz result for user %s", result["user_id"][:12])
    return created


async def seed_playbooks(storage, dry_run: bool, force: bool = False) -> int:
    """Create onboarding playbooks."""
    created = 0
    base_dt = _dt(2026, 1, 15, 8, 0, 0)
    for pb in SAMPLE_PLAYBOOKS:
        pid = generate_id()
        record = {
            "team_id": pb["team_id"], "title": pb["title"],
            "description": pb["description"], "steps": pb["steps"],
            "tags": pb["tags"], "created_by": pb["created_by"],
            "version": pb["version"], "is_archived": pb["is_archived"],
            "use_count": pb["use_count"],
            "created_at": base_dt, "updated_at": base_dt,
        }
        if not dry_run:
            await storage.create_document("onramp_playbooks", pid, record)
        created += 1
        logger.info("  [OK] Created playbook: %s", pb["title"])
    return created


async def seed_milestones(storage, dry_run: bool, force: bool = False) -> int:
    """Create contribution milestones."""
    created = 0
    base_dt = _dt(2026, 1, 18, 10, 0, 0)
    for i, ms in enumerate(SAMPLE_MILESTONES):
        mid = generate_id()
        record = {
            "user": ms["user"], "repo": ms["repo"],
            "type": ms["type"], "metadata": ms["metadata"],
            "timestamp": base_dt + timedelta(hours=i * 24),
        }
        if not dry_run:
            await storage.create_document("onramp_milestones", mid, record)
        created += 1
    logger.info("  [OK] Created %d milestones", len(SAMPLE_MILESTONES))
    return created


async def seed_audit_log(storage, dry_run: bool, force: bool = False) -> int:
    """Create audit log entries."""
    created = 0
    base_dt = _dt(2026, 1, 15, 8, 0, 0)
    for i, event in enumerate(SAMPLE_AUDIT_EVENTS):
        eid = generate_id()
        record = {
            "event_type": event["event_type"], "actor_id": event["actor_id"],
            "target_id": event["target_id"], "team_id": event["team_id"],
            "metadata": event["metadata"],
            "timestamp": base_dt + timedelta(hours=i + 1),
        }
        if not dry_run:
            await storage.create_document("onramp_audit_log", eid, record)
        created += 1
    logger.info("  [OK] Created %d audit log entries", len(SAMPLE_AUDIT_EVENTS))
    return created


async def seed_webhooks(storage, dry_run: bool, force: bool = False) -> int:
    """Create webhook endpoints + delivery records."""
    created = 0
    base_dt = _dt(2026, 1, 15, 8, 0, 0)
    for wh in SAMPLE_WEBHOOKS:
        whid = generate_id()
        record = {
            "user_id": wh["user_id"], "url": wh["url"],
            "events": wh["events"],
            "secret": "whsec_dev_secret_key_for_testing_only",
            "description": wh["description"],
            "team_id": wh["team_id"], "active": wh["active"],
            "delivery_count": wh["delivery_count"],
            "failure_count": wh["failure_count"],
            "last_success_at": base_dt + timedelta(hours=2),
            "last_failure_at": None,
            "created_at": base_dt, "updated_at": base_dt,
        }
        if not dry_run:
            await storage.create_document("onramp_webhooks", whid, record)
        created += 1
        logger.info("  [OK] Created webhook: %s", wh["description"])

        # Add a delivery record for this webhook
        did = generate_id()
        del_record = {
            "webhook_id": whid, "event_type": "task.assigned",
            "url": wh["url"], "status": "success",
            "status_code": 200, "response_body": "{\"ok\":true}",
            "error_message": None, "duration_ms": 234,
            "retry_count": 0, "next_retry_at": None,
            "delivered_at": base_dt + timedelta(hours=2),
            "created_at": base_dt + timedelta(hours=2),
        }
        if not dry_run:
            await storage.create_document("onramp_webhook_deliveries", did, del_record)
        created += 1
    logger.info("  [OK] Created %d webhook delivery logs", len(SAMPLE_WEBHOOKS))
    return created


async def seed_api_keys(storage, dry_run: bool, force: bool = False) -> int:
    """Create API keys."""
    created = 0
    base_dt = _dt(2026, 1, 15, 8, 0, 0)
    for key in SAMPLE_API_KEYS:
        kid = generate_id()
        record = {
            "key_hash": key["key_hash"], "name": key["name"],
            "user_id": key["user_id"], "team_id": key["team_id"],
            "is_active": key["is_active"], "permissions": key["permissions"],
            "expires_at": base_dt + timedelta(days=365),
            "last_used_at": base_dt + timedelta(hours=2),
            "created_at": base_dt,
        }
        if not dry_run:
            await storage.create_document("api_keys", kid, record)
        created += 1
        logger.info("  [OK] Created API key: %s", key["name"])
    return created


async def seed_usage_records(storage, dry_run: bool, force: bool = False) -> int:
    """Create usage tracking records."""
    created = 0
    base_dt = _dt(2026, 1, 22, 8, 0, 0)
    for i, usage in enumerate(SAMPLE_USAGE):
        uid = generate_id()
        record = {
            "user_id": usage["user_id"], "team_id": usage["team_id"],
            "endpoint": usage["endpoint"], "method": usage["method"],
            "status_code": usage["status_code"],
            "response_time_ms": usage["response_time_ms"],
            "tokens_used": usage["tokens_used"],
            "cost_usd": usage["cost_usd"],
            "metadata": {},
            "created_at": base_dt + timedelta(hours=i),
        }
        if not dry_run:
            await storage.create_document("usage_records", uid, record)
        created += 1
    logger.info("  [OK] Created %d usage records", len(SAMPLE_USAGE))
    return created


async def seed_invites(storage, dry_run: bool, force: bool = False) -> int:
    """Create team invitation records."""
    created = 0
    base_dt = _dt(2026, 1, 15, 8, 0, 0)
    for invite in SAMPLE_INVITES:
        iid = generate_id()
        expires = base_dt + timedelta(days=7)
        record = {
            "team_id": invite["team_id"], "email": invite["email"],
            "invited_by": invite["invited_by"], "token": invite["token"],
            "role": invite["role"], "status": invite["status"],
            "message": invite["message"],
            "expires_at": expires,
            "created_at": base_dt, "updated_at": base_dt,
        }
        if not dry_run:
            await storage.create_document("team_invites", iid, record)
        created += 1
        logger.info("  [OK] Created invite: %s -> %s (%s)", invite["email"], invite["team_id"][:12], invite["status"])
    return created


# ═══════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════

async def main():
    import argparse

    parser = argparse.ArgumentParser(description="Seed all Onramp database tables with demo data")
    parser.add_argument("--quick", action="store_true", help="Only seed essential data (users, teams, memberships)")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be created without writing")
    parser.add_argument("--force", action="store_true", help="Re-create existing data")
    args = parser.parse_args()

    dry_run = args.dry_run
    quick = args.quick
    force = args.force
    storage = get_storage()

    print()
    print("+------------------------------------------------------------+")
    print("|          Onramp Database Seed (all 39 tables)              |")
    print("+------------------------------------------------------------+")
    print()
    if dry_run:
        print("  [DRY RUN] - no data will be written\n")
    if quick:
        print("  [QUICK MODE] - seeding minimal data\n")
    if force:
        print("  [FORCE MODE] - re-creating existing data\n")

    sections = [
        ("Users", seed_users),
        ("Teams", seed_teams),
        ("Memberships", seed_memberships),
    ]
    if not quick:
        sections += [
            ("Repositories", seed_repos),
            ("Module Permissions", seed_module_permissions),
            ("Tasks", seed_tasks),
            ("Subscriptions", seed_subscriptions),
            ("Notifications", seed_notifications),
            ("Notification Preferences", seed_notification_preferences),
            ("Gamification XP", seed_gamification_xp),
            ("Badges", seed_badges),
            ("Streaks", seed_streaks),
            ("Integrations", seed_integrations),
            ("Conversations", seed_conversations),
            ("Learning Paths", seed_learning_paths),
            ("Quizzes & Results", seed_quiz_data),
            ("Playbooks", seed_playbooks),
            ("Milestones", seed_milestones),
            ("Audit Log", seed_audit_log),
            ("Webhooks & Deliveries", seed_webhooks),
            ("API Keys", seed_api_keys),
            ("Usage Records", seed_usage_records),
            ("Team Invites", seed_invites),
        ]

    total = 0
    for label, func in sections:
        print(f"  -- {label} {'-' * (50 - len(label))}")
        count = await func(storage, dry_run, force=force)
        total += count
        print()

    if not dry_run:
        print(f"  Created {total} records across {len(sections)} categories!")
        print()
        print("  Sample login credentials (all passwords: demo123):")
        print("  +----------------------+---------------------------+-------------+")
        print("  | Email                | Name                      | Role        |")
        print("  +----------------------+---------------------------+-------------+")
        for u in SAMPLE_USERS[:5 if quick else len(SAMPLE_USERS)]:
            print(f"  | {u['email']:<20} | {u['name']:<24} | {u['role']:<12} |")
        print("  +----------------------+---------------------------+-------------+")
        print()
        if not quick:
            print("  Subscription summary:")
            for s in TEAM_SUBSCRIPTIONS:
                team_name = next((t["name"] for t in SAMPLE_TEAMS if t["id"] == s["team_id"]), s["team_id"][:12])
                print(f"    {team_name:<25} -> {s['tier']:<14} (${s['price']}/{s['billing_cycle']})")
            print()
        print("  Run with --dry-run to preview without writing.")
    else:
        print("  (dry run - no data written)\n")


if __name__ == "__main__":
    asyncio.run(main())
