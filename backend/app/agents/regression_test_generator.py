import logging
from typing import Dict, Any, List
from app.agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)

class RegressionTestGenerator(BaseAgent):
    async def execute(self, pr_diff: str, repo_structure: Dict) -> Dict[str, Any]:
        return await self.generate(pr_diff, repo_structure)

    async def generate(self, pr_diff: str, repo_structure: Dict) -> Dict[str, Any]:
        files_changed = self._extract_files_from_diff(pr_diff)
        file_details = [
            f for f in repo_structure.get("files", [])
            if f.get("path", "") in files_changed
        ]

        if self.llm:
            prompt = (
                f"PR changes the following files:\n{', '.join(files_changed)}\n\n"
                f"Diff:\n{pr_diff[:3000]}\n\n"
                "Generate a comprehensive test checklist for this PR.\n\n"
                "Return as JSON:\n"
                "{\n"
                '  "must_test": ["test case descriptions"],\n'
                '  "edge_cases": ["edge case descriptions"],\n'
                '  "related_tests": ["related areas to verify"],\n'
                '  "test_code_template": "example test code"\n'
                "}"
            )
            try:
                result = await self.llm.json_chat(prompt)
                if result.get("must_test"):
                    return result
            except Exception:
                logger.exception("LLM json_chat failed for regression test generation, using fallback")

        must_test = []
        for f in files_changed:
            name = f.split("/")[-1]
            must_test.append(f"{name} behaves correctly after changes")
            must_test.append(f"{name} handles error cases gracefully")
            must_test.append(f"{name} doesn't break existing functionality")

        return {
            "must_test": must_test[:6],
            "edge_cases": [
                f"What happens when input is empty?",
                f"What happens with maximum input size?",
                f"What happens on network timeout?",
                f"What happens with concurrent access?",
            ],
            "related_tests": [
                "Verify dependent modules still work",
                "Check integration with upstream callers",
                "Run full test suite to catch regressions",
            ],
            "test_code_template": (
                "def test_{feature}():\n"
                '    """Test that {feature} works correctly."""\n'
                "    result = function_under_test(input_data)\n"
                "    assert result.expected_property == expected_value\n"
            ),
        }

    def _extract_files_from_diff(self, diff: str) -> List[str]:
        files = []
        for line in diff.split("\n"):
            if line.startswith("--- a/") or line.startswith("+++ b/"):
                fname = line[6:].strip()
                if fname and fname not in files:
                    files.append(fname)
        return files or ["unknown_file"]
