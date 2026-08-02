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
from datetime import datetime, timedelta, timezone
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


async def activity_heatmap(team_id: str) -> dict:
    """Daily activity data per member over the last 12 weeks.

    Returns a dict keyed by user_id, each containing a list of day buckets
    with task completions, logins, and streak activity for heatmap rendering.
    """
    storage = get_storage()
    members = await _team_members(storage, team_id)
    tasks = await _team_tasks(storage, team_id)
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=84)  # 12 weeks

    heatmap: dict[str, list[dict]] = {}
    for m in members:
        uid = m.get("user_id")
        name = await _user_name(storage, uid)
        days: dict[str, dict] = {}

        cur = start
        while cur <= now:
            key = cur.strftime("%Y-%m-%d")
            days[key] = {"date": key, "commits": 0, "tasks": 0, "logins": 0}
            cur += timedelta(days=1)

        for t in tasks:
            if t.get("assigned_to") != uid:
                continue
            done = _parse_dt(t.get("completed_at")) or _parse_dt(t.get("updated_at"))
            if done and done >= start:
                key = done.strftime("%Y-%m-%d")
                if key in days:
                    days[key]["tasks"] += 1

        streak = await _streak(storage, uid)
        if streak:
            last_active = _parse_date(streak.get("last_active_date"))
            if last_active and last_active >= start:
                key = last_active.strftime("%Y-%m-%d")
                if key in days:
                    days[key]["logins"] += 1

        heatmap[uid] = {
            "user_id": uid,
            "name": name,
            "total": sum(d["tasks"] + d["logins"] for d in days.values()),
            "days": [v for v in days.values()],
        }

    return {"members": heatmap, "from": start.isoformat(), "to": now.isoformat()}


async def developer_onboarding(team_id: str) -> dict:
    """Per-developer onboarding overview: stage, progress, ramp, risk."""
    ramp = await ramp_time(team_id)
    completion = await onboarding_completion(team_id)
    engage = await engagement(team_id)
    risk = await attrition_risk(team_id)
    at_risk_ids = {m["user_id"] for m in risk.get("at_risk", [])}

    devs = []
    for cm in completion["members"]:
        uid = cm["user_id"]
        rm = next((r for r in ramp["members"] if r["user_id"] == uid), {})
        em = next((e for e in engage["members"] if e["user_id"] == uid), {})

        ramp_days = rm.get("ramp_days")
        if ramp_days is None:
            stage = "onboarding"
        elif cm["completion_pct"] >= 80:
            stage = "independent"
        elif cm["completion_pct"] >= 40:
            stage = "contributing"
        else:
            stage = "ramping"

        devs.append({
            "user_id": uid,
            "name": cm["name"],
            "stage": stage,
            "completion_pct": cm["completion_pct"],
            "assigned": cm["assigned"],
            "completed": cm["completed"],
            "ramp_days": ramp_days,
            "current_streak": em.get("current_streak", 0),
            "longest_streak": em.get("longest_streak", 0),
            "at_risk": uid in at_risk_ids,
        })

    return {"developers": devs, "team_id": team_id}


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


