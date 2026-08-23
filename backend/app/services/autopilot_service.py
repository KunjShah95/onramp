"""AutopilotService — in-app implementation of the repo-autopilot pipeline.

Same 9-step flow as ``scripts/repo_autopilot.py``, but as a backend service so
the Onramp UI can run it over HTTP (repo URL → issues → PRs → validation →
senior review):

    1. clone / refresh (with default-branch fallback)
    2. AST parse (ParserService) + dependency graph (build_dependency_graph)
    3. entity-level relationship extraction (classes/functions/API routes +
       calls / inheritance / contains / serves edges)
    4. model-routed AI analysis via LLMRouter (reasoning → structured),
       per-call provider attribution recorded
    5. issues classified by difficulty and assigned by role
       (easy → intern, medium → junior dev, hard → senior dev)
    6. solve: AutonomousCodingAgent opens one GitHub PR per issue
    7. validate: fetch PR head, re-parse + re-graph, graph-diff (broken edges,
       new cycles), AI-verify resolution + regressions, bounded retry loop
    8. senior review: structured per-issue markdown (root cause, files affected,
       changes, validation, risks, tests)

Endpoints live in ``app.api.v1.autopilot``. All heavy lifting reuses the same
services the rest of the platform uses (parse-once context, router, coding
agent), so behavior matches the CLI and the platform.
"""

import json
import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.llm import LLMRouter, QueryType
from app.services.github_service import GitHubService
from app.services.parser_service import ParserService
from app.graph import build_dependency_graph
from app.agents.coding_agent import AutonomousCodingAgent

logger = logging.getLogger("onramp.autopilot")

_ANALYSIS_REQUIREMENT = (
    "find concrete bugs, error-handling gaps, performance problems, security risks, "
    "missing test coverage and refactoring opportunities"
)

_DIFFICULTY_ROLES = {
    "easy": "intern",          # new_dev / interns
    "medium": "developer",     # junior developers
    "hard": "senior_dev",      # senior developers
}

_ROLE_LABELS = {
    "intern": "Intern / junior dev",
    "developer": "Junior developer",
    "senior_dev": "Senior developer",
}

# Pipeline role → Onramp team-member role (TeamMember.role column). Used to
# auto-assign created tasks to a real team member holding the matching role.
_ROLE_TEAM_ROLES = {
    "intern": "junior_dev",
    "developer": "developer",
    "senior_dev": "senior_dev",
}

# Severity → task priority + difficulty → estimated hours (task creation).
_SEVERITY_PRIORITY = {
    "critical": "high",
    "high": "high",
    "medium": "medium",
    "low": "low",
}
_DIFFICULTY_HOURS = {
    "easy": 2,
    "medium": 4,
    "hard": 8,
}

# GitHub label per assigned role — applied to the GitHub issue (when the work
# came from one) and to the PR once it is opened.
_ROLE_GITHUB_LABELS = {
    "intern": "good-first-issue",
    "developer": "good-second-issue",
    "senior_dev": "senior-review",
}
_LABEL_COLORS = {
    "good-first-issue": "7057ff",
    "good-second-issue": "008672",
    "senior-review": "d4a72c",
}

_API_ROUTE_DECORATORS = {
    "app.get": "GET", "app.post": "POST", "app.put": "PUT",
    "app.delete": "DELETE", "app.patch": "PATCH", "app.head": "HEAD",
    "router.get": "GET", "router.post": "POST", "router.put": "PUT",
    "router.delete": "DELETE", "router.patch": "PATCH", "router.head": "HEAD",
}

_MAX_ENTITY_NODES = 1500  # browser-friendly visualization cap
_MAX_ENTITY_EDGES = 2500


def _repo_label(repo_url: str) -> str:
    """'https://github.com/owner/repo' → 'owner/repo'."""
    cleaned = repo_url.strip().rstrip("/")
    if cleaned.endswith(".git"):
        cleaned = cleaned[:-4]
    parts = cleaned.split("/")
    return "/".join(parts[-2:]) if len(parts) >= 2 else cleaned


