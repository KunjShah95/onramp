"""
DORA metrics computation service.

Computes the four DORA metrics from task data:
1. Deployment Frequency — how often tasks are completed
2. Lead Time for Changes — time from assignment to completion
3. Change Failure Rate — how often completed tasks needed changes
4. Mean Time to Recover (MTTR) — time from failure to recovery

Each metric is classified into bands: Elite, High, Medium, Low, None.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.services.postgres_db import get_storage

logger = logging.getLogger(__name__)


# ── Classification helpers ──────────────────────────────────────────────


def _classify(metric: str, value: float) -> str:
    """Classify a metric value into a DORA band.

    DORA 2023 benchmark thresholds:
    - Deployment Frequency: deploys/day
    - Lead Time for Changes: days
    - Change Failure Rate: %
    - MTTR: hours
    """
    if value is None or value < 0:
        return "none"

    if metric == "deployment_frequency":
        if value > 7:
            return "elite"
        if value > 0.14:   # ~1/week
            return "high"
        if value > 0.005:  # ~1/6 months
            return "medium"
        return "low"

    if metric in ("lead_time_for_changes", "mttr"):
        # Lower is better: hours for MTTR, days for lead time
        if metric == "mttr":
            if value < 1:
                return "elite"     # < 1 hour
            if value < 24:
                return "high"      # < 1 day
            if value < 168:
                return "medium"    # < 1 week
        else:
            if value < 1:
                return "elite"     # < 1 day
            if value < 7:
                return "high"      # < 1 week
            if value < 30:
                return "medium"    # < 1 month
        return "low"

    if metric == "change_failure_rate":
        if value < 5:
            return "elite"
        if value < 10:
            return "high"
        if value < 15:
            return "medium"
        return "low"

    return "none"


def _format_value(value: float, unit: str = "") -> str:
    """Format a metric value for display."""
    if value is None:
        return "N/A"
    if unit == "hours":
        if value < 1:
            return f"{int(value * 60)}m"
        return f"{value:.1f}h"
    if unit == "days":
        if value < 1:
            return f"{int(value * 24)}h"
        return f"{value:.1f}d"
    if value == int(value):
        return str(int(value))
    if value < 0.001:
        return f"{value:.4f}"
    if value < 0.1:
        return f"{value:.3f}"
    return f"{value:.1f}"


# ── Data helpers ────────────────────────────────────────────────────────


def _days_between(d1, d2) -> float:
    """Calculate days between two datetime/ISO strings."""
    if isinstance(d1, str):
        d1 = datetime.fromisoformat(d1)
    if isinstance(d2, str):
        d2 = datetime.fromisoformat(d2)
    delta = d2 - d1
    return abs(delta.total_seconds()) / 86400


# ── DORA Metrics ────────────────────────────────────────────────────────


async def deployment_frequency(team_id: str, days: int = 90) -> dict:
    """Compute deployment frequency: completed tasks per day over the period."""
    storage = get_storage()
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    tasks = await storage.query_documents(
        "onramp_tasks",
        [
            ("team_id", "==", team_id),
            ("state", "==", "completed"),
        ],
    )

    # Filter by completed_at within the window
    completed = [
        t for t in tasks
        if t.get("completed_at") and _days_between(t["completed_at"], datetime.now(timezone.utc)) <= days
    ]

    if not completed:
        return {"value": "0", "classification": "none"}

    freq = len(completed) / days
    classification = _classify("deployment_frequency", freq)
    return {"value": _format_value(freq), "classification": classification}


async def lead_time_for_changes(team_id: str, days: int = 90) -> dict:
    """Compute lead time: average days from assignment to completion."""
    storage = get_storage()
    now = datetime.now(timezone.utc)

    tasks = await storage.query_documents(
        "onramp_tasks",
        [
            ("team_id", "==", team_id),
            ("state", "==", "completed"),
        ],
    )

    lead_times = []
    for t in tasks:
        assigned = t.get("created_at") or t.get("assigned_to")
        completed = t.get("completed_at")
        if assigned and completed:
            try:
                lt = _days_between(assigned, completed)
                completed_ago = _days_between(completed, now)
                if lt <= days and completed_ago <= days:
                    lead_times.append(lt)
            except (ValueError, TypeError):
                continue

    if not lead_times:
        return {"value": "N/A", "classification": "none"}

    avg = sum(lead_times) / len(lead_times)
    classification = _classify("lead_time_for_changes", avg)
    return {"value": _format_value(avg, "days"), "classification": classification}


async def change_failure_rate(team_id: str, days: int = 90) -> dict:
    """Compute change failure rate: % of completed tasks that needed changes."""
    storage = get_storage()
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    tasks = await storage.query_documents(
        "onramp_tasks",
        [("team_id", "==", team_id)],
    )

    # Filter tasks in the window by created_at
    window_tasks = [
        t for t in tasks
        if t.get("created_at") and _days_between(t["created_at"], datetime.now(timezone.utc)) <= days
    ]

    if not window_tasks:
        return {"value": "N/A", "classification": "none"}

    # Count tasks that have been in needs_changes state as a proxy for failures
    failures = sum(1 for t in window_tasks if "needs_changes" in str(t.get("state", "")))
    rate = (failures / len(window_tasks)) * 100
    classification = _classify("change_failure_rate", rate)
    return {"value": _format_value(rate, "percent"), "classification": classification}


async def mttr(team_id: str, days: int = 90) -> dict:
    """Compute Mean Time to Recover: avg hours from needs_changes to completed."""
    storage = get_storage()
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    tasks = await storage.query_documents(
        "onramp_tasks",
        [("team_id", "==", team_id)],
    )

    recoveries = []
    for t in tasks:
        # Use needs_changes events as failure, completed_at as recovery
        state = t.get("state", "")
        completed = t.get("completed_at")
        created = t.get("created_at")
        if "needs_changes" in str(state) and completed and created:
            try:
                recovery_hours = _days_between(created, completed) * 24
                if recovery_hours <= days * 24:
                    recoveries.append(recovery_hours)
            except (ValueError, TypeError):
                continue

    if not recoveries:
        return {"value": "N/A", "classification": "none"}

    avg_hours = sum(recoveries) / len(recoveries)
    classification = _classify("mttr", avg_hours)
    return {"value": _format_value(avg_hours, "hours"), "classification": classification}


async def dora_summary(team_id: str, days: int = 90) -> dict:
    """Compute all four DORA metrics and an overall score."""
    df = await deployment_frequency(team_id, days)
    lt = await lead_time_for_changes(team_id, days)
    cfr = await change_failure_rate(team_id, days)
    mt = await mttr(team_id, days)

    # Overall score: elite=100, high=75, medium=50, low=25, none=0
    scores = {"elite": 100, "high": 75, "medium": 50, "low": 25, "none": 0}
    total = 0
    count = 0
    for m in (df, lt, cfr, mt):
        cls = m.get("classification", "none")
        total += scores.get(cls, 0)
        count += 1

    overall = round(total / count) if count > 0 else 0

    return {
        "overall_score": overall,
        "metrics": {
            "deployment_frequency": df,
            "lead_time_for_changes": lt,
            "change_failure_rate": cfr,
            "mttr": mt,
        },
    }


async def velocity_trends(team_id: str, weeks: int = 12) -> dict:
    """Compute weekly completion trends for the given number of weeks."""
    storage = get_storage()
    now = datetime.now(timezone.utc)

    tasks = await storage.query_documents(
        "onramp_tasks",
        [("team_id", "==", team_id), ("state", "==", "completed")],
    )

    trends = []
    for w in range(weeks):
        week_start = now - timedelta(weeks=w + 1)
        week_end = now - timedelta(weeks=w)
        count = 0
        for t in tasks:
            ca = t.get("completed_at")
            if ca:
                try:
                    ca_dt = datetime.fromisoformat(ca) if isinstance(ca, str) else ca
                    if week_start <= ca_dt < week_end:
                        count += 1
                except (ValueError, TypeError):
                    continue
        trends.append({
            "week": week_start.strftime("%Y-W%V"),
            "completed": count,
        })

    trends.reverse()

    # 4-week moving average (rolling, computed after reversal so indices align).
    for i, t in enumerate(trends):
        window = [x["completed"] for x in trends[max(0, i - 3): i + 1]]
        if window:
            t["completed_ma4"] = round(sum(window) / len(window), 2)

    return {"trends": trends}


async def team_throughput(team_id: str, days: int = 30) -> dict:
    """Compute per-member throughput (completed and in-progress tasks)."""
    storage = get_storage()
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)

    tasks = await storage.query_documents(
        "onramp_tasks",
        [("team_id", "==", team_id)],
    )

    members: dict = {}
    for t in tasks:
        assigned_to = t.get("assigned_to")
        if not assigned_to:
            continue

        ca = t.get("completed_at")
        if ca:
            try:
                ca_dt = datetime.fromisoformat(ca) if isinstance(ca, str) else ca
                if ca_dt < cutoff:
                    continue
            except (ValueError, TypeError):
                continue

        if assigned_to not in members:
            members[assigned_to] = {
                "name": assigned_to,
                "completed": 0,
                "in_progress": 0,
            }

        state = t.get("state", "")
        if state == "completed":
            members[assigned_to]["completed"] += 1
        elif state in ("in_progress", "submitted", "under_review"):
            members[assigned_to]["in_progress"] += 1

    # Best-effort: replace raw user IDs with display names for the chart.
    # Route through get_user_by_uid so encrypted PII (field encryption on
    # Postgres) is decrypted — raw list_documents would return ciphertext.
    from app.services.user_service import get_user_by_uid

    result = list(members.values())
    if result:
        try:
            name_map = {}
            for m in result:
                uid = m["name"]
                if uid in name_map:
                    continue
                user = await get_user_by_uid(uid)
                name_map[uid] = (user or {}).get("name") or uid
            for m in result:
                m["name"] = name_map.get(m["name"], m["name"])
        except Exception:
            logger.debug("User name lookup failed — falling back to IDs", exc_info=True)

    return {"members": result}
