"""
Review Operations service (v1.5 — P2: reviews bottleneck).

Sits on top of the existing review queue and adds the two missing
interventions from ROADMAP.md v1.5:

- **Load balancing** — a per-reviewer load board (pending + in-review tasks,
  oldest wait) and a ``suggest_reviewer`` picker that routes new review work
  to the least-loaded capable reviewer instead of always piling it on the
  task creator.
- **Consistency scoring** — per-reviewer quality readout (turnaround +
  calibration) so teams can see who reviews fast and whose verdicts stick,
  and use it as the tie-break when loads are equal.

Everything is read-only (only queries storage). Attribution relies on
``onramp_tasks.reviewed_by`` / ``peer_reviewed_by`` — the state machine
records the acting reviewer on every outcome transition, so the numbers
are only as good as that field (see task_service.transition_task).

Working definitions (documented heuristics, not ML):
- ``load_score``  = min(100, pending×25 + in_review×12) — a transparent
  weighted view of how much review work is waiting on a reviewer.
- ``consistency score`` = 0.40×timeliness + 0.25×punctuality +
  0.35×calibration, where timeliness rewards fast average turnaround,
  punctuality rewards low turnaround variance, and calibration rewards a
  high share of clean verdicts (approved/completed) vs change-request loops.
  Null below MIN_REVIEWS_FOR_SCORE (not enough data to trust).
"""

import logging
from datetime import datetime, timedelta, timezone
from statistics import pstdev
from typing import Any, Optional

from app.services.postgres_db import get_storage
from app.services.field_encryption import decrypt_field

logger = logging.getLogger("onramp.review_ops")

# Roles considered capable reviewers (suggest only routes to these).
REVIEWER_ROLES = {"senior_dev", "senior", "admin", "ceo", "cto"}

# Waiting on a reviewer to act (submitted → first verdict).
PENDING_STATES = ("submitted", "under_review", "product_review")
# Actively claimed / being reviewed right now.
CLAIMED_STATES = ("under_review", "peer_review")
# Terminal-ish states that count as an outcome for attribution.
OUTCOME_STATES = ("approved", "needs_changes", "product_review", "completed")
CLEAN_STATES = ("approved", "completed")  # verdicts that didn't send work back

REVIEWS_LOOKBACK_DAYS = 30
MIN_REVIEWS_FOR_SCORE = 3


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


async def _team_members(storage, team_id: str) -> list[dict]:
    try:
        return await storage.query_documents("team_members", [("team_id", "==", team_id)])
    except Exception:
        logger.exception("Failed to load team_members for team %s", team_id)
        return []


async def _team_tasks(storage, team_id: str) -> list[dict]:
    try:
        return await storage.query_documents("onramp_tasks", [("team_id", "==", team_id)])
    except Exception:
        logger.exception("Failed to load onramp_tasks for team %s", team_id)
        return []


async def _user_name(storage, user_id: str) -> str:
    try:
        rows = await storage.query_documents("users", [("id", "==", user_id)])
        if rows:
            raw = rows[0].get("name") or rows[0].get("email") or user_id
            return decrypt_field(raw) if raw != user_id else user_id
    except Exception:
        logger.exception("Failed to load user %s", user_id)
    return user_id


def _task_reviewers(task: dict) -> set[str]:
    """The reviewer id(s) recorded on a task (senior + peer attribution)."""
    reviewers = set()
    if task.get("reviewed_by"):
        reviewers.add(task["reviewed_by"])
    if task.get("peer_reviewed_by"):
        reviewers.add(task["peer_reviewed_by"])
    return reviewers


def _age_hours(task: dict) -> Optional[float]:
    """Hours since the task last needed attention (submitted → now)."""
    now = datetime.now(timezone.utc)
    submitted = _parse_dt(task.get("submitted_at"))
    updated = _parse_dt(task.get("updated_at")) or _parse_dt(task.get("created_at"))
    base = submitted or updated
    if base is None:
        return None
    return max(0.0, (now - base).total_seconds() / 3600)


def _load_score(pending: int, in_review: int) -> int:
    """Transparent 0-100 load heuristic: 25/actionable + 12/claimed."""
    return min(100, pending * 25 + in_review * 12)


# ── Load board ─────────────────────────────────────────────────────────────


