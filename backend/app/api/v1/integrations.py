"""
Integrations API — manage webhooks, Slack, GitHub, and other third-party integrations.

Endpoints:
  Webhooks:  GET/POST /webhooks, GET/PUT/DELETE /webhooks/{id}, POST /webhooks/{id}/test, POST /webhooks/{id}/rotate-secret
  Integrations: GET/PUT/DELETE /integrations/{type}, GET /integrations
  Events: GET /events (list supported webhook event types)
"""

import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from app.api.v1.auth import get_current_user
from app.services.webhook_service import (
    create_webhook,
    list_webhooks,
    get_webhook,
    update_webhook,
    delete_webhook,
    rotate_secret,
    test_webhook,
    get_integration_config,
    save_integration_config,
    delete_integration_config,
    list_integrations,
    SUPPORTED_EVENTS,
    EVENT_LABELS,
)

router = APIRouter(prefix="/integrations", tags=["integrations"])


# ── Schemas ──────────────────────────────────────────────────


class CreateWebhookRequest(BaseModel):
    url: str
    events: List[str]
    description: str = ""


class UpdateWebhookRequest(BaseModel):
    url: Optional[str] = None
    events: Optional[List[str]] = None
    active: Optional[bool] = None
    description: Optional[str] = None


class SaveIntegrationRequest(BaseModel):
    config: dict


class WebhookResponse(BaseModel):
    webhook_id: str
    url: str
    events: List[str]
    secret: str
    description: str
    active: bool
    created_at: str
    last_success_at: Optional[str] = None
    last_failure_at: Optional[str] = None
    delivery_count: int
    failure_count: int


# ── Webhook Endpoints ────────────────────────────────────────


@router.get("/webhooks")
async def list_user_webhooks(
    user: dict = Depends(get_current_user),
):
    """List all webhooks for the current user."""
    webhooks = await list_webhooks(user.get("uid", ""))
    # Mask secrets in list view
    for w in webhooks:
        if w.get("secret"):
            w["secret"] = w["secret"][:12] + "…" if len(w["secret"]) > 12 else w["secret"]
    return {"webhooks": webhooks, "count": len(webhooks)}


@router.post("/webhooks")
async def create_user_webhook(
    request: CreateWebhookRequest,
    user: dict = Depends(get_current_user),
):
    """Register a new webhook endpoint."""
    # Validate events
    for event in request.events:
        if event not in SUPPORTED_EVENTS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported event '{event}'. Supported: {SUPPORTED_EVENTS}",
            )

    webhook = await create_webhook(
        user_id=user.get("uid", ""),
        url=request.url,
        events=request.events,
        description=request.description,
    )
    return webhook


@router.get("/webhooks/{webhook_id}")
async def get_user_webhook(
    webhook_id: str,
    user: dict = Depends(get_current_user),
):
    """Get a single webhook with full details including secret."""
    webhook = await get_webhook(webhook_id)
    if not webhook or webhook.get("user_id") != user.get("uid", ""):
        raise HTTPException(status_code=404, detail="Webhook not found")
    return webhook


@router.put("/webhooks/{webhook_id}")
async def update_user_webhook(
    webhook_id: str,
    request: UpdateWebhookRequest,
    user: dict = Depends(get_current_user),
):
    """Update a webhook."""
    updates = {k: v for k, v in request.model_dump().items() if v is not None}
    result = await update_webhook(webhook_id, user.get("uid", ""), updates)
    if not result:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return result


@router.delete("/webhooks/{webhook_id}")
async def delete_user_webhook(
    webhook_id: str,
    user: dict = Depends(get_current_user),
):
    """Delete a webhook."""
    success = await delete_webhook(webhook_id, user.get("uid", ""))
    if not success:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return {"deleted": True}


@router.post("/webhooks/{webhook_id}/test")
async def test_user_webhook(
    webhook_id: str,
    user: dict = Depends(get_current_user),
):
    """Send a test event to verify a webhook works."""
    result = await test_webhook(webhook_id, user.get("uid", ""))
    return result


@router.post("/webhooks/{webhook_id}/rotate-secret")
async def rotate_webhook_secret(
    webhook_id: str,
    user: dict = Depends(get_current_user),
):
    """Rotate the signing secret for a webhook."""
    result = await rotate_secret(webhook_id, user.get("uid", ""))
    if not result:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return result


