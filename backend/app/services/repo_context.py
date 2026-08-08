"""Repo Context Service — parse-once, reuse-everywhere repository context.

Pipeline (stages 1, 2 and 4 of the context strategy):

  1. **Index** — clone + parse a repository *once* (keyed by HEAD commit),
     then persist a compact context document (entities + dependency graph +
     stats) to Redis under a stable ``index_id``. Every later request reuses
     the cached document instead of re-cloning/re-parsing the repo.
  2. **Select** — ``select_context()`` scores files against a requirement
     (the task an agent is bound to do) and returns only the relevant slice
     of the index, so agents never receive the whole repository.
  4. **Budget** — every slice is trimmed to a ``max_tokens`` budget using
     :func:`app.services.llm_costs.estimate_tokens`, so LLM prompts stay
     small (biggest token saver after the free-first router).

Redis is optional: when ``REDIS_URL`` is unset (dev, tests) the service
falls back to an in-process TTL cache, so behavior is identical everywhere.
"""

import asyncio
import hashlib
import json
import logging
import os
import shutil
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.services.llm_costs import estimate_tokens

logger = logging.getLogger("onramp.repo_context")

REDIS_PREFIX = "repo:ctx"
DEFAULT_TTL = int(os.getenv("REPO_CONTEXT_TTL", str(24 * 3600)))  # 24h default

# ── In-process fallback when Redis is unavailable ──────────────────────
_LOCAL_CACHE: Dict[str, Dict[str, Any]] = {}
_LOCAL_CACHE_LOCK = asyncio.Lock()


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _redis():
    """Redis client or None (graceful fallback)."""
    try:
        from app.services.cache_service import get_client

        return await get_client()
    except Exception:
        return None


def index_id_for(repo_url: str, branch: str = "main") -> str:
    """Stable index id for a (repo_url, branch) pair.

    Deterministic (no randomness, no timestamps) so repeated builds of the
    same repo always hit the same cache key — this is what makes the
    parse-once pipeline idempotent.
    """
    normalized = repo_url.strip().rstrip("/")
    raw = f"{normalized}@{branch}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:16]


