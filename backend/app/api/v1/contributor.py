import logging
from fastapi import APIRouter, HTTPException, Depends, Header, Request
from pydantic import BaseModel
import hashlib, hmac, os

logger = logging.getLogger(__name__)
from app.services.contributor_tracker import ContributorTracker
from app.api.v1.auth import get_current_user

router = APIRouter(prefix="/track", tags=["contributors"])
tracker = ContributorTracker()


class WebhookPayload(BaseModel):
    event_type: str
    payload: dict


@router.post("/webhook")
async def track_webhook(
    request: Request,
    payload: WebhookPayload,
    x_contributor_signature: str = Header("", alias="X-Contributor-Signature"),
):
    secret = os.getenv("CONTRIBUTOR_WEBHOOK_SECRET", "")
    raw = await request.body()
    expected = "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest() if secret else ""
    if not secret or not hmac.compare_digest(expected, x_contributor_signature):
        raise HTTPException(status_code=401, detail="Invalid contributor webhook signature")
    try:
        result = await tracker.track_event(payload.event_type, payload.payload)
        return result
    except Exception as e:
        logger.exception("Internal error"); raise HTTPException(status_code=500, detail="An internal error occurred. Please try again.")


@router.get("/milestones/{user}")
async def get_user_milestones(user: str, caller: dict = Depends(get_current_user)):
    if user != caller.get("uid"):
        raise HTTPException(status_code=403, detail="Milestones are private to the user")
    from app.services.user_service import get_user_by_uid

    profile = await get_user_by_uid(user) or {}
    github_username = profile.get("github_username")
    if not github_username:
        return {"user": user, "github_username": None, "milestones": []}
    milestones = await tracker.get_user_milestones(github_username)
    return {"user": user, "github_username": github_username, "milestones": milestones}


@router.get("/summary")
async def get_summary(caller: dict = Depends(get_current_user)):
    return await tracker.get_milestone_summary()
