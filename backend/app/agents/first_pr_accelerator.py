import logging
from typing import Dict, Any, List
from app.agents.base_agent import BaseAgent
from app.services.issue_service import IssueService

logger = logging.getLogger(__name__)


class FirstPRAccelerator(BaseAgent):
    """Finds beginner-friendly issues and generates guides for first-time contributors."""

    def __init__(self, llm_client, github_token: str = None):
        """
        Initialize FirstPRAccelerator agent.

        Args:
            llm_client: LLM client for generating guides (Claude).
            github_token: Optional user-specific GitHub token to avoid shared rate limit.
        """
        super().__init__(llm_client)
        self.issue_service = IssueService(github_token=github_token)

    async def execute(self, **kwargs) -> Dict[str, Any]:
        """
        Execute agent logic. Delegates to find_issues() for discovering beginner-friendly issues.

        Args:
            **kwargs: Arbitrary keyword arguments passed from caller (e.g., repo_url, user_level).

        Returns:
            Dictionary with results or status. Format depends on provided kwargs.
        """
        repo_url = kwargs.get("repo_url")
        user_level = kwargs.get("user_level", "junior")

        if not repo_url:
            return {"status": "error", "message": "repo_url is required"}

        issues = await self.find_issues(repo_url, user_level)
        return {
            "status": "ok",
            "user_level": user_level,
            "issues_found": len(issues),
            "issues": issues
        }

    async def find_issues(
        self, repo_url: str, user_level: str = "junior", limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Find good-first-issues and return filtered list by user level.

        Filtering strategy:
        - junior: complexity_score <= 4 (most restrictive, easiest issues only)
        - mid: 3 <= complexity_score <= 7 (medium difficulty)
        - senior: all issues returned (no filtering)

        Args:
            repo_url: Full GitHub repository URL (e.g., https://github.com/owner/repo)
            user_level: Skill level filter: 'junior', 'mid', or 'senior' (default: 'junior')
            limit: Maximum number of issues to fetch before filtering (default: 10)

        Returns:
            List of issue dictionaries filtered by user_level, sorted by complexity score.
            Each issue contains:
                - id: GitHub issue ID
                - number: Issue number in repository
                - title: Issue title
                - body: Issue description
                - url: GitHub URL to issue
                - labels: List of label names
                - complexity_score: 0-10 score (lower = easier)
                - estimated_hours: Estimated work hours based on complexity
        """
        # Fetch beginner issues from GitHub
        issues = await self.issue_service.get_beginner_issues(repo_url, limit=limit)

        # Refine scores with LLM if available (blends LLM score with keyword score)
        if self.llm and issues:
            issues = await self._llm_rescore(issues)

        # Filter by user level
        if user_level == "junior":
            # Junior: only easiest issues (complexity <= 4)
            filtered_issues = [i for i in issues if i["complexity_score"] <= 4]
        elif user_level == "mid":
            # Mid: medium difficulty (3 <= complexity <= 7)
            filtered_issues = [i for i in issues if 3 <= i["complexity_score"] <= 7]
        else:
            # Senior (or default): all issues
            filtered_issues = issues

        # Already sorted by complexity from IssueService, but ensure consistent ordering
        filtered_issues.sort(key=lambda x: x["complexity_score"])
        return filtered_issues

    async def _llm_rescore(self, issues: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Use the LLM to rescore issue complexity based on the full title + body.

        Blends the LLM score (70%) with the keyword-based score (30%) so the
        LLM can catch nuances the keyword heuristic misses, while the keyword
        baseline prevents wild outliers.

        Args:
            issues: List of issue dicts with keyword-based `complexity_score`.

        Returns:
            Updated issue list with blended complexity scores.
        """
        if not self.llm or not issues:
            return issues

        # Batch up to 15 issues to stay within token limits
        batch = issues[:15]
        issues_text = "\n---\n".join(
            f"#{i['number']}: {i['title']}\nBody: {i.get('body', '')[:500]}"
            for i in batch
        )

        prompt = (
            "Rate the complexity of each GitHub issue on a scale of 0-10.\n"
            "- 0 = trivial fix (typo, CSS tweak, one-line change)\n"
            "- 3 = easy (add a simple feature, update docs)\n"
            "- 5 = moderate (refactor a function, add a small component)\n"
            "- 8 = hard (cross-cutting change, new service, API design)\n"
            "- 10 = very hard (architectural change, breaking changes)\n\n"
            "Return ONLY a JSON object mapping issue numbers to scores.\n"
            "Example: {\"42\": 3, \"57\": 7}\n\n"
            f"Issues:\n{issues_text}"
        )

        try:
            result = await self.llm.json_chat(prompt)
            if isinstance(result, dict):
                for issue in issues:
                    str_num = str(issue["number"])
                    if str_num in result:
                        llm_score = float(result[str_num])
                        # Blend: 70% LLM + 30% keyword heuristic
                        issue["complexity_score"] = round(
                            llm_score * 0.7 + issue["complexity_score"] * 0.3, 1
                        )
                        issue["estimated_hours"] = max(1, issue["complexity_score"] * 0.5)
        except Exception:
            logger.exception("LLM rescoring failed, falling back to keyword scores")

        return issues

    async def generate_guide(self, issue_id: int, repo_structure: Dict) -> Dict[str, Any]:
        """
        Generate step-by-step guide for fixing an issue.

        Args:
            issue_id: GitHub issue ID
            repo_structure: Repository structure context (files, issues, etc.)

        Returns:
            Dictionary with guide structure:
                - issue_id: GitHub issue ID
                - files_to_touch: List of file paths to modify
                - steps: List of numbered step strings
                - similar_prs: List of similar merged pull requests
        """
        if self.llm:
            issues = repo_structure.get("issues", [])
            target_issue = None
            for issue in issues:
                if issue.get("id") == issue_id or str(issue.get("id")) == str(issue_id):
                    target_issue = issue
                    break
            
            title = target_issue.get("title", "Fix issue") if target_issue else "Fix issue"
            body = target_issue.get("body", "") if target_issue else ""
            files = [f.get("path", "") for f in repo_structure.get("files", [])]
            
            prompt = (
                f"You are a developer onboarding agent assisting a new developer.\n"
                f"They need to fix the following issue:\n"
                f"Title: {title}\n"
                f"Body: {body}\n\n"
                f"Available codebase files:\n{', '.join(files[:30])}\n\n"
                f"Generate an onboarding guide for this fix. Under `files_to_touch`, list up to 3 files. Under `steps`, provide at least 3 concrete, step-by-step instructions. Under `similar_prs`, mock 1-2 URLs representing similar merged PRs.\n\n"
                f"Return as JSON:\n"
                f"{{\n"
                f'  "issue_id": {issue_id},\n'
                f'  "files_to_touch": ["file1.js", ...],\n'
                f'  "steps": ["Step 1...", "Step 2...", "Step 3..."],\n'
                f'  "similar_prs": [{{"url": "...", "title": "...", "merged": true}}]\n'
                f"}}"
            )
            try:
                result = await self.llm.json_chat(prompt)
                if result.get("steps") and len(result["steps"]) >= 3:
                    return result
            except Exception:
                pass

        # Fallback default implementation
        files_to_touch = []
        issues = repo_structure.get("issues", [])
        target_issue = None
        for issue in issues:
            if issue.get("id") == issue_id or str(issue.get("id")) == str(issue_id):
                target_issue = issue
                break
        
        title = target_issue.get("title", "Fix issue") if target_issue else "Fix issue"
        
        # Try to find relevant files from the repo structure by keyword matching the title
        keywords = title.lower().split()
        for f in repo_structure.get("files", []):
            path = f.get("path", "")
            if any(kw in path.lower() for kw in keywords):
                files_to_touch.append(path)
                if len(files_to_touch) >= 2:
                    break
        
        if not files_to_touch and repo_structure.get("files"):
            files_to_touch = [repo_structure["files"][0].get("path", "")]
            
        file_desc = files_to_touch[0] if files_to_touch else "relevant file"
        
        steps = [
            f"Locate the component or file {file_desc} in the codebase.",
            f"Analyze the implementation details relating to the issue: '{title}'.",
            f"Modify {file_desc} to resolve the issue and verify the changes locally.",
        ]
        
        return {
            "issue_id": issue_id,
            "files_to_touch": files_to_touch,
            "steps": steps,
            "similar_prs": [
                {
                    "url": "https://github.com/example/repo/pull/1",
                    "title": f"Refactored {file_desc.split('/')[-1] if '/' in file_desc else file_desc} behavior",
                    "merged": True
                }
            ]
        }
