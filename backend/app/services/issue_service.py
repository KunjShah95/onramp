from typing import List, Dict, Any
import httpx


class IssueService:
    """Fetch and score GitHub issues."""

    def __init__(self, github_token: str = None):
        """
        Initialize IssueService.

        Args:
            github_token: GitHub API token for authentication.
                         If None, requests will be made without auth (rate-limited).
        """
        self.token = github_token
        self.api_base = "https://api.github.com"

    async def get_beginner_issues(self, repo_url: str, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Fetch issues labeled "good-first-issue", "beginner", "help-wanted".
        Returns scored and sorted list.

        Args:
            repo_url: Full GitHub repository URL (e.g., https://github.com/owner/repo)
            limit: Maximum number of issues to fetch (default: 10)

        Returns:
            List of issues sorted by complexity score (ascending, easiest first).
            Each issue contains:
                - id: GitHub issue ID
                - number: Issue number in repository
                - title: Issue title
                - body: Issue description
                - url: GitHub URL to issue
                - labels: List of label names
                - complexity_score: 0-10 score (lower = easier)
                - estimated_hours: Estimated work hours based on complexity

        Raises:
            httpx.HTTPError: If GitHub API request fails
        """
        # Parse owner/repo from URL
        parts = repo_url.rstrip("/").split("/")
        owner, repo = parts[-2], parts[-1]

        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}

        # Fetch issues
        async with httpx.AsyncClient() as client:
            url = f"{self.api_base}/repos/{owner}/{repo}/issues"
            params = {
                "labels": "good-first-issue,beginner,help-wanted",
                "state": "open",
                "per_page": limit
            }
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()
            issues = response.json()

        # Score by complexity
        scored_issues = []
        for issue in issues:
            score = self._score_complexity(issue)
            scored_issues.append({
                "id": issue["id"],
                "number": issue["number"],
                "title": issue["title"],
                "body": issue["body"],
                "url": issue["html_url"],
                "labels": [label["name"] for label in issue.get("labels", [])],
                "complexity_score": score,  # 0-10, lower = easier
                "estimated_hours": max(1, score * 0.5)
            })

        # Sort by complexity
        scored_issues.sort(key=lambda x: x["complexity_score"])
        return scored_issues

    def _score_complexity(self, issue: Dict) -> float:
        """
        Score issue complexity on a 0-10 scale. Lower scores indicate easier issues.

        Scoring heuristics:
            - Base score: 5
            - Documentation issues: -2
            - Fix typo issues: -3
            - Add test issues: -1
            - Long description (>1000 chars): +1
            - Refactor issues: +2
            - Architecture issues: +3

        Args:
            issue: GitHub issue object from API response

        Returns:
            Complexity score between 0 and 10 (inclusive)
        """
        score = 5  # Base score

        # Factors that reduce score (easier):
        if "documentation" in issue["title"].lower():
            score -= 2
        if "fix typo" in issue["title"].lower():
            score -= 3
        if "add test" in issue["title"].lower():
            score -= 1

        # Factors that increase score (harder):
        if len(issue.get("body", "")) > 1000:
            score += 1
        if "refactor" in issue["title"].lower():
            score += 2
        if "architecture" in issue["title"].lower():
            score += 3

        return max(0, min(10, score))
