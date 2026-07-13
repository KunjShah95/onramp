from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from app.services.slack_service import SlackService
from app.agents import FirstPRAccelerator

router = APIRouter(prefix="/slack", tags=["integration"])


class SlackDigestRequest(BaseModel):
    repo_url: str
    webhook_url: str
    channel: str = "#general"
    user_level: str = "junior"


class SlackCommandRequest(BaseModel):
    text: str
    user_name: str = "anonymous"
    channel_name: str = "general"


@router.post("/digest")
async def send_digest(request: SlackDigestRequest, req: Request):
    llm = getattr(req.app.state, "llm", None)
    slack = SlackService(request.webhook_url)

    try:
        accelerator = FirstPRAccelerator(llm)
        issues = await accelerator.find_issues(
            repo_url=request.repo_url,
            user_level=request.user_level,
        )

        message = slack.format_good_first_issues(issues)
        success = await slack.post_message(message, request.channel)
        return {"sent": success, "issue_count": len(issues)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/command")
async def handle_slash_command(request: SlackCommandRequest):
    return {
        "response_type": "in_channel",
        "text": f"CodeFlow analysis for: {request.text}",
        "attachments": [
            {
                "text": "Use the CodeFlow API to analyze this repository.\n"
                f"POST /api/v1/explore/analyze with repo_url: {request.text}",
                "color": "#4361ee",
            }
        ],
    }
