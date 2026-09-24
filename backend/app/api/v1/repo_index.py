"""Repo Context Index API — parse-once repository context for agents.

Endpoints:
    POST   /repos/index                     — clone + parse + index (or return cached)
    GET    /repos/index/{index_id}          — full context document
    GET    /repos/index/{index_id}/context  — requirement-selected, token-budgeted slice
    DELETE /repos/index/{index_id}          — evict the cache entry

The heavy endpoint (POST) is quota-gated like the explore pipeline; reads
are cheap cache hits and only require an authenticated user.
"""

import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.api.v1.auth import get_current_user
from app.services.quota import enforce_quota
from app.services.repo_context import RepoContextService, index_id_for
from app.services.repo_index_access import (
    find_registered_repository,
    get_index_job,
    grant_index_access,
    list_index_grants,
    parse_github_repo,
    record_index_job,
)

router = APIRouter(prefix="/repos/index", tags=["repo-context"])

_service = RepoContextService()


class BuildIndexRequest(BaseModel):
    repo_url: str
    branch: str = "main"
    max_files: int = 1000
    force: bool = False
    async_build: bool = False
    team_id: Optional[str] = None


class BatchIndexRequest(BaseModel):
    repo_urls: list[str] = Field(..., min_length=1, max_length=20)
    branch: str = "main"
    max_files: int = 1000
    force: bool = False
    async_build: bool = True
    team_id: Optional[str] = None


async def _accessible_team_ids(user: dict) -> set[str]:
    uid = user.get("uid", "")
    if not uid or uid.startswith("api:"):
        return {str(user["team_id"])} if user.get("team_id") else set()
    try:
        from app.services.team_service import get_user_teams
        teams = await get_user_teams(uid)
    except Exception:
        return set()
    return {
        str(team.get("id") or team.get("team_id"))
        for team in (teams or [])
        if team.get("id") or team.get("team_id")
    }


async def _repository_team(user: dict, repo_url: str, requested_team_id: Optional[str]) -> str:
    if not parse_github_repo(repo_url):
        raise HTTPException(status_code=400, detail="Only strict GitHub HTTPS repository URLs are supported")
    repository = await find_registered_repository(repo_url)
    if not repository:
        raise HTTPException(status_code=404, detail="Repository is not registered for this workspace")
    repository_team_id = repository.get("team_id")
    if not repository_team_id:
        raise HTTPException(status_code=403, detail="Repository is not assigned to a team")
    accessible = await _accessible_team_ids(user)
    if str(repository_team_id) not in accessible:
        raise HTTPException(status_code=403, detail="Repository belongs to another team")
    if requested_team_id and str(requested_team_id) != str(repository_team_id):
        raise HTTPException(status_code=403, detail="Repository belongs to another team")
    return str(repository_team_id)