async def cohort_comparison(team_id: str) -> dict:
    """Compare onboarding speed across hiring cohorts (by join month).

    Groups members by the month they joined, then for each cohort computes:
    - member_count
    - avg_ramp_days (days joined → first completed task)
    - avg_completion_pct
    - avg_days_to_first_pr (days joined → first submitted/approved task)
    - blockers (tasks stuck in needs_changes for the cohort's members)

    Cohorts are sorted oldest first so HR can see improvement over time.
    """
    storage = get_storage()
    members = await _team_members(storage, team_id)
    tasks = await _team_tasks(storage, team_id)

    # Member → join month
    cohorts: dict[str, list[dict]] = {}
    for m in members:
        joined = _parse_dt(m.get("joined_at"))
        if not joined:
            continue
        month = joined.strftime("%Y-%m")
        cohorts.setdefault(month, []).append(m)

    # Per-member first completion / first PR timestamps
    first_completed: dict[str, datetime] = {}
    first_pr: dict[str, datetime] = {}
    completed_count: dict[str, int] = {}
    assigned_count: dict[str, int] = {}
    blockers: list[dict] = []
    now = datetime.now(timezone.utc)

    for t in tasks:
        uid = t.get("assigned_to")
        if not uid:
            continue
        assigned_count[uid] = assigned_count.get(uid, 0) + 1
        done = _parse_dt(t.get("completed_at")) or _parse_dt(t.get("updated_at"))
        if t.get("state") == "completed" and done:
            completed_count[uid] = completed_count.get(uid, 0) + 1
            prev = first_completed.get(uid)
            if prev is None or done < prev:
                first_completed[uid] = done
        if t.get("state") in ("submitted", "approved", "completed", "product_review") and done:
            prev = first_pr.get(uid)
            if prev is None or done < prev:
                first_pr[uid] = done
        if t.get("state") == "needs_changes":
            updated = _parse_dt(t.get("updated_at")) or _parse_dt(t.get("created_at"))
            if updated:
                age_days = (now - updated).total_seconds() / 86400
                blockers.append({
                    "task_id": t.get("task_id"),
                    "title": t.get("title"),
                    "assignee": uid,
                    "age_days": round(age_days, 1),
                    "module": t.get("module", ""),
                })

    result = []
    for month in sorted(cohorts.keys()):
        cohort_members = cohorts[month]
        ramp_values: list[float] = []
        pr_values: list[float] = []
        comp_values: list[float] = []
        cohort_blockers: list[dict] = []

        for m in cohort_members:
            uid = m.get("user_id")
            joined = _parse_dt(m.get("joined_at"))
            if joined:
                if uid in first_completed:
                    ramp_values.append((first_completed[uid] - joined).total_seconds() / 86400)
                if uid in first_pr:
                    pr_values.append((first_pr[uid] - joined).total_seconds() / 86400)
            n_assigned = assigned_count.get(uid, 0)
            n_completed = completed_count.get(uid, 0)
            if n_assigned:
                comp_values.append((n_completed / n_assigned) * 100)
            cohort_blockers.extend([b for b in blockers if b["assignee"] == uid])

        cohort_blockers.sort(key=lambda b: b.get("age_days", 0), reverse=True)
        result.append({
            "cohort": month,
            "label": _format_month(month),
            "member_count": len(cohort_members),
            "avg_ramp_days": round(sum(ramp_values) / len(ramp_values), 1) if ramp_values else None,
            "avg_days_to_first_pr": round(sum(pr_values) / len(pr_values), 1) if pr_values else None,
            "avg_completion_pct": round(sum(comp_values) / len(comp_values), 1) if comp_values else None,
            "blocker_count": len(cohort_blockers),
            "top_blockers": cohort_blockers[:5],
        })

    return {"cohorts": result, "team_id": team_id}


def _format_month(ym: str) -> str:
    """Format '2026-03' → 'Mar 2026'."""
    try:
        return datetime.strptime(ym, "%Y-%m").strftime("%b %Y")
    except (ValueError, TypeError):
        return ym


async def onboarding_timeline(team_id: str) -> dict:
    """Per-developer onboarding timeline — each dev is a lane, task states are milestones.

    Returns one entry per developer with an ordered list of milestones derived
    from their tasks (assigned → started → submitted → approved → completed),
    each carrying a timestamp so HR can render a lane-based timeline.
    """
    storage = get_storage()
    members = await _team_members(storage, team_id)
    tasks = await _team_tasks(storage, team_id)

    by_user: dict[str, list[dict]] = {}
    for m in members:
        by_user.setdefault(m.get("user_id"), [])

    for t in tasks:
        uid = t.get("assigned_to")
        if not uid or uid not in by_user:
            continue
        milestones = []
        created = _parse_dt(t.get("created_at"))
        started = _parse_dt(t.get("started_at"))
        completed = _parse_dt(t.get("completed_at")) or _parse_dt(t.get("updated_at"))
        state = t.get("state")

        if created:
            milestones.append({"state": "assigned", "label": "Assigned", "at": created.isoformat(), "title": t.get("title")})
        if started:
            milestones.append({"state": "in_progress", "label": "Started", "at": started.isoformat(), "title": t.get("title")})
        if state in ("submitted", "under_review", "peer_review", "approved", "completed", "product_review"):
            milestones.append({"state": "submitted", "label": "Submitted", "at": completed.isoformat() if completed else created.isoformat(), "title": t.get("title")})
        if state in ("approved", "completed"):
            milestones.append({"state": "approved", "label": "Approved", "at": completed.isoformat() if completed else created.isoformat(), "title": t.get("title")})
        if state == "completed":
            milestones.append({"state": "completed", "label": "Completed", "at": completed.isoformat(), "title": t.get("title")})
        if state == "needs_changes":
            milestones.append({"state": "needs_changes", "label": "Needs changes", "at": completed.isoformat() if completed else created.isoformat(), "title": t.get("title")})

        milestones.sort(key=lambda ms: ms["at"])
        by_user[uid].extend({"task_id": t.get("task_id"), "module": t.get("module", ""), "state": state, **ms} for ms in milestones)

    lanes = []
    for m in members:
        uid = m.get("user_id")
        ms = by_user.get(uid, [])
        ms.sort(key=lambda x: x.get("at", ""))
        lanes.append({
            "user_id": uid,
            "name": await _user_name(storage, uid),
            "role": m.get("role", ""),
            "joined_at": m.get("joined_at"),
            "milestone_count": len(ms),
            "milestones": ms,
        })
    return {"lanes": lanes, "team_id": team_id}


