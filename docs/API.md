# Onramp 2.0 — API Reference

Base URL: `http://localhost:8000/api/v1` (dev) or `https://yourdomain.com/api/v1` (production)

**Authentication:** All endpoints except webhooks and health require an auth token in the `Authorization` header: `Authorization: Bearer <token>` — either a JWT issued by `/auth/login` / `/auth/register` (or OAuth) or an Onramp API key (`nx_live_...` / `nx_test_...`).

**Content-Type:** `application/json`

> Docs are generated from `backend/app/api/v1/*` routers. In production the Swagger UI (`/docs`) is **disabled by default** — opt in with `ENABLE_API_DOCS=true`.

---

## Auth

Auth supports three providers: **email/password**, **Google OAuth**, and **GitHub OAuth**. Users can register with one provider and later **link** a second identity (e.g. email/password account + GitHub) to the same account.

### Register (email/password)

```http
POST /auth/register
Content-Type: application/json

{"email": "user@example.com", "password": "hunter2secret", "name": "Jane Doe"}

Response 200:
{"uid": "...", "email": "...", "name": "Jane Doe", "provider": "password",
 "token": "<jwt>", "refresh_token": "..."}
```

### Login (email/password)

```http
POST /auth/login
Content-Type: application/json

{"email": "user@example.com", "password": "hunter2secret", "remember_me": true}

Response 200:
{"uid": "...", "email": "...", "name": "...", "provider": "password",
 "token": "<jwt>", "refresh_token": "..."}
```

### Refresh Token

```http
POST /auth/refresh
Content-Type: application/json

{"refresh_token": "..."}

Response 200:
{"token": "<new-jwt>", "refresh_token": "..."}
```

### Get Current User

```http
GET /auth/me
Authorization: Bearer <token>

Response 200:
{"uid": "...", "email": "...", "name": "...", "provider": "password",
 "position": null, "avatar_url": null,
 "github_username": "octocat", "github_id": "1234567"}
```

### Update Current User

```http
PATCH /auth/me
Authorization: Bearer <token>
Content-Type: application/json

{"name": "Jane Doe", "avatar_url": "https://..."}

Response 200: same shape as GET /auth/me
```

### Check Provider (public)

```http
GET /auth/check-provider?email=user@example.com

Response 200:
{"email": "user@example.com", "registered": true, "provider": "google.com"}
```

### Verify Email

```http
GET /auth/verify-email?token=...
```

### Forgot / Reset / Set Password

```http
POST /auth/forgot-password     {"email": "user@example.com"}
POST /auth/reset-password      {"token": "...", "new_password": "..."}
POST /auth/set-password        {"new_password": "..."}   # authenticated, password_reset_required
```

### Deactivate Account (GDPR)

```http
POST /auth/deactivate
Authorization: Bearer <token>
```

Cascades cleanup across teams, webhooks, notifications, gamification, conversations, quizzes, learning paths, and usage records.

### Google OAuth

```http
GET  /auth/oauth/google/login      → 307 redirect to Google consent
GET  /auth/oauth/google/callback   → exchanges code, redirects to FRONTEND_URL with session
```

### GitHub OAuth

```http
GET  /auth/oauth/github/login      → 307 redirect to GitHub consent
GET  /auth/oauth/github/callback   → exchanges code, redirects to FRONTEND_URL with session
```

### GitHub Account Linking

```http
POST /auth/oauth/github/link
Authorization: Bearer <token>

Response 200:
{"authorization_url": "https://github.com/login/oauth/authorize?...&state=<redis-state>"}
```

Attaches the authenticated user's GitHub identity to their existing account. The OAuth state is stored in Redis (single-use, 600s TTL); the callback upserts `github_username` / `github_id` on the same user and auto-links PRs to issue tasks via the GitHub push webhook.

---

## Billing

### Create Subscription

```http
POST /billing/subscriptions
Content-Type: application/json

{"team_id": "team-123", "tier": "startup", "billing_cycle": "monthly"}
```

### Get Subscription

```http
GET /billing/subscriptions/{team_id}
```

### Update Tier

```http
PATCH /billing/subscriptions/{team_id}
Content-Type: application/json

{"tier": "professional"}
```

### Cancel Subscription

```http
DELETE /billing/subscriptions/{team_id}
```

### Attach Razorpay IDs

