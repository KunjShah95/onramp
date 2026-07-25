"""Bulk cohort onboarding for campus-hire batches (Onramp 2.0).

Common workflow for Ahmedabad / Gandhinagar companies hiring 20-100 freshers
at once: instead of onboarding each hire by hand (see scripts/onboard_dev_shah.py),
feed a CSV and onboard the whole batch into a single team in one pass.

For every CSV row this script will:
  1. Create the user (role default ``new_dev``) — PII handled exactly like the
     single-hire script (dev stores plaintext when PII_ENCRYPTION_KEY is unset).
  2. Add the user to the target team (``--team "Name"``), creating the team via
     raw SQL if it does not yet exist.
  3. Grant each of the listed modules (``;``-separated ``modules`` column).
  4. Optionally assign a generic starter task (``--assign-task``).

Idempotent: re-running skips users, memberships, module grants and tasks that
already exist. Deterministic user IDs (derived from the email) make repeat runs
safe.

CSV format (header required):
    name,email,role,modules
    Aarav Mehta,aarav.mehta@example.dev,new_dev,frontend-setup;components
  - role   : optional, defaults to ``new_dev`` when blank.
  - modules: optional, ``;``-separated module names, may be blank.

Usage:
    cd backend
    .venv/Scripts/python ../scripts/onboard_cohort.py --dry-run \
        --csv ../scripts/cohort_sample.csv --team "Summer 2026 Cohort"
    .venv/Scripts/python ../scripts/onboard_cohort.py \
        --csv ../scripts/cohort_sample.csv --team "Summer 2026 Cohort" --assign-task
"""

import argparse
import asyncio
import csv
import io
import logging
import os
import sys
import uuid
from datetime import datetime, timezone

# ── Windows: force UTF-8 stdout so names/box-drawing print cleanly ──────────
try:
    sys.stdout.reconfigure(encoding="utf-8")  # py3.7+
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:  # pragma: no cover - very old interpreters
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv

# Load backend/.env (dev: PII stored plaintext, matching existing users).
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))
os.environ.setdefault("ENV", "development")

from app.services.postgres_db import get_storage, generate_id  # noqa: E402
from app.services.field_encryption import encrypt_field, email_hash  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("onboard_cohort")

DEFAULT_ROLE = "new_dev"

# Deterministic UUID namespace so the same email always maps to the same user id
# across runs (idempotency without a lookup table).
_NS = uuid.UUID("00000000-0000-4000-e000-000000000000")

# Generic starter task handed to every fresher when --assign-task is passed.
STARTER_TASK = {
    "title": "Set up your dev environment and open your first PR",
    "description": (
        "Clone the team repo, get it running locally following the README, then "
        "make a tiny change (fix a typo or tweak a comment) and open a PR so we "
        "can walk you through our review flow. This is a warm-up, not graded."
    ),
    "priority": "low",
    "estimated_hours": 2.0,
}


