"""One-off backfill: stamp ``pr_merged_at`` on tasks completed by the merge webhook.

The ``pr_merged_at`` stamp (added to capture time-to-first-merged-PR for
teams without linked GitHub accounts) only exists on tasks merged AFTER the
feature shipped. Tasks auto-completed by the webhook before that carry no
stamp, so those teams would see no first-PR timing until a new merge.

Backfill criterion (conservative — only tasks we can PROVE were completed by
a real GitHub merge):

  ``review_feedback.source == "pr_merged_webhook"``

The webhook writes that marker on the auto-approve transition right before
completing the task, so it unambiguously identifies webhook-completed tasks.
For those, the merge happened when the task was completed: we stamp
``pr_merged_at = completed_at`` (falls back to ``updated_at``).

Deliberately NOT backfilled: tasks completed via the ``already approved``
webhook path (no webhook feedback marker) and tasks completed manually by a
senior — there is no reliable evidence of a real merge there.

The write bumps ``updated_at`` to now (same documented side effect as
``task_service.stamp_pr_merged``): a merge — past or present — is real
trainee activity, so resetting the ramp detector's inactivity clock is
intentional.

USAGE (run from the backend/ directory, uses backend/.env):
  python backfill_pr_merged_at.py                    # dry-run: count + preview
  python backfill_pr_merged_at.py --commit          # write the stamps
  python backfill_pr_merged_at.py --team <team_id>  # scope to one team
  python backfill_pr_merged_at.py --limit 500       # cap how many to stamp

Dry-run is the default; pass --commit to write.
"""

import argparse
import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
os.chdir(HERE)

# Load backend/.env (same file the app loads via load_dotenv()).
if (HERE / ".env").exists():
    for line in (HERE / ".env").read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

from app.services.postgres_db import get_storage  # noqa: E402

COLLECTION = "onramp_tasks"
WEBHOOK_SOURCE = "pr_merged_webhook"


def _webhook_completed(task: dict) -> bool:
    """True when the task was auto-completed by the PR-merge webhook."""
    feedback = task.get("review_feedback")
    return isinstance(feedback, dict) and feedback.get("source") == WEBHOOK_SOURCE


def _merge_time(task: dict):
    """The stamp to write: completed_at (fallback updated_at) or None."""
    for key in ("completed_at", "updated_at"):
        value = task.get(key)
        if value:
            return value
    return None


async def run(commit: bool, team_id: str | None, limit: int) -> None:
    storage = get_storage()
    tasks = await storage.list_documents(COLLECTION)
    if team_id:
        tasks = [t for t in tasks if t.get("team_id") == team_id]

    candidates = [t for t in tasks if _webhook_completed(t) and not t.get("pr_merged_at")]
    candidates.sort(key=lambda t: str(t.get("completed_at") or t.get("updated_at") or ""))

    if not candidates:
        print("No webhook-completed tasks missing a pr_merged_at stamp — nothing to do.")
        return

    capped = min(len(candidates), limit)
    print(
        f"Found {len(candidates)} webhook-completed task(s) missing pr_merged_at "
        f"(stamping {capped} this run — pass --limit to raise the cap) "
        f"({'DRY-RUN - pass --commit to write' if not commit else 'will write'})"
    )
    for t in candidates[:limit]:
        stamp = _merge_time(t)
        if stamp is None:
            continue
        title = (t.get("title") or "")[:48]
        print(
            f"  {str(t.get('task_id'))[:8]}.. {title:<50} "
            f"completed {str(t.get('completed_at'))[:19]} -> pr_merged_at"
        )

    if not commit:
        return

    written = 0
    for t in candidates[:limit]:
        stamp = _merge_time(t)
        if stamp is None:
            continue
        await storage.update_document(COLLECTION, t["task_id"], {
            "pr_merged_at": stamp,
            "updated_at": datetime.now(timezone.utc),
        })
        written += 1
    print(f"DONE: stamped pr_merged_at on {written} task(s).")


async def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill pr_merged_at on tasks completed by the PR-merge webhook"
    )
    parser.add_argument("--commit", action="store_true", help="Write stamps (default is dry-run)")
    parser.add_argument("--team", metavar="TEAM_ID", help="Only backfill tasks in this team")
    parser.add_argument("--limit", type=int, default=10_000, help="Max tasks to stamp per run")
    args = parser.parse_args()

    if args.limit <= 0:
        sys.exit("--limit must be positive")
    await run(commit=args.commit, team_id=args.team, limit=args.limit)


asyncio.run(main())
