"""Repo Context Index API — parse-once repository context for agents.

Endpoints:
    POST   /repos/index                     — clone + parse + index (or return cached)
    GET    /repos/index/{index_id}          — full context document
    GET    /repos/index/{index_id}/context  — requirement-selected, token-budgeted slice
    DELETE /repos/index/{index_id}          — evict the cache entry

The heavy endpoint (POST) is quota-gated like the explore pipeline; reads
are cheap cache hits and only require an authenticated user.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.api.v1.auth import get_current_user
from app.services.quota import enforce_quota
from app.services.repo_context import RepoContextService

router = APIRouter(prefix="/repos/index", tags=["repo-context"])

_service = RepoContextService()


class BuildIndexRequest(BaseModel):
    repo_url: str
    branch: str = "main"
    max_files: int = 1000
    force: bool = False
    async_build: bool = False


@router.post("")
async def build_index(
    request: BuildIndexRequest,
    req: Request,
    user: dict = Depends(get_current_user),
    _q=enforce_quota("explore"),
):
    """Clone + parse + index a repository once; reuse the cached document on later calls.

    Returns the context document with ``cached`` set to True when the
    request was served entirely from the Redis index (no clone, no parse).

    Set ``"async_build": true`` to dispatch the build to the Celery
    ``build_repo_index`` task instead — returns ``202 Accepted`` with a
    task id immediately, so indexes can be pre-built (e.g. on repo
    registration) without blocking the request.
    """
    if request.async_build:
        # Lazy import so the API layer never hard-depends on Celery.
        from app.tasks.repo_index_tasks import build_repo_index as _build_task

        try:
            result = _build_task.delay(
                request.repo_url,
                branch=request.branch,
                max_files=request.max_files,
                force=request.force,
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Failed to enqueue index build: {exc}")
        return JSONResponse(
            status_code=202,
            content={
                "queued": True,
                "task_id": str(getattr(result, "id", "")),
                "repo_url": request.repo_url,
                "branch": request.branch,
            },
        )
    try:
        doc = await _service.build(
            request.repo_url,
            branch=request.branch,
            max_files=request.max_files,
            force=request.force,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Index build failed: {exc}")
    return doc


@router.get("/{index_id}")
async def get_index(
    index_id: str,
    user: dict = Depends(get_current_user),
):
    """Return the full context document (entities + graph + stats)."""
    doc = await _service.get(index_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Index not found")
    return doc


@router.get("/{index_id}/context")
async def select_index(
    index_id: str,
    requirement: str = "",
    max_tokens: int = 4000,
    user: dict = Depends(get_current_user),
):
    """Return a requirement-selected, token-budgeted slice of the index.

    The slice contains only files relevant to ``requirement`` (scored by
    path + symbol overlap) and its rendered ``context_text`` never exceeds
    ``max_tokens`` — this is what agents embed into LLM prompts.
    """
    if not requirement.strip():
        raise HTTPException(status_code=400, detail="requirement is required")
    slice_doc = await _service.select_context(index_id, requirement, max_tokens=max_tokens)
    if slice_doc is None:
        raise HTTPException(status_code=404, detail="Index not found")
    return slice_doc


@router.delete("/{index_id}")
async def evict_index(
    index_id: str,
    user: dict = Depends(get_current_user),
):
    """Evict the cached index so the next build re-parses the repo."""
    removed = await _service.evict(index_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Index not found")
    return {"evicted": index_id}
