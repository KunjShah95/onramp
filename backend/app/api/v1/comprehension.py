"""Comprehension map API — fog-of-war graph, fact checks, senior walkthroughs.

All routes are scoped to a tracked repository the caller's team owns and read
the durable architecture snapshot; nothing here clones, parses or calls an LLM.
"""

import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.v1.auth import get_current_user
from app.services.architecture_store import architecture_store
from app.services.comprehension_service import (
    MAX_NOTE_LEN,
    MAX_TITLE_LEN,
    MAX_WALKTHROUGH_STEPS,
    SENIOR_ROLES,
    GraphFacts,
    annotate_walkthrough,
    build_checks,
    build_map,
    changed_files_from_diff,
    comprehension_store,
    discussions_for,
    module_context,
    grade_checks,
    pin_steps,
    pr_impact,
    public_check,
    rank_starter_issues,
    repo_key,
    step_status,
    team_overview,
)
from app.services.postgres_db import get_storage

logger = logging.getLogger("onramp.comprehension.api")

router = APIRouter(prefix="/comprehension", tags=["comprehension"])


class RepoScope:
    """Resolved access context for one ``{owner}/{repo}`` request."""

    def __init__(self, repo: dict, role: Optional[str], is_admin: bool):
        self.repo = repo
        self.role = role
        self.is_admin = is_admin

    @property
    def team_id(self) -> Optional[str]:
        return self.repo.get("team_id")

    @property
    def is_senior(self) -> bool:
        return self.is_admin or (self.role or "") in SENIOR_ROLES


