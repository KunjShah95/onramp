from typing import Dict, Any, List
from app.agents.base_agent import BaseAgent
from app.services.issue_service import IssueService


class FirstPRAccelerator(BaseAgent):
    """Finds beginner-friendly issues and generates guides for first-time contributors."""

    def __init__(self, llm_client):
        """
        Initialize FirstPRAccelerator agent.

        Args:
            llm_client: LLM client for generating guides (Claude).
        """
        super().__init__(llm_client)
        self.issue_service = IssueService()

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

    async def generate_guide(self, issue_id: int, repo_structure: Dict) -> Dict[str, Any]:
        """
        Generate step-by-step guide for fixing an issue.

        This is a placeholder implementation that returns basic structure.
        Full implementation with LLM-powered guide generation is planned for Phase 2.

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
        return {
            "issue_id": issue_id,
            "files_to_touch": [],
            "steps": [],
            "similar_prs": []
        }
