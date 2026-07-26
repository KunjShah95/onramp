"""
GitLab Integration Service — interact with the GitLab REST API v4.

Supports:
  - Connection testing and project discovery
  - Repository stats retrieval (stars, forks, language, etc.)
  - Issue listing (filtered by labels)
  - Merge request diff fetching
  - Repo cloning via GitLab HTTPS with tokens

Auth:  Private-Token header (personal access token with read_api scope)
API:   https://gitlab.com/api/v4
"""

import os
import re
import urllib.parse
import logging
import subprocess
import sys
import tempfile
from typing import Optional, List, Dict, Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception
from cachetools import TTLCache

logger = logging.getLogger(__name__)

_issues_cache = TTLCache(maxsize=100, ttl=300)
_diffs_cache = TTLCache(maxsize=100, ttl=300)

GITLAB_API_BASE = "https://gitlab.com/api/v4"

# GitLab URL patterns:
#   https://gitlab.com/owner/repo
#   https://gitlab.com/owner/repo.git
#   https://gitlab.com/owner/group/subgroup/repo  (nested groups supported)
_GITLAB_URL_PATTERN = re.compile(
    r'^https://gitlab\.com/[A-Za-z0-9_.\-/]+/[A-Za-z0-9_.\-]+(\\.git)?/?$'
)

_BRANCH_PATTERN = re.compile(r'^[a-zA-Z0-9_\.\-/]+$')


def _is_valid_gitlab_url(repo_url: str) -> bool:
    return bool(isinstance(repo_url, str) and _GITLAB_URL_PATTERN.match(repo_url))


def _encode_project_path(owner: str, repo: str) -> str:
    """URL-encode the project path (owner/repo or groups/owner/repo).

    For nested groups, the full path separator is '/' which must be encoded
    as '%2F' for the GitLab API.
    """
    return urllib.parse.quote(f"{owner}/{repo}", safe="")


def _safe_int(val: Optional[str], default: int = 0) -> int:
    if val is None:
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


def _is_transient_http_error(exc: BaseException) -> bool:
    if isinstance(exc, (httpx.TimeoutException, httpx.ConnectError, httpx.NetworkError)):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in (429, 502, 503)
    return False


def _log_retry(retry_state) -> None:
    outcome = retry_state.outcome
    if outcome and outcome.exception():
        exc = outcome.exception()
        if isinstance(exc, httpx.HTTPStatusError):
            logger.warning(
                "GitLab API retry (%s) — attempt %d/3",
                exc.response.status_code,
                retry_state.attempt_number,
            )
        else:
            logger.warning(
                "GitLab API retry (%s) — attempt %d/3",
                type(exc).__name__,
                retry_state.attempt_number,
            )


