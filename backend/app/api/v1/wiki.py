import logging
from fastapi import APIRouter, Depends, HTTPException

from app.api.v1.auth import get_current_user
from app.services.wiki_service import generate_wiki

logger = logging.getLogger("onramp.api.wiki")

router = APIRouter(prefix="/wiki", tags=["wiki"])


@router.post("/generate")
async def generate_onboarding_wiki(payload: dict, user: dict = Depends(get_current_user)):
    repo_url = payload.get("repo_url", "")
    if not repo_url:
        raise HTTPException(status_code=400, detail="repo_url required")
    parts = repo_url.rstrip("/").split("/")
    if len(parts) < 2:
        raise HTTPException(status_code=400, detail="Invalid repo URL")
    owner, name = parts[-2], parts[-1]
    wiki = await generate_wiki(owner, name)
    return wiki
