from typing import Dict, Any
from app.agents.base_agent import BaseAgent


class SilentPairProgramming(BaseAgent):
    async def execute(self, issue_title: str, issue_body: str, repo_structure: Dict) -> Dict[str, Any]:
        return await self.generate_walkthrough(issue_title, issue_body, repo_structure)

    async def generate_walkthrough(self, issue_title: str, issue_body: str, repo_structure: Dict) -> Dict[str, Any]:
        if self.llm:
            files_summary = "\n".join(
                f.get("path", "") for f in repo_structure.get("files", [])
            )[:3000]
            prompt = (
                f"Issue: {issue_title}\n\n{issue_body}\n\n"
                f"Repository files:\n{files_summary}\n\n"
                "Generate a narrated walkthrough of how to solve this issue. "
                "Think aloud like a senior developer pair programming with a junior. "
                "Include: where to start, what to look for, how to debug, "
                "what to change, and how to test.\n\n"
                "Return as JSON:\n"
                "{\n"
                '  "thought_process": "narrated step-by-step thinking",\n'
                '  "files_to_examine": ["path/to/file"],\n'
                '  "key_insights": ["key observation"],\n'
                '  "solution_steps": ["step 1", "step 2"],\n'
                '  "code_changes": [{"file": "path", "change": "what to do", "code": "example code"}],\n'
                '  "testing_approach": "how to verify"\n'
                "}"
            )
            try:
                result = await self.llm.json_chat(prompt)
                if result.get("thought_process"):
                    return result
            except Exception:
                pass

        return {
            "thought_process": (
                f"Let me understand this issue: {issue_title}. "
                f"The issue says: {issue_body[:200]}. "
                "I need to find where this code lives and understand the current behavior."
            ),
            "files_to_examine": [f.get("path", "") for f in repo_structure.get("files", [])[:5]],
            "key_insights": [
                "Start by understanding the current behavior",
                "Check related files for context",
                "Look for existing tests",
            ],
            "solution_steps": [
                f"Understand the problem: {issue_title}",
                "Find the relevant code",
                "Make the fix following existing patterns",
                "Test the change",
                "Submit for review",
            ],
            "code_changes": [],
            "testing_approach": "Run existing tests, then manually verify the fix resolves the issue.",
        }