```http
POST /billing/subscriptions/{team_id}/razorpay
Content-Type: application/json

{"razorpay_customer_id": "cus_...", "razorpay_subscription_id": "sub_..."}
```

### Create Checkout Session

```http
POST /billing/checkout
Content-Type: application/json

{"team_id": "team-123", "tier": "startup", "success_url": "...", "cancel_url": "..."}

Response 200:
{"url": "https://rzp.io/...", "subscription_id": "sub_..."}
```

Creates a Razorpay **subscription** (`plan_id` from `RAZORPAY_PLAN_*`); the
hosted checkout is the subscription's `short_url`.

### Razorpay Webhook (public, no auth)

```http
POST /billing/webhook
X-Razorpay-Signature: ...

Events handled: subscription.activated, subscription.charged, subscription.completed, subscription.cancelled, subscription.pending, subscription.halted, payment.captured, payment.failed
```

Signature verified with `RAZORPAY_WEBHOOK_SECRET` via
`razorpay.utility.verify_webhook_signature`. `payment.captured` events whose
notes carry `topup=1` credit the wallet (`amount` paise ÷ 100 credits),
idempotent per `payment_id`.

### Credits (usage-based top-ups)

```http
GET  /billing/credits           {"balance": ..., "currency": "inr", ...}
POST /billing/credits/topup     {"amount": ..., "currency": "inr"}  → Razorpay order
GET  /billing/credits/ledger    {"transactions": [...]}
```

### List Pricing

```http
GET /billing/pricing

Response 200:
{"tiers": {"free": {"price_monthly": 0, ...}, "startup": {...}, "professional": {...}, "enterprise": {...}}}
```

---

## Explore

### Analyze Repository

```http
POST /explore/analyze
Content-Type: application/json

{"repo_url": "https://github.com/facebook/react", "branch": "main", "github_token": "ghp_..."}

Response 200:
{"status": "processing", "repo_id": "repo-uuid", "eta_seconds": 45}
```

Responses include an `X-LLM-Route` header reporting which provider/model
produced the architecture analysis (set only when the LLM actually ran).

### Explore Health

```http
GET /explore/health
```

### Get Architecture Graph

```http
POST /repos/index
Content-Type: application/json

{"repo_url": "https://github.com/facebook/react", "branch": "main", "max_files": 1000, "force": false}

Response 200 (fresh build):
{"index_id": "a1b2c3d4e5f6a7b8", "repo_url": "...", "branch": "main",
 "commit": "abc123...", "built_at": "...", "cached": false,
 "stats": {"file_count": 512, "class_count": 320, "function_count": 1800, "import_count": 900},
 "entities": {...}, "graph": {...}}
```

The graph (`nodes` + `edges` + `summary`) is served from the cached index document.

---

## Repo Context Index (parse-once)

Repositories are cloned + parsed **once** and cached to Redis as a compact
context document (entities + dependency graph + stats), keyed by a stable
`index_id` derived from `repo_url@branch`. Every later request reuses the
cache instead of re-cloning/re-parsing — agents then pull only the slice
relevant to their task.

### Build / Refresh Index

```http
POST /repos/index
Content-Type: application/json

{"repo_url": "https://github.com/facebook/react", "branch": "main", "max_files": 1000, "force": false}

Response 200 (fresh build):
{"index_id": "a1b2c3d4e5f6a7b8", "repo_url": "...", "branch": "main",
 "commit": "abc123...", "built_at": "...", "cached": false,
 "stats": {"file_count": 512, "class_count": 320, "function_count": 1800, "import_count": 900},
 "entities": {...}, "graph": {...}}
```

Re-posting the same repo returns the **cached** document (`"cached": true`,
no clone, no parse). Set `"force": true` to re-parse. The response also
reports the HEAD commit the index was built from. This is quota-gated like
the explore pipeline.

To **pre-build without blocking**, set `"async_build": true` — the build is
dispatched to the Celery `build_repo_index` task and the endpoint returns
`202 Accepted` with a task id immediately:

```http
POST /repos/index
{"repo_url": "...", "branch": "main", "async_build": true}

Response 202:
{"queued": true, "task_id": "...", "repo_url": "...", "branch": "main"}
```

