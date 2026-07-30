import os
import re
import datetime
import subprocess
import sys
import tempfile
import logging
from typing import Dict, Any, List, Optional
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception
from cachetools import TTLCache


logger = logging.getLogger(__name__)

_issues_cache = TTLCache(maxsize=100, ttl=300)
_diffs_cache = TTLCache(maxsize=100, ttl=300)

# How many remaining requests before we log a warning
_RATE_LIMIT_WARNING_THRESHOLD = 100

# Branch name validation pattern — allows alphanumeric, dots, dashes, underscores, slashes
_BRANCH_PATTERN = re.compile(r'^[a-zA-Z0-9_\.\-/]+$')

# Strict GitHub https repo URL pattern. Prevents git argument injection
# (e.g. "--upload-pack=...", "ext::sh -c ...") and SSRF via non-GitHub hosts.
_GITHUB_URL_PATTERN = re.compile(
    r'^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(\.git)?/?$'
)

# GitLab URL pattern (nested groups supported)
_GITLAB_URL_PATTERN = re.compile(
    r'^https://gitlab\.com/[A-Za-z0-9_.\-/]+/[A-Za-z0-9_.\-]+(\.git)?/?$'
)

# Bitbucket URL pattern
_BITBUCKET_URL_PATTERN = re.compile(
    r'^https://bitbucket\.org/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(\.git)?/?$'
)


def _is_valid_github_url(repo_url: str) -> bool:
    """Return True if repo_url is a strict GitHub https URL."""
    return bool(isinstance(repo_url, str) and _GITHUB_URL_PATTERN.match(repo_url))


def _is_valid_gitlab_url(repo_url: str) -> bool:
    """Return True if repo_url is a strict GitLab https URL."""
    return bool(isinstance(repo_url, str) and _GITLAB_URL_PATTERN.match(repo_url))


def _is_valid_bitbucket_url(repo_url: str) -> bool:
    """Return True if repo_url is a strict Bitbucket https URL."""
    return bool(isinstance(repo_url, str) and _BITBUCKET_URL_PATTERN.match(repo_url))


def detect_provider(repo_url: str) -> Optional[str]:
    """Detect the git provider from a repository URL.

    Returns 'github', 'gitlab', 'bitbucket', or None.
    """
    if _is_valid_github_url(repo_url):
        return 'github'
    if _is_valid_gitlab_url(repo_url):
        return 'gitlab'
    if _is_valid_bitbucket_url(repo_url):
        return 'bitbucket'
    return None


def _safe_int(val: Optional[str], default: int = 0) -> int:
    """Parse an integer header safely, returning default on failure."""
    if val is None:
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


def _compute_health_score(data: Dict[str, Any]) -> tuple:
    """Derive a 0-100 repository health score from real GitHub signals.

    Transparent, deterministic formula — every deduction is reported in the
    returned factor list so the number is explainable, not a magic constant.
    """
    factors: List[str] = []

    if data.get("archived") or data.get("disabled"):
        return 20, ["archived_or_disabled"]

    score = 100

    if not data.get("description"):
        score -= 10
        factors.append("no_description")
    if not data.get("license"):
        score -= 10
        factors.append("no_license")

    # Staleness from last push.
    pushed_at = data.get("pushed_at")
    if pushed_at:
        try:
            dt = datetime.datetime.fromisoformat(str(pushed_at).replace("Z", "+00:00"))
            days = (datetime.datetime.now(datetime.timezone.utc) - dt).days
            if days > 365:
                score -= 25
                factors.append("stale_over_1y")
            elif days > 180:
                score -= 15
                factors.append("stale_over_6mo")
            elif days > 90:
                score -= 5
                factors.append("stale_over_3mo")
        except Exception:
            pass

    # Open-issue pressure relative to popularity.
    stars = data.get("stargazers_count", 0)
    open_issues = data.get("open_issues_count", 0)
    if stars > 0:
        ratio = open_issues / stars
        if ratio > 1:
            score -= 15
            factors.append("high_issue_ratio")
        elif ratio > 0.5:
            score -= 8
            factors.append("elevated_issue_ratio")
    elif open_issues > 50:
        score -= 10
        factors.append("many_open_issues")

    return max(0, min(100, score)), factors


