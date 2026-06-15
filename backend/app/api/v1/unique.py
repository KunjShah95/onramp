from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from app.agents import SilentPairProgramming, PatternRecognition, RegressionTestGenerator

router = APIRouter(tags=["unique"])


class WalkthroughRequest(BaseModel):
    issue_title: str
    issue_body: str = ""
    repo_structure: dict


class PatternRequest(BaseModel):
    pattern: str
    repo_structure: dict


class TestChecklistRequest(BaseModel):
    pr_diff: str
    repo_structure: dict


@router.post("/pair/walkthrough")
async def generate_walkthrough(request: WalkthroughRequest, req: Request):
    llm = getattr(req.app.state, "llm", None)
    agent = SilentPairProgramming(llm)
    try:
        result = await agent.generate_walkthrough(
            issue_title=request.issue_title,
            issue_body=request.issue_body,
            repo_structure=request.repo_structure,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/patterns/find-similar")
async def find_patterns(request: PatternRequest, req: Request):
    llm = getattr(req.app.state, "llm", None)
    agent = PatternRecognition(llm)
    try:
        result = await agent.find_similar(
            pattern=request.pattern,
            repo_structure=request.repo_structure,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/test-checklist/generate")
async def generate_test_checklist(request: TestChecklistRequest, req: Request):
    llm = getattr(req.app.state, "llm", None)
    agent = RegressionTestGenerator(llm)
    try:
        result = await agent.generate(
            pr_diff=request.pr_diff,
            repo_structure=request.repo_structure,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