Indexes are also **pre-built and auto-refreshed on a schedule**: the
`refresh_repo_indexes` Celery beat task runs nightly (03:00 UTC) against
the repositories registry and enqueues a build for every repo whose cached
index is missing, older than `REPO_INDEX_MAX_AGE_HOURS` (default 20h), or
within `REPO_INDEX_COLD_WINDOW_HOURS` (default 2h) of the 24h TTL expiring
(the cold-window guard rebuilds mid-day-built indexes *before* they TTL out
past the next nightly sweep) — so the first user request hits a warm cache
instead of building.

### GitHub Push Webhook (evolution feedback loop)

```http
POST /webhooks/github   (X-GitHub-Event: push, HMAC-SHA256 signed)
```

A push to a **registered** repository's branch triggers the evolution loop:

1. the repo's LLM cache scope is evicted (`evict_scope` — exact + semantic
tiers) so stale cached answers about the old code are dropped immediately;
2. `build_repo_index` is dispatched (`force=true`) so the index is rebuilt
with the new HEAD — including the **`evolution` block**: the last 50
commits, top contributors, per-file ownership (changes + strongest
author), and the head commit's changed files (all deterministic `git log`
output, zero LLM tokens);
3. the webhook returns `202`-style ack: `{handled, rebuild_triggered,
task_id, cache_entries_evicted}`.

Pushes to unregistered repos / other branches are acknowledged but ignored
(the nightly sweep covers unregistered repos). Configure the webhook with
`GITHUB_WEBHOOK_SECRET` for HMAC verification.

### Get Index Document

```http
GET /repos/index/{index_id}
```

Returns the full context document (entities + graph + stats).

### Select Context (requirement-driven, token-budgeted)

```http
GET /repos/index/{index_id}/context?requirement=auth%20login&max_tokens=4000

Response 200:
{"index_id": "...", "requirement": "auth login", "max_tokens": 4000,
 "selected_files": ["src/auth/login.py", ...], "file_count": 7,
 "entities": {...}, "graph": {...},
 "context_text": "src/auth/login.py (python)\n  classes: LoginHandler\n  functions: validate_credentials\n\n...",
 "token_estimate": 1200, "truncated": false}
```

Files are scored against the requirement (path + symbol keyword overlap);
only relevant files and their entities/edges are returned, and
`context_text` is trimmed to fit `max_tokens` (~4 chars/token) so the slice
is safe to drop straight into an LLM prompt.

### Evict Index

```http
DELETE /repos/index/{index_id}
```

Removes the cached index so the next build re-parses the repo.

### Reuse from Agents (all LLM-backed agents)

Every LLM-backed agent accepts an optional `index_id` instead of a full
`repo_structure` body — `POST /explore/analyze`, `POST /repos/{owner}/{repo}/health`,
`POST /learn/path`, `POST /quiz/generate`, `POST /patterns/find-similar`, and
`POST /drift/detect` (plus the AI gateway `POST /ai/agents/{name}`). When
`index_id` is given, the agent:

- resolves the **full cached entities** from the index for whole-repo
  scoring (health ratios, drift identifiers) — no clone, no parse,
- embeds a **token-budgeted requirement slice** in its LLM prompt
  (health roast, learning path, quiz questions, drift summary, pattern
  analysis),
- falls back to `repo_structure` when the index is missing.

Exactly one of `repo_structure` / `index_id` is required (400 otherwise).

---

## Learn

### Generate Learning Path

```http
POST /learn/path
Content-Type: application/json

{"repo_url": "https://github.com/facebook/react"}

Response 200:
{"path_id": "...", "title": "Learn React", "roadmap": [...], "tasks": [...]}
```

### List Paths

```http
GET /learn/paths
```

### Get Path

```http
GET /learn/paths/{path_id}
```

> Task creation / progress tracking live under the **Tasks** router
> (`POST /tasks`, `POST /tasks/{task_id}/transition`, ...), not under Learn.

---

## First PR

### Score Beginner Issues

```http
POST /first-pr/issues
Content-Type: application/json

{"repo_url": "https://github.com/facebook/react", "user_level": "junior", "github_token": "ghp_..."}

Response 200:
{"issues": [{"number": 123, "title": "...", "score": 85, "reason": "...", "labels": [...]}]}
```

`user_level` ∈ `junior | mid | senior`. The optional `github_token` is
pulled from the body or an `Authorization: Bearer ghp_...` header (only
GitHub-prefixed tokens are accepted — auth JWTs are ignored) to raise the
rate limit above the shared anonymous bucket.

### Get Issue Guide

