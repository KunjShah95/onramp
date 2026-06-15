import os
from typing import Dict, Any
from pathlib import Path
from app.agents.base_agent import BaseAgent
from app.services.github_service import GitHubService
from app.services.parser_service import ParserService
from app.graph import DependencyGraph


class ArchitectureExplorer(BaseAgent):
    def __init__(self, llm_client):
        super().__init__(llm_client)
        self.github = GitHubService()
        self.parser = ParserService()

    async def execute(self, repo_url: str, branch: str = "main") -> Dict[str, Any]:
        repo_path = await self.github.clone_repo(repo_url, branch)

        entities = await self.parser.parse_directory(repo_path)
        graph = self._build_graph(entities)
        result = graph.to_dict()

        services = result.get("services", [])
        if self.llm:
            try:
                files_summary = "\n".join(
                    f"{f['path']} ({f['language']})" for f in entities["files"][:50]
                )
                classes_summary = "\n".join(
                    f"{c['name']} in {c['file']}" for c in entities["classes"][:30]
                )
                prompt = (
                    f"Analyze this repository and identify meaningful service/component boundaries.\n\n"
                    f"Files:\n{files_summary}\n\n"
                    f"Classes:\n{classes_summary}\n\n"
                    f"Return a JSON array of services with format: "
                    f'[{{"name": "service-name", "files": ["path/to/file"], "description": "what it does"}}]'
                )
                llm_result = await self._call_claude(prompt)
                parsed = self._parse_llm_services(llm_result, services)
                if parsed:
                    services = parsed
            except Exception:
                pass

        return {
            "repo": repo_url,
            "entities": entities,
            "services": services,
            "dependencies": result["dependencies"],
            "circular_dependencies": result["circular_dependencies"],
            "architecture_pattern": result["architecture_pattern"],
            "architecture_diagram": result["architecture_diagram"],
        }

    def _build_graph(self, entities: Dict) -> DependencyGraph:
        graph = DependencyGraph()
        module_map = entities.get("module_map", {})
        files = entities["files"]

        for f in files:
            graph.add_module(f["path"], {"language": f["language"]})

        for imp in entities["imports"]:
            source = imp["file"]
            target_mod = imp["module"]
            resolved = self._resolve_module(target_mod, module_map, Path(source).parent)
            if resolved:
                graph.add_dependency(source, resolved)

        for f in files:
            for dep in f.get("dependencies", []):
                resolved = self._resolve_module(dep, module_map, Path(f["path"]).parent)
                if resolved and resolved != f["path"]:
                    graph.add_dependency(f["path"], resolved)

        graph.add_module("__entry__", {"language": "meta"})
        for f in files:
            has_exports = len(f.get("exports", [])) > 0
            is_entry = self._is_entry_point(f["path"])
            if has_exports or is_entry:
                graph.add_dependency("__entry__", f["path"])

        return graph

    def _resolve_module(self, mod: str, module_map: Dict, search_dir: Path) -> str:
        if mod in module_map:
            return module_map[mod]

        dotted_mod = mod.replace("-", "_")
        if dotted_mod in module_map:
            return module_map[dotted_mod]

        as_path = mod.replace(".", "/")
        if as_path in module_map:
            return module_map[as_path]

        for ext in [".py", ".js", ".jsx", ".ts", ".tsx", ".go", ".rs", ".java"]:
            candidate = str(search_dir / as_path) + ext
            if candidate in module_map.values():
                return candidate

        init_candidate = str(search_dir / as_path / f"__init__.py")
        if init_candidate in module_map.values():
            return init_candidate

        index_candidate = str(search_dir / as_path / f"index{ext}")
        if index_candidate in module_map.values():
            return index_candidate

        return ""

    def _is_entry_point(self, fpath: str) -> bool:
        name = Path(fpath).name.lower()
        return any(kw in name for kw in ["main", "index", "app", "cli", "server", "run", "entry"])

    def _parse_llm_services(self, llm_result: str, fallback: list) -> list:
        import json
        try:
            start = llm_result.index("[")
            end = llm_result.rindex("]") + 1
            return json.loads(llm_result[start:end])
        except (ValueError, json.JSONDecodeError):
            return fallback
