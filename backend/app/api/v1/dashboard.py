from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timedelta
from app.services.usage_tracker import UsageTracker
from app.services.billing_service import BillingService
from app.api.v1.auth import get_current_user
from app.services.team_service import get_team_members

router = APIRouter(tags=["dashboard"])

_usage = UsageTracker()
_billing = BillingService()

@router.get("/repos")
async def list_repos():
    """Return the list of tracked repositories for the team."""
    return {
        "repos": [
            {
                "id": "1",
                "name": "codeflow-core",
                "owner": "engineering-team",
                "status": "ready",
                "last_analyzed": "2026-06-15T10:00:00Z",
                "description": "Core backend engine for CodeFlow.",
                "language": "Python",
            },
            {
                "id": "2",
                "name": "frontend-app",
                "owner": "engineering-team",
                "status": "analyzing",
                "last_analyzed": "2026-06-14T08:30:00Z",
                "description": "Main React application.",
                "language": "TypeScript",
            }
        ]
    }


@router.get("/dashboard/cto")
async def cto_dashboard():
    """Return aggregated CTO dashboard metrics for CodeFlow."""
    return {
        "total_repos": 14,
        "onboarding_time_saved_hours": 320,
        "first_prs_merged": 45,
        "learning_paths_generated": 112,
        "actions": [
            {
                "title": "Review onboarding path for 'frontend-app'",
                "subtitle": "2 new junior devs assigned",
                "severity": "info",
            },
            {
                "title": "Architecture health warning in 'payment-service'",
                "subtitle": "Circular dependencies detected",
                "severity": "warning",
            }
        ],
        "services": [
            {"name": "API Gateway", "status": "healthy"},
            {"name": "LLM Provider", "status": "healthy"},
            {"name": "Graph Database", "status": "healthy"},
            {"name": "Redis Cache", "status": "healthy"},
        ],
    }


@router.get("/dashboard/team")
async def team_analytics():
    """Return team analytics data for CodeFlow usage."""
    return {
        "members": [
            {"name": "Alice Chen", "role": "Junior", "paths_completed": 3, "prs_merged": 2},
            {"name": "Bob Martinez", "role": "Senior", "paths_completed": 0, "prs_merged": 15},
            {"name": "Carol Johnson", "role": "Junior", "paths_completed": 5, "prs_merged": 4},
        ]
    }


@router.get("/roadmap")
async def list_roadmap():
    """Return the CodeFlow 2.0 project roadmap milestones."""
    return {
        "milestones": [
            {
                "id": "1",
                "title": "Phase 1: Agent Layer",
                "phase": "Phase 1",
                "status": "completed",
                "progress": 100,
            },
            {
                "id": "2",
                "title": "Phase 2 & 3: Enhancers & Differentiators",
                "phase": "Phase 2",
                "status": "completed",
                "progress": 100,
            },
            {
                "id": "3",
                "title": "Phase 4: AIaaS Launch",
                "phase": "Phase 4",
                "status": "active",
                "progress": 60,
            },
            {
                "id": "4",
                "title": "Phase 5: SaaS Dashboard",
                "phase": "Phase 5",
                "status": "active",
                "progress": 30,
            },
        ]
    }


@router.get("/tasks")
async def list_tasks():
    """Return the list of active onboarding tasks."""
    return {
        "tasks": [
            {"id": "1", "title": "Complete React component learning path", "status": "in_progress", "priority": "high"},
            {"id": "2", "title": "Fix bug #124 (First PR)", "status": "pending", "priority": "medium"},
            {"id": "3", "title": "Read Architecture Document", "status": "completed", "priority": "high"},
        ]
    }


@router.get("/repos/{owner}/{repo}/analysis")
async def repo_analysis(owner: str, repo: str):
    """Return CodeFlow analysis summary for a specific repository."""
    return {
        "graph": {"nodes": 1247, "edges": 3892},
        "learning_paths": 4,
        "first_issues_identified": 12,
        "health_score": 85,
        "owner": owner,
        "repo": repo,
    }


@router.get("/repos/{owner}/{repo}/sections")
async def repo_sections(owner: str, repo: str):
    """Return the CodeFlow sections overview for a specific repository."""
    return {
        "sections": [
            {
                "title": "Architecture Explorer",
                "description": "Interactive graph of the codebase",
                "detail": "1,247 nodes · 3,892 edges",
            },
            {
                "title": "Learning Paths",
                "description": "Generated curriculum for onboarding",
                "detail": "4 active paths",
            },
            {
                "title": "First PR Accelerator",
                "description": "Curated starter issues",
                "detail": "12 issues ready",
            },
            {
                "title": "Repository Health",
                "description": "Codebase maintainability score",
                "detail": "85/100 score",
            },
        ],
        "owner": owner,
        "repo": repo,
    }


async def _get_user_team(user: dict) -> str:
    """Get the first team the user belongs to, or use their user_id as org scope."""
    teams = await get_team_members(user.get("uid", ""))
    if teams:
        return teams[0].get("team_id") or teams[0].get("id") or user.get("uid")
    return user.get("uid")


@router.get("/usage/dashboard")
async def usage_dashboard(user: dict = Depends(get_current_user)):
    """Return comprehensive usage dashboard for the user's team/org."""
    org_name = await _get_user_team(user)
    
    now = datetime.utcnow()
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