```http
POST /first-pr/guide
Content-Type: application/json

{"issue_id": 123, "repo_structure": {...}, "github_token": "ghp_..."}

Response 200:
{"guide": "...", "steps": [...], "files": [...], "estimated_time": "..."}
```

---

## Ask

### Index a Codebase

```http
POST /ask/index
Content-Type: application/json

{"repo_path": "/tmp/cloned-repo"}

Response 200:
{"index_id": "..."}
```

### Query Codebase

```http
POST /ask/query
Content-Type: application/json

{"repo_id": "...", "question": "How does the virtual DOM work?"}

Response 200:
{"answer": "...", "sources": [...], "conversation_id": "..."}
```

Both `POST /ask/query` (non-streaming) and `POST /ask/query/stream` (SSE)
return an `X-LLM-Route` header reporting the serving provider/model, e.g.
`X-LLM-Route: groq/llama-3.3-70b-versatile`. The non-streaming header is
authoritative (only set when the answer actually came from the LLM, not the
fallback path); the streaming header is a best-effort primary-route guess
made before the stream starts.

### Conversation History

```http
GET    /ask/history/{index_id}
DELETE /ask/history/{index_id}
```

---

## Reports

### Generate Onboarding Report

```http
POST /reports/generate
Content-Type: application/json

{"repo_url": "...", "user_level": "junior"}

Response 200:
{"report": {"overview": "...", "difficulty": "intermediate", "estimated_time": "2 weeks", "modules": [...]}}
```

### Generate HTML Report

```http
POST /reports/generate-html
Content-Type: application/json

{"repo_url": "...", "user_level": "junior"}

Response 200:
{"html": "<!doctype html>..."}
```

---

## Dashboard

### CTO Dashboard

```http
GET /dashboard/cto
Authorization: Bearer <token>

Response 200:
{"team_size": 5, "active_users": 3, "completed_tasks": 42, "...": "..."}
```

### Team / Trainee Dashboards

```http
GET /dashboard/team
GET /dashboard/trainee
GET /usage/dashboard
```

---

## Teams

### Create Team

```http
POST /teams
Content-Type: application/json

{"name": "Engineering", "description": "..."}
```

### List Teams

```http
GET /teams
```

### Get / Update / Delete Team

```http
GET    /teams/{team_id}
PUT    /teams/{team_id}
DELETE /teams/{team_id}
```

### Members

```http
GET    /teams/{team_id}/members
POST   /teams/{team_id}/members      {"email": "dev@company.com", "role": "member"}
DELETE /teams/{team_id}/members/{user}
```

### Invites & Tier

```http
GET  /teams/{team_id}/invites
POST /teams/{team_id}/tier
GET  /teams/{team_id}/subscription
```

### Module-Level RBAC

```http
GET    /teams/{team_id}/module-permissions
GET    /teams/{team_id}/module-permissions/{user_id}
POST   /teams/{team_id}/module-permissions/grant
POST   /teams/{team_id}/module-permissions/revoke
POST   /teams/{team_id}/module-permissions/revoke-all
GET    /teams/{team_id}/module-permissions/check/{user_id}/{module}
```

---

## Integrations

### Webhook CRUD

```http
GET    /integrations/webhooks
POST   /integrations/webhooks
GET    /integrations/webhooks/{id}
PUT    /integrations/webhooks/{id}
DELETE /integrations/webhooks/{id}
POST   /integrations/webhooks/{id}/test
POST   /integrations/webhooks/{id}/rotate-secret
```

### Integration Config (slack, github, gitlab, bitbucket, jira, linear)

```http
GET    /integrations/{type}
PUT    /integrations/{type}
DELETE /integrations/{type}
```

### GitHub Token Validation

```http
POST /integrations/github/test
Content-Type: application/json

{"token": "ghp_..."}

Response 200 (valid):
{"valid": true, "username": "octocat", "scopes": ["repo", "read:org"]}

Response 200 (invalid):
{"valid": false, "error": "Token is invalid or expired"}
```

### GitLab / Bitbucket / Jira / Linear

```http
POST /integrations/gitlab/test          {"token": "glpat_..."}
POST /integrations/gitlab/projects      {"token": "...", "group": "..."}
POST /integrations/bitbucket/test       {"token": "...", "username": "..."}
POST /integrations/bitbucket/repos
POST /integrations/jira/test            {"email": "...", "api_token": "...", "site_url": "..."}
POST /integrations/jira/projects
POST /integrations/jira/issue-types
POST /integrations/linear/test          {"api_key": "lin_api_..."}
POST /integrations/linear/teams
POST /integrations/linear/workflow-states
```

