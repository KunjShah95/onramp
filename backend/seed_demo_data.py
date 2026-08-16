"""Seed script — populates NeonDB with rich demo data for testing.

Usage:
    cd backend && .venv/Scripts/python seed_demo_data.py

Uses deterministic UUIDs so data is idempotent (re-running won't create
duplicates if records already exist).
"""

import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("seed")

from app.services.postgres_db import get_storage, generate_id
from app.services.field_encryption import email_hash, encrypt_field

# ═══════════════════════════════════════════════════════════════════════
# Deterministic UUIDs (v5 namespaced on domain strings)
# ═══════════════════════════════════════════════════════════════════════

_NS = uuid.NAMESPACE_DNS

def _det_uuid(name: str) -> str:
    return str(uuid.uuid5(_NS, f"onramp-demo-{name}"))

# ── Team UUIDs ────────────────────────────────────────────────────
TEAM_ACME   = _det_uuid("team-acme")
TEAM_BETA   = _det_uuid("team-beta")
TEAM_STARTUP = _det_uuid("team-startup")

# ── User UUIDs ─────────────────────────────────────────────────────
UID_CEO       = _det_uuid("user-ceo")
UID_CTO       = _det_uuid("user-cto")
UID_SENIOR    = _det_uuid("user-senior")
UID_DEV1      = _det_uuid("user-dev1")
UID_DEV2      = _det_uuid("user-dev2")
UID_TESTER    = _det_uuid("user-tester")
UID_HR        = _det_uuid("user-hr")
UID_NEWBIE    = _det_uuid("user-newbie")
UID_NEWBIE2   = _det_uuid("user-newbie2")

ALL_USERS = [
    (UID_CEO,     "Ravi Sharma",    "ravi@acme.com",     "ceo"),
    (UID_CTO,     "Priya Patel",    "priya@acme.com",    "cto"),
    (UID_SENIOR,  "Alex Chen",      "alex@acme.com",     "senior_dev"),
    (UID_DEV1,    "Maya Johnson",   "maya@acme.com",     "developer"),
    (UID_DEV2,    "Sam Wilson",     "sam@acme.com",      "developer"),
    (UID_TESTER,  "Jordan Lee",     "jordan@acme.com",   "tester"),
    (UID_HR,      "Sarah Kim",      "sarah@acme.com",    "hr"),
    (UID_NEWBIE,  "Dev Shah",       "dev@acme.com",      "junior_dev"),
    (UID_NEWBIE2, "Anika Gupta",    "anika@acme.com",    "junior_dev"),
]

# ── Team definitions ────────────────────────────────────────────────
TEAMS = [
    (TEAM_ACME,    "Acme Corp",    "Enterprise software team — full SDLC lifecycle"),
    (TEAM_BETA,    "Beta Squad",   "Fast-moving feature team focused on experimental products"),
    (TEAM_STARTUP, "Startup XYZ",  "Lean startup team — building MVP and iterating fast"),
]

# Membership: (team_id, user_id, role)
MEMBERSHIPS = [
    (TEAM_ACME,    UID_CEO,     "ceo"),
    (TEAM_ACME,    UID_CTO,     "cto"),
    (TEAM_ACME,    UID_SENIOR,  "senior_dev"),
    (TEAM_ACME,    UID_DEV1,    "developer"),
    (TEAM_ACME,    UID_DEV2,    "developer"),
    (TEAM_ACME,    UID_TESTER,  "tester"),
    (TEAM_ACME,    UID_HR,      "hr"),
    (TEAM_ACME,    UID_NEWBIE,  "junior_dev"),
    (TEAM_ACME,    UID_NEWBIE2, "junior_dev"),
    (TEAM_BETA,    UID_CTO,     "cto"),
    (TEAM_BETA,    UID_SENIOR,  "senior_dev"),
    (TEAM_BETA,    UID_DEV1,    "developer"),
    (TEAM_BETA,    UID_NEWBIE,  "junior_dev"),
    (TEAM_STARTUP, UID_DEV2,    "developer"),
    (TEAM_STARTUP, UID_NEWBIE2, "junior_dev"),
]

