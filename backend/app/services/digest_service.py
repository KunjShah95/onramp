"""
Digest Service — Generates daily/weekly digest summaries for users.

Aggregates data across:
- Unread notifications
- Task progress (completed, pending review, needs changes)
- Module unlocks
- Quiz results
- Milestone achievements

Then sends the digest as a formatted email via the existing email service.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.services.postgres_db import get_storage
from app.services.email_service import send_digest_email

logger = logging.getLogger("codeflow.digest")

COLLECTION_NOTIFICATIONS = "codeflow_notifications"
COLLECTION_TASKS = "workflow_tasks"
COLLECTION_QUIZ_RESULTS = "codeflow_quiz_results"
COLLECTION_MEMBER_MODULES = "member_modules"


async def generate_and_send_digest(
    user_id: str,
    user_email: str,
    user_name: str,
    period: str = "daily",
    team_id: Optional[str] = None,
) -> dict:
    """Generate a digest for a user and send it via email.

    Args:
        user_id: The user to generate the digest for.
        user_email: The user's email address.
        user_name: The user's display name.
        period: "daily" or "weekly".
        team_id: Optional team scope. If not provided, will try to auto-detect.

    Returns:
        Dict with sections and whether the email was sent.
    """
    sections = await build_digest_sections(user_id, period, team_id)

    # Don't send empty digests unless weekly
    total_items = sum(len(s.get("items", [])) for s in sections)
    if total_items == 0 and period == "daily":
        logger.debug("No digest items for user %s — skipping daily digest", user_id)
        return {"sections": sections, "sent": False, "reason": "no_items"}

    sent = await send_digest_email(
        email=user_email,
        user_name=user_name.split("@")[0],
        period=period,
        sections=sections,
    )

    logger.info(
        "Digest %s sent to %s (%s): %d items across %d sections",
        period, user_email, user_id, total_items, len(sections),
    )

    return {"sections": sections, "sent": sent, "total_items": total_items}


async def build_digest_sections(
    user_id: str,
    period: str = "daily",
    team_id: Optional[str] = None,
) -> list:
    """Build digest sections from all data sources.

    Returns a list of section dicts compatible with send_digest_email:
    [{title, items: [{emoji, text, subtitle}], cta: {text, url}}]
    """
    storage = get_storage()
    since = _since_cutoff(period)
    sections = []

    # ── Section 1: Unread Notifications ─────────────────────────
    notif_items = await _get_unread_notifications(storage, user_id, since)
    if notif_items:
        sections.append({
            "title": "Unread Notifications",
            "items": notif_items,
            "cta": {"text": "View All", "url": f"{_frontend_url()}/notifications"},
        })

    # ── Section 2: Task Activity ────────────────────────────────
    task_items = await _get_task_activity(storage, user_id, team_id, since)
    if task_items:
        sections.append({
            "title": "Task Activity",
            "items": task_items,
            "cta": {"text": "View Tasks", "url": f"{_frontend_url()}/tasks"},
        })

    # ── Section 3: Modules Unlocked ─────────────────────────────
    module_items = await _get_module_activity(storage, user_id, team_id, since)
    if module_items:
        sections.append({
            "title": "Modules Unlocked",
            "items": module_items,
        })

    # ── Section 4: Quiz Results ─────────────────────────────────
    quiz_items = await _get_quiz_activity(storage, user_id, since)
    if quiz_items:
        sections.append({
            "title": "Quiz Results",
            "items": quiz_items,
            "cta": {"text": "Take a Quiz", "url": f"{_frontend_url()}/learn"},
        })

    # ── Section 5: Pending Reviews (for seniors/leads) ──────────
    review_items = await _get_pending_reviews(storage, user_id, team_id)
    if review_items:
        sections.append({
            "title": "Pending Reviews",
            "items": review_items,
            "cta": {"text": "Review Queue", "url": f"{_frontend_url()}/review"},
        })

    return sections


# ── Section Builders ─────────────────────────────────────────────


async def _get_unread_notifications(storage, user_id: str, since: str) -> list:
    """Get unread notifications since cutoff."""
    all_notifs = await storage.query_documents(
        COLLECTION_NOTIFICATIONS,
        [("user_id", "==", user_id)],
    )
    items = []
    for n in all_notifs:
        if n.get("read"):
            continue
        created = n.get("created_at", "")
        if created < since:
            continue
        title = n.get("title", "")
        message = n.get("message", "")
        items.append({
            "emoji": _notif_emoji(n.get("type", "")),
            "text": title,
            "subtitle": message[:100] if message else None,
        })
    return items[:8]


async def _get_task_activity(storage, user_id: str, team_id: Optional[str], since: str) -> list:
    """Get tasks completed, assigned, or needing changes since cutoff."""
    filters = [("assigned_to", "==", user_id)]
    if team_id:
        filters.append(("team_id", "==", team_id))
    tasks = await storage.query_documents(COLLECTION_TASKS, filters)

    items = []
    for t in tasks:
        updated = t.get("updated_at", "")
        if updated < since:
            continue
        state = t.get("state", "")
        title = t.get("title", "")
        module = t.get("module", "")

        emoji, text = {
            "completed": ("✅", f"Task completed: {title}"),
            "approved": ("✅", f"Task approved: {title}"),
            "submitted": ("📋", f"Task submitted for review: {title}"),
            "needs_changes": ("🔄", f"Changes requested: {title}"),
            "assigned": ("📌", f"Task assigned: {title}"),
            "in_progress": ("▶️", f"Task in progress: {title}"),
        }.get(state, ("•", f"Task {state}: {title}"))

        subtitle = f"Module: {module}" if module else None
        items.append({"emoji": emoji, "text": text, "subtitle": subtitle})

    return items[:8]


async def _get_module_activity(storage, user_id: str, team_id: Optional[str], since: str) -> list:
    """Get modules granted since cutoff."""
    filters = [("user_id", "==", user_id)]
    if team_id:
        filters.append(("team_id", "==", team_id))

    records = await storage.query_documents(COLLECTION_MEMBER_MODULES, filters)
    items = []
    for r in records:
        granted = r.get("granted_at", "")
        if granted < since:
            continue
        module = r.get("module", "")
        source = r.get("source", "manual")
        source_label = "auto-unlocked via task" if source == "task_completion" else "granted"
        items.append({
            "emoji": "🔓",
            "text": f"Access to module: {module}",
            "subtitle": source_label,
        })

    return items[:5]


async def _get_quiz_activity(storage, user_id: str, since: str) -> list:
    """Get quiz results since cutoff."""
    results = await storage.query_documents(
        COLLECTION_QUIZ_RESULTS,
        [("user_id", "==", user_id)],
    )
    items = []
    for r in results:
        submitted = r.get("submitted_at", "")
        if submitted < since:
            continue
        score = r.get("score", 0)
        total = r.get("total", 0)
        percentage = r.get("percentage", 0)
        passed = r.get("passed", False)
        module = r.get("module", "codebase")

        emoji = "🎉" if passed else "📝"
        items.append({
            "emoji": emoji,
            "text": f"Quiz: {module} — {score}/{total} ({percentage}%)",
            "subtitle": "Passed!" if passed else "Needs improvement",
        })

    return items[:5]


async def _get_pending_reviews(storage, user_id: str, team_id: Optional[str]) -> list:
    """Get tasks pending review (for seniors/team leads)."""
    # Note: "in" filter not fully supported by Postgres DynamicDocument (pre-existing limitation).
    # We query by creator first, then filter state in-memory as a workaround.
    filters = [("created_by", "==", user_id)]
    tasks = await storage.query_documents(COLLECTION_TASKS, filters)
    tasks = [t for t in tasks if t.get("state") in ("submitted", "under_review")]

    items = []
    for t in tasks:
        title = t.get("title", "")
        assignee = t.get("assigned_to", "")
        module = t.get("module", "")
        subtitle = f"by {assignee[:10]}…" if assignee else ""
        if module:
            subtitle += f" · {module}" if subtitle else f"Module: {module}"
        items.append({
            "emoji": "👀",
            "text": f"Pending review: {title}",
            "subtitle": subtitle or None,
        })

    return items[:5]


# ── Helpers ─────────────────────────────────────────────────────


def _since_cutoff(period: str) -> str:
    """Get ISO datetime string for the cutoff of the digest period."""
    now = datetime.now(timezone.utc)
    if period == "weekly":
        cutoff = now - timedelta(days=7)
    else:
        cutoff = now - timedelta(days=1)
    return cutoff.isoformat()


def _notif_emoji(notif_type: str) -> str:
    emoji_map = {
        "task_assigned": "📌",
        "task_submitted": "📋",
        "task_reviewed": "👀",
        "task_approved": "✅",
        "task_needs_changes": "🔄",
        "task_completed": "🎉",
        "task_cancelled": "🗑️",
        "module_granted": "🔓",
        "team_invite": "🤝",
        "system_alert": "⚠️",
        "pr_merged": "🔀",
        "milestone_reached": "🏆",
        "quiz_graded": "📝",
    }
    return emoji_map.get(notif_type, "•")


def _frontend_url() -> str:
    import os
    return os.getenv("FRONTEND_URL", "https://codeflow.dev")
