from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from app.agents import (
    SilentPairProgramming,
    PatternRecognition,
    RegressionTestGenerator,
    CodebaseTrailer,
    DriftDetector,
)
from app.services.quota import enforce_quota

router = APIRouter(tags=["unique"])


class WalkthroughRequest(BaseModel):
    issue_title: str
    issue_body: str = ""
    repo_structure: dict


class PatternRequest(BaseModel):
    pattern: str
    repo_structure: dict
    mode: str = "normal"


class TestChecklistRequest(BaseModel):
    pr_diff: str
    repo_structure: dict


class TrailerRequest(BaseModel):
    repo_url: str
    analysis: dict | None = None


class DriftRequest(BaseModel):
    repo_structure: dict
    docs: str = ""


@router.post("/pair/walkthrough")
async def generate_walkthrough(request: WalkthroughRequest, req: Request, _q=enforce_quota("generate")):
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
async def find_patterns(request: PatternRequest, req: Request, _q=enforce_quota("analyze")):
    llm = getattr(req.app.state, "llm", None)
    agent = PatternRecognition(llm)
    try:
        result = await agent.find_similar(
            pattern=request.pattern,
            repo_structure=request.repo_structure,
            mode=request.mode,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/test-checklist/generate")
async def generate_test_checklist(request: TestChecklistRequest, req: Request, _q=enforce_quota("analyze")):
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


@router.post("/trailer")
async def generate_trailer(request: TrailerRequest, req: Request, _q=enforce_quota("trailer")):
    """Generate a movie-trailer-style summary of a codebase (viral/demo feature)."""
    llm = getattr(req.app.state, "llm", None)
    agent = CodebaseTrailer(llm)
    try:
        return await agent.generate(
            repo_url=request.repo_url,
            analysis=request.analysis,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/drift/detect")
async def detect_drift(request: DriftRequest, req: Request, _q=enforce_quota("analyze")):
    """Detect architecture drift — where documented architecture diverges from the
    actual code structure. Returns a drift score, status, and severity-ranked alerts."""
    llm = getattr(req.app.state, "llm", None)
    agent = DriftDetector(llm)
    try:
        return await agent.detect(
            repo_structure=request.repo_structure,
            docs=request.docs,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
