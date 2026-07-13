import logging
import datetime
from typing import List, Dict, Any, Optional
import httpx
from tenacity import retry, stop_after_attempt, retry_if_exception

from app.services.cache import github_cache

logger = logging.getLogger(__name__)

_RATE_LIMIT_WARNING_THRESHOLD = 100


def _safe_int(val: Optional[str], default: int = 0) -> int:
    """Parse an integer header safely, returning default on failure."""
    if val is None:
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


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


class IssueService:
    """Fetch and score GitHub issues."""

    def __init__(self, github_token: str = None):
        """
        Initialize IssueService.

        Args:
            github_token: GitHub API token for authentication.
                         If None, requests will be made without auth (rate-limited).
        """
        self.token = github_token
        self.api_base = "https://api.github.com"

    @retry(
        stop=stop_after_attempt(3),
        wait=_rate_limit_wait,
        retry=retry_if_exception(_is_transient_http_error),
        before_sleep=_log_retry,
    )
    async def _fetch_issues_page(self, client: httpx.AsyncClient, url: str, params: Dict[str, Any], headers: Dict[str, str]) -> httpx.Response:
        response = await client.get(url, params=params, headers=headers)
        response.raise_for_status()
        _check_rate_limits(response, url.split("?")[0].split("/")[-1])
        return response

    async def get_beginner_issues(self, repo_url: str, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Fetch issues labeled "good-first-issue", "beginner", "help-wanted".
        Returns scored and sorted list.

        Args:
            repo_url: Full GitHub repository URL (e.g., https://github.com/owner/repo)
            limit: Maximum number of issues to fetch (default: 10)

        Returns:
            List of issues sorted by complexity score (ascending, easiest first).
            Each issue contains:
                - id: GitHub issue ID
                - number: Issue number in repository
                - title: Issue title
                - body: Issue description
                - url: GitHub URL to issue
                - labels: List of label names
                - complexity_score: 0-10 score (lower = easier)
                - estimated_hours: Estimated work hours based on complexity
        """
        # Parse owner/repo from URL
        parts = repo_url.rstrip("/").split("/")
        owner, repo = parts[-2], parts[-1]

        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}

        # Check cache before fetching
        cache_key = f"beginner-issues:{owner}/{repo}:{limit}"
        cached = github_cache.get(cache_key)
        if cached is not None:
            logger.debug(f"Cache hit for {cache_key}")
            return cached

        issues = []
        # Fetch issues
        async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
            url = f"{self.api_base}/repos/{owner}/{repo}/issues"
            params = {
                "labels": "good-first-issue,beginner,help-wanted",
                "state": "open",
                "per_page": min(100, limit)
            }
            
            while url and len(issues) < limit:
                try:
                    response = await self._fetch_issues_page(client, url, params, headers)
                    page_data = response.json()
                    
                    for item in page_data:
                        if "pull_request" in item:
                            continue
                        issues.append(item)
                        if len(issues) >= limit:
                            break
                            
                    url = None
                    if "Link" in response.headers:
                        links = response.headers["Link"].split(",")
                        for link in links:
                            if 'rel="next"' in link:
                                url = link[link.find("<")+1:link.find(">")]
                                params = {}  # query params are embedded in the next URL
                                break
                except Exception as e:
                    logger.exception(f"Error fetching issues for {repo_url}: {e}")
                    break

        # Score by complexity
        scored_issues = []
        for issue in issues:
            score = self._score_complexity(issue)
            scored_issues.append({
                "id": issue["id"],
                "number": issue["number"],
                "title": issue["title"],
                "body": issue["body"],
                "url": issue["html_url"],
                "labels": [label["name"] for label in issue.get("labels", [])],
                "complexity_score": score,  # 0-10, lower = easier
                "estimated_hours": max(1, score * 0.5)
            })

        # Sort by complexity
        scored_issues.sort(key=lambda x: x["complexity_score"])

        # Cache before returning
        github_cache.set(cache_key, scored_issues)
        return scored_issues

    def _score_complexity(self, issue: Any) -> float:
        """
        Score issue complexity on a 0-10 scale. Lower scores indicate easier issues.

        Scoring heuristics:
            - Base score: 5
            - Documentation issues: -2
            - Fix typo issues: -3
            - Add test issues: -1
            - Long description (>1000 chars): +1
            - Refactor issues: +2
            - Architecture issues: +3

        Args:
            issue: GitHub issue object or dictionary from API response

        Returns:
            Complexity score between 0 and 10 (inclusive)
        """
        score = 5  # Base score

        # Support both Issue objects and raw API Dicts
        if hasattr(issue, 'title'):
            title = getattr(issue, 'title') or ""
            body = getattr(issue, 'body') or ""
        elif isinstance(issue, dict):
            title = issue.get('title') or ""
            body = issue.get('body') or ""
        else:
            title = ""
            body = ""

        title_lower = title.lower()

        # Factors that reduce score (easier):
        if "documentation" in title_lower:
            score -= 2
        if "fix typo" in title_lower:
            score -= 3
        if "add test" in title_lower:
            score -= 1

        # Factors that increase score (harder):
        if len(body) > 1000:
            score += 1
        if "refactor" in title_lower:
            score += 2
        if "architecture" in title_lower:
            score += 3

        return max(0, min(10, score))
