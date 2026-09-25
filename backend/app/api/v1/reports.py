import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, HttpUrl
from app.agents import OnboardingReportGenerator
from app.api.v1.auth import get_current_user
from app.services.quota import enforce_quota
from app.services.report_generator import ReportGenerator
from app.services.agent_session_helper import get_session, complete_session, fail_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reports", tags=["reports"])


class ReportRequest(BaseModel):
    repo_url: HttpUrl
    user_level: str = "junior"


async def _authorized_report_url(request: ReportRequest, user: dict) -> str:
    from app.api.v1.index_access import authorize_registered_repository
    from app.services.repo_index_access import parse_github_repo

    repo_url = str(request.repo_url).rstrip("/")
    if not parse_github_repo(repo_url):
        raise HTTPException(status_code=400, detail="Only GitHub HTTPS repository URLs are supported")
    await authorize_registered_repository(user, repo_url)
    return repo_url


@router.post("/generate")
async def generate_report(request: ReportRequest, req: Request, user: dict = Depends(get_current_user), _q=enforce_quota("generate")):
    repo_url = await _authorized_report_url(request, user)
    llm = getattr(req.app.state, "llm", None)
    sid = await get_session("onboarding_report_generator", user_id=user.get("uid"), scratchpad={"repo_url": repo_url, "user_level": request.user_level})
    gen = OnboardingReportGenerator(llm, session_id=sid) if sid else OnboardingReportGenerator(llm)
    try:
        data = await gen.generate(repo_url=repo_url, user_level=request.user_level)
        if isinstance(data, dict) and sid:
            data["session_id"] = sid
        await complete_session(sid, "onboarding_report_generator", success=True, payload={"repo_url": repo_url})
        return data
    except Exception as e:
        await fail_session(sid, "onboarding_report_generator")
        logger.exception("Internal error"); raise HTTPException(status_code=500, detail="An internal error occurred. Please try again.")


@router.post("/generate-html")
async def generate_html_report(request: ReportRequest, req: Request, user: dict = Depends(get_current_user), _q=enforce_quota("generate")):
    repo_url = await _authorized_report_url(request, user)
    llm = getattr(req.app.state, "llm", None)
    gen = OnboardingReportGenerator(llm)
    try:
        data = await gen.generate(repo_url=repo_url, user_level=request.user_level)
        html_gen = ReportGenerator()
        html = await html_gen.generate_html(data)
        return {"html": html}
    except Exception as e:
        logger.exception("Internal error"); raise HTTPException(status_code=500, detail="An internal error occurred. Please try again.")