def _check_rate_limits(response: httpx.Response, context: str = "") -> None:
    """Inspect GitHub's X-RateLimit-* headers and warn when remaining is low."""
    remaining = response.headers.get("X-RateLimit-Remaining")
    if remaining is None:
        return
    remaining_int = _safe_int(remaining)
    if remaining_int < _RATE_LIMIT_WARNING_THRESHOLD:
        limit = response.headers.get("X-RateLimit-Limit", "?")
        reset = response.headers.get("X-RateLimit-Reset", "")
        reset_msg = ""
        if reset:
            reset_ts = _safe_int(reset)
            if reset_ts:
                reset_msg = f", resets at {datetime.datetime.fromtimestamp(reset_ts).isoformat()}"
        logger.warning(
            f"GitHub API rate limit low: {remaining_int}/{limit} remaining{reset_msg} "
            f"({context})"
        )


def _rate_limit_wait(retry_state) -> float:
    """
    Tenacity wait strategy that respects Retry-After on 429,
    otherwise falls back to exponential backoff (2^n, max 10s).
    """
    outcome = retry_state.outcome
    if outcome and outcome.exception():
        exc = outcome.exception()
        if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 429:
            retry_after = exc.response.headers.get("Retry-After")
            if retry_after:
                try:
                    return float(retry_after)
                except (ValueError, TypeError):
                    pass  # fall through to exponential backoff
    return min(2 ** (retry_state.attempt_number - 1), 10)


def _log_retry(retry_state) -> None:
    """Log retry attempts with rate-limit context from response headers."""
    outcome = retry_state.outcome
    if outcome and outcome.exception():
        exc = outcome.exception()
        if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 429:
            retry_after = exc.response.headers.get("Retry-After", "?")
            reset = exc.response.headers.get("X-RateLimit-Reset", "")
            reset_msg = ""
            if reset:
                reset_ts = _safe_int(reset)
                if reset_ts:
                    reset_msg = f" (resets {datetime.datetime.fromtimestamp(reset_ts).isoformat()})"
            logger.warning(
                f"Rate limited (429), waiting {retry_after}s{reset_msg} "
                f"(attempt {retry_state.attempt_number}/3)"
            )
        else:
            logger.warning(
                f"Transient network error ({type(exc).__name__}), retrying "
                f"(attempt {retry_state.attempt_number}/3)"
            )