class RepoContextService:
    """Build/read/select repository context documents."""

    def __init__(self, ttl: int = DEFAULT_TTL):
        self.ttl = ttl

    # ── Key helpers ──────────────────────────────────────────────────────

    def _key(self, index_id: str) -> str:
        return f"{REDIS_PREFIX}:{index_id}"

    # ── Build (Stage 1: parse-once) ─────────────────────────────────────

    async def build(
        self,
        repo_url: str,
        branch: str = "main",
        max_files: int = 1000,
        force: bool = False,
    ) -> Dict[str, Any]:
        """Clone + parse + index a repository, or return the cached document.

        Returns a context document::

            {
              "index_id": "...",
              "repo_url": "...", "branch": "main",
              "commit": "abc123...",
              "built_at": "2026-08-08T...",
              "cached": True,            # True when served from cache
              "stats": {"file_count": N, "class_count": M, ...},
              "entities": {...},          # parsed entities (full index)
              "graph": {...},             # dependency graph dict
            }

        ``force=True`` always re-clones + re-parses and overwrites the cache.
        """
        index_id = index_id_for(repo_url, branch)
        existing = await self.get(index_id)
        if existing and not force:
            # Return a copy so the stored document is never mutated.
            logger.info("Repo context cache hit: %s (%s)", index_id, repo_url)
            return {**existing, "cached": True}

        # Parse once: clone → parse → graph, then persist.
        from app.services.github_service import GitHubService
        from app.services.parser_service import ParserService
        from app.graph import build_dependency_graph

        repo_path = None
        try:
            github = GitHubService()
            repo_path = await github.clone_repo(repo_url, branch)
            commit = await self._head_commit(repo_path)
            entities = await ParserService().parse_directory(repo_path, max_files=max_files)
            graph = build_dependency_graph(entities).to_dict(max_nodes=150)
            # Evolution layer: git-history signals (commits, ownership) —
            # deterministic and free, captured while the clone exists.
            evolution = await self.git_evolution(repo_path)
        finally:
            if repo_path:
                shutil.rmtree(repo_path, ignore_errors=True)

        stats = self._stats(entities)
        doc = {
            "index_id": index_id,
            "repo_url": repo_url,
            "branch": branch,
            "commit": commit,
            "built_at": _iso_now(),
            "cached": False,
            "stats": stats,
            "entities": entities,
            "graph": graph,
            "evolution": evolution,
        }
        await self.set(index_id, doc)
        logger.info(
            "Built repo context %s: %d files, %d classes (commit %s)",
            index_id, stats["file_count"], stats["class_count"], commit,
        )
        return doc

    @staticmethod
    async def _head_commit(repo_path: str) -> Optional[str]:
        """HEAD commit sha of a freshly cloned repo (best-effort)."""
        try:
            proc = await asyncio.create_subprocess_exec(
                "git", "-C", repo_path, "rev-parse", "HEAD",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
            )
            out, _ = await proc.communicate()
            if proc.returncode == 0:
                return out.decode().strip()[:12]
        except Exception:
            pass
        return None

    @staticmethod
    async def git_evolution(repo_path: str, max_commits: int = 50) -> Dict[str, Any]:
        """Git-history signals for the evolution layer (deterministic, no LLM).

        Runs on the freshly cloned tree while it exists: the most recent
        commits (sha, author, date, subject) and per-file ownership from
        ``git shortlog`` (who has touched each file, and how many times).
        Also synthesizes the head commit's changed files via ``git diff-tree``
        so a push-triggered rebuild can report what just changed.

        Everything here is best-effort: a repo with no history (shallow
        clone, no git) returns empty structures rather than raising.
        """

        async def _git(*args: str) -> str:
            try:
                proc = await asyncio.create_subprocess_exec(
                    "git", "-C", repo_path, *args,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                out, _ = await proc.communicate()
                if proc.returncode == 0:
                    return out.decode("utf-8", "replace")
            except Exception:
                pass
            return ""

        from collections import Counter, defaultdict

        commits: List[Dict[str, Any]] = []
        raw = await _git(
            "log", "-n", str(max_commits),
            "--pretty=format:%H|%an|%ae|%at|%s",
        )
        for line in raw.splitlines():
            sha, author, email, ts, subject = (line.split("|", 4) + [""] * 5)[:5]
            commits.append({
                "sha": sha[:12],
                "author": author,
                "email": email,
                "date": ts or None,
                "subject": subject,
            })

        # One pass over the log with names: each record is the author line
        # followed by the files it touched. Gives true per-file ownership
        # (changes + author tallies) instead of approximate attribution.
        raw_names = await _git(
            "log", "-n", str(max_commits),
            "--pretty=format:%an", "--name-only",
        )
        author_counts: Counter = Counter()
        file_changes: Counter = Counter()
        file_authors: Dict[str, Counter] = defaultdict(Counter)
        current_author: Optional[str] = None
        for line in raw_names.splitlines():
            if not line.strip():
                current_author = None
                continue
            if current_author is None:
                current_author = line.strip()
                author_counts[current_author] += 1
            else:
                path = line.strip()
                if not path or path.endswith("/"):
                    continue
                file_changes[path] += 1
                file_authors[path][current_author] += 1

        ownership: Dict[str, Dict[str, Any]] = {}
        for path, changes in file_changes.items():
            tally = file_authors[path]
            ownership[path] = {
                "changes": changes,
                "top_author": tally.most_common(1)[0][0] if tally else "",
                "authors": [a for a, _ in tally.most_common(3)],
            }

        head_files = await _git("diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD")
        return {
            "commit_count": len(commits),
            "recent_commits": commits,
            "top_contributors": [a for a, _ in author_counts.most_common(5)],
            "file_ownership": ownership,
            "head_changed_files": [f for f in head_files.splitlines() if f.strip()],
        }

    @staticmethod
    def _stats(entities: Dict[str, Any]) -> Dict[str, int]:
        return {
            "file_count": len(entities.get("files", [])),
            "class_count": len(entities.get("classes", [])),
            "function_count": len(entities.get("functions", [])),
            "import_count": len(entities.get("imports", [])),
        }

    # ── Persistence (Redis with in-process fallback) ────────────────────

    async def get(self, index_id: str) -> Optional[Dict[str, Any]]:
        """Return the context document or None."""
        client = await _redis()
        if client:
            try:
                raw = await client.get(self._key(index_id))
                if raw:
                    return json.loads(raw)
            except Exception:
                logger.debug("Redis get failed for %s", index_id)
        # Fallback
        async with _LOCAL_CACHE_LOCK:
            entry = _LOCAL_CACHE.get(self._key(index_id))
            if entry and entry.get("expires_at", 0) > time.time():
                return entry["doc"]
            _LOCAL_CACHE.pop(self._key(index_id), None)
        return None

    async def set(self, index_id: str, doc: Dict[str, Any]) -> None:
        """Persist a context document (Redis TTL or in-process TTL)."""
        client = await _redis()
        payload = json.dumps(doc, default=str)
        if client:
            try:
                await client.setex(self._key(index_id), self.ttl, payload)
                return
            except Exception:
                logger.debug("Redis set failed for %s", index_id)
        async with _LOCAL_CACHE_LOCK:
            _LOCAL_CACHE[self._key(index_id)] = {
                "doc": doc,
                "expires_at": time.time() + self.ttl,
            }

    async def evict(self, index_id: str) -> bool:
        """Remove a cached context document. Returns True if one was removed."""
        removed = False
        client = await _redis()
        if client:
            try:
                removed = bool(await client.delete(self._key(index_id)))
            except Exception:
                pass
        async with _LOCAL_CACHE_LOCK:
            if _LOCAL_CACHE.pop(self._key(index_id), None) is not None:
                removed = True
        return removed

    # ── Selection (Stage 2: requirement-driven) + budget (Stage 4) ──────

    async def select_context(
        self,
        index_id: str,
        requirement: str,
        max_tokens: int = 4000,
        top_k: int = 25,
    ) -> Optional[Dict[str, Any]]:
        """Return only the context slice relevant to ``requirement``.

        Slices are token-budgeted: the rendered context never exceeds
        ``max_tokens`` (estimated via ``estimate_tokens``). Returns None
        when the index is missing.

        Result::

            {
              "index_id": "...",
              "requirement": "...",
              "max_tokens": 4000,
              "selected_files": ["src/main.py", ...],
              "file_count": 7,
              "entities": {...},           # filtered to selected files
              "graph": {...},              # filtered dependency edges
              "context_text": "...",       # ready-to-embed prompt context
              "token_estimate": 1200,
              "truncated": false,
            }
        """
        doc = await self.get(index_id)
        if not doc:
            return None
        return select_context(doc, requirement, max_tokens=max_tokens, top_k=top_k)

    async def resolve(self, index_id: str) -> Optional[Dict[str, Any]]:
        """Alias for ``get`` — lets agents resolve an index id uniformly."""
        return await self.get(index_id)


def _set_llm_scope(llm: Optional[Any], scope: Optional[str]) -> None:
    """Pin/reset a routed LLM's per-repo cache scope (best-effort)."""
    if llm is None:
        return
    try:
        llm.cache_scope = scope
    except AttributeError:
        pass  # raw router without the wrapper — nothing to pin


async def resolve_for_agent(
    index_id: Optional[str],
    repo_structure: Optional[Dict[str, Any]],
    requirement: str,
    max_tokens: int = 4000,
    top_k: int = 25,
    llm: Optional[Any] = None,
) -> tuple[Dict[str, Any], Dict[str, Any], str]:
    """Resolve the structure an agent should work from, given an index id.

    Returns ``(full_entities, slice_entities, context_text)``:

    - ``full_entities``  — the complete cached entities (for scoring that
      needs whole-repo stats, e.g. health test-coverage ratios).
    - ``slice_entities`` — the requirement-sliced entities (same shape as a
      ``repo_structure`` body: files/classes/functions/imports/exports/
      module_map), for agents that build prompts or fallbacks.
    - ``context_text``   — the token-budgeted rendered slice, safe to embed
      directly into an LLM prompt.

    ``llm`` — when the caller passes its routed LLM (``self.llm``), a
    resolved index id sets ``llm.cache_scope`` to that repo's index id, so
    every subsequent ``chat``/``json_chat`` on the agent caches under the
    repo scope — which the push webhook evicts on new commits. Explicit
    ``cache_scope`` args still win over the instance scope.

    When ``index_id`` is missing or the index is not cached, falls back to
    the caller-provided ``repo_structure`` (backward compatible).
    """
    if index_id:
        doc = await repo_context_service.get(index_id)
        if doc:
            # Repo-backed call: pin the LLM cache to this repo's index scope.
            _set_llm_scope(llm, index_id)
            entities = dict(doc.get("entities") or {})
            # Health scoring reads circular_dependencies from the structure;
            # surface the graph's cycles so scores stay accurate.
            graph = doc.get("graph") or {}
            if graph.get("circular_dependencies") and not entities.get("circular_dependencies"):
                entities["circular_dependencies"] = graph["circular_dependencies"]
            slice_doc = select_context(doc, requirement, max_tokens=max_tokens, top_k=top_k)
            return entities, slice_doc.get("entities") or entities, slice_doc.get("context_text", "")
    # Fallback (missing index / structure-only): clear any scope pinned by an
    # earlier index-backed call on this agent instance, so answers never leak
    # into a stale repo scope (which the wrong repo's push would evict).
    _set_llm_scope(llm, None)
    base = repo_structure or {}
    return base, base, ""


def select_context(
    doc: Dict[str, Any],
    requirement: str,
    max_tokens: int = 4000,
    top_k: int = 25,
) -> Dict[str, Any]:
    """Score files against a requirement and return a budgeted slice.

    Pure function (no I/O) so it is unit-testable and reusable by callers
    that already hold the document.
    """
    entities = doc.get("entities", {})
    files = entities.get("files", [])
    if not files:
        return {
            "index_id": doc.get("index_id"),
            "requirement": requirement,
            "max_tokens": max_tokens,
            "selected_files": [],
            "file_count": 0,
            "entities": entities,
            "graph": {},
            "context_text": "",
            "token_estimate": 0,
            "truncated": False,
        }

    req_tokens = _requirement_tokens(requirement)
    scored = [(_score_file(f, req_tokens), f) for f in files]
    scored.sort(key=lambda pair: pair[0], reverse=True)

    selected: List[Dict[str, Any]] = []
    for score, f in scored:
        if score > 0:
            selected.append(f)
        if len(selected) >= top_k:
            break
    # If nothing matched, fall back to a small representative sample so
    # agents still get *some* repo grounding instead of an empty slice.
    if not selected:
        selected = [f for _, f in scored[: min(top_k, 8)]]

    selected_paths = {f["path"] for f in selected}

    # Filter entities to the selected files (only what the task needs).
    filtered = {
        "files": selected,
        "classes": [c for c in entities.get("classes", []) if c.get("file") in selected_paths],
        "functions": [f for f in entities.get("functions", []) if f.get("file") in selected_paths],
        "imports": [i for i in entities.get("imports", []) if i.get("file") in selected_paths],
        "exports": [e for e in entities.get("exports", []) if e.get("file") in selected_paths],
        "module_map": {
            k: v for k, v in entities.get("module_map", {}).items() if v in selected_paths or k in selected_paths
        },
    }

    # Token-budget the rendered context (Stage 4).
    context_text, truncated = _render_budgeted(files=selected, max_tokens=max_tokens)

    # Graph: keep only edges touching selected files (cheap filter).
    graph = _filter_graph(doc.get("graph", {}), selected_paths)

    return {
        "index_id": doc.get("index_id"),
        "requirement": requirement,
        "max_tokens": max_tokens,
        "selected_files": sorted(selected_paths),
        "file_count": len(selected),
        "entities": filtered,
        "graph": graph,
        "context_text": context_text,
        "token_estimate": estimate_tokens(context_text),
        "truncated": truncated,
    }


def _requirement_tokens(requirement: str) -> List[str]:
    return [t for t in requirement.lower().split() if len(t) > 1]


def _score_file(f: Dict[str, Any], req_tokens: List[str]) -> float:
    """Keyword-overlap score: path > class/function names > content hints.

    Mirrors the retrieval style used by EmbeddingsService but operates on
    the *compact index* (no file contents needed) — cheap and local.
    """
    path = (f.get("path") or "").lower()
    score = 0.0
    for tok in req_tokens:
        if tok in path:
            score += 5.0
    for name in [c.get("name") for c in f.get("classes", [])] + [f.get("name") for f in f.get("functions", [])]:
        name_l = (name or "").lower()
        for tok in req_tokens:
            if tok in name_l:
                score += 2.0
    return score


def _render_budgeted(files: List[Dict[str, Any]], max_tokens: int) -> tuple[str, bool]:
    """Render file summaries, dropping the longest files until under budget.

    Returns ``(context_text, truncated)``. Long files are trimmed to a
    per-file character cap as a last resort so a single giant file cannot
    blow the budget.
    """
    rendered: List[str] = []
    truncated = False
    used_chars = 0
    # Estimate ~4 chars/token; keep 15% headroom for the prompt template.
    budget_chars = int(max_tokens * 4 * 0.85)

    for f in sorted(files, key=lambda x: _file_size_hint(x), reverse=True):
        summary = _file_summary(f)
        if used_chars + len(summary) > budget_chars and rendered:
            truncated = True
            continue  # drop the largest remaining files to fit the budget
        if len(summary) > budget_chars:
            # Per-file cap scaled to the budget so a tiny budget is actually
            # enforced (floor of 400 chars keeps the slice minimally useful
            # when the budget allows it).
            cap = min(400, max(budget_chars // 2, 1))
            summary = summary[:cap] + " …"
            truncated = True
        rendered.append(summary)
        used_chars += len(summary)

    return "\n\n".join(rendered), truncated


def _file_size_hint(f: Dict[str, Any]) -> int:
    return len(f.get("classes", [])) + len(f.get("functions", [])) + len(f.get("imports", []))


def _file_summary(f: Dict[str, Any]) -> str:
    classes = ", ".join(c.get("name", "") for c in f.get("classes", [])[:10])
    funcs = ", ".join(fn.get("name", "") for fn in f.get("functions", [])[:15])
    imports = ", ".join(f.get("imports", [])[:10])
    parts = [f"{f.get('path')} ({f.get('language')})"]
    if classes:
        parts.append(f"  classes: {classes}")
    if funcs:
        parts.append(f"  functions: {funcs}")
    if imports:
        parts.append(f"  imports: {imports}")
    return "\n".join(parts)


def _filter_graph(graph: Dict[str, Any], selected_paths: set) -> Dict[str, Any]:
    """Keep only dependency edges that touch selected files."""
    if not graph:
        return {}
    deps = graph.get("dependencies", {})
    filtered_deps = {}
    for node, preds in deps.items():
        kept = [p for p in preds if node in selected_paths or p in selected_paths]
        if kept:
            filtered_deps[node] = kept
    return {**graph, "dependencies": filtered_deps}


# Module-level singleton for convenience (mirrors get_storage pattern)
repo_context_service = RepoContextService()