def _dt():
    """Naive UTC datetime — the typed timestamp columns want a datetime, not an ISO string."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _hash_pw(pw):
    import bcrypt
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=4)).decode()


def _user_id_for(email):
    return str(uuid.uuid5(_NS, email.lower().strip()))


async def _find_user_by_email(storage, email):
    hits = await storage.query_documents("users", [("email_hash", "==", email_hash(email))])
    return hits[0] if hits else None


# ── CSV parsing ─────────────────────────────────────────────────────────────

def parse_csv(path):
    """Read the cohort CSV into a list of normalized row dicts.

    Skips blank rows and rows missing name/email; de-dupes on email (first wins).
    """
    rows = []
    seen = set()
    with open(path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        required = {"name", "email"}
        if not required.issubset({(h or "").strip().lower() for h in (reader.fieldnames or [])}):
            raise SystemExit(
                f"CSV must have at least 'name' and 'email' columns; got {reader.fieldnames}"
            )
        for lineno, raw in enumerate(reader, start=2):
            row = {(k or "").strip().lower(): (v or "").strip() for k, v in raw.items()}
            name, email = row.get("name", ""), row.get("email", "")
            if not name and not email:
                continue  # blank line
            if not name or not email:
                logger.info("  [warn] line %d skipped (missing name/email): %r", lineno, raw)
                continue
            key = email.lower()
            if key in seen:
                logger.info("  [warn] line %d duplicate email skipped: %s", lineno, email)
                continue
            seen.add(key)
            modules = [m.strip() for m in row.get("modules", "").split(";") if m.strip()]
            rows.append({
                "name": name,
                "email": email,
                "role": row.get("role") or DEFAULT_ROLE,
                "modules": modules,
            })
    return rows


# ── Onboarding steps ─────────────────────────────────────────────────────────

async def ensure_team(team_name, dry):
    """Find team by name or create it via raw SQL.

    Raw INSERT (not storage.create_document) because Team.to_dict() lazy-loads
    .members for member_count, which errors in the async create path.
    Returns the team id.
    """
    from app.database.config import db_config
    from sqlalchemy import text

    await db_config.ensure_engine()
    factory = db_config.get_session_factory()
    async with factory() as session:
        row = await session.execute(text("SELECT id FROM teams WHERE name = :n"), {"n": team_name})
        found = row.fetchone()
        if found:
            logger.info("  [skip] team exists: %s", team_name)
            return str(found[0])
        team_id = generate_id()
        if not dry:
            await session.execute(
                text(
                    "INSERT INTO teams (id, name, description, is_active, created_at, updated_at) "
                    "VALUES (:id, :name, :desc, true, :now, :now)"
                ),
                {"id": team_id, "name": team_name,
                 "desc": f"Campus-hire cohort onboarded via onboard_cohort.py", "now": _dt()},
            )
            await session.commit()
        logger.info("  [ok]   created team: %s", team_name)
        return team_id


async def ensure_user(storage, row, dry):
    """Create the user if absent. Returns (user_id, created?)."""
    uid = _user_id_for(row["email"])
    existing = await storage.get_document("users", uid) or await _find_user_by_email(storage, row["email"])
    if existing:
        logger.info("  [skip] user exists: %-24s %s", row["name"], row["email"])
        return existing["id"], False
    record = {
        "email": encrypt_field(row["email"]),
        "name": encrypt_field(row["name"]),
        "email_hash": email_hash(row["email"]),
        "provider": "password",
        "password_hash": _hash_pw("demo123"),
        "is_active": True,
        "is_admin": False,
        "created_at": _dt(),
        "updated_at": _dt(),
    }
    if not dry:
        await storage.create_document("users", uid, record)
    logger.info("  [ok]   created user: %-22s %s (%s)", row["name"], row["email"], row["role"])
    return uid, True


async def ensure_membership(storage, user_id, team_id, role, dry):
    existing = await storage.query_documents(
        "team_members", [("user_id", "==", user_id), ("team_id", "==", team_id)]
    )
    if existing:
        logger.info("  [skip] membership exists: %s (%s)", user_id[:12], role)
        return False
    if not dry:
        # team_members has an auto-increment int PK; the storage layer ignores
        # the doc_id we pass for this collection (registered as team-member-like).
        await storage.create_document("team_members", generate_id(), {
            "user_id": user_id, "team_id": team_id, "role": role, "joined_at": _dt(),
        })
    logger.info("  [ok]   added member %s as %s", user_id[:12], role)
    return True


async def grant_modules(user_id, team_id, modules, granted_by, dry):
    """Grant the listed modules via raw SQL.

    Raw SQL (not access_control_service) because member_modules.granted_at is a
    typed timestamp column and needs a real datetime, not an ISO string.
    Returns the count of newly granted modules.
    """
    if not modules:
        return 0
    from app.database.config import db_config
    from sqlalchemy import text

    await db_config.ensure_engine()
    factory = db_config.get_session_factory()
    granted = 0
    async with factory() as session:
        for mod in modules:
            exists = await session.execute(
                text("SELECT 1 FROM member_modules WHERE team_id=:t AND user_id=:u AND module=:m"),
                {"t": team_id, "u": user_id, "m": mod},
            )
            if exists.fetchone():
                logger.info("  [skip] module already granted: %s -> %s", mod, user_id[:12])
                continue
            if not dry:
                await session.execute(
                    text(
                        "INSERT INTO member_modules (id, team_id, user_id, module, granted_by, granted_at, source) "
                        "VALUES (:id, :t, :u, :m, :g, :now, 'manual')"
                    ),
                    {"id": generate_id(), "t": team_id, "u": user_id,
                     "m": mod, "g": granted_by, "now": _dt()},
                )
            granted += 1
            logger.info("  [ok]   unlocked module: %-18s -> %s", mod, user_id[:12])
        if not dry:
            await session.commit()
    return granted


async def assign_starter_task(storage, user_id, team_id, created_by, dry):
    existing = await storage.query_documents(
        "onramp_tasks", [("assigned_to", "==", user_id), ("title", "==", STARTER_TASK["title"])]
    )
    if existing:
        logger.info("  [skip] starter task already assigned: %s", user_id[:12])
        return False
    task_id = generate_id()
    now = _dt()
    record = {
        # task_id is the doc_id (PK) — do NOT duplicate it inside the data dict.
        "team_id": team_id,
        "created_by": created_by, "assigned_to": user_id,
        "title": STARTER_TASK["title"], "description": STARTER_TASK["description"],
        "module": None, "state": "assigned", "priority": STARTER_TASK["priority"],
        "pr_url": None, "branch": "main", "repo_url": None,
        "unlock_modules": [], "review_feedback": None,
        "ai_review": None, "product_signoff": False,
        "estimated_hours": STARTER_TASK["estimated_hours"],
        "created_at": now, "updated_at": now, "completed_at": None,
    }
    if not dry:
        await storage.create_document("onramp_tasks", task_id, record)
    logger.info("  [ok]   assigned starter task -> %s", user_id[:12])
    return True


def _print_summary(results, team_name, dry):
    """Print an aligned summary table of everything that happened."""
    print("\n" + "=" * 78)
    print(f"  COHORT SUMMARY -> team: {team_name}" + ("   [DRY RUN]" if dry else ""))
    print("=" * 78)
    header = f"  {'Name':<22} {'Email':<30} {'Role':<10} {'User':<7} {'Mods':<5} {'Task'}"
    print(header)
    print("  " + "-" * 74)
    for r in results:
        print(
            f"  {r['name'][:21]:<22} {r['email'][:29]:<30} {r['role'][:9]:<10} "
            f"{('new' if r['user_created'] else 'exists'):<7} "
            f"{r['modules_granted']:<5} "
            f"{('yes' if r['task_assigned'] else '-')}"
        )
    print("  " + "-" * 74)
    new_users = sum(1 for r in results if r["user_created"])
    total_mods = sum(r["modules_granted"] for r in results)
    tasks = sum(1 for r in results if r["task_assigned"])
    print(f"  Rows: {len(results)}   New users: {new_users}   "
          f"Modules granted: {total_mods}   Starter tasks: {tasks}")
    print("=" * 78)
    if not dry:
        print("  All accounts use password: demo123")


async def main():
    ap = argparse.ArgumentParser(description="Bulk cohort onboarding from a CSV.")
    ap.add_argument("--csv", required=True, help="Path to cohort CSV (name,email,role,modules)")
    ap.add_argument("--team", required=True, help="Target team name (created if missing)")
    ap.add_argument("--assign-task", action="store_true",
                    help="Also assign a generic starter task to each fresher")
    ap.add_argument("--dry-run", action="store_true", help="Preview only — no DB writes")
    args = ap.parse_args()
    dry = args.dry_run

    csv_path = args.csv
    if not os.path.isabs(csv_path):
        csv_path = os.path.abspath(csv_path)

    print(f"\n=== Cohort onboarding: {args.team} ===")
    if dry:
        print("    [DRY RUN — no writes]")
    print(f"    CSV: {csv_path}\n")

    rows = parse_csv(csv_path)
    if not rows:
        print("  No valid rows found. Nothing to do.")
        return

    storage = get_storage()

    print("-- Team --")
    team_id = await ensure_team(args.team, dry)

    results = []
    for row in rows:
        print(f"\n-- {row['name']} <{row['email']}> --")
        user_id, created = await ensure_user(storage, row, dry)
        await ensure_membership(storage, user_id, team_id, row["role"], dry)
        # First user in the batch acts as the grantor/creator of record so we
        # never reference a NULL user for granted_by / created_by.
        granted_by = results[0]["user_id"] if results else user_id
        mods = await grant_modules(user_id, team_id, row["modules"], granted_by, dry)
        task_assigned = False
        if args.assign_task:
            task_assigned = await assign_starter_task(storage, user_id, team_id, granted_by, dry)
        results.append({
            "name": row["name"], "email": row["email"], "role": row["role"],
            "user_id": user_id, "user_created": created,
            "modules_granted": mods, "task_assigned": task_assigned,
        })

    _print_summary(results, args.team, dry)


if __name__ == "__main__":
    asyncio.run(main())