# ── Integration Config Endpoints ─────────────────────────────


class TestGithubTokenRequest(BaseModel):
    token: str


@router.post("/github/test")
async def test_github_token(
    request: TestGithubTokenRequest,
    user: dict = Depends(get_current_user),
):
    """Validate a GitHub personal access token by calling the GitHub API."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.github.com/user",
                headers={
                    "Authorization": f"Bearer {request.token}",
                    "Accept": "application/vnd.github.v3+json",
                    "User-Agent": "Onramp/2.0",
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "valid": True,
                    "username": data.get("login"),
                    "scopes": resp.headers.get("X-OAuth-Scopes", "").split(", "),
                }
            elif resp.status_code == 401:
                return {"valid": False, "error": "Token is invalid or expired"}
            elif resp.status_code == 403:
                return {"valid": False, "error": "Token is valid but lacks permissions"}
            else:
                return {"valid": False, "error": f"GitHub API returned {resp.status_code}"}
    except httpx.RequestError as e:
        return {"valid": False, "error": f"Connection error: {str(e)}"}


# ── GitLab Integration Endpoints ───────────────────────────────


@router.post("/gitlab/test")
async def test_gitlab_connection(
    request: SaveIntegrationRequest,
    user: dict = Depends(get_current_user),
):
    """Validate a GitLab personal access token."""
    from app.services.gitlab_service import GitLabService
    token = request.config.get("token", "")
    if not token:
        return {"valid": False, "error": "Missing GitLab token"}
    svc = GitLabService(token=token)
    return await svc.test_connection()


@router.post("/gitlab/projects")
async def list_gitlab_projects(
    request: SaveIntegrationRequest,
    user: dict = Depends(get_current_user),
):
    """Search GitLab projects accessible with the configured token."""
    from app.services.gitlab_service import GitLabService
    token = request.config.get("token", "")
    search = request.config.get("search", "")
    if not token or not search:
        return {"projects": [], "count": 0}

    try:
        svc = GitLabService(token=token)
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                "https://gitlab.com/api/v4/projects",
                headers={"PRIVATE-TOKEN": token, "Accept": "application/json"},
                params={"search": search, "per_page": 20, "simple": True},
            )
            if resp.status_code == 200:
                data = resp.json()
                projects = [
                    {
                        "id": p["id"],
                        "name": p.get("name", ""),
                        "path_with_namespace": p.get("path_with_namespace", ""),
                        "web_url": p.get("web_url", ""),
                        "description": p.get("description", ""),
                        "avatar_url": p.get("avatar_url", ""),
                        "visibility": p.get("visibility", "private"),
                        "star_count": p.get("star_count", 0),
                    }
                    for p in data
                ]
                return {"projects": projects, "count": len(projects)}
            return {"projects": [], "count": 0}
    except Exception as e:
        return {"projects": [], "count": 0, "error": str(e)}


# ── Bitbucket Integration Endpoints ────────────────────────────


@router.post("/bitbucket/test")
async def test_bitbucket_connection(
    request: SaveIntegrationRequest,
    user: dict = Depends(get_current_user),
):
    """Validate Bitbucket credentials (username + app password)."""
    from app.services.bitbucket_service import BitbucketService
    username = request.config.get("username", "")
    app_password = request.config.get("app_password", "")
    if not username or not app_password:
        return {"valid": False, "error": "Missing Bitbucket username or app password"}
    svc = BitbucketService(username=username, app_password=app_password)
    return await svc.test_connection()


@router.post("/bitbucket/repos")
async def list_bitbucket_repos(
    request: SaveIntegrationRequest,
    user: dict = Depends(get_current_user),
):
    """List Bitbucket repositories for a workspace."""
    import base64
    username = request.config.get("username", "")
    app_password = request.config.get("app_password", "")
    workspace = request.config.get("workspace", "")

    if not username or not app_password:
        return {"repos": [], "count": 0}

    headers = {
        "Authorization": f"Basic {base64.b64encode(f'{username}:{app_password}'.encode()).decode()}",
        "Accept": "application/json",
    }
    url = f"https://api.bitbucket.org/2.0/repositories/{workspace}" if workspace else "https://api.bitbucket.org/2.0/repositories"

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, headers=headers, params={"pagelen": 50, "role": "member"})
            if resp.status_code == 200:
                data = resp.json()
                repos = [
                    {
                        "slug": r.get("slug", ""),
                        "name": r.get("name", ""),
                        "full_name": r.get("full_name", ""),
                        "description": r.get("description", ""),
                        "language": r.get("language", ""),
                        "is_private": r.get("is_private", True),
                        "links": {
                            "html": (r.get("links", {}).get("html", {}) or {}).get("href", ""),
                            "clone": [c["href"] for c in (r.get("links", {}).get("clone", []) or [])],
                        },
                    }
                    for r in data.get("values", [])
                ]
                return {"repos": repos, "count": len(repos)}
            return {"repos": [], "count": 0}
    except Exception as e:
        return {"repos": [], "count": 0, "error": str(e)}


# ── Jira Integration Endpoints ────────────────────────────────


@router.post("/jira/test")
async def test_jira_connection(
    request: SaveIntegrationRequest,
    user: dict = Depends(get_current_user),
):
    """Test Jira connection with provided credentials."""
    from app.services.jira_service import test_connection
    return await test_connection(request.config)


@router.post("/jira/projects")
async def list_jira_projects(
    request: SaveIntegrationRequest,
    user: dict = Depends(get_current_user),
):
    """List Jira projects accessible with the configured credentials."""
    from app.services.jira_service import list_projects
    projects = await list_projects(request.config)
    return {"projects": projects, "count": len(projects)}


@router.post("/jira/issue-types")
async def list_jira_issue_types(
    request: SaveIntegrationRequest,
    user: dict = Depends(get_current_user),
):
    """List issue types for a Jira project."""
    from app.services.jira_service import list_issue_types
    project_key = request.config.get("project_key", "")
    if not project_key:
        raise HTTPException(status_code=400, detail="project_key is required")
    types = await list_issue_types(request.config, project_key)
    return {"issue_types": types, "count": len(types)}


# ── Linear Integration Endpoints ──────────────────────────────


@router.post("/linear/test")
async def test_linear_connection(
    request: SaveIntegrationRequest,
    user: dict = Depends(get_current_user),
):
    """Test Linear connection with provided API key."""
    from app.services.linear_service import test_connection
    return await test_connection(request.config.get("api_key", ""))


@router.post("/linear/teams")
async def list_linear_teams(
    request: SaveIntegrationRequest,
    user: dict = Depends(get_current_user),
):
    """List Linear teams accessible with the configured API key."""
    from app.services.linear_service import list_teams
    teams = await list_teams(request.config.get("api_key", ""))
    return {"teams": teams, "count": len(teams)}


@router.post("/linear/workflow-states")
async def list_linear_workflow_states(
    request: SaveIntegrationRequest,
    user: dict = Depends(get_current_user),
):
    """List workflow states for a Linear team."""
    from app.services.linear_service import list_workflow_states
    team_id = request.config.get("team_id", "")
    if not team_id:
        raise HTTPException(status_code=400, detail="team_id is required")
    states = await list_workflow_states(request.config.get("api_key", ""), team_id)
    return {"workflow_states": states, "count": len(states)}


@router.get("/{integration_type}")
async def get_integration(
    integration_type: str,
    user: dict = Depends(get_current_user),
):
    """Get configuration for a specific integration (slack, github, etc.)."""
    config = await get_integration_config(user.get("uid", ""), integration_type)
    if not config:
        return {"configured": False, "integration": integration_type}
    return {"configured": True, **config}


@router.put("/{integration_type}")
async def save_integration(
    integration_type: str,
    request: SaveIntegrationRequest,
    user: dict = Depends(get_current_user),
):
    """Save or update integration configuration."""
    result = await save_integration_config(
        user.get("uid", ""), integration_type, request.config
    )
    return {"configured": True, **result}


@router.delete("/{integration_type}")
async def delete_integration(
    integration_type: str,
    user: dict = Depends(get_current_user),
):
    """Disconnect an integration."""
    success = await delete_integration_config(user.get("uid", ""), integration_type)
    return {"deleted": success}


@router.get("")
async def list_user_integrations(
    user: dict = Depends(get_current_user),
):
    """List all configured integrations."""
    integrations = await list_integrations(user.get("uid", ""))
    return {"integrations": integrations, "count": len(integrations)}


# ── Events ───────────────────────────────────────────────────


@router.get("/events/list")
async def list_events():
    """List supported webhook event types."""
    return {
        "events": SUPPORTED_EVENTS,
        "labels": EVENT_LABELS,
    }