# ── Task definitions ────────────────────────────────────────────────
TASKS = [
    # (det_id, team_id, created_by, assigned_to, title, module, state, priority, hours)
    ("task-1",  TEAM_ACME,   UID_SENIOR, UID_NEWBIE,  "Set up CI/CD pipeline",                "devops",    "completed",    "high",   4),
    ("task-2",  TEAM_ACME,   UID_SENIOR, UID_NEWBIE,  "Implement user authentication flow",    "backend",   "completed",    "high",   8),
    ("task-3",  TEAM_ACME,   UID_SENIOR, UID_NEWBIE,  "Create REST API for user profiles",     "backend",   "completed",    "medium", 6),
    ("task-4",  TEAM_ACME,   UID_SENIOR, UID_NEWBIE,  "Add unit tests for billing module",     "testing",   "under_review", "medium", 3),
    ("task-5",  TEAM_ACME,   UID_SENIOR, UID_NEWBIE2, "Design and implement dashboard UI",     "frontend",  "in_progress",  "high",   10),
    ("task-6",  TEAM_ACME,   UID_SENIOR, UID_NEWBIE2, "Write API documentation",               "docs",      "submitted",    "low",    2),
    ("task-7",  TEAM_ACME,   UID_CEO,    UID_NEWBIE,  "Research competitor pricing strategies", "research",  "assigned",     "medium", 5),
    ("task-8",  TEAM_ACME,   UID_CTO,    UID_SENIOR,  "Architect microservices migration",      "backend",   "needs_changes","high",   16),
    ("task-9",  TEAM_BETA,   UID_SENIOR, UID_NEWBIE,  "Build feature flag system",              "backend",   "in_progress",  "high",   8),
    ("task-10", TEAM_BETA,   UID_CTO,    UID_DEV1,    "Implement real-time notifications",      "backend",   "completed",    "high",   12),
    ("task-11", TEAM_ACME,   UID_CEO,    None,         "Quarterly planning document",           "planning",  "pending",      "medium", 0),
    ("task-12", TEAM_ACME,   UID_SENIOR, UID_DEV1,    "Code review backlog cleanup",            "process",   "submitted",    "low",    2),
]

# ── Notification definitions ─────────────────────────────────────────
NOTIFICATIONS = [
    (UID_NEWBIE,  "task_assigned",     "Task assigned: Set up CI/CD pipeline",
     "Your first task has been assigned by Alex Chen. Start by reviewing the requirements."),
    (UID_NEWBIE,  "task_completed",    "Task approved: CI/CD pipeline",
     "Great work! Your CI/CD pipeline setup has been approved. You earned 30 XP!"),
    (UID_NEWBIE,  "task_assigned",     "Task assigned: Implement user auth",
     "Alex Chen has assigned you a new backend task: Implement user authentication flow."),
    (UID_NEWBIE,  "task_completed",    "Task approved: User auth flow",
     "Excellent! Your authentication implementation is complete and approved."),
    (UID_NEWBIE,  "badge_earned",      "Badge unlocked: Explorer",
     "You've earned the Explorer badge for analyzing 3 repositories!"),
    (UID_NEWBIE,  "streak_milestone",  "7-day streak achieved!",
     "You've logged in for 7 consecutive days. Keep it up!"),
    (UID_SENIOR,  "review_requested",  "Review needed: Billing tests",
     "Dev Shah has submitted 'Add unit tests for billing module' for review."),
    (UID_SENIOR,  "review_requested",  "Review needed: API documentation",
     "Anika Gupta has submitted 'Write API documentation' for review."),
    (UID_CEO,     "weekly_digest",     "Weekly team digest: 8 tasks completed",
     "Your team completed 8 tasks this week with a 92% completion rate."),
    (UID_CTO,     "system_alert",      "Deployment pipeline: All checks passing",
     "All CI/CD checks are passing. Last deployment was successful."),
    (UID_HR,      "onboarding_update", "New developer onboarding: Week 2 complete",
     "Dev Shah has completed their second week. Pulse survey score: 8/10."),
    (UID_NEWBIE2, "task_assigned",     "Task assigned: Dashboard UI",
     "Alex Chen has assigned you: Design and implement dashboard UI. Estimated: 10 hours."),
]


