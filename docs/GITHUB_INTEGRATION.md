# GitHub Integration: PR & Issue Fetching

## Architecture Overview

### Services

**`GitHubService`** (`backend/app/services/github_service.py`) — generic GitHub API client

| Method | API Call | Returns |
|--------|----------|---------|
| `get_issues(repo_url, labels, limit)` | `GET /repos/{owner}/{repo}/issues?state=open` | `List[Issue]` (PRs filtered out) |
| `get_pr_diff(repo_url, pr_number)` | `GET /repos/{owner}/{repo}/pulls/{n}` with `Accept: v3.diff` | Raw diff text |
| `clone_repo(repo_url, branch)` | `git clone --depth=1 --branch={branch}` via subprocess | Temp directory path |

**`IssueService`** (`backend/app/services/issue_service.py`) — beginner-issue-specific fetcher

| Method | API Call | Returns |
|--------|----------|---------|
| `get_beginner_issues(repo_url, limit)` | `GET /repos/{owner}/{repo}/issues?labels=good-first-issue,beginner,help-wanted` | Scored issue dicts (complexity 0-10) |

### Call Chain

```
POST /first-pr/issues { repo_url, user_level, github_token? }
  → first_pr.py: extract_github_token()
  → FirstPRAccelerator(llm, github_token=token)
    → IssueService(token).get_beginner_issues()
      → httpx GET api.github.com (paginated, retried, cached, PRs filtered)
    → self._llm_rescore()  [if LLM available — blends 70% LLM + 30% keyword]
    → filter by user_level (junior/mid/senior)

POST /explore/analyze { repo_url, branch, github_token? }
  → explore.py: _extract_github_token()
  → ArchitectureExplorer(llm, github_token=token)
    → GitHubService(token).clone_repo()
    → ParserService().parse_directory()
    → DependencyGraph + LLM architecture analysis

POST /first-pr/guide { issue_id, repo_structure }
  → FirstPRAccelerator.generate_guide()
    → LLM prompt only (no GitHub API call)
```

### Tech Stack

| Component | Technology |
|-----------|-----------|
| HTTP client | `httpx.AsyncClient` with `follow_redirects=True` |
| Timeout | 30 seconds |
| Auth format | `Authorization: Bearer {token}` |
| Pagination | `Link` header parsing (`rel="next"`) |
| Retry | tenacity (3 attempts, exponential backoff 2s→4s→8s) |
| Cache | `cachetools.TTLCache` (issues, diffs) + custom `TTLCache` (beginner issues) — both 5-min TTL |
| Complexity scoring | Keyword heuristic (baseline) + optional LLM rescoring (70% LLM / 30% keyword blend) |
| Repo cloning | `git clone --depth=1` via subprocess with `GIT_ASKPASS` |

---

## Challenges & Solutions

### 1. PRs Leaking Into Issue Results

**Problem:** The GitHub `/issues` endpoint returns Pull Requests alongside Issues (PRs have a `pull_request` key). `IssueService` was not filtering these out, so users saw open PRs listed as beginner issues.

**Fix:** Added `if "pull_request" in item: continue` in both `IssueService.get_beginner_issues()` and `GitHubService.get_issues()`.

**File:** `backend/app/services/issue_service.py`

---

### 2. Token Leakage via Subprocess in clone_repo

**Problem:** The original code injected the token into the clone URL via string replacement:
```python
clone_url = repo_url.replace("https://", f"https://{self.github_token}@")
```
If `git clone` failed, the token appeared in `result.stderr`. On Windows, process command lines are visible to all processes.

**Fix:** Replaced URL interpolation with `GIT_ASKPASS`:
1. Write a temporary Python script that reads the token from `CODEFLOW_GITHUB_TOKEN` env var
2. Set `GIT_ASKPASS` to point to that script
3. Error output deliberately omits stderr to prevent token leakage
4. Temp script is cleaned up in a `finally` block

**File:** `backend/app/services/github_service.py` — `clone_repo()`

---

### 3. No Pagination — Only First Page Returned

**Problem:** Both services used `per_page: limit` with no pagination logic. GitHub defaults to 30 results per page. For repos with 100+ beginner issues, only the first 30 were ever seen.

**Fix:** Parse the `Link` header from GitHub responses:
```python
if "Link" in response.headers:
    links = response.headers["Link"].split(",")
    for link in links:
        if 'rel="next"' in link:
            url = link[link.find("<")+1:link.find(">")]
```
The loop continues fetching pages until `limit` items are collected or no more pages exist. `per_page` is set to `min(100, limit)` to minimize round trips.

**Files:** `backend/app/services/github_service.py`, `backend/app/services/issue_service.py`

---

### 4. Silent Exception Swallowing

**Problem:** `GitHubService` caught all exceptions with `except Exception: return []` — no logging, no visibility into why requests failed.

**Fix:** Added `logger.exception()` before every `return []` or `return ""`:
```python
except Exception as e:
    logger.exception(f"Error in get_issues for {repo_url}: {e}")
    return []
```

**Files:** `backend/app/services/github_service.py`, `backend/app/services/issue_service.py`

---

### 5. Inconsistent Auth Header Formats

**Problem:** `GitHubService` used `Authorization: token {token}` (legacy format) while `IssueService` used `Authorization: Bearer {token}` (JWT format).

**Fix:** Standardized both on `Authorization: Bearer {token}`.

**Files:** `backend/app/services/github_service.py`, `backend/app/services/issue_service.py`

---

### 6. No Retry on Transient Errors

