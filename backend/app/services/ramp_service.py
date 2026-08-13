"""
Ramp Visibility & Senior-Time Protection service.

Implements the v1.4 wedge from PROBLEM.md / ROADMAP.md — the complete
**Track → Quantify → Intercept** loop for new developers:

- **Track** — per-trainee ramp profile: days joined → first completed task,
  completion, review cycles, stalled work, questions asked.
- **Quantify** — an estimate of the senior time (and $) each trainee has
  consumed: review cycles × review time, plus periodic senior re-engagement
  for stalled open tasks. Working assumptions live in the constants below
  (to be pressure-tested with customers — see PROBLEM.md).
- **Intercept** — rule-based stuck detection (stalled task, repeated review
  failures, review timeout, inactivity) that fires deduped ``dev_stuck``
  notifications to team leaders and a self-serve nudge to the trainee.

Read-only for every query path; only ``fire_stuck_alerts`` writes (alert
dedupe markers + notifications), so dashboards stay side-effect free.
"""

import logging
import os
from datetime import datetime, timedelta, timezone
from statistics import median
from typing import Any, Optional

from app.services.postgres_db import get_storage, generate_id
from app.services.hr_metrics_service import attrition_risk, review_analytics

logger = logging.getLogger("onramp.ramp")

# ── Scope ─────────────────────────────────────────────────────────────────

# Roles tracked as "trainees" (new developers being onboarded).
TRAINEE_ROLES = {"new_dev", "member"}

# Roles that receive stuck-dev leader alerts.
LEADER_ROLES = {"senior_dev", "senior", "cto", "ceo", "owner"}

# ── Cost model (working assumptions — Phase 0 pressure-tests these) ────────
#
# Defaults are env-tunable (ONRAMP_*), so deployment-wide calibration needs
# no code change, and per-team overrides live in team_cost_settings (see
# GET/PUT /ramp/cost-model). PROBLEM.md's band: senior rate $75-100/hr,
# review cycles 0.25-1.0h of senior attention.

def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, ""))
    except (TypeError, ValueError):
        return default


SENIOR_HOURLY_RATE_USD = _env_float("ONRAMP_SENIOR_HOURLY_RATE", 90.0)   # fully-loaded senior dev cost / hour
REVIEW_HOURS_PER_CYCLE = _env_float("ONRAMP_REVIEW_HOURS_PER_CYCLE", 0.5)  # review + feedback + context switch per change-request cycle
STALLED_WEEKLY_HOURS = _env_float("ONRAMP_STALLED_WEEKLY_HOURS", 0.5)      # senior re-engagement (check-in / unblock) per stalled week
ONRAMP_PRICE_USD_PER_MONTH = _env_float("ONRAMP_PRICE_USD_PER_MONTH", 99.0)  # benchmark price per workspace per month (real Team pricing: $99/mo, unlimited engineers)

# Sensitivity band for the cost estimate (Phase 0 — the honest uncertainty
# range, per PROBLEM.md's working numbers: rate $75-100/hr, a review cycle
# costs 0.25-1.0h of senior attention). The estimate is a model, not a
# measurement — leadership sees the band, not a false-precision point.
SENSITIVITY_CYCLE_MIN_HOURS = 0.25
SENSITIVITY_CYCLE_MAX_HOURS = 1.0
SENSITIVITY_RATE_MIN_USD = 75.0
SENSITIVITY_RATE_MAX_USD = 100.0

# ── Detection thresholds ──────────────────────────────────────────────────
STALLED_DAYS = 5                     # open task untouched → stalled
PENDING_REVIEW_HOURS = 24            # submitted task waiting too long for review
INACTIVITY_DAYS = 7                  # no task activity → inactive
REVIEW_LOOP_CYCLES = 2               # ≥2 change-request cycles → review loop
QUESTION_LOOKBACK_DAYS = 90          # profile "questions asked" window
QUESTION_SPIKE_DAYS = 7              # self-serve question spike window
QUESTION_SPIKE_COUNT = 10            # ≥ this many questions in the window → spike
ALERT_COOLDOWN_HOURS = 24            # don't re-alert the same trainee more than once/day

# ── Health score targets (v1.6 — documented heuristics, not ML) ──────────
HEALTHY_RAMP_DAYS = 21.0             # ramp at/below this = full velocity score
HEALTHY_FIRST_PR_DAYS = 30.0         # first merged PR at/below this = full score
HEALTHY_TURNAROUND_HOURS = 24.0      # review turnaround above this starts costing
REVIEW_PENDING_PENALTY = 8.0         # points off per task waiting in review
STUCK_RATIO_PENALTY = 150.0          # stuck ratio × this = points off stuck health