async def _scope(owner: str, repo: str, user: dict) -> RepoScope:
    """Resolve the tracked repo and the caller's role on its team."""
    from app.services.team_service import get_user_teams

    rows = await get_storage().query_documents(
        "repositories", [("owner", "==", owner), ("name", "==", repo)]
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Repository not found")
    repo_data = rows[0]
    is_admin = bool(user.get("is_admin"))
    repo_team = repo_data.get("team_id")
    if not repo_team:
        if not is_admin:
            raise HTTPException(status_code=403, detail="Repository is not assigned to a team")
        return RepoScope(repo_data, None, True)

    teams = await get_user_teams(user.get("uid", ""))
    role = next(
        (t.get("role") for t in teams if str(t.get("team_id") or t.get("id")) == str(repo_team)),
        None,
    )
    if role is None and not is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    return RepoScope(repo_data, role, is_admin)


async def _facts(owner: str, repo: str, scope: RepoScope, branch: str) -> GraphFacts:
    facts, _snapshot = await _facts_and_snapshot(owner, repo, scope, branch)
    return facts


async def _facts_and_snapshot(owner: str, repo: str, scope: RepoScope, branch: str):
    repo_url = (scope.repo.get("url") or "").strip() or f"https://github.com/{owner}/{repo}"
    snapshot = await architecture_store.latest(repo_url=repo_url, branch=branch)
    if snapshot is None:
        snapshot = await architecture_store.latest(owner=owner, name=repo, branch=branch)
    if snapshot is None:
        raise HTTPException(
            status_code=404,
            detail="No architecture snapshot yet. Build the graph from Explore first.",
        )
    facts = GraphFacts.from_snapshot(snapshot)
    if not facts.nodes:
        raise HTTPException(status_code=404, detail="Architecture snapshot has no modules")
    return facts, snapshot


def _require_senior(scope: RepoScope) -> None:
    if not scope.is_senior:
        raise HTTPException(status_code=403, detail="Senior role required")


# ── Map ─────────────────────────────────────────────────────────────────────


@router.get("/{owner}/{repo}/map")
async def get_map(
    owner: str,
    repo: str,
    branch: str = Query("main", max_length=100),
    user: dict = Depends(get_current_user),
):
    """The caller's fog-of-war view of the repo graph."""
    scope = await _scope(owner, repo, user)
    facts = await _facts(owner, repo, scope, branch)
    state = await comprehension_store.get_state(user.get("uid", ""), repo_key(owner, repo), branch)
    return {**build_map(facts, state), "branch": branch, "is_senior": scope.is_senior}


# ── Fact checks ─────────────────────────────────────────────────────────────


@router.get("/{owner}/{repo}/checks")
async def get_checks(
    owner: str,
    repo: str,
    node: str = Query(..., min_length=1, max_length=500),
    branch: str = Query("main", max_length=100),
    user: dict = Depends(get_current_user),
):
    """Graph-derived questions for one node. The answer key stays server-side."""
    scope = await _scope(owner, repo, user)
    facts = await _facts(owner, repo, scope, branch)
    if not facts.has(node):
        raise HTTPException(status_code=404, detail="Node not in the current graph")
    uid = user.get("uid", "")
    state = await comprehension_store.get_state(uid, repo_key(owner, repo), branch)
    return {
        "node": node,
        "questions": [public_check(q) for q in build_checks(facts, node, uid)],
        "locked_for_seconds": comprehension_store.lockout_remaining(state, node),
    }


class GradeRequest(BaseModel):
    node: str = Field(..., min_length=1, max_length=500)
    branch: str = Field(default="main", max_length=100)
    answers: Dict[str, List[str]] = Field(default_factory=dict)


@router.post("/{owner}/{repo}/checks/grade")
async def grade(
    owner: str,
    repo: str,
    body: GradeRequest,
    user: dict = Depends(get_current_user),
):
    """Grade a node's checks against graph facts; passing lights the node."""
    scope = await _scope(owner, repo, user)
    facts = await _facts(owner, repo, scope, body.branch)
    if not facts.has(body.node):
        raise HTTPException(status_code=404, detail="Node not in the current graph")
    uid = user.get("uid", "")
    key = repo_key(owner, repo)
    state = await comprehension_store.get_state(uid, key, body.branch)
    locked = comprehension_store.lockout_remaining(state, body.node)
    if locked:
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed attempts on this module. Try again in {locked // 60 + 1} min, or take a walkthrough.",
        )
    result = grade_checks(facts, body.node, uid, body.answers)
    if not result["results"]:
        raise HTTPException(status_code=422, detail="This module has no verifiable checks")
    if result["passed"]:
        await comprehension_store.light(
            facts, uid=uid, key=key, branch=body.branch, team_id=scope.team_id,
            nodes=[body.node], source="check",
        )
    else:
        await comprehension_store.record_failure(
            uid=uid, key=key, branch=body.branch, team_id=scope.team_id, node=body.node,
        )
    return result


# ── Senior walkthroughs ─────────────────────────────────────────────────────


class StepIn(BaseModel):
    node: str = Field(..., min_length=1, max_length=500)
    note: str = Field(default="", max_length=MAX_NOTE_LEN)


class WalkthroughIn(BaseModel):
    title: str = Field(..., min_length=3, max_length=MAX_TITLE_LEN)
    summary: str = Field(default="", max_length=MAX_NOTE_LEN)
    branch: str = Field(default="main", max_length=100)
    steps: List[StepIn] = Field(..., min_length=1, max_length=MAX_WALKTHROUGH_STEPS)


class WalkthroughUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=3, max_length=MAX_TITLE_LEN)
    summary: Optional[str] = Field(default=None, max_length=MAX_NOTE_LEN)
    steps: Optional[List[StepIn]] = Field(default=None, min_length=1, max_length=MAX_WALKTHROUGH_STEPS)


async def _owned_walkthrough(owner: str, repo: str, walkthrough_id: str) -> dict:
    doc = await comprehension_store.get_walkthrough(walkthrough_id)
    if not doc or doc.get("repo_key") != repo_key(owner, repo):
        raise HTTPException(status_code=404, detail="Walkthrough not found")
    return doc


@router.get("/{owner}/{repo}/walkthroughs")
async def list_walkthroughs(
    owner: str,
    repo: str,
    branch: str = Query("main", max_length=100),
    user: dict = Depends(get_current_user),
):
    scope = await _scope(owner, repo, user)
    facts = await _facts(owner, repo, scope, branch)
    uid = user.get("uid", "")
    rows = await comprehension_store.list_walkthroughs(repo_key(owner, repo), branch)
    walkthroughs = [annotate_walkthrough(facts, r, completed_by=[uid]) for r in rows]

    # Critical hubs no fresh tour covers — where a senior should record next.
    covered = {
        s["node"] for w in walkthroughs for s in w["steps"] if s["status"] == "fresh"
    }
    gaps = [n for n in facts.critical_nodes() if n not in covered]
    return {"walkthroughs": walkthroughs, "coverage_gaps": gaps, "can_author": scope.is_senior}


