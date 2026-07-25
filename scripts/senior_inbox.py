"""Senior inbox — what Dev Shah submitted.

The senior side of the daily loop: read the junior's standup notes and the
state of his assigned tasks (what's waiting on a review). Read-only.

Usage:
    cd backend && .venv/Scripts/python ../scripts/senior_inbox.py
"""

import asyncio
import os
import sys
from datetime import datetime, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))
os.environ.setdefault("ENV", "development")

from app.services.postgres_db import get_storage  # noqa: E402

SENIOR_ID = "00000000-0000-4000-c000-000000000001"
JUNIOR_ID = "00000000-0000-4000-c000-000000000002"
TEAM_ID = "00000000-0000-4000-d000-000000000001"
JUNIOR_NAME = "Dev Shah"

REVIEW_STATES = ("submitted", "under_review", "needs_changes")


async def main():
    storage = get_storage()

    from app.services import notification_service

    updates = await storage.query_documents("daily_updates", [("submitted_to", "==", SENIOR_ID)])
    updates.sort(key=lambda u: u.get("date", ""), reverse=True)

    notifs = await notification_service.list_notifications(SENIOR_ID, unread_only=True)

    tasks = await storage.query_documents("onramp_tasks", [("assigned_to", "==", JUNIOR_ID)])
    mods = await storage.query_documents(
        "member_modules", [("team_id", "==", TEAM_ID), ("user_id", "==", JUNIOR_ID)]
    )

    print("\n=== Senior inbox — Claude (Senior Engineer) ===")
    print(f"    Mentee: {JUNIOR_NAME}   Team: React Frontend Team\n")

    print(f"-- Unread notifications ({len(notifs)}) --")
    if not notifs:
        print("   (inbox clear)")
    for n in notifs[:10]:
        print(f"   • {n.get('title','')}")
    print()

    print(f"-- Daily updates ({len(updates)}) --")
    if not updates:
        print("   (none submitted yet)")
    for u in updates[:14]:
        print(f"   [{u.get('date','?')}] {u.get('message','')}")

    awaiting = [t for t in tasks if t.get("state") in REVIEW_STATES]
    print(f"\n-- Tasks awaiting your review ({len(awaiting)}) --")
    if not awaiting:
        print("   (nothing in the review queue)")
    for t in awaiting:
        print(f"   [{t.get('state')}] {t.get('title')}  (module: {t.get('module')})")

    print(f"\n-- {JUNIOR_NAME}'s task board ({len(tasks)}) --")
    for t in tasks:
        print(f"   {t.get('state','?'):<13} {t.get('title')}")

    print(f"\n-- Module access ({len(mods)} unlocked) --")
    print("   " + (", ".join(sorted(m.get("module", "") for m in mods)) or "(none)"))
    print()


if __name__ == "__main__":
    asyncio.run(main())
