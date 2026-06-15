import os
import json
from typing import Dict, Any
from pathlib import Path
from app.agents.base_agent import BaseAgent
from app.services.github_service import GitHubService
from app.services.parser_service import ParserService
from app.graph import DependencyGraph


class ArchitectureExplorer(BaseAgent):
    """Maps repo structure, dependencies, and services to identify architecture patterns.

    This agent orchestrates the full analysis pipeline:
    1. Clones the repository from GitHub
    2. Parses code entities (classes, functions, imports, exports)
    3. Builds a dependency graph using NetworkX
    4. Uses Claude to analyze and identify service boundaries
    5. Returns comprehensive architecture analysis
    """

    def __init__(self, llm_client):
        """Initialize ArchitectureExplorer with GitHub and Parser services.

        Args:
            llm_client: LLM client for Claude API calls (passed from main.py)
        """
        super().__init__(llm_client)
        self.github = GitHubService()
        self.parser = ParserService()

    async def execute(self, repo_url: str, branch: str = "main") -> Dict[str, Any]:
        """Analyze repository and return complete architecture analysis.

        Step 1: Clone repo to temporary directory
        Step 2: Parse all entities (files, classes, functions, imports/exports)
        Step 3: Build dependency graph
        Step 4: Use Claude to identify service boundaries and architecture patterns
        Step 5: Return combined analysis

        Args:
            repo_url: GitHub repository URL (e.g., "https://github.com/owner/repo")
            branch: Git branch to analyze (default: "main")

        Returns:
            Dict containing:
                - repo: Repository URL
                - branch: Branch name
                - entities: Parsed code entities (files, classes, functions, imports)
                - graph: Dependency graph serialized to dict
                - services: Identified services/components with boundaries
                - dependencies: Module-to-module dependencies
                - circular_dependencies: Detected circular import cycles
                - architecture_pattern: Detected pattern (monolith/microservices/modular)
                - architecture_diagram: Mermaid diagram of architecture
                - analysis: Claude's architecture analysis in JSON format
        """
        # Step 1: Clone repository
        repo_path = await self.github.clone_repo(repo_url, branch)

        # Step 2: Parse entities from the repository
        entities = await self.parser.parse_directory(repo_path)

        # Step 3: Build dependency graph
        graph = self._build_graph(entities)
        result = graph.to_dict()

        # Step 4: Use Claude to analyze structure and identify services
        services = result.get("services", [])
        analysis = {}

        if self.llm:
            try:
                # Prepare summaries for Claude
                files_summary = "\n".join(
                    f"{f['path']} ({f['language']})"
                    for f in entities["files"][:50]
                )
                classes_summary = "\n".join(
                    f"{c['name']} in {c['file']}"
                    for c in entities["classes"][:30]
                )
                functions_count = len(entities.get("functions", []))

                prompt = (
                    f"Analyze this repository and identify meaningful service/component boundaries.\n\n"
                    f"Files ({len(entities['files'])} total):\n{files_summary}\n\n"
                    f"Classes ({len(entities['classes'])} total):\n{classes_summary}\n\n"
                    f"Functions: {functions_count} total\n\n"
                    f"Current detected pattern: {result.get('architecture_pattern', 'unknown')}\n"
                    f"Circular dependencies: {len(result.get('circular_dependencies', []))}\n\n"
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
        }

    def _build_graph(self, entities: Dict) -> DependencyGraph:
        """Build dependency graph from parsed entities.

        Args:
            entities: Parsed entities from ParserService

        Returns:
            DependencyGraph with all modules and dependencies
        """
        graph = DependencyGraph()
        module_map = entities.get("module_map", {})
        files = entities["files"]

        # Add all files as nodes
        for f in files:
            graph.add_module(f["path"], {"language": f["language"]})

        # Add import dependencies
        for imp in entities["imports"]:
            source = imp["file"]
            target_mod = imp["module"]
            resolved = self._resolve_module(target_mod, module_map, Path(source).parent)
            if resolved:
                graph.add_dependency(source, resolved)

        # Add file-level dependencies
        for f in files:
            for dep in f.get("dependencies", []):
                resolved = self._resolve_module(dep, module_map, Path(f["path"]).parent)
                if resolved and resolved != f["path"]:
                    graph.add_dependency(f["path"], resolved)

        # Mark entry points
        graph.add_module("__entry__", {"language": "meta"})
        for f in files:
            has_exports = len(f.get("exports", [])) > 0
            is_entry = self._is_entry_point(f["path"])
            if has_exports or is_entry:
                graph.add_dependency("__entry__", f["path"])

        return graph

    def _resolve_module(self, mod: str, module_map: Dict, search_dir: Path) -> str:
        """Resolve import module name to actual file path.

        Args:
            mod: Import module name (e.g., "services.auth" or "@components/Button")
            module_map: Mapping of module names to file paths
            search_dir: Directory to search from (for relative imports)

        Returns:
            Resolved file path or empty string if not found
        """
        # Direct lookup
        if mod in module_map:
            return module_map[mod]

        # Try with underscores instead of hyphens
        dotted_mod = mod.replace("-", "_")
        if dotted_mod in module_map:
            return module_map[dotted_mod]

        # Try with path separators instead of dots
        as_path = mod.replace(".", "/")
        if as_path in module_map:
            return module_map[as_path]

        # Try with various extensions
        for ext in [".py", ".js", ".jsx", ".ts", ".tsx", ".go", ".rs", ".java"]:
            candidate = str(search_dir / as_path) + ext
            if candidate in module_map.values():
                return candidate

        # Try __init__.py pattern
        init_candidate = str(search_dir / as_path / f"__init__.py")
        if init_candidate in module_map.values():
            return init_candidate

        # Try index.* pattern
        index_candidate = str(search_dir / as_path / f"index.ts")
        if index_candidate in module_map.values():
            return index_candidate

        return ""

    def _is_entry_point(self, fpath: str) -> bool:
        """Determine if a file is an entry point.

        Args:
            fpath: File path

        Returns:
            True if file matches entry point pattern
        """
        name = Path(fpath).name.lower()
        return any(kw in name for kw in ["main", "index", "app", "cli", "server", "run", "entry"])

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
