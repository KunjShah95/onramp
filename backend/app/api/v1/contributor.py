from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
import hashlib, hmac, os
from app.services.contributor_tracker import ContributorTracker
from app.api.v1.auth import get_current_user

router = APIRouter(prefix="/track", tags=["contributors"])
tracker = ContributorTracker()


class WebhookPayload(BaseModel):
    event_type: str
    payload: dict


@router.post("/webhook")
async def track_webhook(
    payload: WebhookPayload,
    x_contributor_signature: str = Header("", alias="X-Contributor-Signature"),
):
    secret = os.getenv("CONTRIBUTOR_WEBHOOK_SECRET", "")
    raw = payload.model_dump_json().encode()
    expected = "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest() if secret else ""
    if not secret or not hmac.compare_digest(expected, x_contributor_signature):
        raise HTTPException(status_code=401, detail="Invalid contributor webhook signature")
    try:
        result = await tracker.track_event(payload.event_type, payload.payload)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/milestones/{user}")
async def get_user_milestones(user: str, caller: dict = Depends(get_current_user)):
    if user != caller.get("uid"):
        raise HTTPException(status_code=403, detail="Milestones are private to the user")
    milestones = await tracker.get_user_milestones(user)
    return {"user": user, "milestones": milestones}


@router.get("/summary")
async def get_summary(caller: dict = Depends(get_current_user)):
    return await tracker.get_milestone_summary()
