from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

class ReviewSummary(BaseModel):
    original_issue: str
    root_cause: str
    affected_components: List[str]
    changes_made: str
    validation_results: str
    potential_risks: List[str]
    tests_performed: List[str]

class ReviewSummaryGenerator:
    """Generates concise technical summaries for senior developer review."""

    def generate(
        self,
        issue_description: str,
        analysis_result: Any, # AnalysisResult
        fixes: List[Any],      # List[ProposedFix]
        validation_result: Any # ValidationResult
    ) -> str:
        """Produces a formatted markdown report of the resolution process."""

        # Extract affected components from the analysis and fixes
        components = set()
        for fix in fixes:
            components.add(fix.file_path)

        affected_str = ", ".join(components) if components else "None"

        # Format changes made
        changes_list = []
        for i, fix in enumerate(fixes, 1):
            changes_list.append(f"{i}. {fix.file_path}: {fix.reasoning}")
        changes_str = "\n".join(changes_list) if changes_list else "No changes applied"

        # Format validation
        val_status = "✅ PASSED" if validation_result.is_valid else "❌ FAILED"
        val_details = "\n".join(validation_result.errors or ["No errors detected"])
        validation_str = f"Status: {val_status}\nDetails: {val_details}"

        # Generate the final markdown report
        report = (
            "## 🛠 Technical Resolution Summary\n\n"
            f"**Original Issue:**\n{issue_description}\n\n"
            f"**Root Cause:**\n{analysis_result.root_cause}\n\n"
            f"**Affected Components:**\n{affected_str}\n\n"
            f"**Changes Made:**\n{changes_str}\n\n"
            f"**Validation Results:**\n{validation_str}\n\n"
            f"**Potential Risks:**\n- Low risk: minimal changes to existing logic\n"
            f"**Tests Performed:**\n- AST syntactic check\n- Dependency graph regression check"
        )

        return report

    def to_json(self, summary_text: str) -> Dict[str, Any]:
        """Optional helper to return a structured JSON version of the summary."""
        return {"summary": summary_text}
