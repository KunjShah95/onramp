from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from app.services.playbook_service import PlaybookService
from app.api.v1.auth import get_current_user
from app.api.v1.index_access import _team_ids

router = APIRouter(prefix="/playbooks", tags=["saas"])
playbook_service = PlaybookService()


async def _require_playbook_access(user: dict, playbook: dict) -> None:
    if not playbook or str(playbook.get("team_id")) not in await _team_ids(user):
        raise HTTPException(status_code=403, detail="Playbook belongs to another team")


class CreatePlaybookRequest(BaseModel):
    team_id: str
    title: str
    description: str
    steps: List[str]
    created_by: str
    tags: Optional[List[str]] = None


class UpdatePlaybookRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    steps: Optional[List[str]] = None
    tags: Optional[List[str]] = None


@router.post("")
async def create_playbook(
    request: CreatePlaybookRequest,
    user: dict = Depends(get_current_user),
):
    if str(request.team_id) not in await _team_ids(user):
        raise HTTPException(status_code=403, detail="Not a member of this team")
    return await playbook_service.create_playbook(
        team_id=request.team_id,
        title=request.title,
        description=request.description,
        steps=request.steps,
        created_by=user.get("uid", ""),
        tags=request.tags,
    )


@router.get("/{playbook_id}", responses={404: {"description": "Playbook not found"}})
async def get_playbook(playbook_id: str, user: dict = Depends(get_current_user)):
    pb = await playbook_service.get_playbook(playbook_id)
    if not pb:
        raise HTTPException(status_code=404, detail="Playbook not found")
    await _require_playbook_access(user, pb)
    await playbook_service.increment_use(playbook_id)
    return pb


@router.get("")
async def list_playbooks(team_id: str, user: dict = Depends(get_current_user)):
    if str(team_id) not in await _team_ids(user):
        raise HTTPException(status_code=403, detail="Not a member of this team")
    pbs = await playbook_service.list_playbooks(team_id)
    return {"playbooks": pbs, "count": len(pbs)}


@router.patch("/{playbook_id}", responses={404: {"description": "Playbook not found"}})
async def update_playbook(
    playbook_id: str,
    request: UpdatePlaybookRequest,
    user: dict = Depends(get_current_user),
):
    existing = await playbook_service.get_playbook(playbook_id)
    await _require_playbook_access(user, existing)
    updates = {k: v for k, v in request.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await playbook_service.update_playbook(playbook_id, updates)
    if not result:
        raise HTTPException(status_code=404, detail="Playbook not found")
    return result


@router.delete("/{playbook_id}", responses={404: {"description": "Playbook not found"}})
async def archive_playbook(playbook_id: str, user: dict = Depends(get_current_user)):
    existing = await playbook_service.get_playbook(playbook_id)
    await _require_playbook_access(user, existing)
    success = await playbook_service.archive_playbook(playbook_id)
    if not success:
        raise HTTPException(status_code=404, detail="Playbook not found")
    return {"archived": True}