async def review_analytics(team_id: str) -> dict:
    """Review-quality analytics: rework rate, turnaround, and reviewer load.

    Derived entirely from onramp_tasks:
    - rework_rate: % of tasks that have ever gone through a needs_changes cycle
      (tracked via ``review_cycles`` / ``reviewed_at`` timestamps)
    - avg_review_turnaround_hours: submitted → first review outcome
    - reviewer_load: reviews performed per reviewer (senior or peer)
    - pending_review_count: tasks currently waiting in submitted/under_review
    """
    storage = get_storage()
    tasks = await _team_tasks(storage, team_id)
    now = datetime.now(timezone.utc)

    reworked = 0
    turnaround_hours: list[float] = []
    reviewer_load: dict[str, int] = {}
    pending = 0

    for t in tasks:
        cycles = int(t.get("review_cycles", 0) or 0)
        if cycles > 0 or t.get("state") == "needs_changes":
            reworked += 1

        submitted = _parse_dt(t.get("submitted_at"))
        reviewed = _parse_dt(t.get("reviewed_at"))
        if submitted and reviewed and reviewed >= submitted:
            turnaround_hours.append((reviewed - submitted).total_seconds() / 3600)

        for reviewer in (t.get("reviewed_by"), t.get("peer_reviewed_by")):
            if reviewer:
                reviewer_load[reviewer] = reviewer_load.get(reviewer, 0) + 1

        if t.get("state") in ("submitted", "under_review"):
            pending += 1

    total = len(tasks)
    top_reviewers = []
    for uid, count in sorted(reviewer_load.items(), key=lambda kv: -kv[1]):
        top_reviewers.append({
            "user_id": uid,
            "name": await _user_name(storage, uid),
            "reviews": count,
        })

    return {
        "team_id": team_id,
        "total_tasks": total,
        "rework_rate_pct": round((reworked / total) * 100, 1) if total else 0.0,
        "reworked_task_count": reworked,
        "avg_review_turnaround_hours": round(sum(turnaround_hours) / len(turnaround_hours), 1) if turnaround_hours else None,
        "pending_review_count": pending,
        "top_reviewers": top_reviewers[:10],
        "generated_at": now,
    }


async def mentor_matching(team_id: str, new_dev_id: str, limit: int = 5) -> dict:
    """Match a new dev to senior devs by shared tech stack.

    Scoring (simple, not ML): each member's language set is derived from the
    repositories their tasks reference (``onramp_tasks.repo_url`` matched to
    the repositories table). A new dev with no tasks yet falls back to the
    team's repo languages (their planned stack).

    A candidate senior scores +2 per shared language. Seniors are members with
    role in {owner, ceo, cto, senior_dev}.
    """
    storage = get_storage()
    members = await _team_members(storage, team_id)
    repos = await storage.query_documents("repositories", [("team_id", "==", team_id)])

    # repo URL (normalized) → language
    repo_lang: dict[str, str] = {}
    team_langs: set = set()
    for r in repos:
        lang = (r.get("language") or "").strip().lower()
        url = (r.get("url") or f"https://github.com/{r.get('owner', '')}/{r.get('name', '')}").rstrip("/").lower()
        if not lang:
            continue
        repo_lang[url] = lang
        team_langs.add(lang)

    # Per-user languages from the repos their tasks touch
    tasks = await _team_tasks(storage, team_id)
    langs_by_user: dict[str, set] = {m.get("user_id"): set() for m in members}
    for t in tasks:
        uid = t.get("assigned_to")
        if not uid or uid not in langs_by_user:
            continue
        repo_url = (t.get("repo_url") or "").rstrip("/").lower()
        lang = repo_lang.get(repo_url)
        if lang:
            langs_by_user[uid].add(lang)

    new_dev_langs = langs_by_user.get(new_dev_id, set())
    if not new_dev_langs:
        new_dev_langs = set(team_langs)  # planned stack = team's stack

    senior_roles = {"owner", "ceo", "cto", "senior_dev"}
    scored = []
    for m in members:
        uid = m.get("user_id")
        if uid == new_dev_id or m.get("role") not in senior_roles:
            continue
        langs = langs_by_user.get(uid, set())
        shared = new_dev_langs & langs
        score = len(shared) * 2 if new_dev_langs else 1
        scored.append({
            "user_id": uid,
            "name": await _user_name(storage, uid),
            "role": m.get("role"),
            "score": score,
            "shared_languages": sorted(shared),
            "mentor_languages": sorted(langs),
        })

    scored.sort(key=lambda s: (-s["score"], s["name"]))
    return {
        "new_dev_id": new_dev_id,
        "new_dev_languages": sorted(new_dev_langs),
        "matches": scored[:limit],
        "match_count": len(scored),
    }
