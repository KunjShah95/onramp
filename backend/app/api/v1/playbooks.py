from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from app.services.playbook_service import PlaybookService

router = APIRouter(prefix="/playbooks", tags=["saas"])
playbook_service = PlaybookService()


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
async def create_playbook(request: CreatePlaybookRequest):
    return await playbook_service.create_playbook(
        team_id=request.team_id,
        title=request.title,
        description=request.description,
        steps=request.steps,
        created_by=request.created_by,
        tags=request.tags,
    )


@router.get("/{playbook_id}")
async def get_playbook(playbook_id: str):
    pb = await playbook_service.get_playbook(playbook_id)
    if not pb:
        raise HTTPException(status_code=404, detail="Playbook not found")
    await playbook_service.increment_use(playbook_id)
    return pb


@router.get("")
async def list_playbooks(team_id: str):
    pbs = await playbook_service.list_playbooks(team_id)
    return {"playbooks": pbs, "count": len(pbs)}


@router.patch("/{playbook_id}")
async def update_playbook(playbook_id: str, request: UpdatePlaybookRequest):
    updates = {k: v for k, v in request.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await playbook_service.update_playbook(playbook_id, updates)
    if not result:
        raise HTTPException(status_code=404, detail="Playbook not found")
    return result


@router.delete("/{playbook_id}")
async def archive_playbook(playbook_id: str):
    success = await playbook_service.archive_playbook(playbook_id)
    if not success:
        raise HTTPException(status_code=404, detail="Playbook not found")
    return {"archived": True}
