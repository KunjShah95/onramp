"""
Bitbucket Cloud Integration Service — interact with Bitbucket REST API v2.

Supports:
  - Connection testing and workspace/repo discovery
  - Repository stats retrieval
  - Issue listing
  - Pull request diff fetching
  - Repo cloning via Bitbucket HTTPS

Auth:  HTTP Basic auth (username + app password)
API:   https://api.bitbucket.org/2.0
Docs:  https://developer.atlassian.com/cloud/bitbucket/rest
"""

import os
import base64
import re
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

BITBUCKET_API_BASE = "https://api.bitbucket.org/2.0"

# Bitbucket URL patterns:
#   https://bitbucket.org/workspace/repo
#   https://bitbucket.org/workspace/repo.git
_BITBUCKET_URL_PATTERN = re.compile(
    r'^https://bitbucket\.org/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(\\.git)?/?$'
)

_BRANCH_PATTERN = re.compile(r'^[a-zA-Z0-9_\.\-/]+$')


def _is_valid_bitbucket_url(repo_url: str) -> bool:
    return bool(isinstance(repo_url, str) and _BITBUCKET_URL_PATTERN.match(repo_url))


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
        logger.warning(
            "Bitbucket API retry (%s) — attempt %d/3",
            type(exc).__name__,
            retry_state.attempt_number,
        )


