from fastapi import APIRouter

router = APIRouter(tags=["dashboard"])


@router.get("/repos")
async def list_repos():
    """Return the list of tracked repositories."""
    return {
        "repos": [
            {
                "id": "1",
                "name": "react",
                "owner": "facebook",
                "status": "ready",
                "last_analyzed": "2024-01-15T10:00:00Z",
                "description": "A declarative, efficient, and flexible JavaScript library for building user interfaces.",
                "language": "TypeScript",
            },
            {
                "id": "2",
                "name": "typescript",
                "owner": "microsoft",
                "status": "analyzing",
                "last_analyzed": "2024-01-14T08:30:00Z",
                "description": "TypeScript is a superset of JavaScript that compiles to clean JavaScript output.",
                "language": "TypeScript",
            },
            {
                "id": "3",
                "name": "vercel",
                "owner": "vercel",
                "status": "ready",
                "last_analyzed": "2024-01-15T14:00:00Z",
                "description": "Develop. Preview. Ship. Cloud platform for static sites and Serverless Functions.",
                "language": "TypeScript",
            },
            {
                "id": "4",
                "name": "next.js",
                "owner": "vercel",
                "status": "ready",
                "last_analyzed": "2024-01-13T16:45:00Z",
                "description": "The React Framework for Production.",
                "language": "TypeScript",
            },
            {
                "id": "5",
                "name": "tailwindcss",
                "owner": "tailwindlabs",
                "status": "ready",
                "last_analyzed": "2024-01-12T12:20:00Z",
                "description": "A utility-first CSS framework for rapid UI development.",
                "language": "CSS",
            },
        ]
    }


@router.get("/dashboard/cto")
async def cto_dashboard():
    """Return aggregated CTO dashboard metrics."""
    return {
        "total_repos": 127,
        "tech_debt": 2_400_000,
        "drift_issues": 34,
        "wiki_pages": 1_842,
        "actions": [
            {
                "title": "Review 3 critical drift issues",
                "subtitle": "react, typescript, vercel repos",
                "severity": "critical",
            },
            {
                "title": "Address $500k tech debt in auth-service module",
                "subtitle": "Legacy authentication code needs modernization",
                "severity": "warning",
            },
            {
                "title": "Approve 5 new repo onboarding requests",
                "subtitle": "Pending requests from engineering teams",
                "severity": "info",
            },
        ],
        "services": [
            {"name": "API Gateway", "status": "healthy"},
            {"name": "LLM Gateway", "status": "healthy"},
            {"name": "Knowledge Compiler", "status": "healthy"},
            {"name": "Firestore Database", "status": "healthy"},
            {"name": "Redis Cache", "status": "degraded"},
        ],
    }


@router.get("/dashboard/team")
async def team_analytics():
    """Return team analytics data."""
    return {
        "members": [
            {"name": "Alice Chen", "repos": 8, "analyses": 23, "contribution": "high"},
            {"name": "Bob Martinez", "repos": 5, "analyses": 12, "contribution": "medium"},
            {"name": "Carol Johnson", "repos": 3, "analyses": 8, "contribution": "low"},
            {"name": "David Kim", "repos": 6, "analyses": 18, "contribution": "high"},
            {"name": "Emma Wilson", "repos": 7, "analyses": 21, "contribution": "high"},
            {"name": "Frank Garcia", "repos": 4, "analyses": 10, "contribution": "medium"},
        ]
    }


@router.get("/roadmap")
async def list_roadmap():
    """Return the project roadmap milestones."""
    return {
        "milestones": [
            {
                "id": "1",
                "title": "Knowledge Compiler v1",
                "phase": "Phase 1",
                "status": "completed",
                "progress": 100,
            },
            {
                "id": "2",
                "title": "LLM Wiki Engine",
                "phase": "Phase 2",
                "status": "active",
                "progress": 65,
            },
            {
                "id": "3",
                "title": "Multi-Agent System",
                "phase": "Phase 3",
                "status": "active",
                "progress": 40,
            },
            {
                "id": "4",
                "title": "Architecture Drift Detection",
                "phase": "Phase 4",
                "status": "planned",
                "progress": 0,
            },
            {
                "id": "5",
                "title": "Tech Debt Financial Model",
                "phase": "Phase 5",
                "status": "planned",
                "progress": 0,
            },
        ]
    }


@router.get("/tasks")
async def list_tasks():
    """Return the list of tasks."""
    return {
        "tasks": [
            {"id": "1", "title": "Analyze react repository", "status": "completed", "priority": "high"},
            {"id": "2", "title": "Review tech debt report", "status": "in_progress", "priority": "medium"},
            {"id": "3", "title": "Fix architecture drift issues in auth-service", "status": "in_progress", "priority": "high"},
            {"id": "4", "title": "Set up CI/CD pipeline", "status": "pending", "priority": "medium"},
            {"id": "5", "title": "Update onboarding documentation", "status": "pending", "priority": "low"},
            {"id": "6", "title": "Migrate legacy database schema", "status": "pending", "priority": "high"},
        ]
    }


@router.get("/repos/{owner}/{repo}/analysis")
async def repo_analysis(owner: str, repo: str):
    """Return analysis summary for a specific repository."""
    return {
        "graph": {"nodes": 1247, "edges": 3892},
        "wiki": {"pages": 89},
        "drift": {"issues": 12},
        "tech_debt": {"total": 245_000},
        "owner": owner,
        "repo": repo,
    }


@router.get("/repos/{owner}/{repo}/sections")
async def repo_sections(owner: str, repo: str):
    """Return the analysis sections overview for a specific repository."""
    return {
        "sections": [
            {
                "title": "Entity Graph",
                "description": "Functions, classes, imports, exports",
                "detail": "1,247 nodes · 3,892 edges",
            },
            {
                "title": "LLM Wiki",
                "description": "Generated documentation pages",
                "detail": "89 pages compiled",
            },
            {
                "title": "Architecture Drift",
                "description": "Deviations from intended architecture",
                "detail": "12 issues detected",
            },
            {
                "title": "Tech Debt",
                "description": "Estimated remediation cost",
                "detail": "$245,000 total debt",
            },
        ],
        "owner": owner,
        "repo": repo,
    }
