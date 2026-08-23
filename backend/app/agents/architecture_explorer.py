import json
import urllib.parse
from typing import Dict, Any, Optional
from app.agents.base_agent import BaseAgent
from app.llm import QueryType
from app.services.github_service import GitHubService
from app.services.parser_service import ParserService
from app.graph import DependencyGraph


# Reasonable input ceilings, so a stray huge number from a caller can't make
# the agent request an absurd parse/graph build. Realistic repos are tiny
# compared to these; they exist to reject obvious nonsense, not to throttle.
_MAX_FILES = 500_000
_MAX_NODES = 50_000
_MAX_CONTEXT_MAX_TOKENS = 100_000
_ALLOWED_GITHUB_HOSTS = ("github.com", "www.github.com")


def _validate_positive_int(value: Any, name: str, maximum: int) -> int:
    """Validate an int parameter (coerce where safe) and return it."""
    if value is None:
        raise ValueError(f"{name} is required")
    if isinstance(value, bool):
        raise ValueError(f"{name} must be a positive integer, got a boolean")
    if isinstance(value, float) and not value.is_integer():
        raise ValueError(f"{name} must be an integer, got {value!r}")
    try:
        ival = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{name} must be an integer, got {value!r}")
    if ival < 1:
        raise ValueError(f"{name} must be a positive integer, got {ival}")
    if ival > maximum:
        raise ValueError(f"{name} exceeds maximum of {maximum}, got {ival}")
    return ival


def _is_valid_github_url(repo_url: str) -> bool:
    """Return True if repo_url is a strict GitHub https URL with owner/repo."""
    if not isinstance(repo_url, str) or not repo_url.strip():
        return False
    try:
        parsed = urllib.parse.urlparse(repo_url.strip())
    except ValueError:
        return False
    if parsed.scheme != "https" or parsed.hostname not in _ALLOWED_GITHUB_HOSTS:
        return False
    parts = [p for p in parsed.path.split("/") if p]
    return len(parts) >= 2


