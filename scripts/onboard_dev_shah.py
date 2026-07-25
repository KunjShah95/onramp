"""Onboard junior engineer "Dev Shah" to the React repo — module-wise access.

Acts as the senior engineer performing onboarding on the Onramp platform:

  1. Creates the senior engineer account (the mentor running this).
  2. Creates the junior engineer "Dev Shah" (new_dev).
  3. Creates/reuses a dedicated team ("React Frontend Team").
  4. Adds both to the team (senior_dev + new_dev).
  5. Registers the React repository (onramp/web-frontend).
  6. Grants Dev Shah MODULE-WISE access — only the beginner modules are
     unlocked; advanced modules stay locked for the senior to release later.
  7. Assigns his first onboarding task.

Idempotent: re-running skips anything that already exists. Uses the same
storage layer + dev PII behaviour as scripts/seed_dev_user.py.

Usage:
    cd backend && .venv/Scripts/python ../scripts/onboard_dev_shah.py
    cd backend && .venv/Scripts/python ../scripts/onboard_dev_shah.py --dry-run
"""

import argparse
import asyncio
import logging
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))
os.environ.setdefault("ENV", "development")
os.environ.setdefault(
    "PII_ENCRYPTION_KEY",
    "Yk9yLVlpN1RaMkVTSnRiV3hBZ01GdWpGS2U0dUdnMkU=",
)

from app.services.postgres_db import get_storage, generate_id
from app.services.field_encryption import encrypt_field, email_hash
from app.services import access_control_service, notification_service

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("onboard")

SENIOR = {
    "id": "00000000-0000-4000-c000-000000000001",
    "email": "senior@onramp.dev",
    "name": "Claude (Senior Engineer)",
    "role": "senior_dev",
    "is_admin": True,
}
JUNIOR = {
    "id": "00000000-0000-4000-c000-000000000002",
    "email": "dev.shah@onramp.dev",
    "name": "Dev Shah",
    "role": "new_dev",
    "is_admin": False,
}

TEAM = {
    "id": "00000000-0000-4000-d000-000000000001",
    "name": "React Frontend Team",
    "description": "React 19 + Vite SPA \u2014 junior onboarding track",
}

REPO = {
    "owner": "onramp",
    "name": "web-frontend",
    "language": "TypeScript",
    "url": "https://github.com/onramp/web-frontend",
    "description": "React 19 + Vite SPA \u2014 Tailwind, Framer Motion, 24 lazy-loaded pages",
}

MODULES_UNLOCKED = ["frontend-setup", "components", "routing"]
MODULES_LOCKED = ["state-management", "api-integration", "testing"]

FIRST_TASK = {
    "title": "Build the ProfileCard component",
    "description": (
        "Create a reusable <ProfileCard /> in web/src/components showing "
        "avatar, name, role and a status badge. Match existing Tailwind + "
        "Framer Motion patterns. Add a Vitest test."
    ),
    "module": "components",
    "priority": "medium",
}


def _dt():
    """Current UTC datetime (timezone-aware)."""
    return datetime.now(timezone.utc)


def _hash_pw(pw):
    import bcrypt
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=4)).decode()


async def _find_user_by_email(storage, email):
    hits = await storage.query_documents("users", [("email_hash", "==", email_hash(email))])
    return hits[0] if hits else None


async def ensure_user(storage, spec, dry):
    existing = await storage.get_document("users", spec["id"]) or await _find_user_by_email(storage, spec["email"])
    if existing:
        logger.info("  [skip] user exists: %-24s %s", spec["name"], spec["email"])
        return existing["id"]
    now = _dt()
    record = {
        "email": encrypt_field(spec["email"]),
        "name": encrypt_field(spec["name"]),
        "email_hash": email_hash(spec["email"]),
        "provider": "password",
        "password_hash": _hash_pw("demo123"),
        "is_active": True,
        "is_admin": spec["is_admin"],
        "created_at": now,
        "updated_at": now,
    }
    if not dry:
        await storage.create_document("users", spec["id"], record)
    logger.info("  [ok]   created user: %-22s %s (%s)", spec["name"], spec["email"], spec["role"])
    return spec["id"]


async def ensure_team(storage, dry):
    from app.database.config import db_config
    from sqlalchemy import text

    await db_config.ensure_engine()
    factory = db_config.get_session_factory()
    async with factory() as session:
        row = await session.execute(text("SELECT id FROM teams WHERE id = :id"), {"id": TEAM["id"]})
        if row.fetchone():
            logger.info("  [skip] team exists: %s", TEAM["name"])
            return TEAM["id"]
        if not dry:
            now = _dt()
            await session.execute(
                text(
                    "INSERT INTO teams (id, name, description, is_active, created_at, updated_at) "
                    "VALUES (:id, :name, :desc, true, :now, :now)"
                ),
                {"id": TEAM["id"], "name": TEAM["name"], "desc": TEAM["description"], "now": now},
            )
            await session.commit()
    logger.info("  [ok]   created team: %s", TEAM["name"])
    return TEAM["id"]


async def ensure_membership(storage, user_id, role, dry):
    existing = await storage.query_documents(
        "team_members", [("user_id", "==", user_id), ("team_id", "==", TEAM["id"])]
    )
    if existing:
        logger.info("  [skip] membership exists: %s (%s)", user_id[:12], role)
        return
    if not dry:
        await storage.create_document("team_members", generate_id(), {
            "user_id": user_id, "team_id": TEAM["id"], "role": role, "joined_at": _dt(),
        })
    logger.info("  [ok]   added member %s as %s", user_id[:12], role)