# Dedupe markers live here so the sweep never double-fires.
ALERT_COLLECTION = "onramp_ramp_alerts"


# ── Helpers ───────────────────────────────────────────────────────────────

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
            return rows[0].get("name") or rows[0].get("email") or user_id
    except Exception:
        logger.exception("Failed to load user %s", user_id)
    return user_id


async def _questions_asked(storage, user_id: str, since_days: int | None = None) -> int:
    """Repo Q&A turns the trainee has asked (self-serve engagement proxy).

    ``since_days`` windows the count to recent questions (e.g. 7 for the spike
    signal, 90 for the profile readout). None counts all-time.
    """
    try:
        rows = await storage.query_documents(
            "onramp_conversations", [("user_id", "==", user_id)]
        )
    except Exception:
        return 0
    if since_days is None:
        return len(rows)
    cutoff = datetime.now(timezone.utc) - timedelta(days=since_days)
    return sum(
        1 for r in rows
        if (_parse_dt(r.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc)) >= cutoff
    )


def _first_completed(tasks: list[dict], user_id: str) -> Optional[datetime]:
    """Earliest completed_at across a user's tasks (their ramp milestone)."""
    first = None
    for t in tasks:
        if t.get("assigned_to") != user_id or t.get("state") != "completed":
            continue
        done = _parse_dt(t.get("completed_at")) or _parse_dt(t.get("updated_at"))
        if done is None:
            continue
        if first is None or done < first:
            first = done
    return first


