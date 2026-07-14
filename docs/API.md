# Onramp 2.0 — API Reference

Base URL: `http://localhost:8000/api/v1` (dev) or `https://yourdomain.com/api/v1` (production)

**Authentication:** All endpoints except webhooks and health require a Firebase ID token in the `Authorization` header: `Authorization: Bearer <firebase-id-token>`

**Content-Type:** `application/json`

---

## Auth

### Register / Login
```http
POST /auth/register
Content-Type: application/json

{"id_token": "<firebase-id-token>", "provider": "google.com"}

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

### Get Architecture Graph
```http
GET /explore/graph/{repo_id}

Response 200:
{"nodes": [...], "edges": [...], "summary": "..."}
```

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
