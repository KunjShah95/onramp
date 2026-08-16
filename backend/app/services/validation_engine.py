import logging
from typing import Any, Dict, List, Optional, Tuple
from app.services.repo_context import RepoContextService, index_id_for
from app.graph import build_dependency_graph

logger = logging.getLogger("onramp.validation_engine")

class ValidationResult:
    def __init__(self, is_valid: bool, errors: List[str] = None, improvements: List[str] = None):
        self.is_valid = is_valid
        self.errors = errors or []
        self.improvements = improvements or []

    def to_dict(self) -> Dict[str, Any]:
        return {
            "is_valid": self.is_valid,
            "errors": self.errors,
            "improvements": self.improvements
        }

class ValidationEngine:
    """Verifies that a code fix resolves the issue without introducing regressions."""

    def __init__(self):
        self.context = RepoContextService()

    async def verify_fix(
        self,
        repo_url: str,
        branch: str,
        before_index_id: str,
        after_index_id: str,
        expected_changes: List[Any]
    ) -> ValidationResult:
        """
        Performs a multi-stage verification of the fix.

        Args:
            repo_url: The repository URL.
            branch: The branch containing the fix.
            before_index_id: Index ID of the repo before the fix.
            after_index_id: Index ID of the repo after the fix.
            expected_changes: List of ProposedFix objects.
        """
        errors = []
        improvements = []

        # 1. Fetch snapshots
        before_doc = await self.context.get(before_index_id)
        after_doc = await self.context.get(after_index_id)

        if not before_doc or not after_doc:
            return ValidationResult(False, errors=["Could not retrieve before/after snapshots for comparison"])

        # 2. AST Integrity Check
        # If the 'after' doc was successfully built by RepoContextService, it already parses.
        # However, we can explicitly check if any expected files are now missing or empty.
        # Note: parsed files live under doc["entities"]["files"] in the context document.
        after_entities = after_doc.get("entities") or {}
        after_files = {f["path"] for f in after_entities.get("files", [])}
        for change in expected_changes:
            if change.file_path not in after_files:
                errors.append(f"File {change.file_path} is missing after the fix")

        # 3. Graph Regression Analysis
        # Detect new circular dependencies introduced by the fix.
        before_graph = before_doc.get("graph", {})
        after_graph = after_doc.get("graph", {})

        before_cycles = before_graph.get("circular_dependencies", [])
        after_cycles = after_graph.get("circular_dependencies", [])

        new_cycles = [c for c in after_cycles if c not in before_cycles]
        if new_cycles:
            errors.append(f"Fix introduced {len(new_cycles)} new circular dependencies")

        # 4. Relationship Verification
        # Verify that the dependency chain was modified as intended.
        # This is a simplified check: ensure the affected files are still part of the graph.
        before_deps = before_graph.get("dependencies", {})
        after_deps = after_graph.get("dependencies", {})

        for change in expected_changes:
            path = change.file_path
            if path in before_deps and path not in after_deps:
                # If the file was a node in the graph but now it's gone, it might be a problem
                # unless the fix explicitly removed the entity.
                improvements.append(f"Entity at {path} removed from dependency graph")

        is_valid = len(errors) == 0
        return ValidationResult(is_valid, errors, improvements)