async def _authorize_index(user: dict, index_id: str) -> str:
    accessible = await _accessible_team_ids(user)
    grants = await list_index_grants(index_id)
    if grants:
        allowed = {
            str(grant.get("team_id"))
            for grant in grants
            if grant.get("team_id") and str(grant.get("team_id")) in accessible
        }
        if allowed:
            return sorted(allowed)[0]
        raise HTTPException(status_code=403, detail="Index belongs to another team")

    doc = await _service.get(index_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Index not found")
    repository = await find_registered_repository(doc.get("repo_url", ""))
    team_id = str(repository.get("team_id")) if repository and repository.get("team_id") else None
    if not team_id or team_id not in accessible:
        raise HTTPException(status_code=403, detail="Index belongs to another team")
    await grant_index_access(index_id, team_id, doc.get("repo_url", ""), doc.get("branch", "main"))
    return team_id


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
    team_id = await _repository_team(user, request.repo_url, request.team_id)
    if request.async_build:
        # Lazy import so the API layer never hard-depends on Celery.
        from app.tasks.repo_index_tasks import build_repo_index as _build_task

        try:
            result = _build_task.delay(
                request.repo_url,
                branch=request.branch,
                max_files=request.max_files,
                force=request.force,
                team_id=team_id,
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Failed to enqueue index build: {exc}")
        task_id = str(getattr(result, "id", ""))
        if not task_id:
            raise HTTPException(status_code=502, detail="Index task did not return an id")
        await record_index_job(
            task_id=task_id,
            requested_by=user.get("uid", ""),
            team_id=team_id,
            index_id=index_id_for(request.repo_url, request.branch),
            repo_url=request.repo_url,
        )
        return JSONResponse(
            status_code=202,
            content={
                "queued": True,
                "task_id": task_id,
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
        await grant_index_access(doc["index_id"], team_id, request.repo_url, request.branch)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Index build failed: {exc}")
    return doc


@router.post("/batch")
async def build_index_batch(
    request: BatchIndexRequest,
    user: dict = Depends(get_current_user),
    _q=enforce_quota("explore"),
):
    """Queue several registered repositories without blocking the request."""
    if not request.async_build:
        raise HTTPException(status_code=400, detail="Batch indexing must be asynchronous")

    from app.tasks.repo_index_tasks import build_repo_index

    jobs = []
    seen: set[str] = set()
    for repo_url in request.repo_urls:
        normalized = repo_url.strip()
        if normalized in seen:
            continue
        seen.add(normalized)
        team_id = await _repository_team(user, normalized, request.team_id)
        try:
            task = build_repo_index.delay(
                normalized,
                branch=request.branch,
                max_files=request.max_files,
                force=request.force,
                team_id=team_id,
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail="Failed to enqueue repository index batch")
        task_id = str(getattr(task, "id", ""))
        if not task_id:
            raise HTTPException(status_code=502, detail="Index task did not return an id")
        await record_index_job(
            task_id=task_id,
            requested_by=user.get("uid", ""),
            team_id=team_id,
            index_id=index_id_for(normalized, request.branch),
            repo_url=normalized,
        )
        jobs.append(
            {
                "task_id": task_id,
                "index_id": index_id_for(normalized, request.branch),
                "repo_url": normalized,
                "team_id": team_id,
                "status": "queued",
            }
        )

    return JSONResponse(status_code=202, content={"queued": True, "count": len(jobs), "jobs": jobs})


@router.get("/jobs/{task_id}")
async def get_index_job_status(
    task_id: str,
    user: dict = Depends(get_current_user),
):
    """Return a redacted status for an async repository-index task."""
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", task_id):
        raise HTTPException(status_code=400, detail="Invalid task id")
    job = await get_index_job(task_id)
    if not job:
        raise HTTPException(status_code=404, detail="Index job not found")
    if job.get("requested_by") != user.get("uid"):
        accessible = await _accessible_team_ids(user)
        if not job.get("team_id") or str(job.get("team_id")) not in accessible:
            raise HTTPException(status_code=403, detail="Index job belongs to another team")

    from celery.result import AsyncResult
    from app.tasks.celery_app import celery_app

    result = AsyncResult(task_id, app=celery_app)
    response = {"task_id": task_id, "status": result.state}
    if result.state == "SUCCESS" and isinstance(result.result, dict):
        payload = result.result
        response["result"] = {
            key: payload.get(key)
            for key in ("index_id", "repo_url", "branch", "team_id")
            if key in payload
        }
    elif result.state == "FAILURE":
        response["error"] = "Indexing failed"
    return response


@router.get("/{index_id}",
    responses={404: {"description": "Index not found"}})
async def get_index(
    index_id: str,
    user: dict = Depends(get_current_user),
):
    """Return the full context document (entities + graph + stats)."""
    await _authorize_index(user, index_id)
    doc = await _service.get(index_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Index not found")
    return doc


@router.get("/{index_id}/context",
    responses={404: {"description": "Index not found"}})
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
    await _authorize_index(user, index_id)
    slice_doc = await _service.select_context(index_id, requirement, max_tokens=max_tokens)
    if slice_doc is None:
        raise HTTPException(status_code=404, detail="Index not found")
    return slice_doc


@router.delete("/{index_id}",
    responses={404: {"description": "Index not found"}})
async def evict_index(
    index_id: str,
    user: dict = Depends(get_current_user),
    purge_derived: bool = False,
):
    """Evict the cached index; optionally purge derived embeddings/documents."""
    await _authorize_index(user, index_id)
    removed = await _service.evict(index_id)
    if purge_derived:
        from app.services.embeddings_service import EmbeddingsService
        await EmbeddingsService().delete_index(index_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Index not found")
    result = {"evicted": index_id}
    if purge_derived:
        result["purged_derived"] = True
    return result
