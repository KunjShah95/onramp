from typing import List, Optional
from app.services.github_service import GitHubService, Issue


class IssueService:
    def __init__(self, token: Optional[str] = None):
        self.github = GitHubService(token)

    async def get_beginner_issues(self, repo_url: str, limit: int = 20) -> List[Issue]:
        beginner_labels = [
            "good-first-issue",
            "good first issue",
            "beginner",
            "easy",
            "help-wanted",
            "help wanted",
            "starter",
        ]
        all_issues = await self.github.get_issues(repo_url, labels=None, limit=limit * 2)

        scored = [(issue, self._score_complexity(issue)) for issue in all_issues]
        scored.sort(key=lambda x: x[1])

        return [issue for issue, score in scored[:limit]]

    def _score_complexity(self, issue: Issue) -> float:
        score = 5.0
        title_body = f"{issue.title} {issue.body}".lower()

        easy_keywords = ["typo", "docs", "documentation", "readme", "test", "refactor"]
        hard_keywords = ["architecture", "redesign", "migration", "refactor", "performance"]

        if any(kw in title_body for kw in easy_keywords):
            score -= 2
        if any(kw in title_body for kw in hard_keywords):
            score += 2
        if "fix" in title_body:
            score -= 1

        label_boost = 0
        for label in issue.labels:
            l = label.lower()
            if l in ("good-first-issue", "good first issue", "beginner", "easy"):
                label_boost -= 2
            elif l in ("bug",):
                label_boost -= 1
            elif l in ("enhancement", "feature"):
                label_boost += 1
            elif l in ("help-wanted", "help wanted", "starter"):
                label_boost -= 1
        score += label_boost

        body_len = len(issue.body) if issue.body else 0
        if body_len > 1000:
            score += 1
        if body_len < 200 and body_len > 0:
            score -= 1

        return max(0, min(10, score))