class GitLabService:
    """Handles GitLab repo operations via the GitLab REST API v4."""

    def __init__(self, token: Optional[str] = None):
        self.token = token or os.getenv("GITLAB_TOKEN")

    def _headers(self) -> Dict[str, str]:
        headers = {
            "User-Agent": "Onramp-2.0",
            "Accept": "application/json",
        }
        if self.token:
            headers["PRIVATE-TOKEN"] = self.token
        return headers

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception(_is_transient_http_error),
        before_sleep=_log_retry,
    )
    async def _fetch(self, client: httpx.AsyncClient, path: str, params: Dict[str, Any] = None) -> httpx.Response:
        url = f"{GITLAB_API_BASE}/{path.lstrip('/')}"
        response = await client.get(url, headers=self._headers(), params=params)
        response.raise_for_status()
        return response

    # ── Connection Test ──────────────────────────────────────────

    async def test_connection(self) -> dict:
        """Validate a GitLab personal access token by fetching the current user."""
        if not self.token:
            return {"valid": False, "error": "Missing GitLab token"}

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{GITLAB_API_BASE}/user",
                    headers=self._headers(),
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return {
                        "valid": True,
                        "username": data.get("username", ""),
                        "name": data.get("name", ""),
                        "avatar_url": data.get("avatar_url", ""),
                    }
                elif resp.status_code == 401:
                    return {"valid": False, "error": "Token is invalid or expired"}
                else:
                    return {"valid": False, "error": f"GitLab API returned {resp.status_code}"}
        except httpx.ConnectError:
            return {"valid": False, "error": "Could not connect to GitLab API"}
        except Exception as e:
            return {"valid": False, "error": f"Connection error: {str(e)}"}

    # ── Repo Stats ───────────────────────────────────────────────

    async def get_repo_stats(self, owner: str, repo: str) -> dict:
        """Fetch repository metadata from GitLab API.

        Returns real signals or {"available": False} on failure.
        """
        project_path = _encode_project_path(owner, repo)

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await self._fetch(client, f"projects/{project_path}")
                data = resp.json()

                return {
                    "available": True,
                    "description": data.get("description", ""),
                    "language": data.get("primaryLanguage", data.get("language")),
                    "stars": data.get("star_count", 0),
                    "forks": data.get("forks_count", 0),
                    "watchers": data.get("star_count", 0),
                    "open_issues": data.get("open_issues_count", 0),
                    "default_branch": data.get("default_branch", "main"),
                    "pushed_at": data.get("last_activity_at"),
                    "archived": data.get("archived", False),
                    "visibility": data.get("visibility", "private"),
                    "topics": data.get("topics", []),
                    "http_url_to_repo": data.get("http_url_to_repo", ""),
                    "ssh_url_to_repo": data.get("ssh_url_to_repo", ""),
                    "license": (data.get("license", {}) or {}).get("spdx_id") if data.get("license") else None,
                }
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                logger.warning("Project %s/%s not found on GitLab", owner, repo)
            else:
                logger.exception("GitLab API error for %s/%s: %s", owner, repo, e)
        except Exception as e:
            logger.exception("Error fetching GitLab project %s/%s: %s", owner, repo, e)

        return {"available": False}

    # ── Issues ───────────────────────────────────────────────────

    async def get_issues(
        self,
        project_path_full: str,
        labels: Optional[List[str]] = None,
        limit: int = 20,
    ) -> List[dict]:
        """Fetch open issues from a GitLab project.

        project_path_full: "owner/repo" or "group/subgroup/repo"
        labels: ["good first issue", "help wanted"]
        """
        try:
            encoded = _encode_project_path(*project_path_full.split("/", 1))
            labels_key = ",".join(sorted(labels)) if labels else ""
            cache_key = f"gl_issues:{encoded}:{labels_key}:{limit}"
            if cache_key in _issues_cache:
                return _issues_cache[cache_key]

            params: Dict[str, Any] = {
                "state": "opened",
                "per_page": min(100, limit),
            }
            if labels:
                params["labels"] = ",".join(labels)

            issues = []
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await self._fetch(client, f"projects/{encoded}/issues", params)
                data = resp.json()

                for item in data:
                    issues.append({
                        "id": item.get("id"),
                        "iid": item.get("iid"),
                        "title": item.get("title", ""),
                        "description": item.get("description", ""),
                        "web_url": item.get("web_url", ""),
                        "labels": item.get("labels", []),
                        "state": item.get("state", "opened"),
                        "created_at": item.get("created_at"),
                        "author": item.get("author", {}).get("name", ""),
                    })
                    if len(issues) >= limit:
                        break

            _issues_cache[cache_key] = issues
            return issues
        except Exception as e:
            logger.exception("Error fetching GitLab issues for %s: %s", project_path_full, e)
            return []

    # ── Merge Request Diff ───────────────────────────────────────

    async def get_mr_diff(self, project_path_full: str, mr_iid: int) -> str:
        """Fetch the diff for a GitLab merge request."""
        try:
            encoded = _encode_project_path(*project_path_full.split("/", 1))
            cache_key = f"gl_diff:{encoded}:{mr_iid}:{self.token}"
            if cache_key in _diffs_cache:
                return _diffs_cache[cache_key]

            headers = self._headers()
            headers["Accept"] = "application/json"

            async with httpx.AsyncClient(timeout=30) as client:
                resp = await self._fetch(client, f"projects/{encoded}/merge_requests/{mr_iid}/diffs")
                data = resp.json()

                # Build a unified-diff-style string from the diff objects
                diff_text = ""
                for diff in data:
                    old_path = diff.get("old_path", "")
                    new_path = diff.get("new_path", "")
                    diff_str = diff.get("diff", "")
                    diff_text += f"--- a/{old_path}\n+++ b/{new_path}\n{diff_str}\n"

                _diffs_cache[cache_key] = diff_text
                return diff_text
        except Exception as e:
            logger.exception("Error fetching GitLab MR diff %d: %s", mr_iid, e)
            return ""

    # ── Clone Repo ───────────────────────────────────────────────

    async def clone_repo(self, repo_url: str, branch: str = "main") -> str:
        """Clone a GitLab repo to a temp directory.

        Uses GIT_ASKPASS for secure token handling.
        Raises ValueError on invalid URL or branch.
        """
        if not _is_valid_gitlab_url(repo_url):
            raise ValueError(f"Invalid GitLab URL: {repo_url!r}")

        if not _BRANCH_PATTERN.match(branch):
            raise ValueError(f"Invalid branch name: {branch!r}")

        temp_dir = tempfile.mkdtemp(prefix="onramp_gl_")
        cmd = ["git", "clone", "--depth=1", f"--branch={branch}", "--", repo_url, temp_dir]
        env = os.environ.copy()
        askpass_path = None

        if self.token:
            fd, askpass_path = tempfile.mkstemp(suffix=".py", prefix="onramp_git_askpass_")
            with os.fdopen(fd, "w") as f:
                f.write("import sys, os\n")
                f.write("sys.stdout.write(os.environ.get('ONRAMP_GIT_TOKEN', '') + '\\n')\n")
            if sys.platform != "win32":
                os.chmod(askpass_path, 0o755)
            env["GIT_ASKPASS"] = askpass_path
            env["ONRAMP_GIT_TOKEN"] = self.token

        try:
            result = subprocess.run(cmd, env=env, capture_output=True, text=True)
            if result.returncode != 0:
                logger.error("GitLab clone failed (stderr omitted for security)")
                raise Exception("Clone failed")
            return temp_dir
        finally:
            if askpass_path is not None:
                try:
                    os.unlink(askpass_path)
                except OSError:
                    logger.warning("Failed to remove askpass file %s", askpass_path)