class ArchitectureExplorer(BaseAgent):
    query_type = QueryType.REASONING
    agent_type = "architecture_explorer"
    """Maps repo structure, dependencies, and services to identify architecture patterns.

    This agent orchestrates the full analysis pipeline:
    1. Clones the repository from GitHub
    2. Parses code entities (classes, functions, imports, exports)
    3. Builds a dependency graph using NetworkX
    4. Uses Claude to analyze and identify service boundaries
    5. Returns comprehensive architecture analysis
    """

    def __init__(self, llm_client, github_token: Optional[str] = None):
        """Initialize ArchitectureExplorer with GitHub and Parser services.

        Args:
            llm_client: LLM client for Claude API calls (passed from main.py)
            github_token: Optional per-user GitHub token for authenticated requests
        """
        super().__init__(llm_client)
        self.github = GitHubService(token=github_token)
        self.parser = ParserService()

    async def execute(
        self,
        repo_url: str,
        branch: str = "main",
        max_files: int = 1000,
        max_nodes: int = 150,
        index_id: Optional[str] = None,
        context_max_tokens: int = 4000,
    ) -> Dict[str, Any]:
        """Analyze repository and return complete architecture analysis.

        Step 1: Clone repo to temporary directory (skipped when a cached
                repo-context ``index_id`` is provided — parse-once reuse)
        Step 2: Parse all entities (files, classes, functions, imports/exports)
        Step 3: Build dependency graph
        Step 4: Use Claude to identify service boundaries and architecture patterns
        Step 5: Return combined analysis

        Parameters are validated up front so malformed calls fail fast with a
        ``ValueError`` instead of surfacing an obscure downstream error.
        """
        # Step 0: Validate inputs before doing any work.
        max_files = _validate_positive_int(max_files, "max_files", _MAX_FILES)
        max_nodes = _validate_positive_int(max_nodes, "max_nodes", _MAX_NODES)
        context_max_tokens = _validate_positive_int(
            context_max_tokens, "context_max_tokens", _MAX_CONTEXT_MAX_TOKENS
        )
        if not isinstance(branch, str) or not branch.strip():
            raise ValueError("branch must be a non-empty string")

        # Step 1: Clone repository (unless we can reuse the parsed index)
        entities = None
        result = None
        if index_id:
            from app.services.repo_context import repo_context_service

            cached = await repo_context_service.get(index_id)
            if cached:
                entities = cached.get("entities")
                result = cached.get("graph") or {}
                if repo_url == "" or repo_url is None:
                    repo_url = cached.get("repo_url", "")

        if entities is None:
            if not isinstance(repo_url, str) or not _is_valid_github_url(repo_url):
                raise ValueError(
                    f"Invalid repository URL: {repo_url!r}. "
                    "Expected an https GitHub URL (e.g. https://github.com/owner/repo)."
                )
            repo_path = await self.github.clone_repo(repo_url, branch)
            # Step 2: Parse entities from the repository
            entities = await self.parser.parse_directory(repo_path, max_files=max_files)

        # Step 3: Build dependency graph (skip when the cached graph exists)
        if result is None:
            graph = self._build_graph(entities)
            result = graph.to_dict(max_nodes=max_nodes)

        # Step 4: Use Claude to analyze structure and identify services
        services = result.get("services", [])
        analysis = {}

        if self.llm:
            try:
                # Prepare summaries for Claude. When an index is available,
                # embed a token-budgeted selection instead of the full dump.
                if index_id:
                    from app.services.repo_context import select_context

                    slice_doc = select_context(
                        {"index_id": index_id, "entities": entities, "graph": result or {}},
                        requirement="architecture, services, and component boundaries",
                        max_tokens=context_max_tokens,
                    )
                    context_text = slice_doc.get("context_text", "") or ""
                    files_summary = context_text[: int(context_max_tokens * 4)]
                    classes_summary = ""
                    functions_count = slice_doc.get("file_count", len(entities.get("functions", [])))
                    budget_note = (
                        f" (context budgeted to {context_max_tokens} tokens: "
                        f"{slice_doc.get('file_count', 0)} of {len(entities['files'])} files shown)"
                    )
                else:
                    files_summary = "\n".join(
                        f"{f['path']} ({f['language']})"
                        for f in entities["files"][:50]
                    )
                    classes_summary = "\n".join(
                        f"{c['name']} in {c['file']}"
                        for c in entities["classes"][:30]
                    )
                    functions_count = len(entities.get("functions", []))
                    budget_note = ""

                prompt = (
                    f"Analyze this repository and identify meaningful service/component boundaries.\n\n"
                    f"Files ({len(entities['files'])} total):\n{files_summary}{budget_note}\n\n"
                    f"Classes ({len(entities['classes'])} total):\n{classes_summary}\n\n"
                    f"Functions: {functions_count} total\n\n"
                    f"Current detected pattern: {result.get('architecture_pattern', 'unknown')}\n"
                    f"Circular dependencies: {len(result.get('circular_dependencies', []))}\n"
                    f"Dependency graph collapsed/clustered to folder level: {result.get('is_collapsed', False)}\n\n"
                    f"Return a JSON object with:\n"
                    f'{{"services": [{{"name": "service-name", "files": ["path"], "description": "..."}}], '
                    f'"main_services": ["..."], "data_flows": ["..."], '
                    f'"architecture_pattern": "monolith|microservices|modular", '
                    f'"key_dependencies": ["..."], "recommendations": ["..."]}}'
                )

                llm_result = await self._call_claude(prompt)
                analysis = self._parse_llm_analysis(llm_result)

                # Update services from Claude analysis if available
                if analysis.get("services"):
                    services = analysis["services"]

            except Exception:
                # If Claude analysis fails, use graph-based services as fallback
                analysis = {
                    "services": services,
                    "main_services": [s["name"] for s in services[:5]],
                    "architecture_pattern": result.get("architecture_pattern"),
                    "key_dependencies": [],
                    "recommendations": []
                }

        # Step 5: Return complete analysis
        return {
            "repo": repo_url,
            "branch": branch,
            "entities": entities,
            "services": services,
            "dependencies": result["dependencies"],
            "circular_dependencies": result["circular_dependencies"],
            "architecture_pattern": result["architecture_pattern"],
            "architecture_diagram": result["architecture_diagram"],
            "analysis": analysis,
            "graph": result,
        }

    def _build_graph(self, entities: Dict) -> DependencyGraph:
        """Build dependency graph from parsed entities (shared implementation).

        Delegates to :func:`app.graph.build_dependency_graph` so the
        repo-context index and this agent produce identical graphs.
        """
        from app.graph import build_dependency_graph as build_graph

        return build_graph(entities)

    def _parse_llm_analysis(self, llm_result: str) -> Dict[str, Any]:
        """Parse Claude's JSON analysis response.

        Args:
            llm_result: Raw response from Claude

        Returns:
            Parsed JSON analysis dict, or empty dict if parsing fails
        """
        try:
            # Extract JSON from response (may have surrounding text)
            start = llm_result.index("{")
            end = llm_result.rindex("}") + 1
            analysis = json.loads(llm_result[start:end])
            return analysis
        except (ValueError, json.JSONDecodeError, KeyError):
            return {}