async def reviewer_load(team_id: str) -> dict:
    """Per-reviewer load board: pending, in-review, recent volume, oldest wait.

    Includes every member with a reviewer role, plus any non-leader who has
    actually reviewed (peers who claim reviews) — so the board reflects real
    review work, not just roles.
    """
    storage = get_storage()
    members = await _team_members(storage, team_id)
    tasks = await _team_tasks(storage, team_id)
    now = datetime.now(timezone.utc)
    cutoff_30d = now - timedelta(days=REVIEWS_LOOKBACK_DAYS)

    role_by_user = {
        m.get("user_id"): (m.get("role") or "").lower()
        for m in members if m.get("user_id")
    }

    # Aggregate per-user counts in one pass over the tasks.
    pending_by_user: dict[str, int] = {}
    in_review_by_user: dict[str, int] = {}
    recent_by_user: dict[str, int] = {}
    oldest_wait_by_user: dict[str, float] = {}

    for t in tasks:
        state = t.get("state")
        reviewers = _task_reviewers(t)
        for uid in reviewers:
            if state in OUTCOME_STATES:
                reviewed_at = _parse_dt(t.get("reviewed_at"))
                if reviewed_at and reviewed_at >= cutoff_30d:
                    recent_by_user[uid] = recent_by_user.get(uid, 0) + 1
        # Pending attribution is per-state and deliberately precise:
        #   - submitted      → waits on the task creator (the default reviewer).
        #     ``reviewed_by`` is never cleared on re-submit, so unioning it in
        #     would double-count the previous cycle's reviewer.
        #   - under_review   → waits on the senior who claimed it.
        #   - peer_review    → waits on the peer who claimed it.
        #   - product_review → waiting on product sign-off, not a senior — it
        #     does not add to anyone's pending load.
        if state == "submitted":
            uid = t.get("created_by")
            if uid:
                pending_by_user[uid] = pending_by_user.get(uid, 0) + 1
                wait = _age_hours(t)
                if wait is not None:
                    oldest_wait_by_user[uid] = max(oldest_wait_by_user.get(uid, 0.0), wait)
        elif state == "under_review":
            uid = t.get("reviewed_by")
            if uid:
                pending_by_user[uid] = pending_by_user.get(uid, 0) + 1
                wait = _age_hours(t)
                if wait is not None:
                    oldest_wait_by_user[uid] = max(oldest_wait_by_user.get(uid, 0.0), wait)
        elif state == "peer_review":
            uid = t.get("peer_reviewed_by")
            if uid:
                pending_by_user[uid] = pending_by_user.get(uid, 0) + 1
                wait = _age_hours(t)
                if wait is not None:
                    oldest_wait_by_user[uid] = max(oldest_wait_by_user.get(uid, 0.0), wait)
        if state in CLAIMED_STATES:
            for uid in reviewers:
                if not uid:
                    continue
                in_review_by_user[uid] = in_review_by_user.get(uid, 0) + 1

    # Candidate set: reviewer roles ∪ anyone with recorded review activity.
    candidate_ids = set(role_by_user.keys()) | set(recent_by_user.keys())
    reviewers = []
    for uid in candidate_ids:
        pending = pending_by_user.get(uid, 0)
        in_review = in_review_by_user.get(uid, 0)
        wait_hours = oldest_wait_by_user.get(uid)
        reviewers.append({
            "user_id": uid,
            "name": await _user_name(storage, uid),
            "role": role_by_user.get(uid, ""),
            "pending": pending,
            "in_review": in_review,
            "reviews_30d": recent_by_user.get(uid, 0),
            "oldest_wait_hours": round(wait_hours, 1) if wait_hours is not None else None,
            "load_score": _load_score(pending, in_review),
        })

    reviewers.sort(key=lambda r: (-r["load_score"], r["name"]))
    return {
        "team_id": team_id,
        "reviewers": reviewers,
        "generated_at": now,
    }


# ── Suggest reviewer (load-balanced routing) ───────────────────────────────


def _rework_rate_by_reviewer(tasks: list[dict]) -> dict[str, float]:
    """Per-reviewer rework % (change-request reviews / attributed reviews).

    Used as the tie-break in ``suggest_reviewer``: among equally-loaded
    reviewers, prefer the one whose verdicts send less work back into loops.
    Reviewers with no history are neutral (0%).
    """
    total: dict[str, int] = {}
    changes: dict[str, int] = {}
    for t in tasks:
        if t.get("state") not in OUTCOME_STATES:
            continue
        for uid in _task_reviewers(t):
            total[uid] = total.get(uid, 0) + 1
            if t.get("state") == "needs_changes":
                changes[uid] = changes.get(uid, 0) + 1
    return {
        uid: round(changes.get(uid, 0) / n * 100, 1)
        for uid, n in total.items()
    }


