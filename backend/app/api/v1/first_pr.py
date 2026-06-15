from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from app.agents import FirstPRAccelerator

router = APIRouter(prefix="/first-pr", tags=["onboarding"])


class IssuesRequest(BaseModel):
    repo_url: str
    user_level: str = "junior"


class GuideRequest(BaseModel):
    issue_id: int
    repo_structure: dict


@router.post("/issues")
async def find_issues(request: IssuesRequest, req: Request):
    llm = getattr(req.app.state, "llm", None)
    accelerator = FirstPRAccelerator(llm)
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
    accelerator = FirstPRAccelerator(llm)
    try:
        guide = await accelerator.generate_guide(
            issue_id=request.issue_id,
            repo_structure=request.repo_structure
        )
        return guide
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