class AutopilotService:
    """Orchestrates the repo-autopilot pipeline server-side."""

    def __init__(self, llm: Any = None, github_token: Optional[str] = None):
        self.llm = llm or LLMRouter()
        self.github = GitHubService(github_token or os.getenv("GITHUB_TOKEN"))
        self.work_dir = tempfile.mkdtemp(prefix="autopilot_")

    # ── Public API ──────────────────────────────────────────────────────

    async def _get_or_create_pipeline_session(self, repo_url: str, team_id: Optional[str], created_by: Optional[str]) -> Optional[str]:
        try:
            from app.services.agent_context import agent_context
            from app.services.repo_context import index_id_for
            idx = index_id_for(repo_url, "main")
            sess = await agent_context.create_session(
                agent_type="architecture_explorer",
                team_id=team_id,
                user_id=created_by,
                index_id=idx,
                scratchpad={"pipeline": "autopilot", "repo_url": repo_url},
            )
            return sess["id"]
        except Exception:
            logger.debug("Pipeline session creation failed — continuing stateless", exc_info=True)
            return None

    async def analyze(
        self,
        repo_url: str,
        branch: str = "main",
        max_issues: int = 5,
        routing_mode: Any = "balanced",
        out_dir: Optional[Path] = None,
        team_id: Optional[str] = None,
        created_by: Optional[str] = None,
        create_tasks: bool = True,
    ) -> Dict[str, Any]:
        """Steps 1-5: clone → parse → graph → entities → issues (+ assignment).

        When ``team_id`` + ``created_by`` are given, each issue is also turned
        into a real Onramp task (``task_service.create_task``) auto-assigned to
        a team member with the matching role. Returns a report dict (no
        solving). Writes entities/graph/relationships JSON when ``out_dir`` is
        given.
        """
        pipeline_session_id = await self._get_or_create_pipeline_session(repo_url, team_id, created_by)
        repo_path, actual_branch = await self._clone(repo_url, branch)
        entities, graph, stats = await self._parse_and_graph(repo_path)
        rels = self._extract_relationships(repo_path, entities)

        if out_dir:
            out_dir.mkdir(parents=True, exist_ok=True)
            (out_dir / "entities.json").write_text(json.dumps(entities, indent=2), encoding="utf-8")
            (out_dir / "graph.json").write_text(json.dumps(graph, indent=2), encoding="utf-8")
            (out_dir / "relationships.json").write_text(json.dumps(rels, indent=2), encoding="utf-8")

        issues: List[Dict[str, Any]] = []
        llm_routes: List[Dict[str, Any]] = []
        doc = self._build_doc(repo_url, actual_branch, entities, graph, stats)
        try:
            issues, llm_routes = await self._analyze_issues(
                doc, _ANALYSIS_REQUIREMENT, routing_mode, max_issues, pipeline_session_id=pipeline_session_id
            )
        except Exception:
            logger.exception("Autopilot analysis failed — returning empty issue list")

        tasks: List[Dict[str, Any]] = []
        if create_tasks and team_id and created_by:
            tasks = await self.create_tasks(issues, repo_url, actual_branch, team_id, created_by)

        report = self._report(repo_url, actual_branch, repo_path, entities, graph, stats,
                            rels, issues, llm_routes, [], tasks)
        if pipeline_session_id:
            report["pipeline_session_id"] = pipeline_session_id
            try:
                from app.services.agent_context import agent_context
                from app.services.agent_bus import agent_bus
                await agent_context.append_message(pipeline_session_id, role="assistant", content=f"Autopilot analyze complete: {len(issues)} issues", agent_type="architecture_explorer")
                await agent_bus.publish("autopilot.analyze.completed", payload={"repo_url": repo_url, "issue_count": len(issues), "session_id": pipeline_session_id}, source_session_id=pipeline_session_id, source_agent="architecture_explorer")
            except Exception:
                pass
        return report

    async def run(
        self,
        repo_url: str,
        branch: str = "main",
        max_issues: int = 5,
        max_solve: Optional[int] = None,
        routing_mode: Any = "balanced",
        validate: bool = True,
        max_retry: int = 1,
        out_dir: Optional[Path] = None,
        team_id: Optional[str] = None,
        created_by: Optional[str] = None,
        create_tasks: bool = True,
    ) -> Dict[str, Any]:
        """Steps 1-8: analyze + solve (PRs) + validate + senior review.

        Requires GITHUB_TOKEN (env or constructor) to open PRs; validation
        additionally fetches each PR head from the public GitHub refs. When
        ``team_id`` + ``created_by`` are given, analyzed issues are also
        created as real Onramp tasks assigned by role.
        """
        report = await self.analyze(
            repo_url, branch, max_issues, routing_mode, out_dir,
            team_id=team_id, created_by=created_by, create_tasks=create_tasks,
        )
        issues = report.get("issues", [])
        solutions: List[Dict[str, Any]] = []
        review_md = ""

        if not self.github.github_token:
            report["solutions"] = []
            report["review_md"] = (
                "_No PRs opened — GITHUB_TOKEN not configured. Run the analyze endpoint "
                "for issue discovery only._"
            )
            return report

        branch = report["repo"]["branch"]
        repo_path = report["repo"]["checkout"]

        solutions = await self._solve_issues(
            repo_url, branch, repo_path, issues,
            self.github.github_token, max_solve or max_issues, routing_mode,
        )

        if validate:
            solutions = await self._validate_with_retry(
                repo_url, branch, repo_path, issues, report, solutions,
                routing_mode, max_retry,
            )

        report["solutions"] = solutions
        report["review_md"] = self._build_senior_review(report)
        return report

    # ── Step 1: clone (with default-branch fallback) ───────────────────

    async def _clone(self, repo_url: str, branch: str) -> Tuple[str, str]:
        """Clone into a temp dir; fall back to the remote default branch."""
        try:
            return await self.github.clone_repo(repo_url, branch), branch
        except Exception:
            default = self._default_branch(repo_url)
            if default and default != branch:
                logger.info("Branch %s not found — falling back to %s", branch, default)
                return await self.github.clone_repo(repo_url, default), default
            raise ValueError(
                f"Could not clone {repo_url} (branch {branch!r}). "
                "Check the URL and branch name."
            )

    @staticmethod
    def _default_branch(repo_url: str) -> Optional[str]:
        try:
            out = subprocess.run(
                ["git", "ls-remote", "--symref", repo_url, "HEAD"],
                capture_output=True, text=True, timeout=30,
            )
            for line in out.stdout.splitlines():
                if line.startswith("ref:") and "HEAD" in line:
                    return line.split("refs/heads/")[-1].split()[0]
        except Exception:
            pass
        return None

    # ── Step 2: parse + graph ───────────────────────────────────────────

    async def _parse_and_graph(
        self, repo_path: str,
    ) -> Tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
        parser = ParserService()
        entities = await parser.parse_directory(repo_path)
        graph = build_dependency_graph(entities).to_dict()
        stats = {
            "file_count": len(entities.get("files", [])),
            "class_count": len(entities.get("classes", [])),
            "function_count": len(entities.get("functions", [])),
            "import_count": len(entities.get("imports", [])),
            "graph_nodes": len(graph.get("modules", [])),
            "graph_edges": sum(len(v) for v in graph.get("dependencies", {}).values()),
            "circular_dependencies": len(graph.get("circular_dependencies", [])),
            "architecture_pattern": graph.get("architecture_pattern", "unknown"),
            "languages": sorted({
                f.get("language", "unknown") for f in entities.get("files", [])
            }),
        }
        return entities, graph, stats

    # ── Step 3: entity-level relationships ──────────────────────────────

    def _extract_relationships(self, repo_path: str, entities: Dict[str, Any]) -> Dict[str, Any]:
        """Second-pass entity graph: class/function/API nodes + calls/inheritance/
        contains/serves edges, resolved against the repo symbol table."""
        nodes: List[Dict[str, Any]] = []
        edges: List[Dict[str, Any]] = []
        seen_edges = set()

        symbol_table: Dict[str, List[Tuple[str, str]]] = {}
        for f in entities.get("classes", []):
            symbol_table.setdefault(f["name"], []).append((f["file"], "class"))
        for f in entities.get("functions", []):
            symbol_table.setdefault(f["name"], []).append((f["file"], "function"))

        def _resolve(name: str, current_file: str) -> Optional[Tuple[str, str]]:
            candidates = symbol_table.get(name, [])
            if not candidates:
                return None
            for f, kind in candidates:
                if f == current_file:
                    return f, kind
            return candidates[0]

        def _add_node(nid: str, **meta: Any) -> None:
            if nid not in {n["id"] for n in nodes}:
                nodes.append({"id": nid, **meta})

        def _add_edge(source: str, target: str, etype: str) -> None:
            key = (source, target, etype)
            if key in seen_edges or len(edges) >= _MAX_ENTITY_EDGES:
                return
            seen_edges.add(key)
            edges.append({"source": source, "target": target, "type": etype})

        for f in entities.get("files", []):
            fpath = f["path"]
            lang = f.get("language", "")
            _add_node(fpath, kind="file", language=lang)
            if lang not in ("python", "javascript", "typescript", "tsx"):
                continue

            p = Path(repo_path) / fpath
            if not p.is_file():
                continue
            content = p.read_text(encoding="utf-8", errors="ignore")

            if lang == "python":
                self._extract_python_relationships(content, fpath, _add_node, _add_edge, _resolve)
            else:
                self._extract_ts_inheritance(content, fpath, _add_node, _add_edge, _resolve)

        # Trim to a browser-friendly size: connected, high-degree nodes win.
        extracted_node_count = len(nodes)
        extracted_edge_count = len(edges)
        if len(nodes) > _MAX_ENTITY_NODES:
            degree: Dict[str, int] = {}
            for e in edges:
                degree[e["source"]] = degree.get(e["source"], 0) + 1
                degree[e["target"]] = degree.get(e["target"], 0) + 1
            keep = {n["id"] for n in sorted(
                nodes, key=lambda n: (degree.get(n["id"], 0) > 0, degree.get(n["id"], 0)),
                reverse=True,
            )[:_MAX_ENTITY_NODES]}
            nodes = [n for n in nodes if n["id"] in keep]
            edges = [e for e in edges if e["source"] in keep and e["target"] in keep]

        kinds: Dict[str, int] = {}
        for n in nodes:
            kinds[n["kind"]] = kinds.get(n["kind"], 0) + 1
        etypes: Dict[str, int] = {}
        for e in edges:
            etypes[e["type"]] = etypes.get(e["type"], 0) + 1

        return {
            "nodes": nodes,
            "edges": edges,
            "stats": {
                "node_count": len(nodes),
                "edge_count": len(edges),
                "extracted_node_count": extracted_node_count,
                "extracted_edge_count": extracted_edge_count,
                "capped": len(nodes) > _MAX_ENTITY_NODES or extracted_edge_count > _MAX_ENTITY_EDGES,
                "by_kind": kinds,
                "by_type": etypes,
            },
        }

    @staticmethod
    def _py_relationships(content: str) -> Dict[str, Any]:
        """ast-based scan of one Python file → classes/functions/api routes."""
        import ast as _ast
        from app.services.parser_service import ParserService

        classes: Dict[str, Dict[str, Any]] = {}
        funcs: Dict[str, Dict[str, Any]] = {}
        api_routes: List[Dict[str, Any]] = []
        try:
            tree = _ast.parse(content)
        except SyntaxError:
            return {"classes": classes, "functions": funcs, "api_routes": api_routes}

        for node in _ast.walk(tree):
            if isinstance(node, _ast.ClassDef):
                bases = [ParserService._get_name(b) for b in node.bases]
                methods = [
                    n.name for n in node.body
                    if isinstance(n, (_ast.FunctionDef, _ast.AsyncFunctionDef))
                ]
                classes[node.name] = {
                    "bases": [b for b in bases if b],
                    "methods": methods,
                    "lineno": node.lineno,
                }
            elif isinstance(node, (_ast.FunctionDef, _ast.AsyncFunctionDef)):
                calls = set()
                for child in _ast.walk(node):
                    if isinstance(child, _ast.Call):
                        name = ParserService._get_name(child.func)
                        if name:
                            calls.add(name.split(".")[0])
                funcs[node.name] = {"calls": sorted(calls), "lineno": node.lineno}
                for dec in node.decorator_list:
                    dname = ParserService._get_name(dec)
                    method = _API_ROUTE_DECORATORS.get(dname)
                    if method and isinstance(dec, _ast.Call) and dec.args:
                        first = dec.args[0]
                        if isinstance(first, _ast.Constant) and isinstance(first.value, str):
                            api_routes.append({
                                "method": method,
                                "path": first.value,
                                "func": node.name,
                                "lineno": node.lineno,
                            })
        return {"classes": classes, "functions": funcs, "api_routes": api_routes}

    def _extract_python_relationships(self, content: str, fpath: str,
                                      add_node, add_edge, resolve) -> None:
        rel = self._py_relationships(content)
        for cname, cinfo in rel["classes"].items():
            cid = f"{fpath}::c:{cname}"
            add_node(cid, kind="class", name=cname)
            add_edge(fpath, cid, "contains")
            for base in cinfo["bases"]:
                resolved = resolve(base.split(".")[0], fpath)
                if resolved and resolved[1] == "class":
                    add_edge(cid, f"{resolved[0]}::c:{base.split('.')[0]}", "inherits")
        for fname, finfo in rel["functions"].items():
            fid = f"{fpath}::f:{fname}"
            add_node(fid, kind="function", name=fname)
            add_edge(fpath, fid, "contains")
            for callee in finfo["calls"]:
                resolved = resolve(callee, fpath)
                if not resolved:
                    continue
                if resolved[1] == "function":
                    add_edge(fid, f"{resolved[0]}::f:{callee}", "calls")
                elif resolved[1] == "class":
                    add_edge(fid, f"{resolved[0]}::c:{callee}", "uses")
        for route in rel["api_routes"]:
            aid = f"api:{route['method']} {route['path']}"
            add_node(aid, kind="api", method=route["method"], path=route["path"])
            add_edge(fpath, aid, "contains")
            add_edge(f"{fpath}::f:{route['func']}", aid, "serves")

    def _extract_ts_inheritance(self, content: str, fpath: str,
                                add_node, add_edge, resolve) -> None:
        import re
        for m in re.finditer(r"\bclass\s+([A-Za-z_]\w*)\s+extends\s+([A-Za-z_$][\w.$]*)", content):
            cname, base = m.group(1), m.group(2)
            cid = f"{fpath}::c:{cname}"
            add_node(cid, kind="class", name=cname)
            add_edge(fpath, cid, "contains")
            resolved = resolve(base.split(".")[0], fpath)
            if resolved and resolved[1] == "class":
                add_edge(cid, f"{resolved[0]}::c:{base.split('.')[0]}", "inherits")

    # ── Step 4-5: model-routed analysis → issues ────────────────────────

    def _build_doc(self, repo_url: str, branch: str, entities: Dict[str, Any],
                   graph: Dict[str, Any], stats: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "index_id": "autopilot-live",
            "repo_url": repo_url,
            "branch": branch,
            "entities": entities,
            "graph": graph,
            "stats": stats,
        }

    async def _analyze_issues(self, doc: Dict[str, Any], requirement: str,
                              routing_mode: Any, max_issues: int, pipeline_session_id: Optional[str] = None
                              ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        from app.services.repo_context import select_context

        slice_doc = select_context(doc, requirement, max_tokens=6000, top_k=30)
        context_text = (slice_doc or {}).get("context_text", "")
        routes: List[Dict[str, Any]] = []

        analysis_prompt = (
            "You are a senior staff engineer reviewing a codebase.\n\n"
            "## Repository context (token-budgeted slice)\n"
            f"{context_text[:6000]}\n\n"
            "## Task\n"
            "Analyze this codebase and describe the most important problems you see. "
            "Focus on: bugs, error-handling gaps, performance problems, security risks, "
            "missing tests, and refactoring opportunities. Be specific — name files and "
            "functions. End with a short paragraph on overall architecture health."
        )
        # Session-aware: log reasoning step to pipeline session
        if pipeline_session_id:
            try:
                from app.services.agent_context import agent_context as _ac
                await _ac.append_message(pipeline_session_id, role="user", content=analysis_prompt[:4000], agent_type="architecture_explorer")
            except Exception:
                pass
        logger.info("Autopilot LLM #1 — REASONING (analyze codebase)")
        analysis_text = await self.llm.chat(
            analysis_prompt, max_tokens=1500,
            query_type=QueryType.REASONING, routing_mode=routing_mode,
        )
        if pipeline_session_id:
            try:
                from app.services.agent_context import agent_context as _ac2
                await _ac2.append_message(pipeline_session_id, role="assistant", content=analysis_text[:4000], agent_type="architecture_explorer")
            except Exception:
                pass
        routes.append({"step": "analysis", "query_type": "reasoning",
                       **dict(getattr(self.llm, "last_route", None) or {})})

        extract_prompt = (
            "Extract the most important concrete issues from the analysis below into JSON.\n\n"
            f"## Analysis\n{analysis_text}\n\n"
            'Return a JSON object, no extra text: {"issues": [{"title": "...", '
            '"description": "...", "category": "bug|error-handling|performance|security|testing|refactor", '
            '"severity": "low|medium|high|critical", "difficulty": "easy|medium|hard", '
            '"files": ["relative/path", ...]}]}\n\n'
            f"Include at most {max_issues} issues, ordered by impact."
        )
        logger.info("Autopilot LLM #2 — STRUCTURED (extract issues JSON)")
        try:
            data = await self.llm.json_chat(extract_prompt, query_type=QueryType.STRUCTURED)
        except Exception:
            logger.exception("Structured extraction failed — issues will be empty.")
            data = {}
        routes.append({"step": "extract", "query_type": "structured",
                       **dict(getattr(self.llm, "last_route", None) or {})})

        raw = data.get("issues", []) if isinstance(data, dict) else data
        return self._normalize_issues(raw, max_issues), routes

    @staticmethod
    def _normalize_issues(raw: Any, max_issues: int) -> List[Dict[str, Any]]:
        issues: List[Dict[str, Any]] = []
        for item in raw if isinstance(raw, list) else []:
            if not isinstance(item, dict) or not item.get("title"):
                continue
            difficulty = str(item.get("difficulty", "medium")).lower()
            if difficulty not in _DIFFICULTY_ROLES:
                difficulty = "medium"
            files = item.get("files") or []
            if isinstance(files, str):
                files = [files]
            issues.append({
                "title": str(item["title"])[:160],
                "description": str(item.get("description", "")),
                "category": str(item.get("category", "refactor")),
                "severity": str(item.get("severity", "medium")).lower(),
                "difficulty": difficulty,
                "files": [f for f in files if isinstance(f, str)][:5],
                "assigned_role": _DIFFICULTY_ROLES[difficulty],
                "source": "ai-analysis",
            })
        return issues[:max_issues]

    # ── Step 5b: real Onramp tasks (in-app assignment) ──────────────────

    async def create_tasks(
        self,
        issues: List[Dict[str, Any]],
        repo_url: str,
        branch: str,
        team_id: str,
        created_by: str,
    ) -> List[Dict[str, Any]]:
        """Turn pipeline issues into real Onramp tasks, auto-assigned by role.

        Each issue's ``assigned_role`` (intern / developer / senior_dev) maps
        to an Onramp team-member role (new_dev / developer / senior_dev) and
        the task is assigned **load-aware** across every active member holding
        that role: the member with the fewest active (non-terminal) tasks is
        picked first, with the round-robin cycle order as the tie-breaker — so
        an overloaded member is skipped until their queue drains. Rotation
        state is seeded from the team's existing task history, so a second
        pipeline run continues where the last left off. The task creator is
        excluded unless they are the only member with the role.

        Tasks that already exist for the same source issue (GitHub number) or
        the same title in this repo are skipped (idempotent re-runs).

        Returns the created task summaries (``task_id``, ``state``,
        ``assigned_to``) and stamps each created issue with ``task_id``.
        """
        from app.services import task_service
        from app.services.team_service import get_team_members
        from app.services.postgres_db import get_storage

        try:
            members = await get_team_members(team_id)
        except Exception:
            logger.exception("Could not load team members for %s — tasks created unassigned", team_id)
            members = []

        # Load the team's tasks once — used for idempotency and to seed the
        # per-role round-robin cursor from the most recent assignment.
        storage = get_storage()
        try:
            team_tasks = await storage.query_documents(
                "onramp_tasks", [("team_id", "==", team_id)]
            )
        except Exception:
            logger.exception("Could not load team tasks for %s", team_id)
            team_tasks = []

        # rotation[team_role] = {
        #   "pool": [uid, ...] (sorted), "next": int, "loads": {uid: int}
        # }
        # ``loads`` counts each member's active (non-terminal) tasks — the
        # load-aware weight; ``next`` is the round-robin tie-breaker seeded
        # from the team's most recent assignment.
        rotation: Dict[str, Dict[str, Any]] = {}
        for issue in issues:
            role = issue.get("assigned_role", "developer")
            team_role = _ROLE_TEAM_ROLES.get(role, "junior_dev")
            if team_role not in rotation:
                pool = self._role_members(members, team_role, created_by)
                rotation[team_role] = {
                    "pool": pool,
                    "next": self._last_assigned_index(team_tasks, pool),
                    "loads": self._active_loads(team_tasks, pool),
                }

        created: List[Dict[str, Any]] = []
        for issue in issues:
            if not issue.get("title"):
                continue
            # Idempotency — skip when a task for this source issue already
            # exists in the team (GitHub-sourced issues) or the same title in
            # this repo (AI-sourced issues).
            if await self._task_exists(repo_url, team_id, issue):
                logger.info("Task already exists for issue '%s' — skipping", issue["title"])
                issue["task_status"] = "skipped-duplicate"
                continue

            role = issue.get("assigned_role", "developer")
            team_role = _ROLE_TEAM_ROLES.get(role, "junior_dev")
            # Load-aware: pick the least-loaded member (round-robin order as
            # the tie-breaker), then bump their load + advance the cursor.
            state = rotation[team_role]
            assignee = None
            if state["pool"]:
                picked = self._least_loaded_index(state)
                assignee = state["pool"][picked]
                state["loads"][assignee] = state["loads"].get(assignee, 0) + 1
                state["next"] = (picked + 1) % len(state["pool"])

            source_issue = None
            if issue.get("github_number"):
                source_issue = {
                    "number": int(issue["github_number"]),
                    "url": issue.get("github_url", f"{repo_url}/issues/{issue['github_number']}"),
                    "repo_url": repo_url,
                }
            elif issue.get("source") == "github-issue" and issue.get("github_url"):
                source_issue = {"url": issue["github_url"], "repo_url": repo_url}

            description = issue.get("description", "")
            files = issue.get("files") or []
            if files:
                description += "\n\nAffected files:\n" + "\n".join(f"- `{f}`" for f in files)
            description += (
                f"\n\nDifficulty: {issue.get('difficulty', 'medium')} · "
                f"Category: {issue.get('category', 'refactor')} · "
                f"Assigned role: {_ROLE_LABELS.get(role, role)}"
            )

            try:
                task = await task_service.create_task(
                    team_id=team_id,
                    created_by=created_by,
                    title=issue["title"][:160],
                    description=description,
                    module=issue.get("category", ""),
                    priority=_SEVERITY_PRIORITY.get(
                        str(issue.get("severity", "medium")).lower(), "medium"
                    ),
                    repo_url=repo_url,
                    branch=branch,
                    estimated_hours=_DIFFICULTY_HOURS.get(
                        str(issue.get("difficulty", "medium")).lower(), 4
                    ),
                    assigned_to=assignee,
                    source_issue=source_issue,
                )
                issue["task_id"] = task.get("task_id")
                issue["task_status"] = "created"
                created.append({
                    "task_id": task.get("task_id"),
                    "title": task.get("title"),
                    "state": task.get("state"),
                    "priority": task.get("priority"),
                    "assigned_to": task.get("assigned_to"),
                    "team_role": team_role,
                })
            except Exception as exc:
                logger.warning("Task creation failed for issue '%s': %s", issue["title"], exc)
                issue["task_status"] = f"error: {exc}"
        return created

    @staticmethod
    async def _task_exists(repo_url: str, team_id: str, issue: Dict[str, Any]) -> bool:
        """True when a non-terminal task already covers this issue in the team."""
        from app.services import task_service
        from app.services.postgres_db import get_storage

        storage = get_storage()
        try:
            tasks = await storage.query_documents(
                "onramp_tasks", [("team_id", "==", team_id)]
            )
        except Exception:
            return False
        for t in tasks:
            if t.get("state") in ("completed", "cancelled"):
                continue
            src = t.get("source_issue") or {}
            if issue.get("github_number") and str(src.get("number", "")) == str(issue["github_number"]):
                return True
            if (
                not issue.get("github_number")
                and (t.get("title") or "").strip().lower() == (issue.get("title") or "").strip().lower()
                and (t.get("repo_url") or "").rstrip("/") == repo_url.rstrip("/")
            ):
                return True
        return False

    @staticmethod
    def _role_members(members: List[Dict[str, Any]], team_role: str,
                      created_by: str) -> List[str]:
        """Sorted uids of members holding ``team_role`` (creator last).

        The task creator is excluded unless they are the only member with the
        role — a pipeline run by a senior should not auto-assign to themselves.
        Sorted so the round-robin cycle is deterministic.
        """
        matching = [m for m in members if m.get("role") == team_role]
        if not matching:
            return []
        uids = []
        for m in matching:
            uid = m.get("id") or m.get("user_id")
            if uid and uid not in uids:
                uids.append(uid)
        others = [u for u in uids if u != created_by]
        pool = others or uids
        return sorted(pool)

    @staticmethod
    def _last_assigned_index(team_tasks: List[Dict[str, Any]],
                             pool: List[str]) -> int:
        """Index into ``pool`` after the most recent non-terminal assignment.

        Seeds the round-robin cursor from the team's task history so
        consecutive pipeline runs keep rotating across members instead of
        always starting at the first. Returns 0 when nobody has been assigned
        yet (or the pool is empty).
        """
        if not pool:
            return 0
        last: Optional[str] = None
        last_ts = ""
        for t in team_tasks:
            if t.get("state") in ("completed", "cancelled"):
                continue
            uid = t.get("assigned_to")
            if uid not in pool:
                continue
            ts = str(t.get("created_at") or "")
            if ts >= last_ts:
                last_ts = ts
                last = uid
        if last is None or last not in pool:
            return 0
        return (pool.index(last) + 1) % len(pool)

    @staticmethod
    def _active_loads(team_tasks: List[Dict[str, Any]],
                      pool: List[str]) -> Dict[str, int]:
        """Count each pool member's active (non-terminal) tasks.

        Terminal states (completed / cancelled) don't count toward a member's
        workload — only open work in the queue does.
        """
        loads = {uid: 0 for uid in pool}
        for t in team_tasks:
            if t.get("state") in ("completed", "cancelled"):
                continue
            uid = t.get("assigned_to")
            if uid in loads:
                loads[uid] += 1
        return loads

    @staticmethod
    def _least_loaded_index(state: Dict[str, Any]) -> int:
        """Index into ``pool`` of the least-loaded member.

        Load = active (non-terminal) task count. The round-robin cursor
        (``next``) is the tie-breaker: ties resolve to the first member after
        the cursor, which preserves the rotation when everyone is equally
        loaded. When one member is overloaded, they are skipped until their
        queue drains.
        """
        pool = state["pool"]
        loads = state["loads"]
        start = state["next"] % len(pool)
        best = start
        best_load = loads.get(pool[start], 0)
        for i in range(1, len(pool)):
            idx = (start + i) % len(pool)
            load = loads.get(pool[idx], 0)
            if load < best_load:
                best = idx
                best_load = load
        return best

    # ── Step 6: solve → PRs ─────────────────────────────────────────────

    async def _advance_task_on_pr(self, issue: Dict[str, Any],
                                  pr_url: str) -> Optional[Dict[str, Any]]:
        """Auto-advance the linked task's state machine once a PR is opened.

        Walks the chain ``pending → assigned → in_progress → submitted`` so
        the task lands in the senior-review queue with its ``pr_url`` set:

        - ``pending`` → ``assigned`` (assignee = the task creator)
        - ``assigned`` → ``in_progress`` (started by the assignee)
        - ``in_progress`` → ``submitted`` (``pr_url`` recorded)

        Tasks already past ``in_progress`` (submitted / under review / terminal)
        are left untouched — a validation retry that opens a second PR must not
        clobber the first submission. Returns the updated task or ``None`` when
        the issue has no linked task.
        """
        from app.services import task_service

        task_id = issue.get("task_id")
        if not task_id:
            return None
        try:
            task = await task_service.get_task(task_id)
        except Exception:
            logger.exception("Could not load task %s for auto-advance", task_id)
            return None
        if not task:
            return None

        state = task.get("state", "pending")
        if state in ("submitted", "under_review", "peer_review", "product_review",
                     "approved", "completed", "cancelled"):
            return task

        actor = task.get("assigned_to") or task.get("created_by") or "autopilot"
        try:
            if state == "pending":
                task = await task_service.transition_task(task_id, "assigned", actor)
                state = "assigned"
            if state == "assigned":
                task = await task_service.transition_task(task_id, "in_progress", actor)
                state = "in_progress"
            if state == "in_progress":
                task = await task_service.submit_task(task_id, actor, pr_url)
            logger.info("Auto-advanced task %s → %s (PR %s)", task_id, task.get("state"), pr_url)
            return task
        except Exception as exc:
            logger.warning("Task auto-advance failed for %s: %s", task_id, exc)
            return await task_service.get_task(task_id)

    async def _solve_issues(self, repo_url: str, branch: str, repo_path: str,
                            issues: List[Dict[str, Any]], github_token: str,
                            max_solve: int, routing_mode: Any) -> List[Dict[str, Any]]:
        agent = AutonomousCodingAgent(self.llm, github_token=github_token)
        results: List[Dict[str, Any]] = []

        # Role-based auto-labeling: ensure labels exist once, then label each
        # GitHub issue before solving and each PR once it is opened.
        owner, repo = self._owner_repo(repo_url)
        needed_labels = {
            _ROLE_GITHUB_LABELS[i.get("assigned_role", "developer")]
            for i in issues[:max_solve]
            if i.get("assigned_role") in _ROLE_GITHUB_LABELS
        }
        if needed_labels and owner and repo:
            await self.github.ensure_labels(
                owner, repo,
                {name: _LABEL_COLORS.get(name, "5319e7") for name in needed_labels},
            )

        for issue in issues[:max_solve]:
            logger.info("Autopilot solving — %s", issue["title"])
            role_label = _ROLE_GITHUB_LABELS.get(issue.get("assigned_role", "developer"))

            # Label the originating GitHub issue before we open a PR for it.
            if role_label and issue.get("github_number") and owner and repo:
                await self.github.add_labels(owner, repo, issue["github_number"], [role_label])

            snippets = self._file_snippets(repo_path, issue.get("files", []))
            enriched = (
                f"## Issue\n{issue['title']}\n\n{issue['description']}\n\n"
                f"## Current code (from the repository at {branch})\n{snippets}\n"
                if snippets else f"## Issue\n{issue['title']}\n\n{issue['description']}"
            )
            feedback = issue.get("_feedback", "")
            if feedback:
                enriched += f"\n## Validator feedback from previous attempt\n{feedback}\n"
            try:
                result = await agent.execute(
                    repo_url=repo_url,
                    issue_description=enriched,
                    base_branch=branch,
                )
                # Label the opened PR with the role label (after creation).
                if role_label and result.get("success") and result.get("pr_number") and owner and repo:
                    await self.github.add_labels(owner, repo, result["pr_number"], [role_label])
                # Auto-advance the Onramp task state machine with the PR:
                # pending → assigned → in_progress → submitted (pr_url set).
                if result.get("success") and result.get("pr_url"):
                    await self._advance_task_on_pr(issue, result["pr_url"])
                results.append({
                    "issue": issue["title"],
                    "assigned_role": issue["assigned_role"],
                    "difficulty": issue["difficulty"],
                    "source": issue.get("source", "ai-analysis"),
                    **result,
                })
            except Exception as exc:
                logger.warning("Autopilot solve failed for %s: %s", issue["title"], exc)
                results.append({
                    "issue": issue["title"],
                    "assigned_role": issue["assigned_role"],
                    "difficulty": issue["difficulty"],
                    "source": issue.get("source", "ai-analysis"),
                    "success": False,
                    "error": str(exc),
                })
        return results

    @staticmethod
    def _owner_repo(repo_url: str) -> Tuple[str, str]:
        """'https://github.com/owner/repo' → (owner, repo)."""
        cleaned = repo_url.strip().rstrip("/")
        if cleaned.endswith(".git"):
            cleaned = cleaned[:-4]
        parts = cleaned.split("/")
        if len(parts) < 2:
            return "", ""
        return parts[-2], parts[-1]

    @staticmethod
    def _file_snippets(repo_path: str, files: List[str], max_lines: int = 250) -> str:
        snippets = []
        for f in files:
            p = Path(repo_path) / f
            if not p.is_file():
                continue
            try:
                lines = p.read_text(encoding="utf-8", errors="ignore").splitlines()
            except Exception:
                continue
            snippets.append(f"### {f}\n```\n" + "\n".join(lines[:max_lines]) + "\n```")
        return "\n\n".join(snippets)

    # ── Step 7: validation + retry ──────────────────────────────────────

    async def _validate_with_retry(self, repo_url: str, branch: str, repo_path: str,
                                   issues: List[Dict[str, Any]], report: Dict[str, Any],
                                   solutions: List[Dict[str, Any]], routing_mode: Any,
                                   max_retry: int) -> List[Dict[str, Any]]:
        base_graph = report.get("graph", {})
        doc = self._build_doc(repo_url, branch, report["entities"], base_graph, report["stats"])

        # First pass: validate every successful solution against its PR head.
        validated = []
        for s in solutions:
            if s.get("success") and "validation" not in s:
                s = await self._validate_solution(
                    repo_url, branch, repo_path, doc, base_graph, s, routing_mode,
                )
            validated.append(s)
        solutions = validated

        # Retry loop: re-solve anything the validator did not confirm.
        retries = 0
        while retries < max_retry:
            unresolved = [
                s for s in solutions
                if s.get("success")
                and (s.get("validation") or {}).get("status") == "validated"
                and not ((s.get("validation") or {}).get("ai") or {}).get("resolved")
            ]
            if not unresolved:
                break
            retries += 1
            logger.info("Validation retry %d/%d — re-solving %d issue(s)",
                        retries, max_retry, len(unresolved))
            for s in unresolved:
                v = (s.get("validation") or {}).get("ai") or {}
                feedback = (
                    f"Previous attempt: {v.get('notes', '')}. "
                    f"Regressions to fix: {json.dumps(v.get('regressions', []))}. "
                    f"Remaining issues: {json.dumps(v.get('remaining_issues', []))}."
                )
                issue = next((i for i in issues if i["title"] == s["issue"]), None)
                if issue:
                    issue["_feedback"] = feedback

            titles = {s["issue"] for s in unresolved}
            retried = await self._solve_issues(
                repo_url, branch, repo_path,
                [i for i in issues if i["title"] in titles],
                self.github.github_token, len(unresolved), routing_mode,
            )
            for r in retried:
                for idx, s in enumerate(solutions):
                    if s["issue"] == r["issue"]:
                        solutions[idx] = r
                        break
            for i, s in enumerate(solutions):
                if s.get("success") and s.get("issue") in {r["issue"] for r in retried}:
                    solutions[i] = await self._validate_solution(
                        repo_url, branch, repo_path, doc, base_graph, s, routing_mode,
                    )
        return solutions

    async def _validate_solution(self, repo_url: str, branch: str, repo_path: str,
                                 base_doc: Dict[str, Any], base_graph: Dict[str, Any],
                                 solution: Dict[str, Any], routing_mode: Any
                                 ) -> Dict[str, Any]:
        """Fetch PR head, re-parse + re-graph, graph-diff, AI-verify resolution."""
        pr_number = solution.get("pr_number")
        if not solution.get("success") or not pr_number:
            return {**solution, "validation": {"status": "skipped", "reason": "no PR created"}}
        try:
            fetch = subprocess.run(
                ["git", "-C", repo_path, "fetch", "origin", f"pull/{pr_number}/head"],
                capture_output=True, text=True,
            )
            if fetch.returncode != 0:
                return {**solution, "validation": {
                    "status": "skipped", "reason": f"could not fetch PR #{pr_number} head"}}

            tmp = Path(tempfile.mkdtemp(prefix="autopilot_pr_"))
            archive = subprocess.run(
                ["git", "-C", repo_path, "archive", "--format=tar", "FETCH_HEAD"],
                capture_output=True,
            )
            if archive.returncode != 0:
                return {**solution, "validation": {
                    "status": "skipped", "reason": "git archive of PR head failed"}}
            extract = subprocess.run(["tar", "-xf", "-", "-C", str(tmp)], input=archive.stdout)
            if extract.returncode != 0:
                return {**solution, "validation": {
                    "status": "skipped", "reason": "extracting PR head failed"}}

            diff = subprocess.run(
                ["git", "-C", repo_path, "diff", "--name-only", branch, "FETCH_HEAD"],
                capture_output=True, text=True,
            )
            changed_files = [ln for ln in diff.stdout.splitlines() if ln.strip()]

            new_entities, new_graph, new_stats = await self._parse_and_graph(str(tmp))
            graph_diff = self._graph_diff(base_graph, new_graph)

            from app.services.repo_context import select_context
            base_slice = select_context(base_doc, solution["issue"], max_tokens=4000, top_k=20)
            new_doc = self._build_doc(repo_url, "pr-head", new_entities, new_graph, new_stats)
            new_slice = select_context(new_doc, solution["issue"], max_tokens=4000, top_k=20)

            verify_prompt = (
                "You are validating whether a code change resolves an issue.\n\n"
                f"## Issue\n{solution['issue']}\n\n"
                "## Code context BEFORE the change\n"
                f"{(base_slice or {}).get('context_text', '')[:4000]}\n\n"
                "## Code context AFTER the change\n"
                f"{(new_slice or {}).get('context_text', '')[:4000]}\n\n"
                "## Files changed by the PR\n"
                f"{json.dumps(changed_files[:30])}\n\n"
                'Return ONLY JSON: {"resolved": true|false, "confidence": 0.0-1.0, '
                '"root_cause": "one sentence", "regressions": [{"file": "...", "description": "..."}], '
                '"remaining_issues": ["..."], "tests_recommended": ["..."], "risks": ["..."], '
                '"notes": "..."}'
            )
            logger.info("Autopilot LLM — STRUCTURED (validate '%s')", solution["issue"][:60])
            try:
                ai = await self.llm.json_chat(verify_prompt, query_type=QueryType.STRUCTURED)
            except Exception:
                logger.exception("Validation LLM call failed")
                ai = {}

            shutil.rmtree(tmp, ignore_errors=True)
            return {**solution, "validation": {
                "status": "validated",
                "changed_files": changed_files,
                "graph_diff": graph_diff,
                "ai": ai,
                "route": dict(getattr(self.llm, "last_route", None) or {}),
            }}
        except Exception as exc:
            logger.exception("Validation failed for PR #%s", solution.get("pr_number"))
            return {**solution, "validation": {"status": "error", "error": str(exc)}}

    @staticmethod
    def _graph_diff(base_graph: Dict[str, Any], new_graph: Dict[str, Any]) -> Dict[str, Any]:
        base_modules = set(base_graph.get("modules", []))
        new_modules = set(new_graph.get("modules", []))
        base_edges = {(s, t) for t, ss in base_graph.get("dependencies", {}).items() for s in ss}
        new_edges = {(s, t) for t, ss in new_graph.get("dependencies", {}).items() for s in ss}
        return {
            "nodes_before": len(base_modules),
            "nodes_after": len(new_modules),
            "edges_before": len(base_edges),
            "edges_after": len(new_edges),
            "removed_files": sorted(base_modules - new_modules),
            "added_files": sorted(new_modules - base_modules),
            "broken_edges": sorted(base_edges - new_edges)[:20],
            "new_edges": sorted(new_edges - base_edges)[:20],
            "cycles_before": len(base_graph.get("circular_dependencies", [])),
            "cycles_after": len(new_graph.get("circular_dependencies", [])),
        }

    # ── Step 8: senior review markdown ──────────────────────────────────

    def _build_senior_review(self, report: Dict[str, Any]) -> str:
        lines = [
            f"# Senior Developer Review — {report['repo']['label']}",
            "",
            f"Branch `{report['repo']['branch']}` · commit `{report['repo']['commit']}`",
            "",
            "Each entry is the full technical hand-off for one resolved issue: original "
            "issue, root cause, files/components affected, changes made, validation "
            "performed, potential risks, tests recommended.",
            "",
        ]
        validated = [r for r in report.get("solutions", [])
                     if r.get("success") and (r.get("validation") or {}).get("status") == "validated"]
        if not validated:
            lines.append("_No validated solutions to review — run the `run` endpoint with "
                         "GITHUB_TOKEN configured._")
        for i, r in enumerate(validated, 1):
            v = r.get("validation", {})
            ai = v.get("ai", {}) or {}
            gd = v.get("graph_diff", {}) or {}
            lines += [
                f"## {i}. {r.get('issue', '?')}",
                "",
                f"- **PR:** {r.get('pr_url', '#')} (#{r.get('pr_number')})",
                f"- **Assigned role:** {_ROLE_LABELS.get(r.get('assigned_role', 'developer'), r.get('assigned_role'))}",
                f"- **Root cause:** {ai.get('root_cause', '—')}",
                f"- **Files/components affected:** {', '.join(v.get('changed_files', [])[:15]) or '—'}",
                f"- **Validation verdict:** {'resolved' if ai.get('resolved') else 'NOT resolved'} "
                f"(confidence {ai.get('confidence', '—')})",
                f"- **Graph diff:** nodes {gd.get('nodes_before', '?')}→{gd.get('nodes_after', '?')}, "
                f"broken edges {len(gd.get('broken_edges', []))}, cycles {gd.get('cycles_before', '?')}→{gd.get('cycles_after', '?')}",
                f"- **Potential risks:** {'; '.join(ai.get('risks', [])) or '—'}",
                f"- **Tests recommended:** {'; '.join(ai.get('tests_recommended', [])) or '—'}",
            ]
            regressions = ai.get("regressions") or []
            if regressions:
                lines.append("- **Regressions flagged:**")
                for reg in regressions[:10]:
                    if isinstance(reg, dict):
                        lines.append(f"  - `{reg.get('file', '?')}` — {reg.get('description', '')}")
                    else:
                        lines.append(f"  - {reg}")
            remaining = ai.get("remaining_issues") or []
            if remaining:
                lines.append(f"- **Remaining issues:** {'; '.join(remaining[:5])}")
            lines.append("")
        unresolved = [r for r in validated if not ((r.get("validation") or {}).get("ai") or {}).get("resolved")]
        if unresolved:
            lines += ["## ⚠️ Needs human attention (validation failed / retry exhausted)", ""]
            for r in unresolved:
                lines.append(f"- {r.get('issue', '?')} — PR #{r.get('pr_number')}")
            lines.append("")
        return "\n".join(lines)

    # ── Report shape ────────────────────────────────────────────────────

    @staticmethod
    def _report(repo_url: str, branch: str, repo_path: str, entities: Dict[str, Any],
                graph: Dict[str, Any], stats: Dict[str, Any], rels: Dict[str, Any],
                issues: List[Dict[str, Any]], llm_routes: List[Dict[str, Any]],
                solutions: List[Dict[str, Any]],
                tasks: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        from datetime import datetime, timezone
        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "repo": {
                "label": _repo_label(repo_url),
                "url": repo_url,
                "branch": branch,
                "checkout": repo_path,
            },
            "graph": {
                "architecture_pattern": graph.get("architecture_pattern", "unknown"),
                "mermaid": graph.get("architecture_diagram", ""),
                "collapsed": graph.get("is_collapsed", False),
                "stats": stats,
            },
            "relationships": rels.get("stats", {}),
            "llm_routes": llm_routes,
            "issues": issues,
            "solutions": solutions,
            "tasks": tasks or [],
            "entities": entities,
            "stats": stats,
        }
