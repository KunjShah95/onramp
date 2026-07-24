"""
[DEPRECATED] Daily update — replaced by the Slack bot.

This CLI script was the original daily standup workflow. It has been replaced
by the Slack bot which provides:
  - Proactive "What did you work on?" DMs (scheduled via Celery beat)
  - Standup submission via `/standup <note>` slash command
  - Auto-digest broadcast to a team standup channel
  - Senior acknowledgment buttons and follow-up requests

Use the Slack bot instead. To keep this script working for local dev:
    cd backend && .venv/Scripts/python ../scripts/daily_update.py -m "your note"

The Slack bot is the preferred path going forward.
"""

import argparse
import asyncio
import logging
import os
import sys
from datetime import datetime, timezone

# Windows consoles default to cp1252; digest items use emoji.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))
os.environ.setdefault("ENV", "development")

from app.services.postgres_db import get_storage, generate_id  # noqa: E402
from app.services import notification_service, digest_service  # noqa: E402

logging.basicConfig(level=logging.WARNING)

# Same identities as onboard_dev_shah.py
JUNIOR_ID = "00000000-0000-4000-c000-000000000002"
SENIOR_ID = "00000000-0000-4000-c000-000000000001"
TEAM_ID = "00000000-0000-4000-d000-000000000001"
COLLECTION = "daily_updates"


async def submit_update(storage, message: str) -> str:
    today = datetime.now(timezone.utc).date().isoformat()
    # One update per day: overwrite today's note if it already exists.
    prior = await storage.query_documents(
        COLLECTION, [("user_id", "==", JUNIOR_ID), ("date", "==", today)]
    )
    update_id = prior[0]["id"] if prior else generate_id()
    record = {
        "update_id": update_id, "user_id": JUNIOR_ID, "team_id": TEAM_ID,
        "submitted_to": SENIOR_ID, "date": today, "message": message,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if prior:
        # DynamicDocument.update replaces the whole data blob — pass the full record.
        await storage.update_document(COLLECTION, update_id, record)
    else:
        await storage.create_document(COLLECTION, update_id, record)

    # Push to the senior on both first submit and edit.
    await notification_service.create_notification(
        user_id=SENIOR_ID, type="daily_update",
        title=f"Daily update from Dev Shah ({today})",
        message=message, team_id=TEAM_ID,
        metadata={"update_id": update_id, "from": JUNIOR_ID},
    )
    return update_id


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-m", "--message", default="", help="Standup note for the senior")
    args = ap.parse_args()
    storage = get_storage()
    today = datetime.now(timezone.utc).date().isoformat()

    print(f"\n=== Dev Shah — daily update — {today} ===")

    if args.message.strip():
        await submit_update(storage, args.message.strip())
        print(f'\n  Note submitted to senior:\n    "{args.message.strip()}"')
    else:
        print("\n  (no free-text note — digest only)")

    sections = await digest_service.build_digest_sections(JUNIOR_ID, "daily", TEAM_ID)
    print("\n  Auto-digest (last 24h):")
    if not sections:
        print("    - no tracked activity yet")
    for s in sections:
        print(f"\n  {s['title']}:")
        for item in s.get("items", []):
            sub = f"  ({item['subtitle']})" if item.get("subtitle") else ""
            print(f"    {item.get('emoji','-')} {item['text']}{sub}")

    print("\n  -> Senior (senior@onramp.dev) notified.\n")


if __name__ == "__main__":
    asyncio.run(main())
