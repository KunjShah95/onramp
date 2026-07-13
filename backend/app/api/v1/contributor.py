from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.contributor_tracker import ContributorTracker

router = APIRouter(prefix="/track", tags=["contributors"])
tracker = ContributorTracker()


class WebhookPayload(BaseModel):
    event_type: str
    payload: dict


@router.post("/webhook")
async def track_webhook(payload: WebhookPayload):
    try:
        result = await tracker.track_event(payload.event_type, payload.payload)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/milestones/{user}")
async def get_user_milestones(user: str):
    milestones = await tracker.get_user_milestones(user)
    return {"user": user, "milestones": milestones}


@router.get("/summary")
async def get_summary():
    return await tracker.get_milestone_summary()