### List All Integrations & Events

```http
GET /integrations
GET /integrations/events/list
```

---

## Notifications

```http
GET    /notifications
GET    /notifications/unread-count
GET    /notifications/{notification_id}
POST   /notifications/mark-read          {"notification_ids": [...]}
POST   /notifications/mark-all-read
DELETE /notifications/{notification_id}
POST   /notifications/clear-read
```

### Preferences

```http
GET  /notifications/preferences
PUT  /notifications/preferences
GET  /notifications/preferences/defaults
```

```http
PUT /notifications/preferences
Content-Type: application/json

{"channels": {"in_app": {"task_assigned": true}}, "digest_frequency": "daily"}
```

---

## Tasks

```http
POST   /tasks
GET    /tasks
GET    /tasks/{task_id}
PATCH  /tasks/{task_id}
DELETE /tasks/{task_id}
```

### Lifecycle actions

```http
POST /tasks/{task_id}/transition   {"state": "in_progress"}
POST /tasks/{task_id}/assign       {"assigned_to": "user-123"}
POST /tasks/{task_id}/start
POST /tasks/{task_id}/submit
POST /tasks/{task_id}/review       {"review_feedback": {...}, "decision": "approved"|"changes_requested"}
POST /tasks/{task_id}/approve
POST /tasks/{task_id}/complete
POST /tasks/{task_id}/cancel
POST /tasks/{task_id}/actual-hours {"actual_hours": 4.5}
POST /tasks/{task_id}/peer-review
GET  /tasks/{task_id}/quiz-gate
```

### Templates

```http
GET    /tasks/templates
POST   /tasks/templates
PATCH  /tasks/templates/{template_id}
DELETE /tasks/templates/{template_id}
```

### GitHub issue import & bulk ops

```http
POST /tasks/import-issue
POST /tasks/search-issues
POST /tasks/bulk-assign
POST /tasks/auto-assign-starter
```

### Analytics

```http
GET /tasks/time-stats/team/{team_id}
GET /tasks/time-stats/team/{team_id}/export.csv
GET /tasks/progress/team/{team_id}
GET /tasks/progress/user/{user_id}
GET /tasks/export.csv
```

---

## PR Review

### Describe PR

```http
POST /pr-review/describe
Content-Type: application/json

{"repo_url": "https://github.com/owner/repo", "pr_number": 42}

Response 200:
{"title": "...", "summary": "...", "files": [...], "testing_notes": "...", "checklist": [...]}
```

### Review PR

```http
POST /pr-review/review
```

### Auto-Apply Suggestions

```http
POST /pr-review/auto-apply
POST /pr-review/auto-apply/single
```

---

## Repos & Code Health

```http
GET  /repos
POST /repos
GET  /repos/{owner}/{repo}
DELETE /repos/{repo_id}
GET  /repos/{owner}/{repo}/analysis
GET  /repos/{owner}/{repo}/sections
GET  /repos/roadmap

POST /repos/{owner}/{repo}/health
```

---

## AI Gateway

### List LLM Router Models (OpenRouter-style)

```http
GET /ai/models

Response 200:
{
  "router": "onramp-query-router",
  "query_types": {
    "code": {"description": "...", "preferred_providers": ["anthropic", "openai", ...]},
    "chat": {...}, "reasoning": {...}, "structured": {...}, ...
  },
  "providers": {
    "openrouter": {"model": "google/gemini-2.5-flash:free", "available": true, "free": true, ...},
    ...
  }
}
```

### List Agents (routing map)

```http
GET /ai/agents

Response 200:
{
  "count": 9,
  "agents": [
    {
      "name": "pr-review",
      "description": "...",
      "required_params": [...],
      "credit_cost": 5,
      "query_type": "code",
      "model": "anthropic/claude-3-5-sonnet-20241022"
    },
    {
      "name": "explore",
      "query_type": "reasoning",
      "model": "gemini/gemini-2.5-flash"
    }
  ]
}
```

