import os
import subprocess
import tempfile
from typing import Dict, Any, List
from pathlib import Path


class GitHubService:
    """Handles GitHub repo operations."""

    def __init__(self):
        self.github_token = os.getenv("GITHUB_TOKEN")

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

    async def get_issues(self, repo_url: str, labels: List[str] = None) -> List[Dict[str, Any]]:
        """
        Fetch issues from GitHub API.
        labels: ["good-first-issue", "beginner", ...]
        """
        # Placeholder: implement with PyGithub or httpx
        return []

    async def get_pr_diff(self, repo_url: str, pr_number: int) -> str:
        """Fetch PR diff from GitHub API."""
        # Placeholder
        return ""
