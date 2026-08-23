from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from app.agents import OnboardingReportGenerator
from app.services.report_generator import ReportGenerator
from app.services.agent_session_helper import get_session, complete_session, fail_session

router = APIRouter(prefix="/reports", tags=["reports"])


class ReportRequest(BaseModel):
    repo_url: str
    user_level: str = "junior"


@router.post("/generate")
async def generate_report(request: ReportRequest, req: Request):
    llm = getattr(req.app.state, "llm", None)
    sid = await get_session("onboarding_report_generator", scratchpad={"repo_url": request.repo_url, "user_level": request.user_level})
    gen = OnboardingReportGenerator(llm, session_id=sid) if sid else OnboardingReportGenerator(llm)
    try:
        data = await gen.generate(repo_url=request.repo_url, user_level=request.user_level)
        if isinstance(data, dict) and sid:
            data["session_id"] = sid
        await complete_session(sid, "onboarding_report_generator", success=True, payload={"repo_url": request.repo_url})
        return data
    except Exception as e:
        await fail_session(sid, "onboarding_report_generator")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-html")
async def generate_html_report(request: ReportRequest, req: Request):
    llm = getattr(req.app.state, "llm", None)
    gen = OnboardingReportGenerator(llm)
    try:
        data = await gen.generate(repo_url=request.repo_url, user_level=request.user_level)
        html_gen = ReportGenerator()
        html = await html_gen.generate_html(data)
        return {"html": html}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
