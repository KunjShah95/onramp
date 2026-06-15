import os
import subprocess
import tempfile
from typing import Dict, Any, List, Optional
from pathlib import Path
import httpx


class Issue:
    def __init__(
        self,
        id: int,
        number: int,
        title: str,
        body: Optional[str],
        url: str,
        labels: List[str],
        state: str,
    ):
        self.id = id
        self.number = number
        self.title = title
        self.body = body or ""
        self.url = url
        self.labels = labels
        self.state = state

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "number": self.number,
            "title": self.title,
            "body": self.body,
            "url": self.url,
            "labels": self.labels,
            "state": self.state,
        }


class GitHubService:
    """Handles GitHub repo operations."""

    def __init__(self, token: Optional[str] = None):
        self.github_token = token or os.getenv("GITHUB_TOKEN")

    async def clone_repo(self, repo_url: str, branch: str = "main") -> str:
        """
        Clone repo to temp directory. Returns path.
        repo_url: "https://github.com/owner/repo"
        """
        temp_dir = tempfile.mkdtemp(prefix="codeflow_")
        clone_url = repo_url.replace("https://", f"https://{self.github_token}@") if self.github_token else repo_url

        cmd = ["git", "clone", "--depth=1", f"--branch={branch}", clone_url, temp_dir]
        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            raise Exception(f"Clone failed: {result.stderr}")

        return temp_dir

    async def get_issues(self, repo_url: str, labels: List[str] = None, limit: int = 20) -> List[Issue]:
        """
        Fetch issues from GitHub API.
        labels: ["good-first-issue", "beginner", ...]
        """
        try:
            # Parse owner and repo from URL
            # e.g., "https://github.com/owner/repo"
            cleaned_url = repo_url.strip()
            if cleaned_url.endswith(".git"):
                cleaned_url = cleaned_url[:-4]
            parts = cleaned_url.rstrip("/").split("/")
            if len(parts) < 2:
                return []
            owner, repo = parts[-2], parts[-1]

            url = f"https://api.github.com/repos/{owner}/{repo}/issues"

            headers = {
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "CodeFlow-2.0"
            }
            if self.github_token:
                headers["Authorization"] = f"token {self.github_token}"

            params = {
                "state": "open",
                "per_page": limit,
            }
            if labels:
                params["labels"] = ",".join(labels)

            async with httpx.AsyncClient() as client:
                response = await client.get(url, headers=headers, params=params, timeout=10.0)
                if response.status_code != 200:
                    return []

                data = response.json()
                issues = []
                for item in data:
                    # Filter out PRs if they are returned as issues (GitHub API returns PRs in issues endpoint)
                    if "pull_request" in item:
                        continue

                    labels_list = [l["name"] for l in item.get("labels", [])]
                    issues.append(Issue(
                        id=item.get("id"),
                        number=item.get("number"),
                        title=item.get("title", ""),
                        body=item.get("body", ""),
                        url=item.get("html_url", ""),
                        labels=labels_list,
                        state=item.get("state", "open")
                    ))
                return issues
        except Exception:
            return []

    async def get_pr_diff(self, repo_url: str, pr_number: int) -> str:
        """Fetch PR diff from GitHub API."""
        try:
            cleaned_url = repo_url.strip()
            if cleaned_url.endswith(".git"):
                cleaned_url = cleaned_url[:-4]
            parts = cleaned_url.rstrip("/").split("/")
            if len(parts) < 2:
                return ""
            owner, repo = parts[-2], parts[-1]

            url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}"

            headers = {
                "Accept": "application/vnd.github.v3.diff",
                "User-Agent": "CodeFlow-2.0"
            }
            if self.github_token:
                headers["Authorization"] = f"token {self.github_token}"

            async with httpx.AsyncClient() as client:
                response = await client.get(url, headers=headers, timeout=10.0)
                if response.status_code == 200:
                    return response.text
        except Exception:
            pass
        return ""