class BitbucketService:
    """Handles Bitbucket Cloud repo operations via the Bitbucket REST API v2."""

    def __init__(self, username: Optional[str] = None, app_password: Optional[str] = None):
        self.username = username or os.getenv("BITBUCKET_USERNAME", "")
        self.app_password = app_password or os.getenv("BITBUCKET_APP_PASSWORD", "")

    def _auth_headers(self) -> Dict[str, str]:
        """Build basic auth headers from username and app password."""
        headers = {
            "User-Agent": "Onramp-2.0",
            "Accept": "application/json",
        }
        if self.username and self.app_password:
            encoded = base64.b64encode(
                f"{self.username}:{self.app_password}".encode()
            ).decode()
            headers["Authorization"] = f"Basic {encoded}"
        return headers

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception(_is_transient_http_error),
        before_sleep=_log_retry,
    )
    async def _fetch(self, client: httpx.AsyncClient, path: str, params: Dict[str, Any] = None) -> httpx.Response:
        url = f"{BITBUCKET_API_BASE}/{path.lstrip('/')}"
        response = await client.get(url, headers=self._auth_headers(), params=params)
        response.raise_for_status()
        return response

    # ── Connection Test ──────────────────────────────────────────

    async def test_connection(self) -> dict:
        """Validate Bitbucket credentials by fetching the current user."""
        if not self.username or not self.app_password:
            return {"valid": False, "error": "Missing Bitbucket username or app password"}

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{BITBUCKET_API_BASE}/user",
                    headers=self._auth_headers(),
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return {
                        "valid": True,
                        "username": data.get("username", ""),
                        "display_name": data.get("display_name", ""),
                        "uuid": data.get("uuid", ""),
                    }
                elif resp.status_code == 401:
                    return {"valid": False, "error": "Invalid credentials — check your username and app password"}
                elif resp.status_code == 403:
                    return {"valid": False, "error": "Access denied — check app password permissions"}
                else:
                    return {"valid": False, "error": f"Bitbucket API returned {resp.status_code}"}
        except httpx.ConnectError:
            return {"valid": False, "error": "Could not connect to Bitbucket API"}
        except Exception as e:
            return {"valid": False, "error": f"Connection error: {str(e)}"}

    # ── Repo Stats ───────────────────────────────────────────────

    async def get_repo_stats(self, workspace: str, repo_slug: str) -> dict:
        """Fetch repository metadata from Bitbucket API.

        Returns real signals or {"available": False} on failure.
        """
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await self._fetch(client, f"repositories/{workspace}/{repo_slug}")
                data = resp.json()

                owner_info = data.get("owner", {}) or {}
                language = data.get("language", "")
                # Bitbucket may list multiple languages
                if not language and data.get("languages"):
                    langs = data.get("languages", {})
                    if langs:
                        language = max(langs, key=langs.get)

                return {
                    "available": True,
                    "description": data.get("description", ""),
                    "language": language,
                    "created_on": data.get("created_on"),
                    "updated_on": data.get("updated_on"),
                    "size": data.get("size", 0),
                    "has_issues": data.get("has_issues", False),
                    "has_wiki": data.get("has_wiki", False),
                    "is_private": data.get("is_private", True),
                    "fork_policy": data.get("fork_policy", ""),
                    "mainbranch": (data.get("mainbranch", {}) or {}).get("name", "main"),
                    "owner_username": owner_info.get("username", workspace),
                    "owner_display_name": owner_info.get("display_name", workspace),
                    "links": {
                        "clone": [c["href"] for c in (data.get("links", {}).get("clone", []) or [])],
                        "html": (data.get("links", {}).get("html", {}) or {}).get("href", ""),
                    },
                }
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                logger.warning("Repository %s/%s not found on Bitbucket", workspace, repo_slug)
            else:
                logger.exception("Bitbucket API error for %s/%s: %s", workspace, repo_slug, e)
        except Exception as e:
            logger.exception("Error fetching Bitbucket repo %s/%s: %s", workspace, repo_slug, e)

        return {"available": False}

    # ── Issues ───────────────────────────────────────────────────

    async def get_issues(
        self,
        workspace: str,
        repo_slug: str,
        limit: int = 20,
    ) -> List[dict]:
        """Fetch open issues from a Bitbucket repository."""
        try:
            cache_key = f"bb_issues:{workspace}/{repo_slug}:{limit}"
            if cache_key in _issues_cache:
                return _issues_cache[cache_key]

            params: Dict[str, Any] = {
                "state": "opened",
                "pagelen": min(100, limit),
                "sort": "-created_on",
            }

            issues = []
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await self._fetch(
                    client,
                    f"repositories/{workspace}/{repo_slug}/issues",
                    params,
                )
                data = resp.json()

                for item in data.get("values", []):
                    kind = (item.get("kind") or item.get("type", "task")).lower()
                    issues.append({
                        "id": item.get("id"),
                        "title": item.get("title", ""),
                        "content": (item.get("content", {}) or {}).get("raw", ""),
                        "html_url": (item.get("links", {}).get("html", {}) or {}).get("href", ""),
                        "kind": kind,
                        "priority": item.get("priority", "major"),
                        "state": item.get("state", "opened"),
                        "created_on": item.get("created_on"),
                        "reporter": (item.get("reporter", {}) or {}).get("display_name", ""),
                    })
                    if len(issues) >= limit:
                        break

            _issues_cache[cache_key] = issues
            return issues
        except Exception as e:
            logger.exception("Error fetching Bitbucket issues for %s/%s: %s", workspace, repo_slug, e)
            return []

    # ── PR Diff ──────────────────────────────────────────────────

    async def get_pr_diff(self, workspace: str, repo_slug: str, pr_id: int) -> str:
        """Fetch the diff for a Bitbucket pull request."""
        try:
            cache_key = f"bb_diff:{workspace}/{repo_slug}:{pr_id}:{self.username}"
            if cache_key in _diffs_cache:
                return _diffs_cache[cache_key]

            headers = self._auth_headers()
            headers["Accept"] = "text/plain"  # Bitbucket returns plain text diff

            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{BITBUCKET_API_BASE}/repositories/{workspace}/{repo_slug}/pullrequests/{pr_id}/diff",
                    headers=headers,
                )
                if resp.status_code == 200:
                    diff_text = resp.text
                    _diffs_cache[cache_key] = diff_text
                    return diff_text
                else:
                    logger.warning("Bitbucket PR diff %d failed: %s", pr_id, resp.status_code)
                    return ""
        except Exception as e:
            logger.exception("Error fetching Bitbucket PR diff %d: %s", pr_id, e)
            return ""

    # ── Clone Repo ───────────────────────────────────────────────

    async def clone_repo(self, repo_url: str, branch: str = "main") -> str:
        """Clone a Bitbucket repo to a temp directory.

        Uses GIT_ASKPASS for secure password handling.
        Raises ValueError on invalid URL or branch.
        """
        if not _is_valid_bitbucket_url(repo_url):
            raise ValueError(f"Invalid Bitbucket URL: {repo_url!r}")

        if not _BRANCH_PATTERN.match(branch):
            raise ValueError(f"Invalid branch name: {branch!r}")

        temp_dir = tempfile.mkdtemp(prefix="onramp_bb_")
        cmd = ["git", "clone", "--depth=1", f"--branch={branch}", "--", repo_url, temp_dir]
        env = os.environ.copy()
        askpass_path = None

        # Bitbucket clone uses the repo_url as-is (public clone).
        # For private repos, credentials must be embedded in the URL
        # or use a ~/.netrc file. We skip credential injection here
        # since GIT_ASKPASS only handles a single prompt and Bitbucket
        # requires both username and password prompts.

        try:
            result = subprocess.run(cmd, env=env, capture_output=True, text=True)
            if result.returncode != 0:
                logger.error("Bitbucket clone failed (stderr omitted for security)")
                raise Exception("Clone failed")
            return temp_dir
        finally:
            if askpass_path is not None:
                try:
                    os.unlink(askpass_path)
                except OSError:
                    logger.warning("Failed to remove askpass file %s", askpass_path)
