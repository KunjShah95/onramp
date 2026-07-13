from fastapi import APIRouter, Depends, Query, Request
from datetime import datetime, timedelta, timezone
from typing import Optional
from app.services.usage_tracker import UsageTracker
from app.services.billing_service import BillingService
from app.api.v1.auth import get_current_user
from app.services.team_service import get_team_members, get_user_teams
from app.services.task_service import (
    list_tasks,
    get_team_progress,
    get_user_progress,
)
from app.services.access_control_service import get_user_modules
from app.services.contributor_tracker import ContributorTracker
from app.services.cache_service import cached

router = APIRouter(tags=["dashboard"])

_usage = UsageTracker()
_billing = BillingService()
_tracker = ContributorTracker()


async def _get_user_team(user: dict) -> str:
    """Get the first team the user belongs to, or use their user_id as org scope."""
    teams = await get_user_teams(user.get("uid", ""))
    if teams:
        return teams[0].get("team_id") or teams[0].get("id") or user.get("uid")
    return user.get("uid")


@router.get("/dashboard/cto")
@cached("dashboard", ttl=120)
async def cto_dashboard(request: Request, user: dict = Depends(get_current_user)):
    """Return aggregated senior/team-lead dashboard metrics from real data."""
    team_id = await _get_user_team(user)

    # ── Task progress ────────────────────────────────────────
    team_progress = await get_team_progress(team_id)
    all_tasks = await list_tasks(team_id=team_id)

    # Tasks pending review (submitted + under_review)
    pending_review_tasks = [t for t in all_tasks if t.get("state") in ("submitted", "under_review")]

    # Recent activity: last 10 task changes
    recent_tasks = sorted(all_tasks, key=lambda t: t.get("updated_at", ""), reverse=True)[:10]
    recent_activity = []
    for t in recent_tasks:
        recent_activity.append({
            "task_id": t.get("task_id"),
            "title": t.get("title"),
            "state": t.get("state"),
            "assigned_to": t.get("assigned_to"),
            "module": t.get("module"),
            "updated_at": t.get("updated_at"),
        })

    # ── Milestones from ContributorTracker ───────────────────
    milestone_summary = await _tracker.get_milestone_summary()
    milestones = milestone_summary.get("breakdown", {})
    unique_users = milestone_summary.get("unique_users", 0)

    # ── Per-member progress ──────────────────────────────────
    members = await get_team_members(team_id)
    member_progress = []
    for m in members:
        uid = m.get("user_id") or m.get("uid") or m.get("id", "")
        name = m.get("name") or m.get("email", "") or uid
        role = m.get("role", "member")
        up = await get_user_progress(uid, team_id=team_id)
        member_progress.append({
            "user_id": uid,
            "name": name.split("@")[0],  # fallback to name part before @
            "role": role,
            **up,  # total, completed, in_progress, pending_review, modules_unlocked, completion_rate
        })

    # Sort by completion rate descending
    member_progress.sort(key=lambda m: m.get("completion_rate", 0), reverse=True)

    # ── Actions (derived from state) ─────────────────────────
    actions = []
    needs_review = [t for t in all_tasks if t.get("state") in ("submitted", "under_review")]
    for t in needs_review[:5]:
        actions.append({
            "title": f"Review: {t.get('title', '')}",
            "subtitle": f"{'PR submitted' if t.get('pr_url') else 'Ready for review'} · {t.get('module', '')}",
            "severity": "info",
        })

    needs_changes = [t for t in all_tasks if t.get("state") == "needs_changes"]
    for t in needs_changes[:3]:
        actions.append({
            "title": f"Blocked: {t.get('title', '')}",
            "subtitle": "Changes requested, awaiting update",
            "severity": "warning",
        })

    product_reviews = [t for t in all_tasks if t.get("state") == "product_review"]
    for t in product_reviews[:3]:
        actions.append({
            "title": f"Product sign-off: {t.get('title', '')}",
            "subtitle": "Awaiting product team approval",
            "severity": "info",
        })

    return {
        # Aggregate metrics
        "total_tasks": team_progress.get("total", 0),
        "completed_tasks": team_progress.get("completed", 0),
        "in_progress_tasks": team_progress.get("in_progress", 0),
        "pending_review_tasks": team_progress.get("pending_review", 0),
        "blocked_tasks": team_progress.get("blocked", 0),
        "completion_rate": round(
            (team_progress.get("completed", 0) / max(team_progress.get("total", 1), 1)) * 100,
            1
        ),
        # Team composition
        "total_members": len(members),
        "total_trainees": sum(1 for m in member_progress if m.get("role") == "member"),
        # Milestones
        "total_milestones": milestone_summary.get("total_milestones", 0),
        "unique_contributors": unique_users,
        "first_prs_merged": milestones.get("pr_merged", 0),
        # Per-member breakdown
        "member_progress": member_progress,
        # Active items
        "pending_reviews": [
            {
                "task_id": t.get("task_id"),
                "title": t.get("title"),
                "assigned_to": t.get("assigned_to"),
                "module": t.get("module"),
                "pr_url": t.get("pr_url"),
                "state": t.get("state"),
                "created_at": t.get("created_at"),
            }
            for t in pending_review_tasks[:10]
        ],
        "recent_activity": recent_activity,
        "actions": actions[:8],
    }