**Problem:** Network blips, rate limits (429), and server errors (502/503) would propagate as 500 errors with no recovery.

**Fix:** Added tenacity with a custom predicate that only retries transient errors:
```python
def _is_transient_http_error(exc):
    if isinstance(exc, (httpx.TimeoutException, httpx.ConnectError, httpx.NetworkError)):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in (429, 502, 503)
    return False
```
Configuration: 3 attempts, exponential backoff (2s→4s→8s). Non-retriable errors (401, 403, 404, 422) pass through immediately.

**Files:** `backend/app/services/github_service.py`, `backend/app/services/issue_service.py`
**Dep added:** `tenacity>=8.2.0` in `requirements.txt`

---

### 7. 10-Second Timeout on PR Diffs

**Problem:** `get_pr_diff` had a 10-second timeout. Large PRs in monorepos with many file changes would reliably time out.

**Fix:** Increased the httpx client timeout to 30 seconds for all requests.

**File:** `backend/app/services/github_service.py`

---

### 8. All Users Share One Rate Limit Bucket

**Problem:** Both services default to `os.getenv("GITHUB_TOKEN")` — a single token shared across all users (5,000 requests/hour total).

**Fix (backend complete, frontend pending):**
- `POST /first-pr/issues` and `POST /explore/analyze` accept an optional `github_token` field
- Token is extracted from the request body or `Authorization: Bearer` header
- Token prefix validation ensures only GitHub tokens (`ghp_`, `gho_`, `ghu_`, `ghs_`, `github_pat_`) are accepted (avoids accidentally using Firebase JWTs)
- Forwarded through agents: `FirstPRAccelerator(llm, github_token=token)` → `IssueService(token)`
- And: `ArchitectureExplorer(llm, github_token=token)` → `GitHubService(token=token)`

**What's still needed:** Frontend GitHub OAuth to obtain per-user tokens and send them in API requests.

**Files:** `backend/app/api/v1/first_pr.py`, `backend/app/api/v1/explore.py`, `backend/app/agents/first_pr_accelerator.py`, `backend/app/agents/architecture_explorer.py`

---

### 9. No Caching — Redundant API Calls

**Problem:** Every request hit GitHub fresh. If 5 users explored the same repo in 2 minutes, that was 5+ full paginated fetches for identical data.

**Fix:** Two cache layers:
- `cachetools.TTLCache` (maxsize=100, ttl=300s) in `GitHubService` for issues and diffs
- Custom `TTLCache` (thread-safe, configurable TTL) in `cache.py` for beginner issues
- Cache keys include `owner/repo`, labels, and limit to ensure cache isolation
- `get_pr_diff` also caches diff text per `owner/repo/pr_number`

**Files:** `backend/app/services/cache.py` (new), `backend/app/services/github_service.py`, `backend/app/services/issue_service.py`

---

### 10. Keyword-Only Complexity Scoring

**Problem:** `_score_complexity()` only checked 5 hardcoded keywords in the issue title:
```python
if "documentation": score -= 2
if "fix typo": score -= 3
if "add test": score -= 1
if "refactor": score += 2
if "architecture": score += 3
```
This missed body content, comment count, linked PRs, and any issue whose title didn't contain these exact phrases.

**Fix:** Added `FirstPRAccelerator._llm_rescore()` that:
1. Sends issue titles + bodies (truncated to 500 chars) to the LLM
2. Prompts the LLM to rate complexity on a 0-10 scale with anchored examples
3. Blends: **final_score = LLM_score × 0.7 + keyword_score × 0.3**
4. Gracefully falls back to keyword-only if LLM is unavailable

**File:** `backend/app/agents/first_pr_accelerator.py`

---

### 11. Unsanitized Branch Parameter

**Problem:** The `branch` parameter in `clone_repo()` was passed directly to `git clone --branch={branch}` without validation. Could potentially inject git flags.

**Fix:** Added regex validation at the top of `clone_repo()`:
```python
_BRANCH_PATTERN = re.compile(r'^[a-zA-Z0-9_\.\-/]+$')
if not _BRANCH_PATTERN.match(branch):
    raise ValueError(f"Invalid branch name: {branch!r}")
```

**File:** `backend/app/services/github_service.py`

---

### 12. Missing Logger Import

**Problem:** `first_pr_accelerator.py` called `logger.exception()` in the new `_llm_rescore()` method but had no `import logging` or `logger = logging.getLogger(__name__)`.

**Fix:** Added the import and logger initialization.

**File:** `backend/app/agents/first_pr_accelerator.py`

---

## Summary: All Challenges Resolved

| # | Challenge | Status |
|---|-----------|--------|
| 1 | PRs in issue results | ✅ Fixed |
| 2 | Token in git clone URL | ✅ Fixed |
| 3 | No pagination | ✅ Fixed |
| 4 | Silent failures | ✅ Fixed |
| 5 | Auth header inconsistency | ✅ Fixed |
| 6 | No retry | ✅ Fixed |
| 7 | PR diff timeout | ✅ Fixed |
| 8 | Shared rate limit | ✅ Backend done, needs frontend OAuth |
| 9 | No caching | ✅ Fixed |
| 10 | Keyword-only scoring | ✅ Fixed (LLM blend) |
| 11 | Branch injection | ✅ Fixed |
| 12 | Missing logger | ✅ Fixed |

### Pre-existing Issue (Unrelated)

`backend/app/database/models.py` line 209 defines a column named `metadata` on `UsageRecord`, which conflicts with SQLAlchemy's reserved `Base.metadata` attribute. This blocks the test suite but doesn't affect GitHub fetching.