def senior_hours_for_task(task: dict, settings: Optional[dict] = None) -> float:
    """Senior hours consumed by one task: review cycles + stalled re-engagement.

    ``settings`` (optional) carries per-team cost-model calibration
    (``review_hours_per_cycle`` / ``stalled_weekly_hours``); None falls back
    to the platform defaults.
    """
    settings = settings or {}
    cycle_hours = settings.get("review_hours_per_cycle", REVIEW_HOURS_PER_CYCLE)
    stall_hours = settings.get("stalled_weekly_hours", STALLED_WEEKLY_HOURS)
    cycles = int(task.get("review_cycles", 0) or 0)
    hours = cycles * cycle_hours
    if task.get("state") in ("assigned", "in_progress", "needs_changes"):
        updated = _parse_dt(task.get("updated_at")) or _parse_dt(task.get("created_at"))
        if updated:
            age_days = (datetime.now(timezone.utc) - updated).total_seconds() / 86400
            if age_days > STALLED_DAYS:
                hours += (age_days // 7) * stall_hours
    return round(hours, 2)


def senior_time_estimate(tasks: list[dict], settings: Optional[dict] = None) -> dict:
    """Senior hours + fully-loaded cost for a set of tasks.

    ``settings`` (optional) carries per-team cost-model calibration
    (``senior_hourly_rate_usd``); None falls back to the platform default.
    """
    settings = settings or {}
    rate = settings.get("senior_hourly_rate_usd", SENIOR_HOURLY_RATE_USD)
    hours = sum(senior_hours_for_task(t, settings) for t in tasks)
    return {
        "senior_hours": round(hours, 1),
        "senior_cost_usd": round(hours * rate),
    }


def _measured_cost_stats(tasks: list[dict]) -> dict:
    """Measured signals that bound the cost-model assumptions (Phase 0).

    Returns review-cycle count, the average *elapsed* hours from submission
    to review (an upper bound on senior attention — the 0.5h assumption
    claims the senior's own time, which elapsed time never undercuts), and
    the stalled re-engagement weeks actually accumulating on open tasks.
    """
    cycles = 0
    elapsed: list[float] = []
    stall_weeks = 0.0
    now = datetime.now(timezone.utc)
    for t in tasks:
        cycles += int(t.get("review_cycles", 0) or 0)
        sub = _parse_dt(t.get("submitted_at"))
        rev = _parse_dt(t.get("reviewed_at"))
        if sub and rev and rev >= sub:
            elapsed.append((rev - sub).total_seconds() / 3600)
        if t.get("state") in ("assigned", "in_progress", "needs_changes"):
            updated = _parse_dt(t.get("updated_at")) or _parse_dt(t.get("created_at"))
            if updated:
                age_days = (now - updated).total_seconds() / 86400
                if age_days > STALLED_DAYS:
                    stall_weeks += age_days // 7
    return {
        "review_cycles": cycles,
        "avg_cycle_elapsed_hours": round(sum(elapsed) / len(elapsed), 1) if elapsed else None,
        "stall_weeks": round(stall_weeks, 1),
    }


def cost_sensitivity(cycle_count: int, stall_weeks: float, settings: dict) -> dict:
    """Cost estimate over the assumption band (Phase 0 uncertainty range).

    Both assumptions vary together: cycle-hours across the 0.25-1.0h band
    and rate across the $75-100 band, so ``cost_low ≤ cost_current ≤
    cost_high`` by construction. Documented heuristic — see the constants.
    """
    cycle_hours = settings.get("review_hours_per_cycle", REVIEW_HOURS_PER_CYCLE)
    stall_hours = settings.get("stalled_weekly_hours", STALLED_WEEKLY_HOURS)
    rate = settings.get("senior_hourly_rate_usd", SENIOR_HOURLY_RATE_USD)

    def _cost(cycle_h: float, rate_usd: float) -> float:
        hours = cycle_count * cycle_h + stall_weeks * stall_hours
        return hours * rate_usd

    return {
        "cost_low": round(_cost(SENSITIVITY_CYCLE_MIN_HOURS, SENSITIVITY_RATE_MIN_USD)),
        "cost_current": round(_cost(cycle_hours, rate)),
        "cost_high": round(_cost(SENSITIVITY_CYCLE_MAX_HOURS, SENSITIVITY_RATE_MAX_USD)),
    }


# ── Ramp vs Onramp benchmark (tracking the cost story, React-scoped) ───────
#
# The ROI readout: how much the ramp burns in senior time vs. what Onramp
# costs — the flat per-workspace price, sourced live from the team's active
# subscription (INR→USD) when one exists, else the $99/mo platform default
# (or a team override). ``stack`` scopes the cost side to repos of one tech
# stack ("react"), and the team's detected stack is always reported so a
# React codebase is labelled honestly.

# Repo languages that count as a React codebase (the repo's primary language
# field — GitHub/Bitbucket/GitLab report these).
REACT_LANGS = {"javascript", "typescript", "tsx", "react", "jsx"}
BENCHMARK_SNAPSHOT_COLLECTION = "benchmark_snapshots"
DAYS_PER_MONTH = 30.44


def repo_stack(language: str) -> str:
    """Classify a repo's primary language into a benchmark stack bucket."""
    lang = (language or "").strip().lower()
    if not lang:
        return "unknown"
    return "react" if lang in REACT_LANGS else "other"


async def _team_repo_languages(storage, team_id: str) -> dict:
    """Normalized repo URL → stack bucket for a team's repositories."""
    try:
        repos = await storage.query_documents("repositories", [("team_id", "==", team_id)])
    except Exception:
        return {}
    mapping: dict[str, str] = {}
    for r in repos:
        url = (
            r.get("url")
            or f"https://github.com/{r.get('owner', '')}/{r.get('name', '')}"
        ).rstrip("/").lower()
        mapping[url] = repo_stack(r.get("language"))
    return mapping


async def ramp_vs_onramp_benchmark(team_id: str, stack: Optional[str] = None) -> dict:
    """The cost story, tracked: ramp senior-time cost vs Onramp at the flat
    per-workspace price (live subscription when one exists), optionally
    scoped to one tech stack.

    - ``stack`` ("react") filters the cost side to tasks whose repo matches
      that stack; the team's detected stacks are always reported so the
      number is labelled honestly (a team with zero React repos yields no
      React-scoped cost).
    - ``onramp_cost_usd`` = price × ramp window (team median days to first
      task, in months) — Onramp is a flat per-workspace fee ($99/mo,
      unlimited engineers), so the cost does not scale with headcount.
    - ``roi_multiple`` = senior cost ÷ Onramp cost — how many dollars of
      senior time every $1 of Onramp would offset in that window.
    """
    from app.services.team_cost_settings import get_team_cost_settings, resolve_benchmark_price

    storage = get_storage()
    members = await _team_members(storage, team_id)
    tasks = await _team_tasks(storage, team_id)
    repo_stacks = await _team_repo_languages(storage, team_id)
    settings = await get_team_cost_settings(team_id)
    # Benchmark price: explicit team override → live subscription (INR→USD)
    # → platform default. ``price_source`` labels which one won.
    price_info = await resolve_benchmark_price(team_id)

    trainees = [m for m in members if (m.get("role") or "").lower() in TRAINEE_ROLES]
    trainee_ids = {t["user_id"] for t in trainees}
    trainee_tasks = [t for t in tasks if t.get("assigned_to") in trainee_ids]

    # Detected stacks across the team's repos (honest labelling): "mixed"
    # when several stacks, else the single stack, else "unknown".
    stacks_present = sorted({s for s in repo_stacks.values() if s != "unknown"})
    team_is_react = "react" in stacks_present

    # Stack filter: keep only tasks whose repo matches the requested stack.
    if stack and stack != "any":
        def _matches(t: dict) -> bool:
            url = (t.get("repo_url") or "").rstrip("/").lower()
            return repo_stacks.get(url) == stack

        scoped = [t for t in trainee_tasks if _matches(t)]
    else:
        scoped = trainee_tasks

    est = senior_time_estimate(scoped, settings)
    senior_hours = est["senior_hours"]
    senior_cost = est["senior_cost_usd"]

    # Ramp window (team median days to first task) — the comparison window.
    ramp_days: Optional[float] = None
    values: list[float] = []
    for t in trainees:
        joined = _parse_dt(t.get("joined_at"))
        first = _first_completed(tasks, t["user_id"])
        if joined and first and first >= joined:
            values.append((first - joined).total_seconds() / 86400)
    if values:
        ramp_days = round(median(values), 1)
    window_months = round((ramp_days or 0.0) / DAYS_PER_MONTH, 2)

    price = price_info["price_usd"]
    onramp_cost = round(price * window_months)
    roi = round(senior_cost / max(onramp_cost, 1), 1)

    team_stack = (
        "mixed" if len(stacks_present) > 1
        else (stacks_present[0] if stacks_present else "unknown")
    )
    return {
        "team_id": team_id,
        "stack": stack or "all",
        "team_stack": team_stack,
        "stacks_present": stacks_present,
        "repo_count": len(repo_stacks),
        "trainee_count": len(trainees),
        "task_count": len(scoped),
        "ramp_window_days": ramp_days,
        "ramp_window_months": window_months,
        "senior_hours": round(senior_hours, 1),
        "senior_cost_usd": senior_cost,
        "onramp_price_usd_per_month": round(price, 2),
        "price_source": price_info["price_source"],
        "onramp_price_inr": price_info.get("price_inr"),
        "onramp_cost_usd": onramp_cost,
        "roi_multiple": roi,
        "settings_source": settings.get("source", "platform"),
        "generated_at": datetime.now(timezone.utc),
    }


async def record_benchmark_snapshot(team_id: str, user_id: str, stack: Optional[str] = None) -> dict:
    """Store a point-in-time benchmark so the cost story tracks over time."""
    bench = await ramp_vs_onramp_benchmark(team_id, stack)
    record = {
        "team_id": team_id,
        "recorded_by": user_id,
        "stack": bench["stack"],
        "team_stack": bench["team_stack"],
        "trainee_count": bench["trainee_count"],
        "senior_hours": bench["senior_hours"],
        "senior_cost_usd": bench["senior_cost_usd"],
        "onramp_cost_usd": bench["onramp_cost_usd"],
        "roi_multiple": bench["roi_multiple"],
        "onramp_price_usd_per_month": bench["onramp_price_usd_per_month"],
        "price_source": bench.get("price_source", "platform"),
        "onramp_price_inr": bench.get("onramp_price_inr"),
        "generated_at": bench["generated_at"],
    }
    await get_storage().create_document(
        BENCHMARK_SNAPSHOT_COLLECTION, generate_id(), record
    )
    return record


async def get_benchmark_history(team_id: str, stack: Optional[str] = None, limit: int = 30) -> list[dict]:
    """Recent benchmark snapshots for a team (newest first)."""
    filters = [("team_id", "==", team_id)]
    if stack and stack != "any":
        filters.append(("stack", "==", stack))
    try:
        rows = await get_storage().query_documents(BENCHMARK_SNAPSHOT_COLLECTION, filters)
    except Exception:
        return []
    rows.sort(key=lambda r: str(r.get("generated_at") or ""), reverse=True)
    return rows[:limit]


async def _earliest_pr_merged(storage, github_login: str) -> Optional[datetime]:
    """Earliest GitHub `pr_merged` milestone timestamp for a login (webhook data)."""
    if not github_login:
        return None
    try:
        rows = await storage.query_documents(
            "onramp_milestones",
            [("user", "==", github_login), ("type", "==", "pr_merged")],
        )
    except Exception:
        return None
    times = [t for t in (_parse_dt(r.get("timestamp")) for r in rows) if t]
    return min(times) if times else None


def _first_pr_merged_from_tasks(tasks: list[dict]) -> Optional[datetime]:
    """Earliest ``pr_merged_at`` stamped across a trainee's tasks.

    The merge webhook stamps ``pr_merged_at`` on the task it auto-completes
    (attribution = task assignee), so this works for teams WITHOUT linked
    GitHub accounts — no login→user mapping required. Task state is
    deliberately ignored: a stamp reflects a real GitHub merge, which is the
    ground truth for "time to first merged PR" even if the onramp task was
    later cancelled.
    """
    times = [t for t in (_parse_dt(x.get("pr_merged_at")) for x in tasks) if t is not None]
    return min(times) if times else None


def stuck_signals(user_id: str, tasks: list[dict], questions_7d: int = 0) -> list[dict]:
    """Rule-based stuck signals for one trainee's tasks (empty = not stuck)."""
    now = datetime.now(timezone.utc)
    signals: list[dict] = []

    for t in tasks:
        state = t.get("state")
        updated = _parse_dt(t.get("updated_at")) or _parse_dt(t.get("created_at"))
        if updated is None:
            continue
        age_hours = (now - updated).total_seconds() / 3600
        if state in ("assigned", "in_progress", "needs_changes") and age_hours > STALLED_DAYS * 24:
            signals.append({
                "code": "stalled_task",
                "label": "Task stalled",
                "detail": (
                    f"\"{t.get('title', '')}\" in '{state}' untouched for "
                    f"{age_hours / 24:.0f}d"
                ),
                "task_id": t.get("task_id"),
                "since_days": round(age_hours / 24, 1),
            })
        elif state in ("submitted", "under_review", "peer_review") and age_hours > PENDING_REVIEW_HOURS:
            signals.append({
                "code": "pending_review_timeout",
                "label": "Review waiting",
                "detail": f"\"{t.get('title', '')}\" waiting for review {age_hours / 24:.1f}d",
                "task_id": t.get("task_id"),
                "since_days": round(age_hours / 24, 1),
            })

    cycles = sum(int(t.get("review_cycles", 0) or 0) for t in tasks)
    if cycles >= REVIEW_LOOP_CYCLES:
        signals.append({
            "code": "review_loop",
            "label": "Repeated review failures",
            "detail": f"{cycles} change-request cycles across tasks",
            "task_id": None,
            "since_days": None,
        })

    # Inactivity: has OPEN work but nothing updated for INACTIVITY_DAYS. A
    # trainee whose tasks are all completed/cancelled is NOT stuck — they've
    # finished; flagging them as "no activity" would false-positive healthy,
    # fully-ramped teams (and drag down the v1.6 health score).
    has_open_work = any(
        t.get("state") not in ("completed", "cancelled") for t in tasks
    )
    if has_open_work:
        updates = [
            d for d in (
                _parse_dt(t.get("updated_at")) or _parse_dt(t.get("created_at"))
                for t in tasks
            ) if d is not None
        ]
        if updates:
            idle_days = (now - max(updates)).total_seconds() / 86400
            if idle_days > INACTIVITY_DAYS:
                signals.append({
                    "code": "inactivity",
                    "label": "No activity",
                    "detail": f"No task updates for {idle_days:.0f}d",
                    "task_id": None,
                    "since_days": round(idle_days, 1),
                })

    # Self-serve question spike: a flood of Ask questions can mean the trainee
    # is spinning without a senior — route them to guided self-serve instead.
    if questions_7d >= QUESTION_SPIKE_COUNT:
        signals.append({
            "code": "question_spike",
            "label": "Question spike",
            "detail": (
                f"{questions_7d} questions asked in the last {QUESTION_SPIKE_DAYS}d "
                "— route to guided self-serve"
            ),
            "task_id": None,
            "since_days": None,
        })

    return signals


def _severity(signals: list[dict]) -> str:
    if not signals:
        return "none"
    if len(signals) >= 2 or any(s.get("code") == "review_loop" for s in signals):
        return "high"
    return "medium"


# ── Track + Quantify ──────────────────────────────────────────────────────

async def get_ramp_summary(team_id: str) -> dict:
    """Per-trainee ramp profiles + team benchmark + senior-time cost estimate."""
    storage = get_storage()
    members = await _team_members(storage, team_id)
    tasks = await _team_tasks(storage, team_id)

    # Phase 0: effective cost-model calibration — team override → platform
    # default (lazy import: team_cost_settings imports this module).
    from app.services.team_cost_settings import get_team_cost_settings

    cost_settings = await get_team_cost_settings(team_id)
    measured = _measured_cost_stats(tasks)
    cycle_count = measured["review_cycles"]
    stall_weeks = measured["stall_weeks"]

    trainees = [
        m for m in members if (m.get("role") or "").lower() in TRAINEE_ROLES
    ]
    tasks_by_user = {
        t["user_id"]: [x for x in tasks if x.get("assigned_to") == t["user_id"]]
        for t in trainees
    }

    # GitHub identity map (trainee id → github_username) for webhook PR-merge
    # tracking. Milestones are keyed by the GitHub *login* (what oauth_service
    # stores as github_username), so github_id (a numeric account id) would
    # never match and is deliberately not used as a fallback. Users with no
    # GitHub link fall back to the task-completion ramp day (the webhook data
    # is a refinement, not a requirement).
    github_by_user: dict[str, str] = {}
    if trainees:
        try:
            user_rows = await storage.query_documents(
                "users", [("id", "in", [t["user_id"] for t in trainees])]
            )
        except Exception:
            user_rows = []
        for u in user_rows:
            gh = u.get("github_username")
            if gh:
                github_by_user[u["id"]] = gh

    # Benchmark: median days joined_at → first completed task across the team.
    ramp_values: list[float] = []
    for t in trainees:
        joined = _parse_dt(t.get("joined_at"))
        first = _first_completed(tasks, t["user_id"])
        if joined and first and first >= joined:
            ramp_values.append((first - joined).total_seconds() / 86400)
    benchmark_days = round(median(ramp_values), 1) if ramp_values else None

    profiles = []
    total_hours = 0.0
    for t in trainees:
        uid = t["user_id"]
        ts = tasks_by_user[uid]
        joined = _parse_dt(t.get("joined_at"))
        first = _first_completed(tasks, uid)
        ramp_days: Optional[float] = None
        if joined and first and first >= joined:
            ramp_days = round((first - joined).total_seconds() / 86400, 1)
        completed = sum(1 for x in ts if x.get("state") == "completed")
        total = len(ts)
        review_cycles = sum(int(x.get("review_cycles", 0) or 0) for x in ts)
        needed_changes = sum(
            1 for x in ts
            if int(x.get("review_cycles", 0) or 0) > 0 or x.get("state") == "needs_changes"
        )
        est = senior_time_estimate(ts, cost_settings)
        total_hours += est["senior_hours"]

        # Real PR-merge timing — primary source is the GitHub milestone webhook
        # (login-keyed, needs a linked account); fall back to the merge stamp
        # on the trainee's own tasks, which the webhook writes regardless of
        # account linking (``pr_merged_at`` on the auto-completed task).
        first_pr = await _earliest_pr_merged(storage, github_by_user.get(uid, ""))
        first_pr_source: Optional[str] = "github" if first_pr else None
        if first_pr is None:
            first_pr = _first_pr_merged_from_tasks(ts)
            if first_pr is not None:
                first_pr_source = "task"
        days_to_first_pr: Optional[float] = None
        if joined and first_pr and first_pr >= joined:
            days_to_first_pr = round((first_pr - joined).total_seconds() / 86400, 1)

        questions_90 = await _questions_asked(storage, uid, since_days=QUESTION_LOOKBACK_DAYS)
        questions_7 = await _questions_asked(storage, uid, since_days=QUESTION_SPIKE_DAYS)
        signals = stuck_signals(uid, ts, questions_7d=questions_7)
        profiles.append({
            "user_id": uid,
            "name": await _user_name(storage, uid),
            "role": t.get("role"),
            "joined_at": t.get("joined_at"),
            "ramp_days": ramp_days,
            "first_pr_at": first_pr.isoformat() if first_pr else None,
            "days_to_first_pr": days_to_first_pr,
            "first_pr_source": first_pr_source,
            "benchmark_days": benchmark_days,
            "vs_benchmark_days": (
                round(ramp_days - benchmark_days, 1)
                if ramp_days is not None and benchmark_days is not None else None
            ),
            "tasks_total": total,
            "tasks_completed": completed,
            "completion_pct": round(completed / total * 100, 1) if total else 0.0,
            "review_cycles": review_cycles,
            "tasks_needing_changes": needed_changes,
            "questions_asked": questions_90,
            "questions_asked_7d": questions_7,
            "senior_hours": est["senior_hours"],
            "senior_cost_usd": est["senior_cost_usd"],
            "stuck": signals,
            "stuck_severity": _severity(signals),
        })

    # Not-yet-ramped first, then slowest ramp first within each group.
    profiles.sort(key=lambda p: (p["ramp_days"] is not None, -(p["ramp_days"] or 0)))

    stuck = [
        {
            "user_id": p["user_id"],
            "name": p["name"],
            "role": p["role"],
            "severity": p["stuck_severity"],
            "signals": p["stuck"],
            "senior_cost_usd": p["senior_cost_usd"],
        }
        for p in profiles if p["stuck"]
    ]
    stuck.sort(key=lambda s: (s["severity"] != "high", -s["senior_cost_usd"]))

    return {
        "team_id": team_id,
        "generated_at": datetime.now(timezone.utc),
        "benchmark_days": benchmark_days,
        "first_pr_benchmark_days": _median_first_pr(profiles),
        "trainee_count": len(profiles),
        "ramped_count": sum(1 for p in profiles if p["ramp_days"] is not None),
        "profiles": profiles,
        "totals": {
            "senior_hours": round(total_hours, 1),
            "senior_cost_usd": round(total_hours * cost_settings["senior_hourly_rate_usd"]),
        },
        "cost_model": {
            # Effective assumptions in use + where they came from (Phase 0).
            "settings": {
                "senior_hourly_rate_usd": round(cost_settings["senior_hourly_rate_usd"], 2),
                "review_hours_per_cycle": round(cost_settings["review_hours_per_cycle"], 2),
                "stalled_weekly_hours": round(cost_settings["stalled_weekly_hours"], 2),
            },
            "source": cost_settings.get("source", "platform"),
            # Measured signals that bound the assumptions (what actually
            # happened vs. what the model claims).
            "measured": measured,
            # The honest uncertainty range on the estimate.
            "sensitivity": cost_sensitivity(cycle_count, stall_weeks, cost_settings),
        },
        "stuck": {
            "team_id": team_id,
            "stuck": stuck,
            "count": len(stuck),
            "generated_at": datetime.now(timezone.utc),
        },
    }


def _median_first_pr(profiles: list[dict]) -> Optional[float]:
    """Median days-to-first-merged-PR across the team (None when no data)."""
    values = [p["days_to_first_pr"] for p in profiles if p.get("days_to_first_pr") is not None]
    return round(median(values), 1) if values else None


async def detect_stuck(team_id: str) -> dict:
    """Current stuck-dev list for a team (read-only, no notifications)."""
    summary = await get_ramp_summary(team_id)
    return summary["stuck"]


# ── Intercept ─────────────────────────────────────────────────────────────

async def _last_alert_time(storage, team_id: str, user_id: str) -> Optional[datetime]:
    try:
        rows = await storage.query_documents(
            ALERT_COLLECTION,
            [("team_id", "==", team_id), ("user_id", "==", user_id)],
        )
    except Exception:
        return None
    times = [t for t in (_parse_dt(r.get("alerted_at")) for r in rows) if t]
    return max(times) if times else None


async def fire_stuck_alerts(team_id: str) -> dict:
    """Detect stuck trainees and notify leaders + trainee (deduped, ≤1/day).

    Returns ``{"alerts_fired", "skipped", "stuck_count"}``. Best-effort: a
    notification failure is logged and never breaks the sweep.
    """
    storage = get_storage()
    detection = await detect_stuck(team_id)
    members = await _team_members(storage, team_id)
    leader_ids = [
        m["user_id"] for m in members
        if (m.get("role") or "").lower() in LEADER_ROLES
    ]
    now = datetime.now(timezone.utc)

    fired = 0
    skipped = 0
    for s in detection.get("stuck", []):
        last = await _last_alert_time(storage, team_id, s["user_id"])
        if last is not None and (now - last).total_seconds() / 3600 < ALERT_COOLDOWN_HOURS:
            skipped += 1
            continue

        # Record the dedupe marker BEFORE dispatching: this guarantees a
        # crash mid-dispatch never double-fires the same stuck dev — at the
        # cost that a crash before dispatch loses this alert until the 24h
        # cooldown expires (prefer losing one alert over spamming leaders).
        try:
            await storage.create_document(ALERT_COLLECTION, generate_id(), {
                "team_id": team_id,
                "user_id": s["user_id"],
                "severity": s["severity"],
                "signals": s["signals"],
                "alerted_at": now,
            })
        except Exception:
            logger.exception("Failed to record ramp alert marker for %s", s["user_id"])
            continue

        try:
            from app.services.notification_helpers import notify_dev_stuck

            await notify_dev_stuck(
                trainee=s,
                leader_ids=leader_ids,
                signals=s.get("signals", []),
                severity=s.get("severity", "medium"),
                team_id=team_id,
            )
            fired += 1
        except Exception:
            logger.exception("Failed to dispatch dev_stuck alerts for %s", s["user_id"])

    return {"alerts_fired": fired, "skipped": skipped, "stuck_count": detection.get("count", 0)}


# ── Org ramp health (v1.6 — P3: blind leaders) ─────────────────────────────


def _clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))


