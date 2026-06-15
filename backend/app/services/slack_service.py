from typing import List, Optional
import httpx


class SlackService:
    def __init__(self, webhook_url: Optional[str] = None):
        self.webhook_url = webhook_url

    async def post_message(self, text: str, channel: str = "#general") -> bool:
        if not self.webhook_url:
            return False
        payload = {"channel": channel, "text": text, "mrkdwn": True}
        async with httpx.AsyncClient() as client:
            resp = await client.post(self.webhook_url, json=payload)
            return resp.is_success

    def format_good_first_issues(self, issues: list) -> str:
        if not issues:
            return "No good first issues found today :tada:"

        lines = [f"*Good First Issues for Juniors ({len(issues)} found)*\n"]
        for i, issue in enumerate(issues[:10], 1):
            title = issue.get("title", "Untitled")
            hours = issue.get("estimated_hours", "?")
            url = issue.get("url", "")
            score = issue.get("complexity_score", "?")
            lines.append(f"{i}. <{url}|{title}> ({hours}h, complexity: {score})")

        return "\n".join(lines)

    def format_health_report(self, repo: str, health: dict) -> str:
        score = health.get("overall_score", 0)
        lines = [
            f"*CodeFlow Health Report: {repo}*\n",
            f"Overall Score: {score}/100",
            f"Test Coverage: {health.get('test_coverage', 0)}%",
            f"Maintainability: {health.get('maintainability', 0)}/10",
            f"Complexity: {health.get('complexity', 'unknown')}\n",
        ]
        recs = health.get("recommendations", [])
        if recs:
            lines.append("*Recommendations:*")
            for r in recs:
                lines.append(f"• {r}")

        return "\n".join(lines)
