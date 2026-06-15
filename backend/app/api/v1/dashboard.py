from fastapi import APIRouter

router = APIRouter(tags=["dashboard"])

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
