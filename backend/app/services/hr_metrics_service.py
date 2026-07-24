"""
HR onboarding-analytics service.

Computes read-only onboarding/cohort metrics for a team, aimed at HR managers
who want visibility into ramp time, completion, engagement, and attrition risk
across a group of new developers.

All functions are read-only — they only query storage via
``app.services.postgres_db.get_storage`` and never write. Timestamps stored as
ISO strings or native datetimes are both handled.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from app.services.postgres_db import get_storage

logger = logging.getLogger("onramp.hr_metrics")

# A task in one of these states, untouched for longer than STALE_DAYS, is
# considered stalled and contributes to attrition risk.
OPEN_STATES = ("assigned", "in_progress", "needs_changes")
STALE_DAYS = 5


def _parse_dt(value: Any) -> Optional[datetime]:
    """Parse an ISO string or datetime into an aware UTC datetime (or None)."""
    if not value:
        return None
    try:
        if isinstance(value, datetime):
            dt = value
        else:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None


def _parse_date(value: Any) -> Optional[datetime]:
    """Parse a date-only string (e.g. streak last_active_date) into UTC datetime."""
    dt = _parse_dt(value)
    if dt is not None:
        return dt
    if not value:
        return None
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


async def _team_members(storage, team_id: str) -> list[dict]:
    """Return raw team_members rows for a team."""
    try:
        return await storage.query_documents("team_members", [("team_id", "==", team_id)])
    except Exception:
        logger.exception("Failed to load team_members for team %s", team_id)
        return []


async def _team_tasks(storage, team_id: str) -> list[dict]:
    """Return all onramp_tasks rows for a team."""
    try:
        return await storage.query_documents("onramp_tasks", [("team_id", "==", team_id)])
    except Exception:
        logger.exception("Failed to load onramp_tasks for team %s", team_id)
        return []


async def _user_name(storage, user_id: str) -> str:
    """Best-effort human name for a user id, falling back to email/id."""
    try:
        rows = await storage.query_documents("users", [("id", "==", user_id)])
        if rows:
            return rows[0].get("name") or rows[0].get("email") or user_id
    except Exception:
        logger.exception("Failed to load user %s", user_id)
    return user_id


async def _streak(storage, user_id: str) -> Optional[dict]:
    """Return the streak row for a user, or None."""
    try:
        rows = await storage.query_documents(
            "onramp_gamification_streaks", [("user_id", "==", user_id)]
        )
        return rows[0] if rows else None
    except Exception:
        logger.exception("Failed to load streak for user %s", user_id)
        return None


async def ramp_time(team_id: str) -> dict:
    """Days from joined_at to first completed task, per member, plus team average.

    A member's ramp time is None when they have joined but not yet completed any
    task. The team average is computed only over members with a value.
    """
    storage = get_storage()
    members = await _team_members(storage, team_id)
    tasks = await _team_tasks(storage, team_id)

    # First completion timestamp per assignee.
    first_completed: dict[str, datetime] = {}
    for t in tasks:
        if t.get("state") != "completed":
            continue
        assignee = t.get("assigned_to")
        if not assignee:
            continue
        done = _parse_dt(t.get("completed_at")) or _parse_dt(t.get("updated_at"))
        if done is None:
            continue
        prev = first_completed.get(assignee)
        if prev is None or done < prev:
            first_completed[assignee] = done

    per_member = []
    ramp_days_values: list[float] = []
    for m in members:
        uid = m.get("user_id")
        joined = _parse_dt(m.get("joined_at"))
        done = first_completed.get(uid)
        days: Optional[float] = None
        if joined and done and done >= joined:
            days = round((done - joined).total_seconds() / 86400, 1)
            ramp_days_values.append(days)
        per_member.append({
            "user_id": uid,
            "name": await _user_name(storage, uid),
            "ramp_days": days,
        })

    team_average = (
        round(sum(ramp_days_values) / len(ramp_days_values), 1)
        if ramp_days_values else None
    )
    return {"members": per_member, "team_average_days": team_average}


async def onboarding_completion(team_id: str) -> dict:
    """Per-member completion % = completed tasks / assigned tasks."""
    storage = get_storage()
    members = await _team_members(storage, team_id)
    tasks = await _team_tasks(storage, team_id)

    assigned: dict[str, int] = {}
    completed: dict[str, int] = {}
    for t in tasks:
        uid = t.get("assigned_to")
        if not uid:
            continue
        assigned[uid] = assigned.get(uid, 0) + 1
        if t.get("state") == "completed":
            completed[uid] = completed.get(uid, 0) + 1

    per_member = []
    for m in members:
        uid = m.get("user_id")
        n_assigned = assigned.get(uid, 0)
        n_completed = completed.get(uid, 0)
        pct = round((n_completed / n_assigned) * 100, 1) if n_assigned else 0.0
        per_member.append({
            "user_id": uid,
            "name": await _user_name(storage, uid),
            "assigned": n_assigned,
            "completed": n_completed,
            "completion_pct": pct,
        })
    return {"members": per_member}


async def engagement(team_id: str) -> dict:
    """Current streaks per member and count of members with an active streak."""
    storage = get_storage()
    members = await _team_members(storage, team_id)

    per_member = []
    active_count = 0
    for m in members:
        uid = m.get("user_id")
        streak = await _streak(storage, uid)
        current = int(streak.get("current_streak", 0)) if streak else 0
        longest = int(streak.get("longest_streak", 0)) if streak else 0
        if current > 0:
            active_count += 1
        per_member.append({
            "user_id": uid,
            "name": await _user_name(storage, uid),
            "current_streak": current,
            "longest_streak": longest,
        })
    return {"members": per_member, "active_streaks": active_count}


async def attrition_risk(team_id: str) -> dict:
    """Flag members at risk of disengaging.

    A member is flagged when either:
      - they have a stalled open task (assigned/in_progress/needs_changes whose
        updated_at is older than STALE_DAYS), or
      - their streak has dropped to 0 while a longest_streak > 0 shows they were
        previously active.
    """
    storage = get_storage()
    members = await _team_members(storage, team_id)
    tasks = await _team_tasks(storage, team_id)
    now = datetime.now(timezone.utc)

    # Oldest stalled open task per assignee.
    stalled: dict[str, dict] = {}
    for t in tasks:
        if t.get("state") not in OPEN_STATES:
            continue
        uid = t.get("assigned_to")
        if not uid:
            continue
        updated = _parse_dt(t.get("updated_at")) or _parse_dt(t.get("created_at"))
        if updated is None:
            continue
        age_days = (now - updated).total_seconds() / 86400
        if age_days <= STALE_DAYS:
            continue
        existing = stalled.get(uid)
        if existing is None or age_days > existing["age_days"]:
            stalled[uid] = {
                "task_id": t.get("task_id"),
                "title": t.get("title"),
                "state": t.get("state"),
                "age_days": round(age_days, 1),
            }

    at_risk = []
    for m in members:
        uid = m.get("user_id")
        reasons = []
        stalled_task = stalled.get(uid)
        if stalled_task:
            reasons.append(
                f"stalled task '{stalled_task['title']}' in state "
                f"'{stalled_task['state']}' for {stalled_task['age_days']}d"
            )
        streak = await _streak(storage, uid)
        current = int(streak.get("current_streak", 0)) if streak else 0
        longest = int(streak.get("longest_streak", 0)) if streak else 0
        if streak is not None and current == 0 and longest > 0:
            reasons.append("streak dropped to 0")
        if reasons:
            at_risk.append({
                "user_id": uid,
                "name": await _user_name(storage, uid),
                "reasons": reasons,
                "stalled_task": stalled_task,
            })
    return {"at_risk": at_risk, "at_risk_count": len(at_risk)}


async def cohort_summary(team_id: str) -> dict:
    """Roll the individual metrics into a single cohort dict for a team."""
    ramp = await ramp_time(team_id)
    completion = await onboarding_completion(team_id)
    engage = await engagement(team_id)
    risk = await attrition_risk(team_id)
    return {
        "team_id": team_id,
        "member_count": len(completion["members"]),
        "ramp_time": ramp,
        "onboarding_completion": completion,
        "engagement": engage,
        "attrition_risk": risk,
        "generated_at": datetime.now(timezone.utc),
    }
