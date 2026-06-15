from typing import Dict, Any
from app.agents.base_agent import BaseAgent


class HealthScorer(BaseAgent):
    async def execute(self, **kwargs) -> Dict[str, Any]:
        return await self.score(kwargs.get("repo_structure", {}))

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
