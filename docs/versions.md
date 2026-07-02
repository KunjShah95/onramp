# CodeFlow — Version Roadmap

> Release-by-release plan for the self-healing / self-learning evolution of the platform.
> Full idea catalog (with rationale and codebase grounding) lives in [features_future.md](./features_future.md).
> Feature-level backlog for the current product surface lives in [FEATURES_PLAN.md](./FEATURES_PLAN.md).

**Guiding rule:** self-healing acts on *infrastructure*; self-repair *proposes* code changes but a human merges. Nothing autonomous ever touches the prod DB or merges unattended.

**Order matters:** eval harness → feedback capture → router learning → prompt A/B → agentic self-repair. Without evals, "self-refining" is drift with no ground truth.

---

## v1.0 (current)

Shipped: learning path generation, repo Q&A (streaming + memory), architecture explorer, first-PR accelerator, PR review agent, quizzes, digests, playbooks, teams/billing/quota, multi-provider LLM fallback chain, usage tracking, Sentry, audit trails.

---

## v1.1 — Reactive resilience + measurement foundation

*Mostly wiring on top of existing infra. This release makes quality measurable and failures survivable.*

### Golden eval harness (build first — prerequisite for everything else)
- [x] 20–50 canonical Q&A cases per demo repo, checked into `backend/evals/golden/`
- [x] Offline scorer (`must_contain` / `must_not_contain` / regex checks) — no LLM needed to grade
- [x] `backend/evals/run_evals.py` — runs cases through the real agent when LLM keys are present, exits cleanly when not
- [ ] CI: run evals on every prompt change (gate on secret availability)

### Tier-1 self-healing (reactive)
- [x] **LLM provider circuit breaker** — router already has a fallback chain; add per-provider failure-rate tracking, auto-eject a failing provider for N minutes, auto-restore on half-open probe success
- [x] **Retry with backoff on transient errors** — `tenacity` already in requirements; apply to transient LLM/network errors before falling through the chain
- [ ] **Dead-letter queue for failed jobs** (digests, emails) — persist failures, auto-replay with backoff
- [x] **Watchdog deep health check** — `/health/deep` verifies DB, Redis, and LLM provider/breaker state (compose already has `restart: unless-stopped`)

### Feedback capture (cheapest highest-value addition)
- [ ] Thumbs up/down on every AI output (ask, explore, learn, PR review) — one table, one endpoint, one frontend component

---

## v1.2 — Diagnostic + first learning loops

### Tier-2 self-healing (diagnostic)
- [ ] **Self-diagnosis agent** — Sentry webhook → agent reads the error + relevant code → posts diagnosis + suggested fix as a GitHub issue (reuses existing agent framework + repo parsing; one new agent)
- [ ] **Schema drift detector** — CI job compares `models.py` against the live DB, alerts on mismatch
- [ ] **Anomaly alerts on `usage_records`** — latency spikes, error rate per provider/route

### Self-learning
- [ ] **Router learning** — use provider failure/latency/cost history to reorder the fallback chain
- [ ] **Prompt A/B** — run prompt variants against the golden eval set + live feedback before promoting
- [ ] **Learning-path refinement** — task completion data shows which modules stall trainees → reorder/rewrite suggestions
- [ ] **PR review learning** — track which review comments get accepted vs dismissed → suppress low-value comment patterns per team

### Onboarding intelligence
- [ ] **Onboarding time predictor** — task/audit data already captured; predict ramp-up ETA per hire, flag stalls early
- [ ] **Mentor matching** — contributor tracker knows who owns what code; auto-suggest reviewer/mentor per task

---

## v2.0 — Self-repairing + adaptive loop (gate carefully)

### Tier-3 self-healing (self-repairing)
- [ ] **Fix-PR agent** — opens a fix PR (never auto-merges) for known error classes: missing null guards, flaky provider config
- [ ] **Auto-rollback deploy** — post-deploy smoke test failure triggers rollback (pipeline hook, not AI)

### Full adaptive loop
- [ ] One feedback pipeline, many consumers: evals + thumbs + acceptance data feed router, prompts, learning paths, and RAG chunking
- [ ] **RAG refinement** — re-embed on push, log retrieval hits vs misses, tune chunking from miss patterns

### Platform
- [ ] **GitHub App** (vs PAT) — per-org install, webhook-driven inline PR review comments, no token management
- [ ] **IDE extension** — Silent Pair Programming in VS Code
- [ ] **Skill graph per trainee** — quiz + task outcomes → competency map; gaps drive the next learning module

---

## Status tracking

| Item | Version | Status |
|------|---------|--------|
| Golden eval harness | v1.1 | ✅ harness + scorer + seed set; CI gating pending |
| LLM circuit breaker + retry | v1.1 | ✅ implemented |
| Deep health check | v1.1 | ✅ implemented |
| Dead-letter queue | v1.1 | 🟢 not started |
| Feedback capture | v1.1 | 🟢 not started |
| Self-diagnosis agent | v1.2 | 🟢 not started |
| Schema drift detector | v1.2 | 🟢 not started |
| Router learning | v1.2 | 🔴 blocked on eval harness CI + feedback data |
| Prompt A/B | v1.2 | 🔴 blocked on eval harness CI |
| Fix-PR agent | v2.0 | 🔴 blocked on Tier-2 |
