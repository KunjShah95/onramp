"""Community playbook marketplace API.

Publish team playbooks to a shared catalog, discover/search listings, import a
listing into your team, and rate what you use.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional

from app.api.v1.auth import get_current_user
from app.services.field_encryption import decrypt_field
from app.services.marketplace_service import MarketplaceService

router = APIRouter(prefix="/marketplace", tags=["marketplace"])
service = MarketplaceService()


class PublishRequest(BaseModel):
    source_playbook_id: str


class ImportRequest(BaseModel):
    team_id: str


class RateRequest(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: str = ""


@router.get("/playbooks")
async def list_marketplace(
    search: str = "",
    tag: str = "",
    sort: str = Query("popular", pattern="^(popular|top_rated|newest)$"),
    limit: int = Query(50, ge=1, le=100),
    _user: dict = Depends(get_current_user),
):
    """List/search public marketplace playbooks."""
    listings = await service.list_listings(search=search, tag=tag, sort=sort, limit=limit)
    return {"listings": listings, "count": len(listings)}


@router.get("/playbooks/{listing_id}")
async def get_listing(listing_id: str, _user: dict = Depends(get_current_user)):
    listing = await service.get_listing(listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    listing["ratings"] = await service.list_ratings(listing_id, limit=20)
    return listing


@router.post("/publish")
async def publish(request: PublishRequest, user: dict = Depends(get_current_user)):
    """Publish one of your team's playbooks to the marketplace."""
    try:
        return await service.publish(
            source_playbook_id=request.source_playbook_id,
            publisher_id=user.get("uid", ""),
            publisher_name=decrypt_field(user.get("name") or user.get("email", "")),
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/playbooks/{listing_id}")
async def unpublish(listing_id: str, user: dict = Depends(get_current_user)):
    try:
        ok = await service.unpublish(listing_id, requester_id=user.get("uid", ""))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    if not ok:
        raise HTTPException(status_code=404, detail="Listing not found")
    return {"unpublished": True}


@router.post("/playbooks/{listing_id}/import")
async def import_listing(
    listing_id: str, request: ImportRequest, user: dict = Depends(get_current_user)
):
    """Import a marketplace listing into a team as a new playbook."""
    try:
        return await service.import_listing(
            listing_id=listing_id, team_id=request.team_id, user_id=user.get("uid", "")
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/playbooks/{listing_id}/rate")
async def rate_listing(
    listing_id: str, request: RateRequest, user: dict = Depends(get_current_user)
):
    """Rate a marketplace listing (1–5). One rating per user; re-rating updates it."""
    try:
        return await service.rate_listing(
            listing_id=listing_id,
            user_id=user.get("uid", ""),
            rating=request.rating,
            comment=request.comment,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