The catalog exposes the 9 LLM-backed agents registered in the gateway. Every
agent declares the query type its task routes through (`code`, `reasoning`,
`structured`, or `creative`), read live from the agent class, so the map can
never drift from the code. `model` is the primary provider/model that would
serve the agent right now — resolved from the router's per-type preference
chain and reflecting current key availability (e.g. `code` →
`anthropic/claude-3-5-sonnet-20241022`, `reasoning` → `gemini/gemini-2.5-flash`,
`structured` → `groq/llama-3.3-70b-versatile`). `query_type`/`model` are `null`
when the router is not configured; `query_type` also falls back to `null`
defensively if an agent class has no such attribute (broken import, rule-based
agent). This powers the agent catalog UI (Developer Portal) and lets clients
pre-select the right model per agent.

### Invoke an Agent

```http
POST /ai/agents/{agent_name}
Content-Type: application/json

{"repo_url": "...", "user_level": "junior", ...agent-specific params}
```

### API Keys (AIaaS)

```http
POST   /ai/keys
GET    /ai/keys
DELETE /ai/keys/{key_id}
POST   /ai/keys/{key_id}/rotate
POST   /ai/keys/validate
```

### Provider Route Breakdown (cost-savings)

```http
GET /ai/usage/{org_name}/providers?period=month

Response 200:
{
  "org_name": "acme",
  "period": "month",
  "total_requests": 120,
  "tracked_requests": 118,
  "free_requests": 100,
  "paid_requests": 18,
  "free_pct": 84.7,
  "total_cost_usd": 0.84,
  "total_cost_avoided_usd": 6.20,
  "providers": {"groq": 70, "openrouter": 30, "anthropic": 18},
  "models": {"groq/llama-3.3-70b-versatile": 70, ...},
  "provider_costs": {
    "groq": {"requests": 70, "cost_usd": 0.12, "cost_avoided_usd": 3.40},
    "anthropic": {"requests": 18, "cost_usd": 0.72, "cost_avoided_usd": 0.0}
  }
}
```

Period: `day`, `week`, `month`, or omitted for all records. Each `/v1` chat
completion logs the serving provider/model, the free/paid flag, and the
per-1M-token prices into the usage record, so `free_pct` measures how much
traffic the free-first router absorbed.

Dollar figures: `total_cost_usd` is what the tracked requests actually cost;
`total_cost_avoided_usd` is how much was saved versus always using the paid
baseline model (`claude-3-5-sonnet-20241022` in `app/services/llm_costs.py`,
which also holds the per-model `$`/1M-token pricing table). Every route record
snapshots the price at request time, so historical numbers stay stable.

### Usage / Quota / Audit Logs

```http
GET /ai/usage/{org_name}
GET /ai/usage/{org_name}/summary
GET /ai/usage/{org_name}/quota
GET /ai/audit-logs/{org_name}
GET /ai/tiers
```

---

## OpenAI-Compatible Gateway (OpenRouter-style)

The `/v1` gateway exposes the query-type LLM router behind the OpenAI Chat
Completions API, so any OpenAI-SDK client can point `base_url` at it.
For the full router internals — provider chain, query types, caching, cost
attribution, BYOK, and how to add a provider — see
[docs/LLM_ROUTING.md](LLM_ROUTING.md):

```python
from openai import AsyncOpenAI
client = AsyncOpenAI(api_key="cf_...", base_url="https://yourhost.com/v1")
resp = await client.chat.completions.create(model="code", messages=[...])
```

Auth: JWT (`Authorization: Bearer <jwt>`) or Onramp API key (`X-API-Key`
header, or `Authorization: Bearer cf_...`).

`model` values accepted (routed server-side): query-type names
(`code`, `reasoning`, `chat`, `structured`, `summarization`, `translation`,
`creative`), provider names (`openrouter`, `gemini`, `groq`, `nvidia`,
`openai`, `anthropic`, `ollama`), known model ids (`gpt-4o-mini`, ...), or
omitted to auto-classify the prompt.

### Chat Completions

```http
POST /v1/chat/completions
Content-Type: application/json

{
  "model": "code",
  "messages": [{"role": "user", "content": "Write a function"}],
  "max_tokens": 2000,
  "stream": false
}

Response 200:
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "model": "anthropic/claude-3-5-sonnet-20241022",
  "choices": [{"index": 0, "message": {"role": "assistant", "content": "..."}, "finish_reason": "stop"}],
  "usage": {"prompt_tokens": 5, "completion_tokens": 5, "total_tokens": 10}
}
```

Set `"stream": true` for Server-Sent Events (`data: {...}` chunks ending
with `data: [DONE]`).

