"""Autopilot API — run the repo-autopilot pipeline from the UI.

Endpoints
---------
- ``POST /api/v1/autopilot/analyze`` — repo URL → clone → parse → graph → entity
  graph → model-routed issue analysis + role assignment (no PRs).
- ``POST /api/v1/autopilot/run`` — analyze + solve issues → GitHub PRs →
  validate each PR head (graph diff + AI verification) → senior-review markdown.

Both are synchronous (matching ``/explore/analyze`` and ``/repos/index``); for
production traffic they should move behind the existing Celery ``agent-tasks``
queue. Requires an authenticated user; the solve path needs ``GITHUB_TOKEN``
configured server-side (env or platform integration).
"""

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from app.api.v1.auth import get_current_user
from app.services.quota import enforce_quota
from app.services.autopilot_service import AutopilotService
from app.api.v1.llm_route import attach_served_route_header

router = APIRouter(prefix="/autopilot", tags=["autopilot"])


class AutopilotAnalyzeRequest(BaseModel):
    repo_url: str = Field(..., description="GitHub repo URL (https://github.com/owner/repo)")
    branch: str = "main"
    max_issues: int = Field(5, ge=1, le=20)
    routing_mode: str = Field("balanced", description="cost | balanced | intelligence")
    create_tasks: bool = Field(
        True,
        description="Create each issue as a real Onramp task assigned by role "
        "(intern→new_dev, junior→developer, senior→senior_dev)",
    )
    team_id: Optional[str] = Field(
        None,
        description="Team to create tasks in (defaults to the caller's first team)",
    )


class AutopilotRunRequest(BaseModel):
    repo_url: str = Field(..., description="GitHub repo URL (https://github.com/owner/repo)")
    branch: str = "main"
    max_issues: int = Field(5, ge=1, le=20)
    max_solve: Optional[int] = Field(None, ge=1, le=20, description="Defaults to max_issues")
    routing_mode: str = Field("balanced", description="cost | balanced | intelligence")
    run_validation: bool = Field(True, description="Validate each PR head (graph diff + AI verification)")
    max_retry: int = Field(1, ge=0, le=3, description="Validation retry rounds for unresolved issues")
    create_tasks: bool = Field(
        True,
        description="Create each issue as a real Onramp task assigned by role",
    )
    team_id: Optional[str] = Field(
        None,
        description="Team to create tasks in (defaults to the caller's first team)",
    )


def _service(req: Request) -> AutopilotService:
    llm = getattr(req.app.state, "llm", None)
    return AutopilotService(llm=llm)


def _routing_mode(value: str) -> Any:
    return value.strip().lower()


async def _resolve_team(user: dict, requested_team_id: Optional[str]) -> Optional[str]:
    """Pick the team for task creation from the caller's session.

    Prefers an explicit ``team_id`` (must be one the caller belongs to);
    otherwise falls back to the caller's first team. Returns None when the
    caller has no teams (task creation is then skipped).
    """
    from app.services.team_service import get_user_teams

    uid = user.get("uid", "")
    if not uid:
        return None
    teams = await get_user_teams(uid)
    if not teams:
        return None
    if requested_team_id:
        ids = {(t.get("team_id") or t.get("id")) for t in teams}
        if requested_team_id not in ids:
            raise HTTPException(status_code=403, detail="You are not a member of that team")
        return requested_team_id
    return teams[0].get("team_id") or teams[0].get("id")


@router.post("/analyze")
async def autopilot_analyze(
    request: AutopilotAnalyzeRequest,
    req: Request,
    response: Response,
    user: dict = Depends(get_current_user),
    _q=enforce_quota("analyze"),
):
    """Repo URL → issues. Clones, parses, builds file + entity graphs, runs the
    model-routed analysis, returns issues with role assignment and creates each
    issue as a real Onramp task assigned by role."""
    service = _service(req)
    llm = getattr(req.app.state, "llm", None)
    before_route = getattr(llm, "last_route", None)
    try:
        team_id = await _resolve_team(user, request.team_id) if request.create_tasks else None
        result = await service.analyze(
            repo_url=request.repo_url,
            branch=request.branch,
            max_issues=request.max_issues,
            routing_mode=_routing_mode(request.routing_mode),
            team_id=team_id,
            created_by=user.get("uid", ""),
            create_tasks=request.create_tasks,
        )
        attach_served_route_header(llm, before_route, response)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Autopilot analysis failed: {e}")


@router.post("/run")
async def autopilot_run(
    request: AutopilotRunRequest,
    req: Request,
    response: Response,
    user: dict = Depends(get_current_user),
    _q=enforce_quota("analyze"),
):
    """Full pipeline: analyze → solve issues → GitHub PRs → validate → senior review.
    Analyzed issues are also created as real Onramp tasks assigned by role."""
    service = _service(req)
    llm = getattr(req.app.state, "llm", None)
    before_route = getattr(llm, "last_route", None)
    try:
        team_id = await _resolve_team(user, request.team_id) if request.create_tasks else None
        result = await service.run(
            repo_url=request.repo_url,
            branch=request.branch,
            max_issues=request.max_issues,
            max_solve=request.max_solve,
            routing_mode=_routing_mode(request.routing_mode),
            validate=request.run_validation,
            max_retry=request.max_retry,
            team_id=team_id,
            created_by=user.get("uid", ""),
            create_tasks=request.create_tasks,
        )
        attach_served_route_header(llm, before_route, response)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Autopilot run failed: {e}")
