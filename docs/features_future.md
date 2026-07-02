# CodeFlow — Future Features Catalog

> The full idea catalog, grounded in what the codebase already has. Three buckets: **new features**, **self-healing**, and **self-learning**. Release sequencing lives in [versions.md](./versions.md).

---

## 1. New features (build on existing infra)

### Onboarding intelligence

| Idea | Grounding in existing code |
|------|---------------------------|
| **Onboarding time predictor** — predict "ramp-up ETA" per hire, flag stalls early | Task + audit data already captured (`task_service`, `audit_service`) |
| **Skill graph per trainee** — competency map from quiz + task outcomes; gaps drive the next learning module | `quiz_generator` agent + task system already produce the raw signals |
| **Codebase changelog digests** — weekly summaries of merged PRs for new hires ("what changed while you learned") | Repo watcher + `digest_service` already exist |
| **Mentor matching** — auto-suggest reviewer/mentor per task | `contributor_tracker` already knows who owns what code |

### Platform

| Idea | Grounding |
|------|-----------|
| **GitHub App (vs PAT)** — per-org install, webhook-driven inline PR review comments, no token management | `github_service` + `webhook_service` + PR review agent |
| **IDE extension** — Silent Pair Programming in VS Code | `silent_pair_programming` agent already in the codebase (v2.0 plan) |
| **Slack bot commands** — `/codeflow ask <question>` in-channel, not just notifications out | `slack_service` handles the outbound half today |
| **Multi-repo workspace** — onboard against a whole org, cross-repo dependency map | `networkx` already in deps; graph code in `app/graph.py` |
| **Public API portal** — docs site + more SDKs (Python next) | OpenAPI schema exists; `sdks/` directory already started |

### Analytics

| Idea | Grounding |
|------|-----------|
| **DORA metrics dashboard** | `usage_records` + GitHub data already collected |
| **LLM cost attribution** — per-team, per-feature spend | `usage_records` captures tokens + cost; just surface it |

---

## 2. Self-healing (tiered, realistic)

**Rule:** self-healing acts on infra; self-repair proposes but a human merges code. Never let it touch the prod DB or merge unattended.

### Tier 1 — reactive (v1.1, mostly wiring)

- **LLM provider circuit breaker** — the router already has a fallback chain; add failure-rate tracking, auto-eject a bad provider for N minutes, auto-restore on probe success. *(Implemented: `backend/app/llm.py` `CircuitBreaker`.)*
- **Retry with backoff on transient DB/API errors** — `tenacity` already in requirements, barely used. *(Implemented for transient LLM errors in the router.)*
- **Dead-letter queue for failed jobs** (digests, emails) — auto-replay with backoff.
- **Watchdog** — `/health/deep` (DB, Redis, LLM breaker state) + container restart policy (compose already has `restart: unless-stopped`). *(Implemented: `backend/app/api/v1/system_health.py`.)*

### Tier 2 — diagnostic (v1.2)

- **Self-diagnosis agent** — Sentry webhook → agent reads the error + relevant code → posts diagnosis + suggested fix as a GitHub issue. Agent framework + repo parsing already exist; this is one new agent.
- **Schema drift detector** — CI job compares `models.py` vs the live DB, alerts on mismatch.
- **Anomaly alerts on `usage_records`** — latency spikes, error rate per provider/route.

### Tier 3 — self-repairing (v2.0, gate carefully)

- **Fix-PR agent** — opens a fix PR (never auto-merge) for known error classes: missing null guards, flaky provider config.
- **Auto-rollback deploy** — post-deploy smoke failure triggers rollback (pipeline hook, not AI).

---

## 3. Self-learning / self-refining loop

**Core design — one feedback pipeline, many consumers:**

```
   ┌────────────────────────────────────────────────────┐
   │                 Feedback pipeline                  │
   │  thumbs · eval scores · acceptance data · RAG hits │
   └───────┬──────────┬───────────┬──────────┬──────────┘
           ▼          ▼           ▼          ▼
     LLM router   prompt      learning     RAG
     ordering     variants    paths        chunking
```

Concrete pieces, in build order:

1. **Golden eval set** *(prerequisite — build first)* — 20–50 canonical Q&A per demo repo; run on every prompt change in CI. Stops silent quality regression. *(Started: `backend/evals/`.)*
2. **Feedback capture** — thumbs on every AI output (ask, explore, learn, PR review). Cheapest highest-value addition: one table, one component.
3. **Router learning** — reorder the fallback chain from observed failure/latency/cost.
4. **Prompt A/B** — variants validated against evals + live feedback before promotion.
5. **Learning-path refinement** — task completion data shows which modules stall trainees → reorder/rewrite suggestions. Data already in the task system.
6. **PR review learning** — track which review comments get accepted vs dismissed → suppress low-value comment patterns per team.
7. **RAG refinement** — embeddings service exists; re-embed on push, log retrieval hits vs misses, tune chunking from miss patterns.
8. **Agentic self-repair** — last, gated on all of the above.

Without evals, "self-refining" = drift with no ground truth.