def _health_component(score: float, weight: float, detail: str) -> dict:
    return {"score": round(_clamp(score)), "weight": weight, "detail": detail}


def _health_grade(score: Optional[int]) -> str:
    if score is None:
        return "no_data"
    if score >= 80:
        return "healthy"
    if score >= 50:
        return "at_risk"
    return "critical"


async def ramp_health(team_id: str) -> dict:
    """Org-level ramp health score — one number from the P1+P2 data.

    Composite 0-100 (documented heuristic, components exposed for drill-down):

    - ``ramp_velocity``   (20%) — blend of % trainees ramped and ramp speed vs
      the HEALTHY_RAMP_DAYS target (21d).
    - ``completion``      (15%) — average task completion % across trainees.
    - ``stuck_health``    (20%) — inverse of the stuck-dev ratio (150 pts off
      per full stuck ratio).
    - ``review_health``   (15%) — inverse of pending reviews (8 pts each) and
      review turnaround beyond HEALTHY_TURNAROUND_HOURS (2 pts/hr).
    - ``first_pr``        (15%) — speed to first merged PR vs the 30d target;
      neutral (100) when the team has no first-PR data yet.
    - ``attrition_health`` (15%) — inverse of the HR attrition-risk ratio
      (150 pts off per full at-risk ratio; stalled tasks / lost streaks).

    Grade: healthy ≥80 · at_risk 50-79 · critical <50 · no_data (no trainees).
    ``at_risk_count`` (HR attrition flags) is both exposed at the top level
    and weighted into the composite via ``attrition_health``.
    """
    summary = await get_ramp_summary(team_id)
    profiles = summary.get("profiles", [])
    trainee_count = summary.get("trainee_count", 0)
    stuck_count = summary.get("stuck", {}).get("count", 0)

    if trainee_count == 0 or not profiles:
        return {
            "team_id": team_id,
            "health_score": None,
            "grade": "no_data",
            "trainee_count": 0,
            "stuck_count": 0,
            "at_risk_count": 0,
            "components": {},
            "generated_at": datetime.now(timezone.utc),
        }

    # Ramp velocity: half momentum (% ramped), half speed vs the 21d target.
    ramped_ratio = summary.get("ramped_count", 0) / trainee_count
    benchmark = summary.get("benchmark_days")
    speed = 0.0 if benchmark is None else 100.0 - (benchmark / HEALTHY_RAMP_DAYS) * 100.0
    velocity = 0.5 * ramped_ratio * 100.0 + 0.5 * _clamp(speed)

    completion = sum(p.get("completion_pct", 0.0) for p in profiles) / trainee_count

    stuck_health = 100.0 - (stuck_count / trainee_count) * STUCK_RATIO_PENALTY

    # Review health rides the HR review analytics (P2 data).
    try:
        review = await review_analytics(team_id)
        pending = int(review.get("pending_review_count", 0) or 0)
        turnaround = review.get("avg_review_turnaround_hours")
        over = max(0.0, (turnaround or 0.0) - HEALTHY_TURNAROUND_HOURS)
        review_health = 100.0 - pending * REVIEW_PENDING_PENALTY - over * 2.0
    except Exception:
        logger.exception("Review health unavailable for team %s", team_id)
        review_health = 100.0
        pending = 0
        turnaround = None  # keep the component detail string safe below

    first_pr_benchmark = summary.get("first_pr_benchmark_days")
    first_pr_health = (
        100.0 if first_pr_benchmark is None
        else 100.0 - (first_pr_benchmark / HEALTHY_FIRST_PR_DAYS) * 100.0
    )

    # Attrition health (v1.6 wave 2): HR attrition flags are now a weighted
    # component, not just context — same shape as stuck_health (150 pts off
    # per full at-risk ratio), so a team with half its trainees flagged sits
    # at 25/100 on this axis.
    try:
        at_risk = int((await attrition_risk(team_id)).get("at_risk_count", 0) or 0)
    except Exception:
        logger.exception("Attrition risk unavailable for team %s", team_id)
        at_risk = 0
    attrition_health = 100.0 - (at_risk / trainee_count) * STUCK_RATIO_PENALTY

    components = {
        "ramp_velocity": _health_component(
            velocity, 0.20,
            f"{summary.get('ramped_count', 0)}/{trainee_count} ramped"
            + (f" · median {benchmark}d" if benchmark is not None else " · no ramp yet"),
        ),
        "completion": _health_component(
            completion, 0.15,
            f"avg {round(completion, 1)}% tasks completed",
        ),
        "stuck_health": _health_component(
            stuck_health, 0.20,
            f"{stuck_count} stuck dev{'' if stuck_count == 1 else 's'} of {trainee_count}",
        ),
        "review_health": _health_component(
            review_health, 0.15,
            f"{pending} pending review"
            + (f" · avg {turnaround}h" if turnaround is not None else " · no review data"),
        ),
        "first_pr": _health_component(
            first_pr_health, 0.15,
            ("no first-PR data yet (neutral)" if first_pr_benchmark is None
             else f"median {first_pr_benchmark}d to first merged PR"),
        ),
        "attrition_health": _health_component(
            attrition_health, 0.15,
            f"{at_risk} of {trainee_count} trainees at risk"
            + ("" if at_risk == 0 else " · stalled task / lost streak"),
        ),
    }

    score = round(
        sum(c["score"] * c["weight"] for c in components.values())
    )

    return {
        "team_id": team_id,
        "health_score": score,
        "grade": _health_grade(score),
        "trainee_count": trainee_count,
        "stuck_count": stuck_count,
        "at_risk_count": at_risk,
        "components": components,
        "generated_at": datetime.now(timezone.utc),
    }
