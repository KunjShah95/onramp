import logging
from fastapi import APIRouter, Depends
from app.api.v1.auth import get_current_user
from app.services.postgres_db import get_storage

logger = logging.getLogger("codeflow.seed")

router = APIRouter(prefix="/seed", tags=["seed"])


@router.get("/role-data")
async def get_seed_role_data(user=Depends(get_current_user)):
    """Return sample data appropriate for the user's role."""
    storage = get_storage()
    memberships = await storage.query_documents(
        "team_members",
        [("user_id", "==", user["uid"])],
    )
    role = memberships[0].get("role", "member") if memberships else "member"

    base_data = {
        "stats": {
            "repos_analyzed": 47,
            "active_teams": 12,
            "total_users": 384,
            "api_calls_24h": 15283,
        },
    }

    dev_data = {
        **base_data,
        "recent_activity": [
            {"type": "analysis", "title": "Analyzed frontend-app repo", "time": "2m ago", "status": "completed"},
            {"type": "review", "title": "Reviewed PR #142 - auth middleware", "time": "15m ago", "status": "completed"},
            {"type": "deploy", "title": "Deployed v2.4.1 to staging", "time": "1h ago", "status": "completed"},
            {"type": "alert", "title": "Redis connection spike detected", "time": "3h ago", "status": "warning"},
            {"type": "health", "title": "Code health score dropped for api-service", "time": "5h ago", "status": "action_needed"},
        ],
        "system_health": [
            {"service": "API Server", "status": "healthy", "uptime": "99.97%", "latency_p95": "42ms"},
            {"service": "PostgreSQL", "status": "healthy", "uptime": "99.99%", "latency_p95": "8ms"},
            {"service": "Redis Cache", "status": "degraded", "uptime": "98.2%", "latency_p95": "15ms"},
            {"service": "LLM Router", "status": "healthy", "uptime": "99.89%", "latency_p95": "1.2s"},
        ],
        "pending_reviews": 7,
        "open_incidents": 2,
    }

    executive_data = {
        **base_data,
        "mrr": 28450,
        "mrr_growth": 12.4,
        "active_subscriptions": 87,
        "churn_rate": 2.1,
        "revenue_by_tier": {"free": 0, "startup": 12250, "professional": 16200, "enterprise": 0},
        "top_teams": [
            {"name": "Frontend Core", "members": 12, "completion_rate": 78, "velocity": 24},
            {"name": "Backend Platform", "members": 8, "completion_rate": 92, "velocity": 31},
            {"name": "ML/AI", "members": 6, "completion_rate": 65, "velocity": 18},
            {"name": "DevOps", "members": 4, "completion_rate": 88, "velocity": 22},
        ],
        "billing_summary": {"active": 87, "past_due": 3, "canceled": 12, "trialing": 8},
        "recent_audit_events": [
            {"action": "Team created", "actor": "sarah@company.com", "time": "10m ago"},
            {"action": "Subscription upgraded", "actor": "mike@company.com", "time": "1h ago"},
            {"action": "API key revoked", "actor": "devops-bot", "time": "3h ago"},
            {"action": "Member invited", "actor": "alex@company.com", "time": "5h ago"},
        ],
    }

    senior_data = {
        **base_data,
        "pending_reviews": 12,
        "avg_code_health": 76,
        "active_mentees": 5,
        "open_tasks": 23,
        "review_items": [
            {"pr_title": "Add rate limiting to LLM routes", "author": "alice", "status": "submitted", "priority": "high", "age": "2h"},
            {"pr_title": "Fix notification polling race condition", "author": "bob", "status": "under_review", "priority": "medium", "age": "1d"},
            {"pr_title": "Refactor team service to use typed models", "author": "charlie", "status": "needs_changes", "priority": "low", "age": "3d"},
        ],
        "repo_health_scores": [
            {"repo": "frontend-app", "score": 82, "trend": "up"},
            {"repo": "backend-api", "score": 74, "trend": "down"},
            {"repo": "ml-service", "score": 68, "trend": "stable"},
        ],
        "team_progress": [
            {"name": "Alice Chen", "completion": 92, "role": "senior"},
            {"name": "Bob Smith", "completion": 65, "role": "mid"},
            {"name": "Charlie Davis", "completion": 34, "role": "junior"},
            {"name": "Diana Park", "completion": 78, "role": "senior"},
        ],
        "unlocked_modules": 14,
        "total_modules": 18,
    }

    member_data = {
        "welcome_name": user.get("name", user.get("email", "Developer")),
        "checklist": [
            {"id": "explore", "label": "Explore the repository architecture", "done": True},
            {"id": "learn", "label": "Start your learning path", "done": True},
            {"id": "first_issue", "label": "Find and claim your first issue", "done": False},
            {"id": "first_pr", "label": "Submit your first PR", "done": False},
            {"id": "profile", "label": "Complete your profile", "done": True},
            {"id": "team", "label": "Join a team", "done": True},
        ],
        "learning_modules": [
            {"name": "Codebase Overview", "progress": 100, "status": "completed"},
            {"name": "Backend Architecture", "progress": 65, "status": "in_progress"},
            {"name": "Frontend Patterns", "progress": 20, "status": "in_progress"},
            {"name": "Testing & QA", "progress": 0, "status": "locked"},
        ],
        "recent_activity": [
            {"type": "module", "title": "Completed 'Codebase Overview' module", "time": "1d ago"},
            {"type": "task", "title": "Task 'Set up dev environment' approved", "time": "2d ago"},
            {"type": "achievement", "title": "Earned 'First Analysis' badge", "time": "3d ago"},
            {"type": "guide", "title": "Viewed guide for issue #42", "time": "4d ago"},
        ],
        "completed_tasks": 8,
        "total_tasks": 15,
        "streak_days": 5,
    }

    role_data_map = {
        "owner": {"portal": "executive", "data": executive_data},
        "developer": {"portal": "dev", "data": dev_data},
        "senior": {"portal": "senior", "data": senior_data},
        "member": {"portal": "onboarding", "data": member_data},
    }

    result = role_data_map.get(role, role_data_map["member"])
    result["role"] = role
    return result
