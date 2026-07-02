"""Thumbs up/down on AI outputs. One endpoint, feeds the whole learning loop."""

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.v1.auth import get_current_user
from app.services.feedback_service import FeedbackService, FEEDBACK_FEATURES

router = APIRouter(prefix="/feedback", tags=["feedback"])

_service = FeedbackService()


class FeedbackRequest(BaseModel):
    feature: str = Field(description=f"One of: {sorted(FEEDBACK_FEATURES)}")
    rating: int = Field(description="1 = thumbs up, -1 = thumbs down")
    context: Optional[Dict[str, Any]] = Field(
        default=None,
        description="What was rated: index_id, question, answer preview, PR number, etc.",
    )
    comment: Optional[str] = Field(default=None, max_length=2000)


@router.post("")
async def submit_feedback(request: FeedbackRequest, user: dict = Depends(get_current_user)):
    try:
        record = await _service.add_feedback(
            user_id=user.get("uid"),
            feature=request.feature,
            rating=request.rating,
            context=request.context,
            comment=request.comment,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {"id": record.get("id"), "recorded": True}


@router.get("/stats")
async def feedback_stats(
    feature: Optional[str] = None,
    days: int = 30,
    user: dict = Depends(get_current_user),
):
    if feature is not None and feature not in FEEDBACK_FEATURES:
        raise HTTPException(status_code=422, detail=f"Unknown feature '{feature}'")
    if not 1 <= days <= 365:
        raise HTTPException(status_code=422, detail="days must be between 1 and 365")
    return await _service.stats(feature=feature, days=days)
