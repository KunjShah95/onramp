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


def _is_valid_github_url(repo_url: str) -> bool:
    """Return True if repo_url is a strict GitHub https URL."""
    return bool(isinstance(repo_url, str) and _GITHUB_URL_PATTERN.match(repo_url))


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
        async with httpx.AsyncClient(timeout=15.0) as client:
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
            async with httpx.AsyncClient(timeout=30.0) as client:
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

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await self._fetch_page(client, url, headers)
                diff_text = response.text
                _diffs_cache[cache_key] = diff_text
                return diff_text
        except Exception as e:
            logger.exception(f"Error fetching PR diff {pr_number} for {repo_url}: {e}")
            return ""