async def ensure_repo(storage, dry):
    existing = await storage.query_documents(
        "repositories", [("owner", "==", REPO["owner"]), ("name", "==", REPO["name"])]
    )
    if existing:
        logger.info("  [skip] repo exists: %s/%s", REPO["owner"], REPO["name"])
        return
    now = _dt()
    if not dry:
        await storage.create_document("repositories", generate_id(), {
            "name": REPO["name"], "owner": REPO["owner"], "team_id": TEAM["id"],
            "url": REPO["url"], "language": REPO["language"], "description": REPO["description"],
            "status": "pending", "created_at": now, "updated_at": now, "last_analyzed_at": None,
        })
    logger.info("  [ok]   registered repo: %s/%s (React + Vite)", REPO["owner"], REPO["name"])


async def grant_modules(storage, junior_id, senior_id, dry):
    from app.database.config import db_config
    from sqlalchemy import text

    await db_config.ensure_engine()
    factory = db_config.get_session_factory()
    async with factory() as session:
        for mod in MODULES_UNLOCKED:
            exists = await session.execute(
                text("SELECT 1 FROM member_modules WHERE team_id=:t AND user_id=:u AND module=:m"),
                {"t": TEAM["id"], "u": junior_id, "m": mod},
            )
            if exists.fetchone():
                logger.info("  [skip] module already granted: %s", mod)
                continue
            if not dry:
                now = _dt()
                await session.execute(
                    text(
                        "INSERT INTO member_modules (id, team_id, user_id, module, granted_by, granted_at, source) "
                        "VALUES (:id, :t, :u, :m, :g, :now, 'manual')"
                    ),
                    {"id": generate_id(), "t": TEAM["id"], "u": junior_id,
                     "m": mod, "g": senior_id, "now": now},
                )
            logger.info("  [ok]   unlocked module: %-18s -> Dev Shah", mod)
        if not dry:
            await session.commit()
    for mod in MODULES_LOCKED:
        logger.info("  [lock] module withheld:  %-18s (senior releases later)", mod)


async def _notify_best_effort(**kwargs):
    try:
        await notification_service.create_notification(**kwargs)
    except Exception as exc:
        logger.info("  [warn] notification skipped: %s", str(exc)[:70])


async def assign_first_task(storage, junior_id, senior_id, dry):
    existing = await storage.query_documents(
        "onramp_tasks", [("assigned_to", "==", junior_id), ("title", "==", FIRST_TASK["title"])]
    )
    if existing:
        logger.info("  [skip] first task already assigned")
        return existing[0].get("task_id")
    task_id = generate_id()
    now = _dt()
    record = {
        "team_id": TEAM["id"],
        "created_by": senior_id, "assigned_to": junior_id,
        "title": FIRST_TASK["title"], "description": FIRST_TASK["description"],
        "module": FIRST_TASK["module"], "state": "assigned", "priority": FIRST_TASK["priority"],
        "pr_url": None, "branch": "main", "repo_url": REPO["url"],
        "unlock_modules": ["state-management"], "review_feedback": None,
        "ai_review": None, "product_signoff": False, "estimated_hours": 3.0,
        "created_at": now, "updated_at": now, "completed_at": None,
    }
    if not dry:
        await storage.create_document("onramp_tasks", task_id, record)
        await _notify_best_effort(
            user_id=junior_id, type="task_assigned",
            title="Your first task is ready",
            message=f"{FIRST_TASK['title']} \u2014 module: {FIRST_TASK['module']}",
            team_id=TEAM["id"], metadata={"task_id": task_id},
        )
    logger.info("  [ok]   assigned first task: %s", FIRST_TASK["title"])
    return task_id


async def main():
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    dry = args.dry_run
    storage = get_storage()

    print("\n=== Onboarding: Dev Shah -> React Frontend Team ===")
    if dry:
        print("    [DRY RUN \u2014 no writes]\n")

    print("\n-- Accounts --")
    senior_id = await ensure_user(storage, SENIOR, dry)
    junior_id = await ensure_user(storage, JUNIOR, dry)

    print("\n-- Team --")
    await ensure_team(storage, dry)
    await ensure_membership(storage, senior_id, "senior_dev", dry)
    await ensure_membership(storage, junior_id, "new_dev", dry)

    print("\n-- Repository --")
    await ensure_repo(storage, dry)

    print("\n-- Module-wise access (Dev Shah) --")
    await grant_modules(storage, junior_id, senior_id, dry)

    print("\n-- First task --")
    await assign_first_task(storage, junior_id, senior_id, dry)

    print("\n=== Done ===")
    print("  Senior : senior@onramp.dev   / demo123  (senior_dev)")
    print("  Junior : dev.shah@onramp.dev / demo123  (new_dev)")
    print(f"  Team   : {TEAM['name']}")
    print(f"  Repo   : {REPO['owner']}/{REPO['name']} (React + Vite)")
    print(f"  Unlocked modules : {', '.join(MODULES_UNLOCKED)}")
    print(f"  Locked modules   : {', '.join(MODULES_LOCKED)}")
    print()
    print("  Dev Shah submits daily standup via Slack:")
    print('    /standup what I worked on today')
    print()


if __name__ == "__main__":
    asyncio.run(main())
