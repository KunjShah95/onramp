from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from app.agents import FirstPRAccelerator

router = APIRouter(prefix="/first-pr", tags=["onboarding"])


class IssuesRequest(BaseModel):
    repo_url: str
    user_level: str = "junior"
    github_token: Optional[str] = None


class GuideRequest(BaseModel):
    issue_id: int
    repo_structure: dict
    github_token: Optional[str] = None


def extract_github_token(request_body: BaseModel, req: Request) -> Optional[str]:
    """Extract token from request body or Authorization header."""
    if getattr(request_body, "github_token", None):
        return request_body.github_token
    auth_header = req.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
        # Only use it if it looks like a GitHub token, avoiding Firebase JWTs
        if token.startswith(("ghp_", "gho_", "ghu_", "ghs_", "github_pat_")):
            return token
    return None


@router.post("/issues")
async def find_issues(request: IssuesRequest, req: Request):
    llm = getattr(req.app.state, "llm", None)
    github_token = extract_github_token(request, req)
    accelerator = FirstPRAccelerator(llm, github_token=github_token)
    try:
        issues = await accelerator.find_issues(
            repo_url=request.repo_url,
            user_level=request.user_level
        )
        return {"issues": issues}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/guide")
async def generate_guide(request: GuideRequest, req: Request):
    llm = getattr(req.app.state, "llm", None)
    github_token = extract_github_token(request, req)
    accelerator = FirstPRAccelerator(llm, github_token=github_token)
    try:
        guide = await accelerator.generate_guide(
            issue_id=request.issue_id,
            repo_structure=request.repo_structure
        )
        return guide
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