Every response includes an `X-LLM-Route` debug header showing exactly which
provider/model served the request, e.g. `groq/llama-3.3-70b-versatile`
(streaming reports the primary route in the header; the authoritative served
model appears in each chunk's `model` field). Non-streaming responses also
carry `X-LLM-Cache: HIT` when the answer came from the Redis response cache
(zero tokens, zero cost) or `MISS` otherwise, plus `X-LLM-Cache-Tier`
reporting *which* tier served: `redis` (exact match), `semantic`
(near-duplicate question), or `MISS`.

#### Response caching (token savings)

Repeated prompts (same query type, same normalized prompt + system +
max_tokens) are served from Redis instead of a provider — see
`app/services/llm_cache.py`. Cache hits cost **$0**: they are recorded as a
`cache/redis` route with `free=true` and zero price, so they appear in the
cost-savings breakdown as requests that avoided the full baseline cost.

A **semantic tier** sits on top of exact matching: near-duplicate questions
(case/punctuation/word-order noise, light rephrasings) also hit the cache
via local hashed n-gram embeddings (no embedding API — probing must stay
cheaper than the LLM call it replaces) and a content-word **subset gate**.
A stored answer is served only when both pass: cosine similarity ≥
`LLM_SEMANTIC_THRESHOLD` (0.85) AND every content word of the new question
also appears in the stored prompt. The subset gate makes one-word
adversarial rewrites (`sort` → `reverse`, `auth` → `payment`) structurally
miss even though their raw similarity is ~0.9. Semantic hits report as
`cache/semantic` (free, $0) and `X-LLM-Cache-Tier: semantic`. Tune with
`LLM_SEMANTIC_CACHE=0` (disable), `LLM_SEMANTIC_THRESHOLD`, and
`LLM_SEMANTIC_BUCKET_CAP`.
TTL defaults to 1h (`LLM_CACHE_TTL`). Streaming responses are not cached.

### Embeddings

```http
POST /v1/embeddings
Content-Type: application/json

{"model": "text-embedding-3-small", "input": ["chunk one", "chunk two"]}

Response 200:
{"object": "list", "data": [{"object": "embedding", "embedding": [...], "index": 0}, ...],
 "model": "text-embedding-3-small", "usage": {"prompt_tokens": 10, "total_tokens": 10}}
```

Backed by the pluggable embeddings router (`EMBEDDINGS_PROVIDER`:
`openai` / `cohere` / `voyage` / `pgvector` / `none`).

### List Models

```http
GET /v1/models

Response 200:
{"object": "list", "data": [{"id": "gpt-4o-mini", "object": "model", "owned_by": "openai", ...}, ...]}
```

---

## Admin (owner role)

### API Key Management (pepper-version aware)

```http
GET  /admin/keys
POST /admin/keys/rehash

Response 200 (rehash):
{
  "message": "Key rehash diagnostics",
  "active_keys": 12,
  "keys_on_current_pepper": 12,
  "legacy_keys": 0,
  "current_pepper_version": "v1",
  "legacy_fallback_enabled": true
}
```

Keys record the HMAC pepper version at creation; legacy (pre-rotation) keys
keep validating through the transition window via the fallback
(`API_KEY_ALLOW_LEGACY_PEPPER`, default `true`). Set it to `false` once all
legacy keys are regenerated.

### Global Usage + LLM Cost Savings

```http
GET /admin/usage?period=month&days=14
GET /admin/usage/teams
```

Requires the `owner` role in at least one team. Returns usage across ALL
teams, plus the free-first routing attribution and dollar savings from the
route metadata logged by the LLM gateway:

```json
{
  "period": "month",
  "total_requests": 120,
  "total_credits": 96,
  "team_breakdown": {...},
  "endpoint_breakdown": {...},
  "tracked_requests": 118,
  "free_requests": 100,
  "paid_requests": 18,
  "free_pct": 84.7,
  "total_cost_usd": 0.84,
  "total_cost_avoided_usd": 6.20,
  "provider_series": [
    {"date": "2026-07-26", "free": 0, "paid": 0, "cost_usd": 0.0, "cost_avoided_usd": 0.0},
    {"date": "2026-07-27", "free": 12, "paid": 3, "cost_usd": 0.05, "cost_avoided_usd": 0.60}
  ]
}
```

`period` filters the aggregate (`day`/`week`/`month`); `days` controls the
length of the daily `provider_series` (default 14, max 90) used by the admin
dashboard's free-vs-paid-over-time chart.

### Audit Trail & Webhooks

```http
GET /admin/audit
GET /admin/audit/export
GET /admin/webhooks
GET /admin/webhooks/{webhook_id}
POST /admin/webhooks/{webhook_id}/test
POST /admin/webhooks/{webhook_id}/rotate-secret
GET /admin/webhooks/{webhook_id}/deliveries
```

---

## Quiz / Gamification / Onboarding / HR

```http
POST /quiz/generate        {"repo_url": "...", "module": "...", "difficulty": "junior"}
GET  /quiz/{quiz_id}
GET  /quiz/{quiz_id}/answers
POST /quiz/{quiz_id}/submit
GET  /quiz/{quiz_id}/results
GET  /quiz/

POST /gamification/xp      {"source": "...", "amount": 10}
GET  /gamification/summary
GET  /gamification/badges
GET  /gamification/badges/definitions
GET  /gamification/streak
GET  /gamification/leaderboard
GET  /gamification/sources
POST /gamification/login

POST /onboarding-plans
POST /onboarding-plans/generate
GET  /onboarding-plans
GET  /onboarding-plans/{plan_id}
GET  /onboarding-plans/{plan_id}/roadmap
PATCH /onboarding-plans/{plan_id}
POST /onboarding-plans/{plan_id}/pulse
GET  /onboarding-plans/{plan_id}/pulse-trends
POST /onboarding-plans/milestones/{milestone_id}/complete
POST /onboarding-plans/pre-boarding/{task_id}/complete
GET  /onboarding-plans/team/{team_id}/pulse-overview

GET /hr-dashboard/cohort/{team_id}
GET /hr-dashboard/attrition/{team_id}
GET /hr-dashboard/heatmap/{team_id}
GET /hr-dashboard/developers/{team_id}
GET /hr-dashboard/cohort-comparison/{team_id}
GET /hr-dashboard/timeline/{team_id}
GET /hr-dashboard/mentor-match/{team_id}/{user_id}
GET /hr-dashboard/review-analytics/{team_id}

GET /dora/summary
GET /dora/velocity
GET /dora/throughput

GET /audit/my
GET /audit
```

---

## Feature Flags, Invites, Accounts, Wiki

```http
GET    /feature-flags/{team_id}
GET    /feature-flags/{team_id}/{flag_name}
POST   /feature-flags/{team_id}/{flag_name}
DELETE /feature-flags/{team_id}/{flag_name}

POST   /invites/teams/{team_id}
GET    /invites/teams/{team_id}
DELETE /invites/teams/{team_id}/invites/{invite_id}
POST   /invites/accept
GET    /invites/me

POST   /accounts/create
POST   /accounts/preview-csv
POST   /accounts/create-bulk

POST /wiki/generate
```

---

## Health

The ops router is mounted at the **root** (no `/api/v1` prefix):

```http
GET /health      → liveness: {"status": "ok", "version": "1.0.0", "uptime_seconds": 12.3}
GET /ready       → readiness: {"status": "ready"|"not_ready", "checks": {"database": {...}, "redis": {...}}}
GET /metrics     → Prometheus metrics
```

`/ready` reports `not_ready` (503) when PostgreSQL or Redis is unreachable.
`/health` is always 200 while the process runs. Both are public (no auth).
The Kubernetes deployment uses `/health` for startup/liveness probes and
`/ready` for readiness.

---

## WebSocket

```http
WS /api/v1/ws?token=<jwt>
```

Authenticated via token query param. Server pushes notification events;
client may send `{"type": "ping"}` and receives `{"type": "pong"}`.
Invalid/missing token closes with code `4001`.

---

## Webhook Events

| Event | Description |
| ------- | ------------- |
| `task.assigned` | Task assigned to user |
| `task.started` | User started working on task |
| `task.submitted` | Task submitted for review |
| `task.reviewed` | Task reviewed |
| `task.approved` | Task approved |
| `task.completed` | Task marked complete |
| `task.needs_changes` | Changes requested on task |
| `task.cancelled` | Task cancelled |
| `module.granted` | Learning module granted |
| `pr.merged` | PR merged |
| `milestone.reached` | Learning milestone reached |
| `team.invite` | Team invite sent |
| `*` | Wildcard — all events |
