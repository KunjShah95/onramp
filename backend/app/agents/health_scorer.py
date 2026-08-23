import logging
import random
from typing import Dict, Any
from app.agents.base_agent import BaseAgent
from app.llm import QueryType

logger = logging.getLogger(__name__)


class HealthScorer(BaseAgent):
    agent_type = "health_scorer"
    query_type = QueryType.STRUCTURED
    async def execute(self, **kwargs) -> Dict[str, Any]:
        mode = kwargs.get("mode", "normal")
        # Resolve from the repo-context index when an index_id is given;
        # scoring needs the full structure (ratios), the roast only a slice.
        from app.services.repo_context import resolve_for_agent

        full, _slice, context_text = await resolve_for_agent(
            kwargs.get("index_id"),
            kwargs.get("repo_structure", {}),
            requirement="repository health, code quality, test coverage, documentation, complexity",
            max_tokens=kwargs.get("context_max_tokens", 2000),
            llm=self.llm,
        )
        score_result = await self.score(full)
        if mode == "roast" and self.llm:
            return await self._add_roast(score_result, full, context_text)
        return score_result

    async def score(self, repo_structure: Dict) -> Dict[str, Any]:
        files = repo_structure.get("files", [])
        classes = repo_structure.get("classes", [])
        functions = repo_structure.get("functions", [])
        imports = repo_structure.get("imports", [])

        total_files = len(files) or 1
        total_imports = len(imports)

        test_files = sum(1 for f in files if self._is_test_file(f.get("path", "")))
        test_coverage = round((test_files / total_files) * 100, 1)

        doc_files = sum(1 for f in files if self._is_doc_file(f.get("path", "")))
        documentation = round((doc_files / total_files) * 100, 1)

        avg_deps = total_imports / total_files
        dependency_freshness = max(0, min(100, round(100 - (avg_deps * 10), 1)))

        complexity = self._assess_complexity(files, classes, functions)

        circular_deps = repo_structure.get("circular_dependencies", [])
        has_circular = len(circular_deps) > 0

        entry_files = sum(1 for f in files if self._is_entry_point(f.get("path", "")))
        has_entry_points = entry_files > 0

        maintainability = round(
            10.0
            - (len(circular_deps) * 0.5)
            - (1 if total_imports > total_files * 3 else 0)
            + (0.5 if test_files > 0 else 0)
            + (0.5 if has_entry_points else 0),
            1,
        )
        maintainability = max(1, min(10, maintainability))

        overall_score = round(
            (test_coverage * 0.25)
            + (documentation * 0.15)
            + (dependency_freshness * 0.2)
            + (maintainability * 10 * 0.25)
            + (50 if not has_circular else 20) * 0.15,
            1,
        )

        recommendations = []
        if test_coverage < 30:
            recommendations.append(f"Increase test coverage from {test_coverage}% to at least 30%")
        if documentation < 20:
            recommendations.append(f"Add more documentation (currently {documentation}% of files)")
        if has_circular:
            recommendations.append(f"Resolve {len(circular_deps)} circular dependencies")
        if avg_deps > 3:
            recommendations.append(f"Reduce average imports per file ({avg_deps:.1f} → target < 3)")
        if not has_entry_points:
            recommendations.append("Add entry point files (main.py, app.py, etc.)")
        if test_files == 0:
            recommendations.append("Add test files to improve maintainability")

        return {
            "overall_score": overall_score,
            "test_coverage": test_coverage,
            "documentation": documentation,
            "dependency_freshness": dependency_freshness,
            "complexity": complexity,
            "maintainability": maintainability,
            "circular_dependencies": len(circular_deps),
            "total_files": total_files,
            "test_files": test_files,
            "recommendations": recommendations[:5],
        }

    async def _add_roast(
        self, score_result: Dict[str, Any], repo_structure: Dict, context_text: str = ""
    ) -> Dict[str, Any]:
        # Prefer the token-budgeted index slice for the roast prompt.
        files_summary = context_text or "\n".join(
            f.get("path", "") for f in repo_structure.get("files", [])
        )[:2000]
        scores = f"Overall: {score_result['overall_score']}/100, Tests: {score_result['test_coverage']}%, Docs: {score_result['documentation']}%, Maintainability: {score_result['maintainability']}/10"
        prompt = (
            f"You are 'Health Score Roast Bot' — a sarcastic code health analyst.\n\n"
            f"Given these health scores for a codebase, write a funny 2-3 sentence roast:\n{scores}\n\n"
            f"Repository files:\n{files_summary}\n\n"
            "Return JSON only:\n"
            "{\n"
            '  "roast_summary": "Your funny roast (max 3 sentences)",\n'
            '  "roast_intensity": "light|medium|dark|burnt"\n'
            "}"
        )
        try:
            result = await self.llm.json_chat(prompt)
            score_result["roast"] = result.get("roast_summary", "")
            score_result["roast_intensity"] = result.get("roast_intensity", "light")
        except Exception:
            logger.exception("LLM roast failed for health scorer")
            score_result["roast"] = self._fallback_roast(score_result)
        return score_result

    @staticmethod
    def _fallback_roast(score_result: Dict[str, Any]) -> str:
        score = score_result.get("overall_score", 50)
        test_cov = score_result.get("test_coverage", 0)
        if score < 30:
            return "This codebase is held together by hope and outdated comments."
        if score < 50:
            return f"Test coverage at {test_cov}% is not 'coverage', it's an alibi."
        if score < 70:
            return "Your code is like a good indie movie — rough around the edges but it gets the job done."
        return "This codebase is so clean I'm genuinely suspicious. Who hurt you?"

    def _is_test_file(self, path: str) -> bool:
        name = path.lower()
        return any(kw in name for kw in ["test_", "_test", "spec.", "_spec", "tests/", "__tests__"])

    def _is_doc_file(self, path: str) -> bool:
        return path.lower().endswith((".md", ".rst", ".txt", "readme"))

    def _is_entry_point(self, path: str) -> bool:
        name = path.lower()
        return any(kw in name for kw in ["main.", "app.", "index.", "cli.", "server."])

    def _assess_complexity(self, files: list, classes: list, functions: list) -> str:
        if not files:
            return "unknown"
        ratio = len(functions) / max(1, len(files))
        class_ratio = len(classes) / max(1, len(files))
        if ratio < 1 and class_ratio < 0.5:
            return "low"
        elif ratio < 3 and class_ratio < 2:
            return "medium"
        return "high"