def _is_transient_http_error(exc: BaseException) -> bool:
    """Return True only for errors that warrant a retry (network blips, rate limits, server errors)."""
    if isinstance(exc, (httpx.TimeoutException, httpx.ConnectError, httpx.NetworkError)):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in (429, 502, 503)
    return False


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

        Uses GIT_ASKPASS with a temporary Python script to supply the token
        via an environment variable instead of embedding it in the URL or
        command-line arguments (preventing token leakage in process listings
        and error logs).

        Raises:
            ValueError: If repo_url is not a valid GitHub https URL, or if
                the branch name contains invalid characters.
        """
        # Validate repo_url against a strict GitHub https URL pattern to
        # prevent git argument injection (e.g. "--upload-pack=...",
        # "ext::sh -c ...") and SSRF via arbitrary hosts/protocols.
        if not _is_valid_github_url(repo_url):
            raise ValueError(f"Invalid repository URL: {repo_url!r}. Expected a GitHub https URL.")

        # Sanitize branch parameter to prevent command injection
        if not _BRANCH_PATTERN.match(branch):
            raise ValueError(f"Invalid branch name: {branch!r}. Only alphanumeric, dots, dashes, underscores, and slashes allowed.")

        temp_dir = tempfile.mkdtemp(prefix="onramp_")

        # "--" separates options from positional args so git cannot
        # interpret repo_url (or temp_dir) as an option flag.
        cmd = ["git", "clone", "--depth=1", f"--branch={branch}", "--", repo_url, temp_dir]
        env = os.environ.copy()
        askpass_path = None

        if self.github_token:
            # Write a cross-platform GIT_ASKPASS helper script
            fd, askpass_path = tempfile.mkstemp(suffix=".py", prefix="onramp_git_askpass_")
            with os.fdopen(fd, "w") as f:
                f.write("import sys, os\n")
                f.write("sys.stdout.write(os.environ.get('ONRAMP_GITHUB_TOKEN', '') + '\\n')\n")
            if sys.platform != "win32":
                os.chmod(askpass_path, 0o755)

            env["GIT_ASKPASS"] = askpass_path
            env["ONRAMP_GITHUB_TOKEN"] = self.github_token

        try:
            result = subprocess.run(cmd, env=env, capture_output=True, text=True)
            if result.returncode != 0:
                # Deliberately omit stderr from the exception to avoid
                # any chance of token leakage via error messages.
                logger.error("Clone failed (stderr omitted for security)")
                raise Exception("Clone failed")
            return temp_dir
        finally:
            if askpass_path is not None:
                try:
                    os.unlink(askpass_path)
                except OSError:
                    logger.warning("Failed to remove askpass file %s", askpass_path)

    @retry(
        stop=stop_after_attempt(3),
        wait=_rate_limit_wait,
        retry=retry_if_exception(_is_transient_http_error),
        before_sleep=_log_retry,
    )
    async def _fetch_page(self, client: httpx.AsyncClient, url: str, headers: Dict[str, str], params: Dict[str, Any] = None) -> httpx.Response:
        response = await client.get(url, headers=headers, params=params)
        response.raise_for_status()
        _check_rate_limits(response, url.split("?")[0].split("/")[-1])
        return response

    # ── Git Data API: Create commits via blob → tree → commit → ref ──────────

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception(_is_transient_http_error),
        before_sleep=_log_retry,
    )
    async def _gh_request(self, method: str, path: str, json_body: dict = None) -> dict:
        """Make an authenticated GitHub API request and return JSON."""
        headers = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "Onramp-2.0",
        }
        if self.github_token:
            headers["Authorization"] = f"Bearer {self.github_token}"
        url = f"https://api.github.com{path}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            if method == "GET":
                resp = await client.get(url, headers=headers)
            elif method == "POST":
                resp = await client.post(url, headers=headers, json=json_body or {})
            else:
                raise ValueError(f"Unsupported method: {method}")
            resp.raise_for_status()
            _check_rate_limits(resp, path.split("/")[-1])
            return resp.json()

    async def get_pr_info(self, repo_url: str, pr_number: int) -> Optional[dict]:
        """Get PR metadata — head ref, head SHA, base repo full_name."""
        cleaned = repo_url.strip().rstrip("/")
        if cleaned.endswith(".git"):
            cleaned = cleaned[:-4]
        parts = cleaned.split("/")
        if len(parts) < 2:
            return None
        owner, repo = parts[-2], parts[-1]
        try:
            data = await self._gh_request("GET", f"/repos/{owner}/{repo}/pulls/{pr_number}")
            return {
                "owner": owner,
                "repo": repo,
                "head_ref": data["head"]["ref"],
                "head_sha": data["head"]["sha"],
                "base_ref": data["base"]["ref"],
                "base_repo_full_name": data["base"]["repo"]["full_name"],
                "title": data.get("title", ""),
            }
        except Exception:
            logger.exception(f"Failed to fetch PR info for {repo_url}#{pr_number}")
            return None

    async def get_file_content(self, repo_url: str, file_path: str, ref: str) -> Optional[str]:
        """Get the content of a file at a given ref. Returns decoded text."""
        cleaned = repo_url.strip().rstrip("/")
        if cleaned.endswith(".git"):
            cleaned = cleaned[:-4]
        parts = cleaned.split("/")
        if len(parts) < 2:
            return None
        owner, repo = parts[-2], parts[-1]
        import base64
        try:
            data = await self._gh_request(
                "GET",
                f"/repos/{owner}/{repo}/contents/{file_path}?ref={ref}"
            )
            if data.get("encoding") == "base64":
                raw = base64.b64decode(data["content"])
                return raw.decode("utf-8", errors="replace")
            return None
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            logger.exception(f"Failed to fetch file {file_path}@{ref}")
            return None

    async def apply_suggestion(
        self,
        repo_url: str,
        pr_number: int,
        file_path: str,
        old_string: str,
        new_string: str,
        commit_message: str = "fix: auto-apply PR review suggestion",
    ) -> dict:
        """Apply a find-and-replace suggestion to a file in the PR's branch.

        Uses the Git Data API (blob → tree → commit → update ref) to create
        an inline fix commit on the PR's head branch.

        Returns:
            dict with ``commit_sha``, ``commit_url``, ``file_path``.
        """
        pr_info = await self.get_pr_info(repo_url, pr_number)
        if not pr_info:
            raise ValueError("Could not fetch PR info — check repo URL and PR number.")

        owner = pr_info["owner"]
        repo = pr_info["repo"]
        head_ref = pr_info["head_ref"]
        head_sha = pr_info["head_sha"]

        # 1. Get current file content from the PR's head ref
        content = await self.get_file_content(repo_url, file_path, head_sha)
        if content is None:
            raise ValueError(f"File '{file_path}' not found at ref {head_sha[:8]}")

        # 2. Apply the find-and-replace
        if old_string not in content:
            raise ValueError(
                f"Could not find the specified snippet in '{file_path}'. "
                "The file may have been modified since the review."
            )
        new_content = content.replace(old_string, new_string, 1)

        # 3. Create blob with new content
        import base64
        encoded = base64.b64encode(new_content.encode("utf-8")).decode("ascii")
        blob = await self._gh_request(
            "POST",
            f"/repos/{owner}/{repo}/git/blobs",
            {"content": encoded, "encoding": "base64"},
        )
        blob_sha = blob["sha"]

        # 4. Get the current tree SHA
        commit_data = await self._gh_request("GET", f"/repos/{owner}/{repo}/git/commits/{head_sha}")
        base_tree_sha = commit_data["tree"]["sha"]

        # 5. Create a new tree with the updated file
        new_tree = await self._gh_request(
            "POST",
            f"/repos/{owner}/{repo}/git/trees",
            {
                "base_tree": base_tree_sha,
                "tree": [
                    {
                        "path": file_path,
                        "mode": "100644",
                        "type": "blob",
                        "sha": blob_sha,
                    }
                ],
            },
        )
        new_tree_sha = new_tree["sha"]

        # 6. Create a commit
        new_commit = await self._gh_request(
            "POST",
            f"/repos/{owner}/{repo}/git/commits",
            {
                "message": commit_message,
                "tree": new_tree_sha,
                "parents": [head_sha],
            },
        )
        new_commit_sha = new_commit["sha"]

        # 7. Update the ref (push the commit to the PR branch)
        await self._gh_request(
            "POST",
            f"/repos/{owner}/{repo}/git/refs/heads/{head_ref}",
            {"sha": new_commit_sha, "force": False},
        )

        return {
            "commit_sha": new_commit_sha,
            "commit_url": f"https://github.com/{owner}/{repo}/commit/{new_commit_sha}",
            "file_path": file_path,
        }

    # ── Pull Request Creation ──────────────────────────────────────────────

    async def get_authenticated_user(self) -> Optional[str]:
        """Fetch the authenticated user's GitHub login (username).

        Returns the login string (e.g. "octocat"), or None on failure.
        """
        try:
            data = await self._gh_request("GET", "/user")
            return data.get("login")
        except Exception:
            logger.exception("Failed to fetch authenticated user")
            return None

    async def commit_to_branch(
        self,
        owner: str,
        repo: str,
        branch: str,
        file_path: str,
        old_string: str,
        new_string: str,
        commit_message: str = "feat: autonomous coding change",
    ) -> dict:
        """Commit a find-and-replace change directly to a branch (no PR needed).

        Uses the Git Data API (get branch ref → get file content → create blob →
        create tree → create commit → update ref) to push a commit to a branch.

        Args:
            owner: Repo owner
            repo: Repo name
            branch: Target branch name
            file_path: Path to the file to modify
            old_string: Exact existing code to replace
            new_string: Replacement code
            commit_message: Git commit message

        Returns:
            dict with ``commit_sha``, ``commit_url``, ``file_path``.

        Raises:
            ValueError: If the branch doesn't exist, file not found, or old_string
                       doesn't match the current content.
        """
        # 1. Get the branch ref to find the current head SHA
        ref_data = await self._gh_request(
            "GET", f"/repos/{owner}/{repo}/git/refs/heads/{branch}"
        )
        head_sha = ref_data["object"]["sha"]

        # 2. Construct the repo URL for file content lookup
        repo_url = f"https://github.com/{owner}/{repo}"

        # 3. Determine new content — for new files (empty old_string) skip fetch
        if not old_string:
            # New file creation — no existing content to fetch
            new_content = new_string
        else:
            # Existing file modification — fetch current content
            content = await self.get_file_content(repo_url, file_path, head_sha)
            if content is None:
                raise ValueError(
                    f"File '{file_path}' not found at ref {head_sha[:8]}. "
                    "To create a new file, pass an empty old_string."
                )
            if old_string not in content:
                raise ValueError(
                    f"Could not find the specified snippet in '{file_path}'. "
                    "The file may have been modified since the plan was generated."
                )
            new_content = content.replace(old_string, new_string, 1)

        # 4. Create blob with new content
        import base64
        encoded = base64.b64encode(new_content.encode("utf-8")).decode("ascii")
        blob = await self._gh_request(
            "POST",
            f"/repos/{owner}/{repo}/git/blobs",
            {"content": encoded, "encoding": "base64"},
        )
        blob_sha = blob["sha"]

        # 5. Get the current tree SHA from the head commit
        commit_data = await self._gh_request("GET", f"/repos/{owner}/{repo}/git/commits/{head_sha}")
        base_tree_sha = commit_data["tree"]["sha"]

        # 6. Create a new tree with the updated file
        new_tree = await self._gh_request(
            "POST",
            f"/repos/{owner}/{repo}/git/trees",
            {
                "base_tree": base_tree_sha,
                "tree": [
                    {
                        "path": file_path,
                        "mode": "100644",
                        "type": "blob",
                        "sha": blob_sha,
                    }
                ],
            },
        )
        new_tree_sha = new_tree["sha"]

        # 7. Create a commit
        new_commit = await self._gh_request(
            "POST",
            f"/repos/{owner}/{repo}/git/commits",
            {
                "message": commit_message,
                "tree": new_tree_sha,
                "parents": [head_sha],
            },
        )
        new_commit_sha = new_commit["sha"]

        # 8. Update the branch ref
        await self._gh_request(
            "POST",
            f"/repos/{owner}/{repo}/git/refs/heads/{branch}",
            {"sha": new_commit_sha, "force": False},
        )

        return {
            "commit_sha": new_commit_sha,
            "commit_url": f"https://github.com/{owner}/{repo}/commit/{new_commit_sha}",
            "file_path": file_path,
        }

    async def create_fork(self, owner: str, repo: str) -> Optional[str]:
        """Fork a repo to the authenticated user's account.

        Returns the full name of the fork ("username/repo"), or None on failure.
        """
        try:
            data = await self._gh_request("POST", f"/repos/{owner}/{repo}/forks")
            return data.get("full_name") or data.get("full_name", "")
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 202:
                # Fork already being created — check for existing fork
                logger.info("Fork of %s/%s already being created, will retry later", owner, repo)
                return None
            logger.exception("Failed to fork %s/%s", owner, repo)
            return None

    async def create_branch(
        self, owner: str, repo: str, base_branch: str, new_branch: str
    ) -> Optional[str]:
        """Create a new branch from an existing base branch.

        Returns the new branch ref, or None on failure.
        """
        try:
            # Get the SHA of the base branch
            ref_data = await self._gh_request(
                "GET", f"/repos/{owner}/{repo}/git/refs/heads/{base_branch}"
            )
            base_sha = ref_data["object"]["sha"]

            # Create the new branch
            await self._gh_request(
                "POST",
                f"/repos/{owner}/{repo}/git/refs",
                {"ref": f"refs/heads/{new_branch}", "sha": base_sha},
            )
            return new_branch
        except Exception:
            logger.exception("Failed to create branch %s/%s:%s", owner, repo, new_branch)
            return None

    async def create_pr(
        self,
        owner: str,
        repo: str,
        head: str,
        base: str,
        title: str,
        body: str = "",
    ) -> Optional[dict]:
        """Create a pull request on GitHub.

        Args:
            owner: Repo owner
            repo: Repo name
            head: Branch with changes (can be "fork_owner:branch" for cross-repo PRs)
            base: Target branch (usually "main")
            title: PR title
            body: PR description body

        Returns:
            dict with ``pr_number``, ``pr_url``, ``html_url``, or None on failure.
        """
        try:
            data = await self._gh_request(
                "POST",
                f"/repos/{owner}/{repo}/pulls",
                {"title": title, "body": body, "head": head, "base": base},
            )
            return {
                "pr_number": data["number"],
                "pr_url": data["html_url"],
                "html_url": data["html_url"],
                "title": data.get("title", ""),
            }
        except Exception:
            logger.exception("Failed to create PR %s/%s %s->%s", owner, repo, head, base)
            return None

    async def get_pr_info(self, repo_url: str, pr_number: int) -> Optional[dict]:
        """Get PR metadata — head ref, head SHA, base repo full_name."""
        cleaned = repo_url.strip().rstrip("/")
        if cleaned.endswith(".git"):
            cleaned = cleaned[:-4]
        parts = cleaned.split("/")
        if len(parts) < 2:
            return None
        owner, repo = parts[-2], parts[-1]
        try:
            data = await self._gh_request("GET", f"/repos/{owner}/{repo}/pulls/{pr_number}")
            return {
                "owner": owner,
                "repo": repo,
                "head_ref": data["head"]["ref"],
                "head_sha": data["head"]["sha"],
                "base_ref": data["base"]["ref"],
                "base_repo_full_name": data["base"]["repo"]["full_name"],
                "title": data.get("title", ""),
            }
        except Exception:
            logger.exception(f"Failed to fetch PR info for {repo_url}#{pr_number}")
            return None

    async def apply_suggestions_bulk(
        self,
        repo_url: str,
        pr_number: int,
        suggestions: List[dict],
        commit_message_prefix: str = "fix: auto-apply PR review suggestions",
    ) -> List[dict]:
        """Apply multiple suggestions sequentially as individual commits.

        Each suggestion dict must have: ``file_path``, ``old_string``, ``new_string``.
        Optionally: ``commit_message`` (overrides default).

        .. note::

           Suggestions are applied one at a time on the PR's head branch.
           Each call updates the ref, so **two suggestions targeting the
           same file will cause the second to fail** (the snippet to replace
           may no longer exist at the new head SHA). Bulk calls typically
           target one suggestion per file; for multiple changes in one file
           merge them into a single suggestion with the full old/new content.

        Returns a list of per-suggestion results.
        """
        results = []
        for s in suggestions:
            try:
                result = await self.apply_suggestion(
                    repo_url=repo_url,
                    pr_number=pr_number,
                    file_path=s["file_path"],
                    old_string=s["old_string"],
                    new_string=s["new_string"],
                    commit_message=s.get("commit_message", f"{commit_message_prefix}: {s.get('file_path', '')}"),
                )
                result["success"] = True
                results.append(result)
            except Exception as e:
                results.append({
                    "success": False,
                    "file_path": s.get("file_path", ""),
                    "error": str(e),
                })
        return results

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception(lambda e: isinstance(e, (httpx.TimeoutException, httpx.HTTPStatusError))),
        before_sleep=_log_retry,
    )
    async def get_repo_stats(self, owner: str, repo: str) -> dict:
        """Fetch real repository metadata from the GitHub API.

        Returns only values sourced from GitHub, plus a health_score derived
        from those real signals (see _compute_health_score). On failure it
        returns {"available": False} rather than fabricated numbers, so callers
        can render an honest "not analyzed" state.
        """
        headers = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "Onramp-2.0"
        }
        if self.github_token:
            headers["Authorization"] = f"Bearer {self.github_token}"

        url = f"https://api.github.com/repos/{owner}/{repo}"
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            try:
                response = await self._fetch_page(client, url, headers)
                data = response.json()

                health_score, health_factors = _compute_health_score(data)
                license_info = data.get("license") or {}
                return {
                    "available": True,
                    "description": data.get("description", ""),
                    "language": data.get("language"),
                    "stars": data.get("stargazers_count", 0),
                    "forks": data.get("forks_count", 0),
                    "watchers": data.get("subscribers_count", data.get("watchers_count", 0)),
                    "open_issues": data.get("open_issues_count", 0),
                    "size_kb": data.get("size", 0),
                    "default_branch": data.get("default_branch", "main"),
                    "pushed_at": data.get("pushed_at"),
                    "license": license_info.get("spdx_id") if isinstance(license_info, dict) else None,
                    "archived": data.get("archived", False),
                    "topics": data.get("topics", []),
                    "health_score": health_score,
                    "health_factors": health_factors,
                }
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    logger.warning(f"Repository {owner}/{repo} not found on GitHub")
                else:
                    logger.exception(f"GitHub API error for {owner}/{repo}: {e}")
            except Exception as e:
                logger.exception(f"Error fetching repo stats for {owner}/{repo}: {e}")

        # No fabricated fallback — signal unavailability truthfully.
        return {"available": False, "health_score": None}

    async def get_issues(self, repo_url: str, labels: List[str] = None, limit: int = 20) -> List[Issue]:
        """
        Fetch issues from GitHub API.
        labels: ["good-first-issue", "beginner", ...]
        """
        try:
            cleaned_url = repo_url.strip()
            if not _is_valid_github_url(cleaned_url):
                logger.warning(f"Invalid repository URL passed to get_issues: {repo_url!r}")
                return []
            if cleaned_url.endswith(".git"):
                cleaned_url = cleaned_url[:-4]
            parts = cleaned_url.rstrip("/").split("/")
            if len(parts) < 2:
                return []
            owner, repo = parts[-2], parts[-1]
            
            labels_key = ",".join(sorted(labels)) if labels else ""
            cache_key = f"issues:{owner}/{repo}:{labels_key}:{limit}"
            if cache_key in _issues_cache:
                return _issues_cache[cache_key]

            url = f"https://api.github.com/repos/{owner}/{repo}/issues"

            headers = {
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "Onramp-2.0"
            }
            if self.github_token:
                headers["Authorization"] = f"Bearer {self.github_token}"

            params = {
                "state": "open",
                "per_page": min(100, limit),
            }
            if labels:
                params["labels"] = ",".join(labels)

            issues = []
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                while url and len(issues) < limit:
                    try:
                        response = await self._fetch_page(client, url, headers, params)
                        data = response.json()
                        
                        for item in data:
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
                            
                            if len(issues) >= limit:
                                break
                                
                        url = None
                        if "Link" in response.headers:
                            links = response.headers["Link"].split(",")
                            for link in links:
                                if 'rel="next"' in link:
                                    url = link[link.find("<")+1:link.find(">")]
                                    break
                    except Exception as e:
                        logger.exception(f"Error fetching page for {repo_url}: {e}")
                        break
                        
            _issues_cache[cache_key] = issues
            return issues
        except Exception as e:
            logger.exception(f"Error in get_issues for {repo_url}: {e}")
            return []

    async def get_pr_diff(self, repo_url: str, pr_number: int) -> str:
        """Fetch PR diff from GitHub API."""
        try:
            cleaned_url = repo_url.strip()
            if not _is_valid_github_url(cleaned_url):
                logger.warning(f"Invalid repository URL passed to get_pr_diff: {repo_url!r}")
                return ""
            if cleaned_url.endswith(".git"):
                cleaned_url = cleaned_url[:-4]
            parts = cleaned_url.rstrip("/").split("/")
            if len(parts) < 2:
                return ""
            owner, repo = parts[-2], parts[-1]

            cache_key = f"{owner}/{repo}:{pr_number}:{self.github_token}"
            if cache_key in _diffs_cache:
                return _diffs_cache[cache_key]

            url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}"

            headers = {
                "Accept": "application/vnd.github.v3.diff",
                "User-Agent": "Onramp-2.0"
            }
            if self.github_token:
                headers["Authorization"] = f"Bearer {self.github_token}"

            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                response = await self._fetch_page(client, url, headers)
                diff_text = response.text
                _diffs_cache[cache_key] = diff_text
                return diff_text
        except Exception as e:
            logger.exception(f"Error fetching PR diff {pr_number} for {repo_url}: {e}")
            return ""