@router.post("/{owner}/{repo}/walkthroughs", status_code=201)
async def create_walkthrough(
    owner: str,
    repo: str,
    body: WalkthroughIn,
    user: dict = Depends(get_current_user),
):
    scope = await _scope(owner, repo, user)
    _require_senior(scope)
    facts = await _facts(owner, repo, scope, body.branch)
    steps, unknown = pin_steps(facts, [s.model_dump() for s in body.steps])
    if unknown:
        raise HTTPException(status_code=422, detail={"message": "Unknown modules", "nodes": unknown})
    doc = await comprehension_store.save_walkthrough({
        "repo_key": repo_key(owner, repo),
        "branch": body.branch,
        "team_id": scope.team_id,
        "author_uid": user.get("uid"),
        "author_name": user.get("name") or user.get("email") or "",
        "title": body.title.strip(),
        "summary": body.summary.strip(),
        "steps": steps,
        "pinned_commit": facts.commit,
        "completed_by": [],
    })
    return annotate_walkthrough(facts, doc, completed_by=[user.get("uid", "")])


@router.put("/{owner}/{repo}/walkthroughs/{walkthrough_id}")
async def update_walkthrough(
    owner: str,
    repo: str,
    walkthrough_id: str,
    body: WalkthroughUpdate,
    user: dict = Depends(get_current_user),
):
    """Edit and/or re-verify a tour. Re-pins every step to the current graph."""
    scope = await _scope(owner, repo, user)
    _require_senior(scope)
    doc = await _owned_walkthrough(owner, repo, walkthrough_id)
    facts = await _facts(owner, repo, scope, doc.get("branch") or "main")
    raw_steps = [s.model_dump() for s in body.steps] if body.steps is not None else [
        # Re-verifying keeps notes but drops steps whose module no longer exists.
        s for s in doc.get("steps") or [] if step_status(facts, s) != "removed"
    ]
    steps, unknown = pin_steps(facts, raw_steps)
    if unknown:
        raise HTTPException(status_code=422, detail={"message": "Unknown modules", "nodes": unknown})
    if not steps:
        raise HTTPException(status_code=422, detail="Walkthrough would have no steps left")
    updated = {
        **doc,
        "title": (body.title or doc.get("title") or "").strip(),
        "summary": (body.summary if body.summary is not None else doc.get("summary") or "").strip(),
        "steps": steps,
        "pinned_commit": facts.commit,
        "verified_by": user.get("uid"),
    }
    saved = await comprehension_store.save_walkthrough(updated)
    return annotate_walkthrough(facts, saved, completed_by=[user.get("uid", "")])


@router.delete("/{owner}/{repo}/walkthroughs/{walkthrough_id}")
async def delete_walkthrough(
    owner: str,
    repo: str,
    walkthrough_id: str,
    user: dict = Depends(get_current_user),
):
    scope = await _scope(owner, repo, user)
    doc = await _owned_walkthrough(owner, repo, walkthrough_id)
    if doc.get("author_uid") != user.get("uid") and not scope.is_admin and scope.role not in {"cto", "ceo", "admin"}:
        raise HTTPException(status_code=403, detail="Only the author or a team lead can delete this walkthrough")
    await comprehension_store.delete_walkthrough(walkthrough_id)
    return {"ok": True}


@router.post("/{owner}/{repo}/walkthroughs/{walkthrough_id}/complete")
async def complete_walkthrough(
    owner: str,
    repo: str,
    walkthrough_id: str,
    user: dict = Depends(get_current_user),
):
    """Finish a tour: lights every step whose code hasn't moved since recording."""
    scope = await _scope(owner, repo, user)
    doc = await _owned_walkthrough(owner, repo, walkthrough_id)
    branch = doc.get("branch") or "main"
    facts = await _facts(owner, repo, scope, branch)
    fresh = [s["node"] for s in doc.get("steps") or [] if step_status(facts, s) == "fresh"]
    uid = user.get("uid", "")
    if fresh:
        await comprehension_store.light(
            facts, uid=uid, key=repo_key(owner, repo), branch=branch,
            team_id=scope.team_id, nodes=fresh, source=f"walkthrough:{walkthrough_id}",
        )
    completed_by = list(doc.get("completed_by") or [])
    if uid not in completed_by:
        completed_by.append(uid)
        doc = await comprehension_store.save_walkthrough({**doc, "completed_by": completed_by})
    skipped = len(doc.get("steps") or []) - len(fresh)
    return {"lit": fresh, "skipped_stale": skipped, "walkthrough": annotate_walkthrough(facts, doc, completed_by=[uid])}


