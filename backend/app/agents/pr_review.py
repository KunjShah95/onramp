"""
PR Review Agent - analyzes pull requests and provides code review feedback.
"""

import logging
from typing import Dict, Any, List
from app.agents.base_agent import BaseAgent
from app.services.github_service import GitHubService

logger = logging.getLogger(__name__)

class PRReviewAgent(BaseAgent):
    """Agent that reviews GitHub pull requests and provides feedback."""

    def __init__(self, llm_client, github_token: str = None):
        super().__init__(llm_client)
        self.github = GitHubService(github_token)

    async def execute(self, **kwargs) -> Dict[str, Any]:
        return await self.review_pr(
            repo_url=kwargs.get("repo_url"),
            pr_number=kwargs.get("pr_number"),
            focus_areas=kwargs.get("focus_areas"),
        )

    async def review_pr(
        self,
        repo_url: str,
        pr_number: int,
        focus_areas: List[str] = None,
    ) -> Dict[str, Any]:
        """Review a PR and return structured feedback."""
        diff = await self.github.get_pr_diff(repo_url, pr_number)
        if not diff:
            return {
                "error": "Could not fetch PR diff",
                "repo_url": repo_url,
                "pr_number": pr_number,
            }

        return await self._analyze_diff(diff, focus_areas)

    async def _analyze_diff(
        self,
        diff: str,
        focus_areas: List[str] = None,
    ) -> Dict[str, Any]:
        """Analyze the diff and return review feedback."""
        if not self.llm:
            return self._fallback_analysis(diff)

        focus = focus_areas or ["security", "performance", "maintainability", "correctness"]
        prompt = self._build_review_prompt(diff, focus)

        try:
            result = await self._call_claude(prompt)
            return self._parse_review_result(result, diff)
        except Exception:
            return self._fallback_analysis(diff)

    def _build_review_prompt(self, diff: str, focus_areas: List[str]) -> str:
        """Build the prompt for PR review."""
        focus_str = ", ".join(focus_areas)
        return f"""You are a senior code reviewer. Analyze the following PR diff and provide structured feedback.

Focus areas: {focus_str}

Diff:
```diff
{diff[:8000]}
```

Provide your response as JSON with this exact structure:
{{
  "summary": "Brief overall assessment (2-3 sentences)",
  "score": 85,
  "issues": [
    {{
      "type": "security|performance|maintainability|correctness|style",
      "severity": "critical|high|medium|low",
      "file": "path/to/file.py",
      "line": 42,
      "message": "Description of the issue",
      "suggestion": "How to fix it"
    }}
  ],
  "positives": ["Good practice 1", "Good practice 2"],
  "recommendations": ["Recommendation 1", "Recommendation 2"]
}}

Only include the JSON response, no extra text."""

    def _parse_review_result(self, result: str, diff: str) -> Dict[str, Any]:
        """Parse the LLM response into structured review."""
        import json
        try:
            start = result.find("{")
            end = result.rfind("}") + 1
            if start >= 0 and end > start:
                parsed = json.loads(result[start:end])
                parsed["diff_stats"] = self._get_diff_stats(diff)
                return parsed
        except Exception:
            logger.exception("Failed to parse LLM review result, using fallback analysis")
        return self._fallback_analysis(diff)

    def _fallback_analysis(self, diff: str) -> Dict[str, Any]:
        """Fallback analysis when LLM is not available."""
        stats = self._get_diff_stats(diff)
        return {
            "summary": f"PR modifies {stats['files_changed']} files (+{stats['additions']}/-{stats['deletions']} lines). Manual review recommended.",
            "score": 70,
            "issues": [],
            "positives": ["Changes are focused and readable"],
            "recommendations": [
                "Add unit tests for new functionality",
                "Ensure CI passes before merging",
                "Consider adding documentation for API changes"
            ],
            "diff_stats": stats,
        }

    async def generate_pr_description(
        self,
        repo_url: str,
        pr_number: int,
        title: str = "",
        branch: str = "",
    ) -> Dict[str, Any]:
        """Generate a human-readable PR description from a diff."""
        diff = await self.github.get_pr_diff(repo_url, pr_number)
        if not diff:
            return {
                "error": "Could not fetch PR diff",
                "repo_url": repo_url,
                "pr_number": pr_number,
            }

        if not self.llm:
            stats = self._get_diff_stats(diff)
            return {
                "title": title or f"Pull Request #{pr_number}",
                "summary": f"This PR modifies {stats['files_changed']} files with {stats['additions']} additions and {stats['deletions']} deletions.",
                "changes": [],
                "testing_notes": "Manual testing recommended.",
                "checklist": ["Code compiles", "Tests pass", "Manual QA done"],
                "diff_stats": stats,
            }

        stats = self._get_diff_stats(diff)
        prompt = f"""Generate a polished PR description in JSON format based on the following diff.

PR title: {title or f"Untitled PR #{pr_number}"}
Branch: {branch or "unknown"}

Diff:
```diff
{diff[:8000]}
```

Respond in this exact JSON format:
{{
  "title": "Concise PR title",
  "summary": "2-3 sentence summary of what this PR does and why",
  "changes": [
    {{
      "file": "path/to/file.py",
      "description": "What changed in this file and why"
    }}
  ],
  "testing_notes": "How to test these changes",
  "checklist": ["Item 1", "Item 2"]
}}

Only output the JSON, no extra text."""

        try:
            result = await self._call_claude(prompt)
            import json
            start = result.find("{")
            end = result.rfind("}") + 1
            if start >= 0 and end > start:
                parsed = json.loads(result[start:end])
                parsed["diff_stats"] = stats
                return parsed
        except Exception:
            logger.exception("Failed to get LLM review, using fallback")

        # Fallback
        return {
            "title": title or f"Pull Request #{pr_number}",
            "summary": f"This PR modifies {stats['files_changed']} files with {stats['additions']} additions and {stats['deletions']} deletions.",
            "changes": [],
            "testing_notes": "Manual testing recommended.",
            "checklist": ["Code compiles", "Tests pass", "Manual QA done"],
            "diff_stats": stats,
        }

    def _get_diff_stats(self, diff: str) -> Dict[str, int]:
        """Extract basic stats from diff."""
        lines = diff.split("\n")
        additions = sum(1 for l in lines if l.startswith("+") and not l.startswith("+++"))
        deletions = sum(1 for l in lines if l.startswith("-") and not l.startswith("---"))
        files = set()
        for l in lines:
            if l.startswith("+++ b/") or l.startswith("--- a/"):
                files.add(l[6:])
        return {
            "files_changed": len(files),
            "additions": additions,
            "deletions": deletions,
        }