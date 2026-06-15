from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from app.agents import RepoQA

router = APIRouter(prefix="/ask", tags=["qa"])


class IndexRequest(BaseModel):
    repo_path: str


class QueryRequest(BaseModel):
    index_id: str
    question: str


@router.post("/index")
async def index_repo(request: IndexRequest, req: Request):
    llm = getattr(req.app.state, "llm", None)
    qa = RepoQA(llm)
    try:
        index_id = await qa.index_repo(request.repo_path)
        return {"index_id": index_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/query")
async def query_repo(request: QueryRequest, req: Request):
    llm = getattr(req.app.state, "llm", None)
    qa = RepoQA(llm)
    try:
        answer = await qa.ask(request.index_id, request.question)
        return {"answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
