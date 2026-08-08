# Onramp 2.0 — API Reference

Base URL: `http://localhost:8000/api/v1` (dev) or `https://yourdomain.com/api/v1` (production)

**Authentication:** All endpoints except webhooks and health require an auth token in the `Authorization` header: `Authorization: Bearer <token>`

**Content-Type:** `application/json`

---

## Auth

### Register / Login
```http
POST /auth/register
Content-Type: application/json

{"id_token": "<auth-token>", "provider": "google.com"}

Response 200:
{"uid": "...", "email": "...", "name": "...", "provider": "google.com"}
```

### Get Current User
```http
GET /auth/me
Authorization: Bearer <token>

Response 200:
{"uid": "...", "email": "...", "name": "...", "provider": "google.com"}
```

### Check Provider
```http
GET /auth/check-provider?email=user@example.com

Response 200:
{"email": "user@example.com", "registered": true, "provider": "google.com"}
```

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

### Attach Stripe IDs
```http
POST /billing/subscriptions/{team_id}/stripe
Content-Type: application/json

{"stripe_customer_id": "cus_...", "stripe_subscription_id": "sub_..."}
```

### Create Checkout Session
```http
POST /billing/checkout
Content-Type: application/json

{"team_id": "team-123", "tier": "startup", "success_url": "...", "cancel_url": "..."}

Response 200:
{"url": "https://checkout.stripe.com/...", "session_id": "cs_..."}
```

### Stripe Webhook (public, no auth)
```http
POST /billing/webhook
Stripe-Signature: ...

Events handled: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, invoice.payment_succeeded, invoice.payment_failed
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

{"repo_url": "https://github.com/facebook/react"}

Response 200:
{"status": "processing", "repo_id": "repo-uuid", "eta_seconds": 45}

Use repo_id to poll graph/index endpoints.
```

Responses include an `X-LLM-Route` header reporting which provider/model
produced the architecture analysis (set only when the LLM actually ran).

### Get Architecture Graph
```http
GET /explore/graph/{repo_id}

Response 200:
{"nodes": [...], "edges": [...], "summary": "..."}
```

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

### Get Index Status
```http
GET /explore/index/{repo_id}
```

### Get History
```http
GET /explore/history
```

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

### Create Task
```http
POST /learn/paths/{path_id}/tasks
Content-Type: application/json

{"title": "Understand JSX", "description": "...", "type": "reading"}
```

### Get Task
```http
GET /learn/tasks/{task_id}
```

### Update Progress
```http
POST /learn/progress
Content-Type: application/json

{"task_id": "...", "status": "completed"}
```

---

## First PR

### Score Beginner Issues
```http
POST /first-pr/score-issues
Content-Type: application/json

{"repo_url": "https://github.com/facebook/react"}

Response 200:
{"issues": [{"number": 123, "title": "...", "score": 85, "reason": "..."}]}
```

### Get Issue Guide
```http
GET /first-pr/guide/{issue_id}
```

---

## Ask

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

### Get History
```http
GET /ask/history
```

---

## Reports

### Generate Onboarding Report
```http
POST /reports/onboarding
Content-Type: application/json

{"repo_url": "..."}

Response 200:
{"report": {"overview": "...", "difficulty": "intermediate", "estimated_time": "2 weeks", "modules": [...]}}
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

### Get Team
```http
GET /teams/{team_id}
```

### Update Team
```http
PUT /teams/{team_id}
Content-Type: application/json

{"name": "...", "description": "..."}
```

### Delete Team
```http
DELETE /teams/{team_id}
```

### Add Member
```http
POST /teams/{team_id}/members
Content-Type: application/json

{"email": "dev@company.com", "role": "member"}
```

### Remove Member
```http
DELETE /teams/{team_id}/members/{user_id}
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

### Integration Config
```http
GET    /integrations/{type}          # e.g., slack, github
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

### List All Integrations
```http
GET /integrations
```

### List Supported Events
```http
GET /integrations/events/list
```

---

## Notifications

### List Notifications
```http
GET /notifications
```

### Get Preferences
```http
GET /notifications/preferences
```

### Update Preferences
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
PUT    /tasks/{task_id}
DELETE /tasks/{task_id}
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

---

## OpenAI-Compatible Gateway (OpenRouter-style)

The `/v1` gateway exposes the query-type LLM router behind the OpenAI Chat
Completions API, so any OpenAI-SDK client can point `base_url` at it:

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

### List Models
```http
GET /v1/models

Response 200:
{"object": "list", "data": [{"id": "gpt-4o-mini", "object": "model", "owned_by": "openai", ...}, ...]}
```

---

## Admin (owner role)

### Global Usage + LLM Cost Savings
```http
GET /admin/usage?period=month&days=14
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

---

## Health

```http
GET /health/live
GET /health/ready
```

---

## Webhook Events

| Event | Description |
|-------|-------------|
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