async def suggest_reviewer(
    team_id: str, task_id: Optional[str] = None
) -> dict:
    """Recommend the least-loaded reviewer for new review work.

    Candidates are team members with a reviewer role (excluding the task's
    assignee — you can't review your own work). Sorting is: load score asc →
    rework rate asc → name, so the suggestion spreads work evenly and breaks
    ties toward the more consistent reviewer. The task creator is a candidate
    like anyone else: if they happen to be the least loaded, they're picked.

    ``task_id`` is optional — with no task, the suggestion is simply the
    team's least-loaded reviewer.
    """
    storage = get_storage()
    members = await _team_members(storage, team_id)
    tasks = await _team_tasks(storage, team_id)
    load = await reviewer_load(team_id)
    rework = _rework_rate_by_reviewer(tasks)

    excluded: set[str] = set()
    if task_id:
        task = await storage.get_document("onramp_tasks", task_id)
        if task:
            excluded.add(task.get("assigned_to") or "")

    candidates = [
        r for r in load["reviewers"]
        if r["role"] in REVIEWER_ROLES and r["user_id"] not in excluded
    ]
    candidates.sort(key=lambda r: (r["load_score"], rework.get(r["user_id"], 0.0), r["name"]))

    def _to_pick(entry: dict) -> dict:
        return {
            "user_id": entry["user_id"],
            "name": entry["name"],
            "role": entry["role"],
            "pending": entry["pending"],
            "in_review": entry["in_review"],
            "load_score": entry["load_score"],
            "rework_pct": rework.get(entry["user_id"]),
        }

    return {
        "team_id": team_id,
        "task_id": task_id,
        "suggestion": _to_pick(candidates[0]) if candidates else None,
        "alternatives": [_to_pick(c) for c in candidates[1:4]],
        "generated_at": datetime.now(timezone.utc),
    }


# ── Consistency scoring ────────────────────────────────────────────────────


async def consistency_scores(team_id: str) -> dict:
    """Per-reviewer consistency readout + a 0-100 score.

    Signals (all derived from tasks attributed to the reviewer):
    - avg_turnaround_hours / turnaround_stddev_hours: submitted → reviewed.
      Fast + predictable reviewers unblock trainees sooner.
    - rework_rate_pct: share of their verdicts that sent work back into a
      needs_changes loop. A high share means more junior+senior cycles.
    - score: 0.40×timeliness + 0.25×punctuality + 0.35×calibration, null
      below MIN_REVIEWS_FOR_SCORE (insufficient data).

    Known blind spot: ``reviewed_by`` holds only the *latest* reviewer, so
    approval "stickiness" (did someone else bounce an approval later?) is not
    measurable from the task table — a task one reviewer approved and another
    later bounced attributes entirely to the later reviewer. A review-events
    log would close this; the current score is a defensible v1 heuristic.
    """
    storage = get_storage()
    tasks = await _team_tasks(storage, team_id)

    reviews: dict[str, int] = {}
    changes: dict[str, int] = {}
    clean: dict[str, int] = {}
    product: dict[str, int] = {}
    turnarounds: dict[str, list[float]] = {}

    for t in tasks:
        if t.get("state") not in OUTCOME_STATES:
            continue
        submitted = _parse_dt(t.get("submitted_at"))
        reviewed = _parse_dt(t.get("reviewed_at"))
        for uid in _task_reviewers(t):
            reviews[uid] = reviews.get(uid, 0) + 1
            if t.get("state") == "needs_changes":
                changes[uid] = changes.get(uid, 0) + 1
            elif t.get("state") == "product_review":
                product[uid] = product.get(uid, 0) + 1
            elif t.get("state") in CLEAN_STATES:
                clean[uid] = clean.get(uid, 0) + 1
            if submitted and reviewed and reviewed >= submitted:
                turnarounds.setdefault(uid, []).append(
                    (reviewed - submitted).total_seconds() / 3600
                )

    role_by_user: dict[str, str] = {}
    for m in await _team_members(storage, team_id):
        if m.get("user_id"):
            role_by_user[m["user_id"]] = (m.get("role") or "").lower()

    reviewers = []
    for uid, n in reviews.items():
        n_changes = changes.get(uid, 0)
        n_clean = clean.get(uid, 0)
        turns = turnarounds.get(uid, [])
        avg_hours = sum(turns) / len(turns) if turns else None
        stddev_hours = round(pstdev(turns), 1) if len(turns) > 1 else 0.0

        score = None
        if n >= MIN_REVIEWS_FOR_SCORE:
            timeliness = 100.0 - (avg_hours or 0.0) * 3.0      # 0h → 100
            punctuality = 100.0 - stddev_hours * 4.0           # 0h variance → 100
            calibration = (n_clean / n) * 100.0                # clean-verdict share
            raw = 0.40 * timeliness + 0.25 * punctuality + 0.35 * calibration
            score = max(0, min(100, round(raw)))

        reviewers.append({
            "user_id": uid,
            "name": await _user_name(storage, uid),
            "role": role_by_user.get(uid, ""),
            "reviews": n,
            "approved": n_clean,
            "changes_requested": n_changes,
            "product_routed": product.get(uid, 0),
            "rework_rate_pct": round(n_changes / n * 100, 1),
            "avg_turnaround_hours": round(avg_hours, 1) if avg_hours is not None else None,
            "turnaround_stddev_hours": stddev_hours,
            "score": score,
            "confidence": "ok" if score is not None else "insufficient",
        })

    # Scored reviewers first (best first), then insufficient-data ones by volume.
    reviewers.sort(key=lambda r: (
        r["score"] is None,
        -(r["score"] or 0),
        -r["reviews"],
    ))
    return {
        "team_id": team_id,
        "reviewers": reviewers,
        "generated_at": datetime.now(timezone.utc),
    }
