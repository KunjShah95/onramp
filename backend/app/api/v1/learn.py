from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from app.agents import LearningPathGenerator
from app.api.v1.auth import get_current_user
from app.services.postgres_db import get_storage, generate_id

router = APIRouter(prefix="/learn", tags=["learning"])

COLLECTION = "onramp_learning_paths"


class LearnRequest(BaseModel):
    repo_structure: dict
    user_level: str
    repo_url: str = ""


@router.post("/path")
async def generate_path(
    request: LearnRequest,
    req: Request,
    user: dict = Depends(get_current_user),
):
    llm = getattr(req.app.state, "llm", None)
    generator = LearningPathGenerator(llm)
    try:
        result = await generator.execute(
            repo_structure=request.repo_structure,
            user_level=request.user_level,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    uid = user.get("uid", "anonymous")
    path_id = generate_id()
    storage = get_storage()
    await storage.create_document(COLLECTION, path_id, {
        "path_id": path_id,
        "user_id": uid,
        "repo_url": request.repo_url,
        "user_level": request.user_level,
        "result": result,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    return {**result, "path_id": path_id}


@router.get("/paths")
async def list_paths(
    user: dict = Depends(get_current_user),
    limit: int = 5,
):
    """Return the authenticated user's most recent learning paths."""
    uid = user.get("uid", "")
    storage = get_storage()
    rows = await storage.query_documents(COLLECTION, [("user_id", "==", uid)])
    rows.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return {"paths": rows[:limit]}


@router.get("/paths/{path_id}")
async def get_path(path_id: str, user: dict = Depends(get_current_user)):
    storage = get_storage()
    doc = await storage.get_document(COLLECTION, path_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Learning path not found")
    if doc.get("user_id") != user.get("uid"):
        raise HTTPException(status_code=403, detail="Not your learning path")
    return doc
