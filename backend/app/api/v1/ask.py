import json
from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.agents import RepoQA
from app.services.quota import enforce_quota
from app.services.conversation_service import ConversationService
from app.api.v1.auth import get_current_user

router = APIRouter(prefix="/ask", tags=["qa"])

_conversation = ConversationService()


class IndexRequest(BaseModel):
    repo_path: str


class QueryRequest(BaseModel):
    index_id: str
    question: str
    use_memory: bool = True


@router.post("/index")
async def index_repo(request: IndexRequest, req: Request, _q=enforce_quota("analyze")):
    llm = getattr(req.app.state, "llm", None)
    qa = RepoQA(llm)
    try:
        index_id = await qa.index_repo(request.repo_path)
        return {"index_id": index_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def _get_memory(user_id: str, index_id: str, question: str, use_memory: bool) -> str:
    if not use_memory:
        return ""
    relevant = await _conversation.get_relevant(user_id, index_id, question, top_k=3)
    return ConversationService.format_memory(relevant)


@router.post("/query")
async def query_repo(
    request: QueryRequest,
    req: Request,
    user: dict = Depends(get_current_user),
    _q=enforce_quota("chat"),
):
    llm = getattr(req.app.state, "llm", None)
    qa = RepoQA(llm)
    user_id = user.get("uid")

    memory = await _get_memory(user_id, request.index_id, request.question, request.use_memory)

    try:
        answer = await qa.ask(request.index_id, request.question, memory)
        await _conversation.add_turn(user_id, request.index_id, request.question, answer)
        return {"answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/query/stream")
async def query_repo_stream(
    request: QueryRequest,
    req: Request,
    user: dict = Depends(get_current_user),
    _q=enforce_quota("chat"),
):
    """Stream the answer as Server-Sent Events (text/event-stream)."""
    llm = getattr(req.app.state, "llm", None)
    qa = RepoQA(llm)
    user_id = user.get("uid")

    memory = await _get_memory(user_id, request.index_id, request.question, request.use_memory)

    async def event_gen():
        full_answer = ""
        try:
            async for token in qa.ask_stream(request.index_id, request.question, memory):
                full_answer += token
                yield f"data: {json.dumps({'token': token})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            if full_answer:
                await _conversation.add_turn(user_id, request.index_id, request.question, full_answer)

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/history/{index_id}")
async def get_history(
    index_id: str,
    limit: int = 10,
    user: dict = Depends(get_current_user),
):
    """Get conversation history for an index."""
    user_id = user.get("uid")
    turns = await _conversation.get_history(user_id, index_id, limit)
    return {"history": turns}


@router.delete("/history/{index_id}")
async def clear_history(
    index_id: str,
    user: dict = Depends(get_current_user),
):
    """Clear conversation history for an index."""
    user_id = user.get("uid")
    count = await _conversation.clear(user_id, index_id)
    return {"cleared": count}
