import os
import tempfile
from typing import List, Optional
from dataclasses import dataclass
import httpx


@dataclass
class Issue:
    id: int
    number: int
    title: str
    body: str
    url: str
    labels: List[str]
    state: str


class GitHubService:
    def __init__(self, token: Optional[str] = None):
        self.token = token or os.getenv("GITHUB_TOKEN", "")
        self.base_url = "https://api.github.com"

    def _headers(self) -> dict:
        headers = {"Accept": "application/vnd.github.v3+json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    async def clone_repo(self, repo_url: str, branch: str = "main") -> str:
        owner, name = self._parse_repo_url(repo_url)
        clone_url = f"https://github.com/{owner}/{name}.git"
        dest = tempfile.mkdtemp(prefix=f"codeflow_{owner}_{name}_")
        result = os.system(f"git clone --depth 1 --branch {branch} {clone_url} {dest} 2>nul")
        if result != 0:
            result = os.system(f"git clone --depth 1 {clone_url} {dest} 2>nul")
        if result != 0:
            raise RuntimeError(f"Failed to clone {repo_url}")
        return dest

    async def get_issues(self, repo_url: str, labels: Optional[List[str]] = None, limit: int = 20) -> List[Issue]:
        owner, name = self._parse_repo_url(repo_url)
        url = f"{self.base_url}/repos/{owner}/{name}/issues"
        params = {"state": "open", "per_page": min(limit, 100), "sort": "updated"}
        if labels:
            params["labels"] = ",".join(labels)

        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=self._headers(), params=params)
            resp.raise_for_status()
            data = resp.json()

        issues = []
        for item in data:
            issues.append(Issue(
                id=item["id"],
                number=item["number"],
                title=item["title"],
                body=item.get("body", "") or "",
                url=item["html_url"],
                labels=[l["name"] for l in item.get("labels", [])],
                state=item["state"],
            ))
        return issues[:limit]

    async def get_pr_diff(self, repo_url: str, pr_number: int) -> str:
        owner, name = self._parse_repo_url(repo_url)
        url = f"{self.base_url}/repos/{owner}/{name}/pulls/{pr_number}"
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers={**self._headers(), "Accept": "application/vnd.github.v3.diff"})
            resp.raise_for_status()
            return resp.text

    async def search_similar_prs(self, repo_url: str, query: str, limit: int = 5) -> List[dict]:
        owner, name = self._parse_repo_url(repo_url)
        url = f"{self.base_url}/search/issues"
        q = f"repo:{owner}/{name} {query} is:pr is:merged"
        params = {"q": q, "per_page": limit, "sort": "updated"}

        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=self._headers(), params=params)
            resp.raise_for_status()
            data = resp.json()

        return [
            {"url": item["html_url"], "title": item["title"], "merged": True}
            for item in data.get("items", [])
        ]

    def _parse_repo_url(self, url: str) -> tuple:
        url = url.rstrip("/")
        if url.endswith(".git"):
            url = url[:-4]
        parts = url.split("/")
        return parts[-2], parts[-1]