# ── Team view (seniors) ─────────────────────────────────────────────────────


@router.get("/{owner}/{repo}/team")
async def team_view(
    owner: str,
    repo: str,
    branch: str = Query("main", max_length=100),
    user: dict = Depends(get_current_user),
):
    """Who understands what, and which modules the team keeps failing on."""
    scope = await _scope(owner, repo, user)
    _require_senior(scope)
    facts = await _facts(owner, repo, scope, branch)
    states, names = await _team_states(owner, repo, scope, branch)
    return team_overview(facts, states, names)


async def _team_states(owner: str, repo: str, scope: RepoScope, branch: str):
    """Comprehension states of the repo team's current members, plus names."""
    states = await comprehension_store.team_states(repo_key(owner, repo), branch)
    names: Dict[str, str] = {}
    if scope.team_id:
        try:
            from app.services.team_service import get_team_members

            members = await get_team_members(scope.team_id)
            names = {str(m.get("id") or m.get("user_id")): (m.get("name") or m.get("email") or "") for m in members}
            states = [s for s in states if str(s.get("uid")) in names]
        except Exception:
            logger.debug("Team member lookup failed for %s", scope.team_id, exc_info=True)
    return states, names


# ── Blast radius: starter issues + change impact ────────────────────────────


def _repo_url(owner: str, repo: str, scope: RepoScope) -> str:
    return (scope.repo.get("url") or "").strip() or f"https://github.com/{owner}/{repo}"


@router.get("/{owner}/{repo}/starter-issues")
async def starter_issues(
    owner: str,
    repo: str,
    branch: str = Query("main", max_length=100),
    user: dict = Depends(get_current_user),
):
    """Open issues ranked by blast radius and by what the caller already knows."""
    scope = await _scope(owner, repo, user)
    facts = await _facts(owner, repo, scope, branch)
    from app.services.github_service import GitHubService

    gh = GitHubService()
    url = _repo_url(owner, repo, scope)
    labelled = True
    try:
        issues = await gh.get_issues(url, labels=["good first issue"], limit=30)
        if not issues:
            labelled = False
            issues = await gh.get_issues(url, limit=30)
    except Exception:
        logger.exception("Starter issue fetch failed for %s/%s", owner, repo)
        raise HTTPException(status_code=502, detail="Could not fetch issues from GitHub")
    state = await comprehension_store.get_state(user.get("uid", ""), repo_key(owner, repo), branch)
    ranked = rank_starter_issues(facts, [i.to_dict() for i in issues], state.get("lit") or {})
    return {"issues": ranked, "labelled_good_first_issue": labelled}


class ImpactRequest(BaseModel):
    branch: str = Field(default="main", max_length=100)
    files: List[str] = Field(default_factory=list, max_length=500)
    nodes: List[str] = Field(default_factory=list, max_length=200)


@router.post("/{owner}/{repo}/impact")
async def change_impact(
    owner: str,
    repo: str,
    body: ImpactRequest,
    user: dict = Depends(get_current_user),
):
    """What changing these files/modules can break, and who understands them."""
    if not body.files and not body.nodes:
        raise HTTPException(status_code=422, detail="Provide files or nodes")
    scope = await _scope(owner, repo, user)
    facts = await _facts(owner, repo, scope, body.branch)
    states, names = await _team_states(owner, repo, scope, body.branch)
    return pr_impact(facts, [*body.files, *body.nodes], states, names, exclude_uid=user.get("uid"))