async def seed():
    """Main seeding function."""
    storage = get_storage()
    now = datetime.now(timezone.utc)
    log.info("Seeding NeonDB with demo data...")

    # ════════════════════════════════════════════════════════════════
    # 1. Users
    # ════════════════════════════════════════════════════════════════
    log.info("  Creating users...")
    for uid, name, email, provider in ALL_USERS:
        existing = await storage.get_document("users", uid)
        if existing:
            log.info(f"    User {name} already exists — skipping")
            continue
        await storage.create_document("users", uid, {
            "email": encrypt_field(email),
            "name": encrypt_field(name),
            "email_hash": email_hash(email),
            "provider": "password",
            "password_hash": "seed-demo-hash-not-for-production",
            "is_active": True,
            "is_admin": uid in (UID_CEO, UID_CTO),
            "email_verified": True,
            "password_reset_required": False,
            "created_at": now - timedelta(hours=len(ALL_USERS) * 2),
            "updated_at": now,
        })
        log.info(f"    Created user: {name} ({email})")

    # ════════════════════════════════════════════════════════════════
    # 2. Teams
    # ════════════════════════════════════════════════════════════════
    log.info("  Creating teams...")
    for tid, tname, desc in TEAMS:
        existing = await storage.get_document("teams", tid)
        if existing:
            log.info(f"    Team {tname} already exists — skipping")
            continue
        await storage.create_document("teams", tid, {
            "name": tname,
            "description": desc,
            "is_active": True,
            "created_at": now - timedelta(days=60),
            "updated_at": now,
        })
        log.info(f"    Created team: {tname}")

    # ════════════════════════════════════════════════════════════════
    # 3. Team Memberships
    # ════════════════════════════════════════════════════════════════
    # Note: team_members.id is auto-increment INTEGER. We check for duplicates
    # by querying user_id+team_id combo (which has a UNIQUE constraint).
    log.info("  Creating team memberships...")
    member_count = 0
    for tid, uid, role in MEMBERSHIPS:
        existing = await storage.query_documents(
            "team_members",
            [("user_id", "==", uid), ("team_id", "==", tid)],
        )
        if existing:
            continue
        await storage.create_document("team_members", generate_id(), {
            "user_id": uid,
            "team_id": tid,
            "role": role,
            "joined_at": now - timedelta(days=45) if role in ("ceo", "cto", "senior_dev")
                          else now - timedelta(days=14),
        })
        member_count += 1
    log.info(f"    Created {member_count} memberships")

    # ════════════════════════════════════════════════════════════════
    # 4. Subscriptions
    # ════════════════════════════════════════════════════════════════
    log.info("  Creating subscriptions...")
    subs = [
        (TEAM_ACME,    "professional", 299, 20),
        (TEAM_BETA,    "startup",       49,  5),
        (TEAM_STARTUP, "free",            0,  1),
    ]
    for tid, tier, price, _ in subs:
        existing_subs = await storage.query_documents("onramp_subscriptions",
                                                        [("team_id", "==", tid)])
        if existing_subs:
            continue
        sub_id = generate_id()
        await storage.create_document("onramp_subscriptions", sub_id, {
            "subscription_id": sub_id,
            "team_id": tid,
            "tier": tier,
            "billing_cycle": "monthly",
            "price": price,
            "status": "active",
            "current_period_start": now - timedelta(days=30),
            "current_period_end": now + timedelta(days=1),
            "created_at": now - timedelta(days=30),
            "updated_at": now,
        })
    log.info(f"    Created {len(subs)} subscriptions")

    # ════════════════════════════════════════════════════════════════
    # 5. Tasks
    # ════════════════════════════════════════════════════════════════
    log.info("  Creating tasks...")
    for det_id, team_id, creator, assignee, title, module, state, priority, hours in TASKS:
        task_id = _det_uuid(det_id)
        existing = await storage.get_document("onramp_tasks", task_id)
        if existing:
            continue

        created_at = now - timedelta(hours=len(TASKS) * 3)
        started_at = created_at + timedelta(hours=1) if state in ("in_progress", "submitted", "under_review", "completed") else None
        completed_at = created_at + timedelta(hours=hours or 4) if state == "completed" else None
        pr_url = f"https://github.com/acme/onramp/pull/{abs(hash(det_id)) % 1000}" if state in ("submitted", "under_review", "completed") else None

        await storage.create_document("onramp_tasks", task_id, {
            "task_id": task_id,
            "team_id": team_id,
            "created_by": creator,
            "assigned_to": assignee or None,
            "title": title,
            "description": f"Task: {title}. Assigned by the team lead as part of the onboarding workflow.",
            "module": module,
            "state": state,
            "priority": priority,
            "pr_url": pr_url,
            "branch": f"feature/{det_id.replace('_', '-')}",
            "repo_url": "https://github.com/acme/onramp",
            "unlock_modules": ["ci_cd_basics", "backend_fundamentals"] if "auth" in title.lower() else [],
            "estimated_hours": hours or 0,
            "started_at": started_at,
            "completed_at": completed_at,
            "created_at": created_at,
            "updated_at": completed_at or now,
        })
    log.info(f"    Created {len(TASKS)} tasks")

    # ════════════════════════════════════════════════════════════════
    # 6. Gamification — XP, Badges, Streaks
    # ════════════════════════════════════════════════════════════════
    log.info("  Creating gamification data...")

    # XP records
    xp_data = [
        (UID_NEWBIE,  "task_completed",  30,  3),
        (UID_NEWBIE,  "learning_module_completed", 50, 2),
        (UID_NEWBIE,  "quiz_passed",     10,  5),
        (UID_NEWBIE,  "daily_login",      5,  7),
        (UID_NEWBIE2, "task_completed",  30,  1),
        (UID_NEWBIE2, "question_asked",   5,  3),
        (UID_NEWBIE2, "quiz_passed",     10,  2),
        (UID_DEV1,    "task_completed",  30, 10),
        (UID_DEV1,    "pr_review_completed", 15, 8),
        (UID_DEV1,    "repo_analyzed",   20,  5),
        (UID_DEV2,    "task_completed",  30,  6),
        (UID_SENIOR,  "pr_review_completed", 15, 20),
        (UID_SENIOR,  "playbook_created", 100, 2),
        (UID_SENIOR,  "first_pr_merged", 200, 3),
    ]
    for uid, source, amount, count in xp_data:
        for i in range(count):
            xp_id = _det_uuid(f"xp-{uid[:8]}-{source}-{i}")
            existing = await storage.get_document("onramp_gamification_xp", xp_id)
            if existing:
                continue
            await storage.create_document("onramp_gamification_xp", xp_id, {
                "xp_id": xp_id,
                "user_id": uid,
                "source": source,
                "amount": amount,
                "date": (datetime.now(timezone.utc) - timedelta(days=count - i - 1)).strftime("%Y-%m-%d"),
                "team_id": TEAM_ACME,
                "metadata": {},
                "created_at": now - timedelta(hours=i * 4),
            })

    # Badges
    badges = [
        (UID_NEWBIE,  "explorer",     "Explorer"),
        (UID_NEWBIE,  "scholar",      "Scholar"),
        (UID_NEWBIE,  "streak_master","Streak Master"),
        (UID_NEWBIE2, "explorer",     "Explorer"),
        (UID_DEV1,    "explorer",     "Explorer"),
        (UID_DEV1,    "scholar",      "Scholar"),
        (UID_DEV1,    "code_champion","Code Champion"),
        (UID_SENIOR,  "code_champion","Code Champion"),
        (UID_SENIOR,  "squasher",     "Squasher"),
    ]
    for uid, badge_key, badge_name in badges:
        badge_id = _det_uuid(f"badge-{uid[:8]}-{badge_key}")
        existing = await storage.get_document("onramp_gamification_badges", badge_id)
        if existing:
            continue
        await storage.create_document("onramp_gamification_badges", badge_id, {
            "badge_id": badge_id,
            "user_id": uid,
            "badge_key": badge_key,
            "badge_name": badge_name,
            "icon": "",
            "description": f"{badge_name} badge earned through excellent work",
            "xp_bonus": 50,
            "team_id": TEAM_ACME,
            "earned_at": now - timedelta(days=7),
        })

    # Streaks
    streak_users = [
        (UID_NEWBIE,  7, 14),
        (UID_NEWBIE2, 3, 5),
        (UID_DEV1,    5, 30),
        (UID_DEV2,    2, 10),
        (UID_SENIOR,  12, 45),
    ]
    for uid, current, longest in streak_users:
        streak_id = _det_uuid(f"streak-{uid[:8]}")
        existing = await storage.get_document("onramp_gamification_streaks", streak_id)
        if existing:
            continue
        await storage.create_document("onramp_gamification_streaks", streak_id, {
            "streak_id": streak_id,
            "user_id": uid,
            "current_streak": current,
            "longest_streak": longest,
            "last_active_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "streak_frozen": False,
            "created_at": now - timedelta(days=longest),
            "updated_at": now,
        })

    # ════════════════════════════════════════════════════════════════
    # 7. Notifications
    # ════════════════════════════════════════════════════════════════
    log.info("  Creating notifications...")
    for idx, (uid, ntype, title, msg) in enumerate(NOTIFICATIONS):
        notif_id = _det_uuid(f"notif-{uid[:8]}-{idx}")
        existing = await storage.get_document("onramp_notifications", notif_id)
        if existing:
            continue
        days_ago = idx
        await storage.create_document("onramp_notifications", notif_id, {
            "notification_id": notif_id,
            "user_id": uid,
            "type": ntype,
            "title": title,
            "message": msg[:500],
            "full_message": msg,
            "metadata": {"source": "seed_demo"},
            "team_id": TEAM_ACME,
            "read": idx < 3,
            "read_at": now if idx < 3 else None,
            "created_at": now - timedelta(days=days_ago, hours=2),
        })
    log.info(f"    Created {len(NOTIFICATIONS)} notifications")

    # Notification preferences for Newbie
    pref_id = UID_NEWBIE
    existing_pref = await storage.get_document("onramp_notification_preferences", pref_id)
    if not existing_pref:
        await storage.create_document("onramp_notification_preferences", pref_id, {
            "user_id": pref_id,
            "channels": {"in_app": True, "email": True, "slack": False},
            "digest_frequency": "daily",
            "quiet_hours_enabled": False,
            "quiet_hours_start": "22:00",
            "quiet_hours_end": "08:00",
            "roast_mode_enabled": False,
            "created_at": now,
            "updated_at": now,
        })

    # ════════════════════════════════════════════════════════════════
    # 8. Playbooks
    # ════════════════════════════════════════════════════════════════
    log.info("  Creating playbooks...")
    playbooks = [
        ("playbook-1", TEAM_ACME, "New Developer Onboarding",
         "Step-by-step guide for new developers joining the team.",
         [{"step": 1, "title": "Set up dev environment", "done": True},
          {"step": 2, "title": "Meet the team", "done": True},
          {"step": 3, "title": "Review architecture docs", "done": False}],
         ["onboarding", "junior_dev"]),
        ("playbook-2", TEAM_ACME, "Code Review Best Practices",
         "Guidelines for conducting effective code reviews.",
         [{"step": 1, "title": "Review the PR description", "done": False},
          {"step": 2, "title": "Check for test coverage", "done": False}],
         ["process", "code_review"]),
        ("playbook-3", TEAM_BETA, "Feature Rollout Checklist",
         "Standard checklist for rolling out new features to production.",
         [{"step": 1, "title": "Run integration tests", "done": True},
          {"step": 2, "title": "Update documentation", "done": True},
          {"step": 3, "title": "Deploy to staging", "done": False},
          {"step": 4, "title": "Monitor metrics", "done": False}],
         ["deployment", "feature"]),
    ]
    for det_id, tid, title, desc, steps, tags in playbooks:
        pb_id = _det_uuid(det_id)
        existing = await storage.get_document("onramp_playbooks", pb_id)
        if existing:
            continue
        await storage.create_document("onramp_playbooks", pb_id, {
            "playbook_id": pb_id,
            "team_id": tid,
            "title": title,
            "description": desc,
            "steps": steps,
            "tags": tags,
            "created_by": UID_SENIOR,
            "version": 1,
            "is_archived": False,
            "use_count": 12 if "Onboarding" in title else 5,
            "created_at": now - timedelta(days=30),
            "updated_at": now,
        })
    log.info(f"    Created {len(playbooks)} playbooks")

    # ════════════════════════════════════════════════════════════════
    # 9. Repository Records (real GitHub repos — GitHub API can fetch stats)
    # ════════════════════════════════════════════════════════════════
    log.info("  Creating repositories (real GitHub repos)...")
    # First, clean up old fictional repos if they exist (unique constraint on id)
    for old_det_id in ("repo-1", "repo-2", "repo-3", "repo-4", "repo-5"):
        old_id = _det_uuid(old_det_id)
        old = await storage.get_document("repositories", old_id)
        if old:
            await storage.delete_document("repositories", old_id)
            log.info(f"    Removed old fictional repo: {old.get('owner')}/{old.get('name')}")

    repos = [
        # (det_id, team_id, name, owner, language, description)
        ("gh-repo-1", TEAM_ACME,    "react",          "facebook",       "JavaScript", "A declarative, efficient, and flexible JavaScript library for building user interfaces"),
        ("gh-repo-2", TEAM_ACME,    "tensorflow",     "tensorflow",     "Python",     "An Open Source Machine Learning Framework for Everyone"),
        ("gh-repo-3", TEAM_ACME,    "vscode",         "microsoft",      "TypeScript", "Visual Studio Code — Open Source IDE"),
        ("gh-repo-4", TEAM_BETA,    "cpython",        "python",         "Python",     "The Python programming language source code"),
        ("gh-repo-5", TEAM_BETA,    "kubernetes",     "kubernetes",     "Go",         "Production-Grade Container Scheduling and Management"),
        ("gh-repo-6", TEAM_BETA,    "node",           "nodejs",         "JavaScript", "Node.js JavaScript runtime"),
        ("gh-repo-7", TEAM_ACME,    "rust",           "rust-lang",      "Rust",       "Empowering everyone to build reliable and efficient software"),
        ("gh-repo-8", TEAM_STARTUP, "spring-boot",    "spring-projects","Java",       "Spring Boot helps you to create Spring-powered, production-grade applications"),
        ("gh-repo-9", TEAM_ACME,    "ansible",        "ansible",        "Python",     "Ansible is a radically simple IT automation platform"),
        ("gh-repo-10", TEAM_STARTUP,"scikit-learn",   "scikit-learn",   "Python",     "scikit-learn: machine learning in Python"),
    ]
    for det_id, tid, name, owner, lang, desc in repos:
        repo_id = _det_uuid(det_id)
        # Check by unique (owner, name) constraint to avoid duplicates
        existing = await storage.query_documents(
            "repositories",
            [("owner", "==", owner), ("name", "==", name)],
        )
        if existing:
            log.info(f"    Repo {owner}/{name} already exists — skipping")
            continue
        await storage.create_document("repositories", repo_id, {
            "id": repo_id,
            "name": name,
            "owner": owner,
            "team_id": tid,
            "url": f"https://github.com/{owner}/{name}",
            "language": lang,
            "description": desc,
            "status": "pending",  # pending — GitHub API will be called to analyze
            "last_analyzed_at": None,
            "created_at": now - timedelta(days=30),
            "updated_at": now,
        })
        log.info(f"    Created repo: {owner}/{name} (pending analysis)")
    log.info(f"    Seeded {len(repos)} real GitHub repositories")

    # ════════════════════════════════════════════════════════════════
    # 10. Feature Flags
    # ════════════════════════════════════════════════════════════════
    log.info("  Creating feature flags...")
    flags = [
        ("flag-1", TEAM_ACME, "jira_sync", True),
        ("flag-2", TEAM_ACME, "roast_mode", False),
        ("flag-3", TEAM_BETA, "jira_sync", False),
        ("flag-4", TEAM_ACME, "dark_mode", True),
    ]
    for det_id, tid, flag_name, enabled in flags:
        flag_id = _det_uuid(det_id)
        existing = await storage.get_document("onramp_feature_flags", flag_id)
        if existing:
            continue
        await storage.create_document("onramp_feature_flags", flag_id, {
            "id": flag_id,
            "team_id": tid,
            "flag_name": flag_name,
            "enabled": enabled,
            "created_by": UID_CTO,
            "created_at": now - timedelta(days=20),
            "updated_at": now,
        })
    log.info(f"    Created {len(flags)} feature flags")

    # ════════════════════════════════════════════════════════════════
    # 11. Module Access (member_modules)
    # ════════════════════════════════════════════════════════════════
    log.info("  Creating module access records...")
    modules_data = [
        (UID_NEWBIE,  TEAM_ACME, "ci_cd_basics",           UID_SENIOR),
        (UID_NEWBIE,  TEAM_ACME, "backend_fundamentals",   UID_SENIOR),
        (UID_NEWBIE,  TEAM_ACME, "testing_basics",         UID_SENIOR),
        (UID_NEWBIE,  TEAM_ACME, "frontend_essentials",    UID_SENIOR),
        (UID_NEWBIE2, TEAM_ACME, "frontend_essentials",    UID_SENIOR),
        (UID_NEWBIE2, TEAM_ACME, "ci_cd_basics",           UID_SENIOR),
        (UID_DEV1,    TEAM_ACME, "advanced_backend",       UID_CTO),
        (UID_DEV1,    TEAM_ACME, "architecture_review",    UID_CTO),
        (UID_DEV2,    TEAM_BETA, "backend_fundamentals",   UID_CTO),
    ]
    for uid, tid, module, granted_by in modules_data:
        mod_id = _det_uuid(f"module-{uid[:8]}-{module}")
        existing = await storage.get_document("member_modules", mod_id)
        if existing:
            continue
        await storage.create_document("member_modules", mod_id, {
            "id": mod_id,
            "team_id": tid,
            "user_id": uid,
            "module": module,
            "granted_by": granted_by,
            "granted_at": now - timedelta(days=10),
            "source": "manual",
        })
    log.info(f"    Created {len(modules_data)} module access records")

    # ════════════════════════════════════════════════════════════════
    # 12. Audit Log Events
    # ════════════════════════════════════════════════════════════════
    log.info("  Creating audit log events...")
    audit_events = [
        ("audit-1", "user_login",        UID_CEO,   TEAM_ACME,  {"ip": "192.168.1.1"}),
        ("audit-2", "team_created",      UID_CEO,   TEAM_ACME,  {"team_name": "Acme Corp"}),
        ("audit-3", "subscription_change", UID_CEO, TEAM_ACME,  {"tier": "professional"}),
        ("audit-4", "user_invited",      UID_CTO,   TEAM_ACME,  {"email": "dev@acme.com"}),
        ("audit-5", "task_completed",    UID_SENIOR, TEAM_ACME, {"task_id": _det_uuid("task-1")}),
        ("audit-6", "api_key_created",   UID_DEV1,  TEAM_ACME,  {"key_name": "ci-cd-key"}),
    ]
    for det_id, event_type, actor, tid, meta in audit_events:
        event_id = _det_uuid(det_id)
        existing = await storage.get_document("onramp_audit_log", event_id)
        if existing:
            continue
        await storage.create_document("onramp_audit_log", event_id, {
            "event_id": event_id,
            "event_type": event_type,
            "actor_id": actor,
            "target_id": "",
            "team_id": tid,
            "metadata": meta,
            "timestamp": now - timedelta(hours=len(audit_events) * 6),
        })
    log.info(f"    Created {len(audit_events)} audit log entries")

    # ════════════════════════════════════════════════════════════════
    # Summary
    # ════════════════════════════════════════════════════════════════
    log.info("")
    log.info("=== Seed Summary ===")

    counts = {}
    for coll in ("users", "teams", "team_members", "onramp_tasks",
                  "onramp_subscriptions", "onramp_notifications",
                  "onramp_gamification_xp", "onramp_gamification_badges",
                  "onramp_gamification_streaks", "onramp_playbooks",
                  "repositories", "onramp_feature_flags",
                  "member_modules", "onramp_audit_log"):
        docs = await storage.list_documents(coll)
        counts[coll] = len(docs)

    for coll, count in counts.items():
        log.info(f"  {coll}: {count} records")

    log.info("")
    log.info("[OK] Demo data seeded successfully into NeonDB!")
    return counts


if __name__ == "__main__":
    counts = asyncio.run(seed())