@router.get("/dashboard/team")
async def team_analytics(user: dict = Depends(get_current_user)):
    """Return team analytics with per-user task completion data."""
    team_id = await _get_user_team(user)
    members = await get_team_members(team_id)

    member_list = []
    for m in members:
        uid = m.get("user_id") or m.get("uid") or m.get("id", "")
        name = m.get("name") or m.get("email", "") or uid
        role = m.get("role", "member")
        up = await get_user_progress(uid, team_id=team_id)

        member_list.append({
            "name": name.split("@")[0],
            "user_id": uid,
            "role": role,
            "total_tasks": up.get("total", 0),
            "completed_tasks": up.get("completed", 0),
            "in_progress_tasks": up.get("in_progress", 0),
            "pending_review": up.get("pending_review", 0),
            "modules_unlocked": up.get("modules_unlocked", []),
            "completion_rate": up.get("completion_rate", 0),
        })

    member_list.sort(key=lambda m: m.get("completion_rate", 0), reverse=True)

    return {"members": member_list}


@router.get("/dashboard/trainee")
async def trainee_dashboard(
    team_id: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    uid = user.get("uid", "")
    if not team_id:
        teams = await get_user_teams(uid)
        team_id = teams[0].get("team_id") if teams else uid

    progress = await get_user_progress(uid, team_id=team_id)
    my_tasks = await list_tasks(team_id=team_id, assigned_to=uid)
    modules = await get_user_modules(team_id, uid)

    recent = sorted(my_tasks, key=lambda t: t.get("updated_at", ""), reverse=True)[:10]

    return {
        "user_id": uid,
        "user_name": user.get("name", "") or user.get("email", ""),
        "team_id": team_id,
        "progress": progress,
        "modules": [
            {
                "module": m.get("module", ""),
                "granted_at": m.get("granted_at", ""),
                "source": m.get("source", ""),
            }
            for m in modules
        ],
        "recent_tasks": [
            {
                "task_id": t.get("task_id"),
                "title": t.get("title"),
                "state": t.get("state"),
                "module": t.get("module"),
                "priority": t.get("priority"),
                "updated_at": t.get("updated_at"),
            }
            for t in recent
        ],
    }


@router.get("/usage/dashboard")
async def usage_dashboard(user: dict = Depends(get_current_user)):
    """Return comprehensive usage dashboard for the user's team/org."""
    org_name = await _get_user_team(user)

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=7)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    month_usage = await _usage.get_usage(org_name, period="month")
    week_usage = await _usage.get_usage(org_name, period="week")
    day_usage = await _usage.get_usage(org_name, period="day")

    sub = await _billing.get_subscription(org_name)
    tier = sub.get("tier") if sub else "free"
    limits = BillingService.get_pricing().get(tier, BillingService.get_pricing()["free"])

    return {
        "org_name": org_name,
        "tier": tier,
        "limits": {
            "monthly_credits": limits.get("features", [])[2] if len(limits.get("features", [])) > 2 else "N/A",
        },
        "periods": {
            "month": {
                "total_credits": month_usage.get("total_credits", 0),
                "total_requests": month_usage.get("total_requests", 0),
                "endpoint_breakdown": month_usage.get("endpoint_breakdown", {}),
            },
            "week": {
                "total_credits": week_usage.get("total_credits", 0),
                "total_requests": week_usage.get("total_requests", 0),
                "endpoint_breakdown": week_usage.get("endpoint_breakdown", {}),
            },
            "day": {
                "total_credits": day_usage.get("total_credits", 0),
                "total_requests": day_usage.get("total_requests", 0),
                "endpoint_breakdown": day_usage.get("endpoint_breakdown", {}),
            },
        },
        "quota": await _usage.check_quota(org_name, {"credits_per_month": 5000}),
    }