@router.get("/{owner}/{repo}/pr/{pr_number}/impact")
async def pr_change_impact(
    owner: str,
    repo: str,
    pr_number: int,
    branch: str = Query("main", max_length=100),
    user: dict = Depends(get_current_user),
):
    """Blast radius of an open PR plus reviewers who demonstrably understand it."""
    if pr_number < 1:
        raise HTTPException(status_code=422, detail="Invalid PR number")
    scope = await _scope(owner, repo, user)
    facts = await _facts(owner, repo, scope, branch)
    from app.services.github_service import GitHubService

    diff = await GitHubService().get_pr_diff(_repo_url(owner, repo, scope), pr_number)
    files = changed_files_from_diff(diff)
    if not files:
        raise HTTPException(status_code=404, detail="PR not found or has no file changes")
    states, names = await _team_states(owner, repo, scope, branch)
    return {"pr_number": pr_number, "files": files, **pr_impact(facts, files, states, names, exclude_uid=user.get("uid"))}


# ── Agent briefing (used by the read-only MCP server) ───────────────────────


async def build_change_briefing(user: dict, owner: str, repo: str, files: List[str], branch: str = "main") -> dict:
    """Everything a human or coding agent should know before touching ``files``.

    Combines blast radius, critical-path exposure, the team's senior
    walkthrough notes on those modules (with staleness) and who has
    demonstrated understanding of them. Read-only; same team scoping as the UI.
    """
    scope = await _scope(owner, repo, user)
    facts, snapshot = await _facts_and_snapshot(owner, repo, scope, branch)
    states, names = await _team_states(owner, repo, scope, branch)
    impact = pr_impact(facts, files, states, names, exclude_uid=user.get("uid"))
    evolution = snapshot.get("evolution") or {}
    touched = set(impact["changed_modules"])
    notes = []
    for w in await comprehension_store.list_walkthroughs(repo_key(owner, repo), branch):
        for step in w.get("steps") or []:
            if step.get("node") in touched and step.get("note"):
                notes.append({
                    "module": step["node"],
                    "walkthrough": w.get("title"),
                    "author": w.get("author_name"),
                    "note": step["note"],
                    "status": step_status(facts, step),
                })
    why = []
    for node in impact["changed_modules"][:10]:
        ctx = module_context(
            facts, node, evolution, states=[], names={}, walkthroughs=[],
            repo_url=_repo_url(owner, repo, scope),
            discussions=await discussions_for(
                repo_key(owner, repo), (facts.node_files.get(node) or []) + [node]
            ),
        )
        if ctx["why"]["history"] or ctx["why"]["decisions"] or ctx["why"]["discussions"]:
            why.append({
                "module": node,
                "recent_changes": [
                    {"subject": c.get("subject"), "author": c.get("author"), "pr_url": c.get("pr_url")}
                    for c in ctx["why"]["history"][:3]
                ],
                "decisions": ctx["why"]["decisions"][:3],
                "review_discussion": [
                    {"author": d.get("author"), "body": d.get("body"), "pr_url": d.get("pr_url")}
                    for d in ctx["why"]["discussions"][:3]
                ],
                "authors": [a["name"] for a in ctx["who"]["wrote"][:3]],
            })
    return {
        "repo": f"{owner}/{repo}",
        "branch": branch,
        "commit": facts.commit,
        **impact,
        "senior_notes": notes,
        "why": why,
    }


@router.get("/{owner}/{repo}/context")
async def get_module_context(
    owner: str,
    repo: str,
    node: str = Query(..., min_length=1, max_length=500),
    branch: str = Query("main", max_length=100),
    user: dict = Depends(get_current_user),
):
    """Why a module looks like this and who to ask about it."""
    scope = await _scope(owner, repo, user)
    facts, snapshot = await _facts_and_snapshot(owner, repo, scope, branch)
    if not facts.has(node):
        raise HTTPException(status_code=404, detail="Node not in the current graph")
    states, names = await _team_states(owner, repo, scope, branch)
    walkthroughs = await comprehension_store.list_walkthroughs(repo_key(owner, repo), branch)
    files = (facts.node_files.get(node) or []) + [node]
    return module_context(
        facts, node, snapshot.get("evolution") or {},
        states=states, names=names, walkthroughs=walkthroughs,
        repo_url=_repo_url(owner, repo, scope),
        discussions=await discussions_for(repo_key(owner, repo), files),
    )

