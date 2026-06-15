from typing import Dict, Any, List
from app.agents.base_agent import BaseAgent
from app.services.issue_service import IssueService


class FirstPRAccelerator(BaseAgent):
    def __init__(self, llm_client):
        super().__init__(llm_client)
        self.issue_service = IssueService()

    async def execute(self, **kwargs) -> Dict[str, Any]:
        return {"status": "ok"}

    async def find_issues(self, repo_url: str, user_level: str = "junior") -> List[Dict[str, Any]]:
        issues = await self.issue_service.get_beginner_issues(repo_url)

        level_thresholds = {"junior": 4, "mid": 7, "senior": 10}

        result = []
        for issue in issues:
            score = self.issue_service._score_complexity(issue)
            max_score = level_thresholds.get(user_level, 4)
            if score <= max_score:
                result.append({
                    "id": issue.id,
                    "number": issue.number,
                    "title": issue.title,
                    "body": issue.body[:500] if issue.body else "",
                    "url": issue.url,
                    "labels": issue.labels,
                    "complexity_score": score,
                    "estimated_hours": round(max(0.5, score * 0.75), 1),
                })

        result.sort(key=lambda x: x["complexity_score"])
        return result[:20]

    async def generate_guide(self, issue_id: int, repo_structure: Dict) -> Dict[str, Any]:
        issue_title = "Issue"
        issue_body = ""
        for issue_data in repo_structure.get("issues", []):
            if issue_data.get("id") == issue_id:
                issue_title = issue_data.get("title", "Issue")
                issue_body = issue_data.get("body", "")
                break

        if self.llm:
            files_summary = "\n".join(
                f.get("path", "")
                for f in repo_structure.get("files", [])
            )[:2000]

            prompt = (
                f"Issue: {issue_title}\n\n{issue_body}\n\n"
                f"Repository files:\n{files_summary}\n\n"
                "Generate a step-by-step guide to fix this issue. "
                'Return as JSON with keys: files_to_touch (list of file paths), '
                'steps (list of numbered step strings), similar_prs (list of {url, title, merged})'
            )
            try:
                llm_result = await self._call_claude(prompt)
                parsed = self._parse_llm_guide(llm_result, issue_id)
                if parsed.get("steps"):
                    return parsed
            except Exception:
                pass

        files_to_touch = []
        for f in repo_structure.get("files", []):
            path = f.get("path", "")
            if any(kw.lower() in path.lower() for kw in issue_title.split()):
                files_to_touch.append(path)

        steps = [
            f"1. Understand the issue: {issue_title}",
            f"2. Read the description: {issue_body[:200]}" if issue_body else "2. Read the issue description",
            "3. Locate the relevant files in the codebase",
            "4. Make the necessary changes following existing patterns",
            "5. Run tests to verify your changes",
            "6. Submit a pull request with a clear description",
        ]

        return {
            "issue_id": issue_id,
            "title": issue_title,
            "files_to_touch": files_to_touch[:5],
            "steps": steps,
            "similar_prs": [],
        }

    def _parse_llm_guide(self, llm_result: str, issue_id: int) -> Dict:
        import json
        try:
            start = llm_result.index("{")
            end = llm_result.rindex("}") + 1
            guide = json.loads(llm_result[start:end])
            guide["issue_id"] = issue_id
            return guide
        except (ValueError, json.JSONDecodeError):
            return {
                "issue_id": issue_id,
                "files_to_touch": [],
                "steps": [],
                "similar_prs": [],
            }
