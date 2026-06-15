from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from app.agents import LearningPathGenerator

router = APIRouter(prefix="/learn", tags=["learning"])


class LearnRequest(BaseModel):
    repo_structure: dict
    user_level: str


@router.post("/path")
async def generate_path(request: LearnRequest, req: Request):
    llm = getattr(req.app.state, "llm", None)
    generator = LearningPathGenerator(llm)
    try:
        result = await generator.execute(
            repo_structure=request.repo_structure,
            user_level=request.user_level
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
