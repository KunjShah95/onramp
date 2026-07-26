"""Autonomous Coding Agent — implements issues and opens PRs.

Workflow:
1. Accept an issue description + repo URL
2. Clone the repo to a temp directory
3. Use the LLM to understand the issue and plan changes
4. Use the LLM to generate the actual code changes (find-and-replace patches)
5. Apply changes via GitHub's Git Data API
6. Create a branch, commit changes, and open a PR

Runs inside a Celery task (``app.tasks.agent_tasks.autonomous_code_change``)
so the caller receives an immediate job ID and can poll for results.
"""

import logging
import os
import tempfile
from typing import Any, Dict, List, Optional

from app.agents.base_agent import BaseAgent
from app.services.github_service import GitHubService

logger = logging.getLogger(__name__)


class AutonomousCodingAgent(BaseAgent):
    """Agent that autonomously implements code changes from an issue description."""

    def __init__(self, llm_client, github_token: str = None):
        super().__init__(llm_client)
        self.github = GitHubService(github_token)
        self._tmp_dir: Optional[str] = None

    async def execute(self, **kwargs) -> Dict[str, Any]:
        """Execute the autonomous coding workflow.

        Required kwargs:
          - repo_url (str): GitHub repo URL (e.g. ``https://github.com/owner/repo``)
          - issue_description (str): Description of the feature/fix to implement
          - branch_name (str, optional): Branch name for the changes (auto-generated if omitted)
          - base_branch (str, optional): Target branch (default ``main``)

        Returns:
          dict with ``pr_url``, ``pr_number``, ``branch``, ``summary``, ``changes``.
        """
        repo_url = kwargs.get("repo_url", "")
        issue_description = kwargs.get("issue_description", "")
        base_branch = kwargs.get("base_branch", "main")
        branch_name = kwargs.get("branch_name", f"ai/{os.urandom(4).hex()[:8]}")

        if not repo_url or not issue_description:
            raise ValueError("Both 'repo_url' and 'issue_description' are required.")

        # 1. Parse owner/repo from URL
        cleaned = repo_url.strip().rstrip("/")
        if cleaned.endswith(".git"):
            cleaned = cleaned[:-4]
        parts = cleaned.split("/")
        if len(parts) < 2:
            raise ValueError(f"Invalid repo URL: {repo_url}")
        owner, repo = parts[-2], parts[-1]

        # 2. Analyze the issue and generate a plan
        plan = await self._generate_plan(issue_description, repo_url)
        patches = plan.get("patches", [])
        summary = plan.get("summary", issue_description[:200])

        if not patches:
            return {
                "success": False,
                "error": "Could not generate any code changes from the issue description. "
                          "Try being more specific about which files to modify.",
            }

        # 3. Create branch (try direct first, then fork)
        branch_created = await self.github.create_branch(owner, repo, base_branch, branch_name)
        head_ref = branch_name
        pr_owner = owner

        if not branch_created:
            # Try fork — fetch the authenticated user first
            gh_user = await self.github.get_authenticated_user()
            if not gh_user:
                return {"success": False, "error": "Could not determine authenticated GitHub user for forking."}

            fork_name = await self.github.create_fork(owner, repo)
            if not fork_name:
                return {"success": False, "error": "Could not fork the repository. Check permissions."}

            try:
                await self.github.create_branch(gh_user, repo, base_branch, branch_name)
                head_ref = f"{gh_user}:{branch_name}"
                pr_owner = owner
            except Exception:
                logger.exception("Failed to create branch on fork")
                return {"success": False, "error": "Created fork but could not create branch on it."}

        # 4. Apply each patch via commit_to_branch (no PR number needed)
        applied = []
        for patch in patches:
            try:
                result = await self.github.commit_to_branch(
                    owner=pr_owner,
                    repo=repo,
                    branch=branch_name,
                    file_path=patch["file_path"],
                    old_string=patch.get("old_string", ""),
                    new_string=patch.get("new_string", ""),
                    commit_message=patch.get(
                        "commit_message", f"fix: {summary[:60]}"
                    ),
                )
                applied.append(result)
            except Exception as e:
                logger.warning("Patch failed for %s: %s", patch.get("file_path"), e)
                applied.append({"file_path": patch.get("file_path"), "error": str(e)})

        # 5. Create the pull request
        pr_result = await self.github.create_pr(
            owner=owner,
            repo=repo,
            head=head_ref,
            base=base_branch,
            title=summary[:72],
            body=self._build_pr_body(issue_description, plan, applied),
        )

        if not pr_result:
            return {
                "success": False,
                "error": "Changes were committed but PR creation failed.",
                "applied_patches": applied,
                "branch": branch_name,
            }

        logger.info(
            "Autonomous coding complete: %s PR #%s",
            repo_url,
            pr_result.get("pr_number"),
        )

        return {
            "success": True,
            "pr_url": pr_result["pr_url"],
            "pr_number": pr_result["pr_number"],
            "branch": branch_name,
            "summary": summary,
            "files_changed": len(applied),
            "patches_applied": len([a for a in applied if "commit_sha" in a]),
            "patches_failed": len([a for a in applied if "error" in a]),
        }

    # ── LLM-powered plan generation ──────────────────────────────────────

    async def _generate_plan(
        self, issue_description: str, repo_url: str
    ) -> Dict[str, Any]:
        """Use the LLM to generate a set of file patches from the issue description."""
        prompt = f"""You are an expert software engineer implementing a feature from an issue description.

Issue:
{issue_description[:3000]}

Repository: {repo_url}

Your task: Generate the exact code changes needed to implement this feature.

For each file that needs to be changed, provide:
1. The file path (relative to repo root)
2. The EXACT existing code snippet (old_string) that will be replaced
3. The NEW code snippet (new_string) that replaces it
4. A brief commit message for this change

IMPORTANT: The old_string must match the EXISTING code EXACTLY — whitespace, indentation, everything.
This is a find-and-replace operation.

Return ONLY valid JSON with this structure:
{{
  "summary": "Brief 1-sentence summary of the changes",
  "patches": [
    {{
      "file_path": "src/main.py",
      "old_string": "existing code that will be replaced",
      "new_string": "new code that replaces it",
      "commit_message": "Brief description of this specific change"
    }}
  ]
}}

Only output the JSON, no extra text. If you cannot determine the required changes, return:
{{"summary": "Could not determine changes", "patches": []}}
"""
        try:
            result = await self.llm.json_chat(prompt)
            return result
        except Exception:
            logger.exception("LLM plan generation failed")
            return {"summary": "", "patches": []}

    async def _fallback_simple_patch(
        self, issue_description: str, repo_url: str
    ) -> Dict[str, Any]:
        """Fallback plan that just generates a new file (README.md with issue notes).

        This is a placeholder — in production, a more sophisticated approach
        would be used (e.g., cloning the repo and analyzing the actual code).
        """
        prompt = f"""Given this issue:
{issue_description[:2000]}

Generate a minimal implementation plan. Since we couldn't analyze the actual repo,
assume we need to create a new file or modify a config file.

Return ONLY JSON:
{{
  "summary": "Brief summary",
  "patches": [
    {{
      "file_path": "README.md",
      "old_string": "",
      "new_string": "# Implementation Plan\\n\\nBased on the issue:\\n\\n{issue_description[:500]}\\n",
      "commit_message": "docs: add implementation notes"
    }}
  ]
}}"""
        try:
            return await self.llm.json_chat(prompt)
        except Exception:
            return {"summary": "", "patches": []}

    # ── Helpers ──────────────────────────────────────────────────────────

    def _build_pr_body(
        self,
        issue_description: str,
        plan: Dict[str, Any],
        applied: List[Dict[str, Any]],
    ) -> str:
        """Build a PR description from the plan and applied patches."""
        lines = [
            "##  Autonomous Implementation\n",
            plan.get("summary", ""),
            "",
            "### Issue",
            "",
            issue_description[:2000],
            "",
            "### Changes",
            "",
        ]
        for p in applied:
            fp = p.get("file_path", "?")
            if "commit_sha" in p:
                lines.append(f"- `{fp}` — committed")
            elif "error" in p:
                lines.append(f"- `{fp}` — {p['error']}")
        lines.extend([
            "",
            "---",
            "_This PR was generated autonomously by the Onramp AI coding agent._",
        ])
        return "\n".join(lines)
