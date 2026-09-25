import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from app.agents import (
    SilentPairProgramming,
    PatternRecognition,
    RegressionTestGenerator,
    CodebaseTrailer,
    DriftDetector,
)
from app.api.v1.auth import get_current_user
from app.api.v1.index_access import authorize_repo_index
from app.services.quota import enforce_quota
from app.services.agent_session_helper import get_session, complete_session, fail_session

logger = logging.getLogger(__name__)

router = APIRouter(tags=["unique"])


class WalkthroughRequest(BaseModel):
    issue_title: str
    issue_body: str = ""
    repo_structure: dict


class PatternRequest(BaseModel):
    pattern: str
    repo_structure: dict | None = None
    index_id: str | None = None  # reuse a cached repo-context index (parse-once)
    mode: str = "normal"


class TestChecklistRequest(BaseModel):
    pr_diff: str
    repo_structure: dict


class TrailerRequest(BaseModel):
    repo_url: str
    analysis: dict | None = None


class DriftRequest(BaseModel):
    repo_structure: dict | None = None
    index_id: str | None = None  # reuse a cached repo-context index (parse-once)
    docs: str = ""


@router.post("/pair/walkthrough")
async def generate_walkthrough(
    request: WalkthroughRequest,
    req: Request,
    user: dict = Depends(get_current_user),
    _q=enforce_quota("generate"),
):
    llm = getattr(req.app.state, "llm", None)
    sid = await get_session(
        "silent_pair_programming",
        user_id=user.get("uid"),
        scratchpad={"issue_title": request.issue_title},
    )
    agent = SilentPairProgramming(llm, session_id=sid) if sid else SilentPairProgramming(llm)
    try:
        result = await agent.generate_walkthrough(
            issue_title=request.issue_title,
            issue_body=request.issue_body,
            repo_structure=request.repo_structure,
        )
        if isinstance(result, dict) and sid:
            result["session_id"] = sid
        await complete_session(sid, "silent_pair_programming", success=True)
        return result
    except Exception as e:
        await fail_session(sid, "silent_pair_programming")
        logger.exception("Internal error"); raise HTTPException(status_code=500, detail="An internal error occurred. Please try again.")


@router.post("/patterns/find-similar")
async def find_patterns(
    request: PatternRequest,
    req: Request,
    user: dict = Depends(get_current_user),
    _q=enforce_quota("analyze"),
):
    llm = getattr(req.app.state, "llm", None)
    team_id = await authorize_repo_index(user, request.index_id) if request.index_id else None
    sid = await get_session(
        "pattern_recognition",
        user_id=user.get("uid"),
        team_id=team_id,
        index_id=request.index_id,
        scratchpad={"pattern": request.pattern},
    )
    agent = PatternRecognition(llm, session_id=sid) if sid else PatternRecognition(llm)
    try:
        result = await agent.find_similar(
            pattern=request.pattern,
            repo_structure=request.repo_structure,
            index_id=request.index_id,
            mode=request.mode,
        )
        if isinstance(result, dict) and sid:
            result["session_id"] = sid
        await complete_session(sid, "pattern_recognition", success=True, payload={"pattern": request.pattern})
        return result
    except Exception as e:
        await fail_session(sid, "pattern_recognition")
        logger.exception("Internal error"); raise HTTPException(status_code=500, detail="An internal error occurred. Please try again.")


@router.post("/test-checklist/generate")
async def generate_test_checklist(
    request: TestChecklistRequest,
    req: Request,
    user: dict = Depends(get_current_user),
    _q=enforce_quota("analyze"),
):
    llm = getattr(req.app.state, "llm", None)
    sid = await get_session(
        "regression_test_generator",
        user_id=user.get("uid"),
        scratchpad={"diff_len": len(request.pr_diff)},
    )
    agent = RegressionTestGenerator(llm, session_id=sid) if sid else RegressionTestGenerator(llm)
    try:
        result = await agent.generate(
            pr_diff=request.pr_diff,
            repo_structure=request.repo_structure,
        )
        if isinstance(result, dict) and sid:
            result["session_id"] = sid
        await complete_session(sid, "regression_test_generator", success=True)
        return result
    except Exception as e:
        await fail_session(sid, "regression_test_generator")
        logger.exception("Internal error"); raise HTTPException(status_code=500, detail="An internal error occurred. Please try again.")


@router.post("/trailer")
async def generate_trailer(
    request: TrailerRequest,
    req: Request,
    user: dict = Depends(get_current_user),
    _q=enforce_quota("trailer"),
):
    """Generate a movie-trailer-style summary of a codebase (viral/demo feature)."""
    llm = getattr(req.app.state, "llm", None)
    sid = await get_session(
        "codebase_trailer",
        user_id=user.get("uid"),
        scratchpad={"repo_url": request.repo_url},
    )
    agent = CodebaseTrailer(llm, session_id=sid) if sid else CodebaseTrailer(llm)
    try:
        result = await agent.generate(
            repo_url=request.repo_url,
            analysis=request.analysis,
        )
        if isinstance(result, dict) and sid:
            result["session_id"] = sid
        await complete_session(sid, "codebase_trailer", success=True, payload={"repo_url": request.repo_url})
        return result
    except Exception as e:
        await fail_session(sid, "codebase_trailer")
        logger.exception("Internal error"); raise HTTPException(status_code=500, detail="An internal error occurred. Please try again.")


@router.post("/drift/detect")
async def detect_drift(
    request: DriftRequest,
    req: Request,
    user: dict = Depends(get_current_user),
    _q=enforce_quota("analyze"),
):
    """Detect architecture drift — where documented architecture diverges from the
    actual code structure. Returns a drift score, status, and severity-ranked alerts."""
    llm = getattr(req.app.state, "llm", None)
    team_id = await authorize_repo_index(user, request.index_id) if request.index_id else None
    sid = await get_session(
        "drift_detector",
        user_id=user.get("uid"),
        team_id=team_id,
        index_id=request.index_id,
        scratchpad={"has_docs": bool(request.docs)},
    )
    agent = DriftDetector(llm, session_id=sid) if sid else DriftDetector(llm)
    try:
        result = await agent.execute(
            repo_structure=request.repo_structure,
            index_id=request.index_id,
            docs=request.docs,
        )
        if isinstance(result, dict) and sid:
            result["session_id"] = sid
        await complete_session(sid, "drift_detector", success=True, payload={"status": result.get("status"), "drift_score": result.get("drift_score")})
        return result
    except Exception as e:
        await fail_session(sid, "drift_detector")
        logger.exception("Internal error"); raise HTTPException(status_code=500, detail="An internal error occurred. Please try again.")
