# 🗺️ Onramp 2.0 — Product Roadmap (Problem-First)

**Last updated:** August 2026
**Status:** v1.4 wedge built (Track → Quantify → Intercept) · v1.5 wave 1 built (review load-balancing + consistency) · v1.6 wave 3 built (headcount flows + cohort size deltas) · Phase 0 built (cost-model dials + measurement loop + ramp-vs-Onramp ROI tracker) · Next: run the 5-team validation interviews

---

## 🎯 North Star — the problem we solve

> **New developers waste expensive senior-developer time while ramping up, and engineering leaders have no way to track the ramp or intercept the drain — costing senior devs their focus and companies real money.**

Root cause: **institutional knowledge fails to flow to the people who need it.** Every feature below is judged against this problem — if a feature doesn't serve it, it's cut.

**Evidence:** customer conversations — leaders couldn't track new devs; new devs burned senior time; the cost was real and financial.

**Full problem statement, cost math, personas & metrics → [PROBLEM.md](./PROBLEM.md)**

### Wedge — Ramp Visibility & Senior-Time Protection

1. **Track** — every new dev's ramp is visible: learned, working on, stuck on.
2. **Quantify** — the cost of ramp: senior hours burned, review cycles, ramp lag vs. benchmark.
3. **Intercept** — self-serve routing (Repo Q&A / learning paths / wiki) + stuck-dev alerts, before more senior time is lost.

### The four pillars (one root problem)

| Pillar | Pain | Persona | Metric | Status |
| --- | --- | --- | --- | --- |
| **P1 · Ramp-up** | Slow ramp; senior time drained | New devs + leads | Time-to-first-merged-PR ↓ | 🔴 **v1.4 wedge** |
| **P2 · Reviews** | Review bottleneck | Seniors, leads | Review turnaround ↓ | 🔵 v1.5 wave 1 built |
| **P3 · Visibility** | Blind leaders | CTO / EM / HR | Stuck surfaced <24h | 🔵 v1.6 wave 3 built |
| **P4 · Stale docs** | Docs drift from code | Everyone | Q&A without humans ↑ | 🔵 Folded into P1 |

---

## ✅ Done — v1.0 → v1.3 (history)

### MVP (v1.0) — Complete

- **Auth & teams:** email/password + JWT, RBAC (8 roles), team creation/invites/membership, team switching, PostgreSQL sessions.
- **AI tools:** Architecture Explorer, First PR Accelerator, Learning Path Generator, Repo Q&A (streaming SSE), PR Description Generator, Code Health Scorer, Pattern Recognition, Silent Pair Programming, Quiz Generator, Regression Test Generator.
- **Onboarding & learning:** Onboarding Report Generator, Trainee Dashboard, gamification (XP/levels/badges/streaks/leaderboards), module-level access, learning paths, Onboarding Hub.
- **Task workflow:** full lifecycle (create → assign → start → submit → review → approve → complete), AI-assisted review, review queue with status badges, product sign-off gate.
- **Leadership dashboards:** CTO/Executive dashboard, Senior Dev Space, task distribution/completion charts, activity trends.
- **Billing & API gateway:** Razorpay subscriptions (free/pro/enterprise), API keys with usage tracking, rate limiting, quotas.

### v1.1 — Complete

- **Auth & security:** OAuth2 (Google/GitHub) with CSRF state, password reset, role expansion (ceo/cto/senior_dev/tester).
- **Onboarding plans:** 30-60-90 day plans, milestone tracking, pulse check-ins, review sign-off.
- **Playbooks / Wiki / Quiz:** playbook CRUD + tags + usage; AI wikis from repo URLs; module quizzes with grading notifications.
- **HR dashboard:** team health metrics, people management, role-scoped views.
- **Notifications & integrations:** notification center (14 event types), bell + badge, webhooks (create/test/rotate/logs), GitHub token validation, Slack, SendGrid.
- **UX polish:** 50+ design tokens, 15+ skeleton loaders, keyboard shortcuts, ambient backgrounds, error boundaries, changelog/pricing/privacy/terms pages.
- **Drill-downs:** member detail, module health, Dev Space, Senior Space.
- **Admin & infra:** admin dashboard (API keys, usage, audit events), audit log, user deactivation, dynamic-document table migration (21 collections).

### v1.2 — Production Launch & Polish — Complete

Production readiness (Railway/Render + Vercel + managed PG + Redis + CI/CD + SSL) · real-time WebSocket notifications · interactive repo graph · milestone roadmap view · session refresh/remember-me · full mobile responsiveness (44 pages) · WCAG 2.1 AA audit · pagination · E2E suite (65+ tests) · API contract tests (31) · keyboard shortcuts · Jira/Linear sync · feature flags.

### v1.3 — Enterprise + AI Acceleration — Complete

SSO/SAML (Okta + Entra ID) with domain-based routing · real-time audit log UI · HMAC-SHA256 API key hashing · DORA/velocity metrics · CI/CD auto PR review · architecture drift detection · playbook marketplace · usage-based billing tier (credit wallet + metered drawdown) · team feature flags · autonomous coding agent (issue → PR) · Ollama local models · PR auto-apply · AIaaS public API gateway + `@onramp/sdk` · VS Code extension groundwork · PWA (manifest + service worker) · Prometheus/Grafana observability · JSON logging · request correlation IDs · hardened security headers · non-root Docker.

---

## 🎯 v1.4 — Wedge: Ramp Visibility & Senior-Time Protection

**Theme:** Make the ramp measurable and the senior-time drain interceptable.
**Est. effort:** 3–4 weeks
**Focus:** The complete **Track → Quantify → Intercept** loop for new devs. Nothing else ships until this loop is proven with real teams.

### ✅ Wave 1 — built (Ramp service + `/ramp` API + Ramp page)

| Area | Feature | Status |
| --- | --- | --- |
| Track | **Per-trainee ramp profiles** — ramp days vs team benchmark, completion, review cycles, stalled work, questions asked | ✅ Built (`ramp_service.get_ramp_summary` → `GET /ramp/summary`) |
| Quantify | **Senior-time cost per new dev** — review cycles × 0.5h + stalled re-engagement, at ~$90/hr | ✅ Built (`senior_time_estimate`, totals on `/ramp/summary`) |
| Intercept | **Stuck-dev detector** — stalled task (>5d) · review loop (≥2 cycles) · review timeout (>24h) · inactivity (>7d) | ✅ Built (`ramp_service.detect_stuck` → `GET /ramp/stuck`) |
| Intercept | **Stuck-dev alerts** — deduped ≤1/day `dev_stuck` notifications to leaders + self-serve nudge to trainee | ✅ Built (`fire_stuck_alerts` → `POST /ramp/check` + Celery `check_stuck_devs` every 6h) |
| UI | **Ramp page** (`/ramp`, senior+ roles) — benchmark/cost cards, stuck panel, per-trainee table | ✅ Built (`web/src/pages/RampPage.tsx`) |
| Tests | Ramp service + authz tests (memory backend) | ✅ 12 tests, all passing |

### Next (wave 2)

| Area | Feature | Status |
| --- | --- | --- |
| Validate | Pressure-test the cost model with 3–5 customer conversations | 🔴 Blocking (PROBLEM.md) |
| Intercept | Self-serve-first routing nudge deep-link (Ask Codebase / Learning Path on alert click) | 🆕 |
| Dashboards | Surface ramp cost + stuck list inside CTO/Executive dashboard (charts built) | ✅ Built (`RampPanel` on Mission Control + Executive Console) |
| Track | Time-to-first-merged-PR wired to GitHub PR-merge webhook data — login-keyed milestones (linked accounts) + `pr_merged_at` stamp on the auto-completed task (works for teams WITHOUT linked GitHub accounts) | ✅ Built |

**Exit criteria for v1.4:** 3–5 real teams using the loop; senior-time-per-new-dev measured; stuck-dev alert latency < 24h; time-to-first-merged-PR baseline captured.

---

## 🔵 v1.5 — Reviews (P2)

The senior-time drain continues past ramp — attack the review bottleneck.

### ✅ Wave 1 — built (load balancing + consistency)

| Area | Feature | Status |
| --- | --- | --- |
| Load | **Reviewer load board** — per-reviewer pending/in-review counts, 30d volume, oldest wait, 0-100 load score | ✅ Built (`review_ops_service.reviewer_load` → `GET /review-ops/load`) |
| Load | **Next-reviewer suggestion** — least-loaded capable reviewer, assignee excluded, rework tie-break | ✅ Built (`suggest_reviewer` → `GET /review-ops/suggest`) |
| Consistency | **Per-reviewer consistency scores** — turnaround + variance + rework/calibration → 0-100 (null below 3 reviews) | ✅ Built (`consistency_scores` → `GET /review-ops/consistency`) |
| Attribution | **Reviewer recorded on every outcome** — `reviewed_by` now set on needs_changes / product_review / approved | ✅ Built (`task_service.transition_task`) |
| UI | **Review Ops panel on the review queue** (`/reviews`) — suggestion callout, load bars, score badges | ✅ Built (`ReviewOpsPanel.tsx`) |
| Tests | Load, suggestion, consistency, re-submission regression, authz | ✅ 12 tests, all passing |

### Next (wave 2)

- Review turnaround metrics folded into the ramp cost view (P1 × P2 shared data).
- Per-task suggestion wired into the queue rows (the `task_id` variant exists — surface it in the Review action).
- Review-events log to close the consistency blind spot (approval "stickiness" is currently not measurable — see `review_ops_service` docstring).
- Regression test generator + PR descriptions as review accelerators (built).

---

## 🔵 v1.6 — Org-Level Visibility (P3)

Reporting layer on top of P1 + P2 data.

### ✅ Wave 1 — built (org ramp health + cohort trend)

| Area | Feature | Status |
| --- | --- | --- |
| Health | **Org ramp health score** — composite 0-100 (ramp velocity 20% / completion 15% / stuck 20% / review health 15% / first-PR 15% / **attrition 15%**) with grade (healthy ≥80 · at_risk 50-79 · critical <50 · no_data) + component drill-down | ✅ Built (`ramp_service.ramp_health` → `GET /ramp/health`) |
| Health | **First-PR benchmark** — team median days-to-first-merged-PR (webhook-stamped, works without linked GitHub accounts) | ✅ Built (`first_pr_benchmark_days` on `/ramp/summary`) |
| Health | **Backfill script** — stamps `pr_merged_at` on webhook-auto-completed tasks for teams with pre-existing merges (dry-run default) | ✅ Built (`backfill_pr_merged_at.py`) |
| UI | **Health card on Ramp page** — score, grade, per-component bars | ✅ Built (`RampPage.tsx` HealthCard) |
| UI | **Health readout on leadership consoles** — score + grade LED on RampPanel (Mission Control + Executive) | ✅ Built (`RampPanel.tsx`) |
| UI | **Cohort trend panel** — cohort comparison surfaced on the Executive Console (previously HR-only) | ✅ Built (`CohortTrendPanel.tsx`) |
| Detector | **Inactivity false-positive fix** — no-activity signal only fires for trainees with OPEN work (completed/cancelled-only teams are healthy, not stuck) | ✅ Built + regression test |
| Tests | Health score math, empty team, stuck-heavy team, review-analytics-failure path, detector regression | ✅ 6 tests, all passing |

### ✅ Wave 2 — built (attrition-risk weighted + retention curves)

| Area | Feature | Status |
| --- | --- | --- |
| Health | **Attrition risk folded into health score** — `attrition_health` as a weighted 6th component (150 pts off per full at-risk ratio; weights rebalanced to sum 1.0) | ✅ Built (`ramp_health` + `at_risk_count` exposure) |
| Retention | **Cohort retention curves** — retained % / active % survival at 30/60/90/120/180d after joining, join-relative per cohort (deactivation = leave signal) | ✅ Built (`hr_metrics_service.cohort_retention` → `GET /hr/cohort-retention/{team_id}`) |
| UI | **Retention curves on CTO seat** — newest cohort charted + per-cohort 180d retention trend across cohorts | ✅ Built (`RetentionCurvesPanel.tsx` on Executive Console) |
| Detector | **Retention bucket semantics fix** — buckets are join-relative (a member deactivated at day 50 drops out at the 60d bucket, not the 30d one) | ✅ Built + regression test |
| Tests | Attrition component lowers composite · retention curve drop-out · empty team · endpoint smoke | ✅ 4 tests, all passing |

### ✅ Wave 3 — built (headcount flows + cohort size deltas)

| Area | Feature | Status |
| --- | --- | --- |
| Headcount | **Headcount flows per month** — joined (team_members.joined_at) vs. deactivated (users.deactivated_at) per calendar month, with net change | ✅ Built (`hr_metrics_service.headcount_flow` → `GET /hr/headcount-flow/{team_id}`) |
| Headcount | **Cohort size deltas + trajectory** — cumulative cohort_size (total onboarded) and headcount (net) running totals per month | ✅ Built (same payload) |
| UI | **Headcount flow on CTO seat** — joined/left bars + headcount line chart, net-growing/shrinking signal | ✅ Built (`HeadcountFlowPanel.tsx`, 2-col grid with retention) |
| UI | **Org health + retention on the HR console** — RampPanel (health score + stuck) and retention curves mounted on the HR dashboard; HR added to the shared leader-role gate (`LEADER_ROLES`), `/ramp` nav + read-only Ramp page for HR (check button stays leader-only) | ✅ Built (`HrDashboardPage.tsx`, `RampPanel.tsx`, `Sidebar.tsx`) |
| Tests | Month bucketing + cumulative math · empty team | ✅ 2 tests, all passing |

### ✅ Phase 0 — cost-model validation harness (pressure-testing the assumptions)

| Area | Feature | Status |
| --- | --- | --- |
| Calibration | **Tunable cost model** — env-driven platform defaults (`ONRAMP_SENIOR_HOURLY_RATE` etc.) + per-team overrides (`team_cost_settings`) with validated ranges | ✅ Built (`team_cost_settings.py`, threaded through `get_ramp_summary`) |
| API | **`GET /ramp/cost-model`** (member) — effective assumptions, source, measured signals, sensitivity band · **`PUT /ramp/cost-model`** (leader) — partial calibration | ✅ Built (`ramp.py`) |
| Measurement | **Measured signals bound the assumptions** — avg elapsed review cycle vs 0.5h, stalled re-engagement weeks, review-cycle count | ✅ Built (`_measured_cost_stats` on the summary + Ramp page CostModel card) |
| Honesty | **Sensitivity band** — `cost_low ≤ cost_current ≤ cost_high` across the $75–100/hr · 0.25–1h/cycle band (PROBLEM.md's working numbers) | ✅ Built (`cost_sensitivity`) |
| Runbook | **Interview script updated** — 5-team protocol + the product-side measurement loop + how to feed results into the dials | ✅ `docs/validation-interview-script.md` |
| Benchmark | **Ramp vs Onramp ROI tracker** — senior ramp cost vs Onramp at the **live subscription price** (active billing subscription, INR→USD, else team override, else the $99/mo platform default — `price_source` labels which), React-scoped (`stack=react` filters cost to React-repo tasks; team stack always reported honestly), snapshot history for tracking over time | ✅ Built (`ramp_vs_onramp_benchmark` → `GET /ramp/benchmark` + `POST /ramp/benchmark/snapshot`) |
| Benchmark | **Terminal coding agents vs Onramp** — per-agent team monthly cost (per-dev subscription × dev count) vs Onramp's **live subscription price** (same `price_source` logic), for the team's detected stack (React when repos are JS/TS), documented Aug-2026 catalog (Claude Code, Codex, Gemini CLI, Cursor) + snapshot tracking | ✅ Built (`agent_benchmark_service` → `GET /ramp/agent-benchmark` + `POST /ramp/agent-benchmark/snapshot`, `AgentBenchmarkPanel.tsx` on the Ramp page) |
| Benchmark | **Live-price resolution** — `resolve_benchmark_price`: explicit team override → live `onramp_subscriptions` (INR→USD at `ONRAMP_INR_TO_USD_RATE`, default ₹84/$) → $99 platform default; free-tier teams (₹0) correctly fall back to the default instead of an infinite ROI; the original ₹ amount rides along (`onramp_price_inr`) so panels show the conversion step (e.g. "₹2,999 ≈ $35.70/mo") | ✅ Built (`team_cost_settings.resolve_benchmark_price` + `live_subscription_price`, UI labels show the source + conversion) |
| Benchmark | **Token-efficiency benchmark** — the "why we're cheaper" story in tokens AND dollars, mechanism-first: a step-by-step "when the codebase changes" comparison (agent re-reads the whole repo = `tokens_per_change` vs Onramp re-embeds only changed files = `graph_refresh.tokens_per_change`, ~10%) + measured 30d usage (free-key %, spend) + subscriptions; headline per-change token savings and monthly $ savings; change-frequency dial (the faster the churn, the wider the gap); codebase-size default grounded in indexed `file_count` (new model column + migration); honest caveat that changed-files-only re-embed is the target architecture | ✅ Built (`token_efficiency_benchmark` → `GET /ramp/efficiency-benchmark`, `EfficiencyBenchmarkPanel.tsx` on the Ramp page) |
| Benchmark | **Headcount / hiring simulation** — "hire more devs? agents charge per seat AND per context": `dev_count` simulates agent costs at any team size (per-dev subscriptions × N **+ per-dev token burn** — each agent holds its own codebase copy, so tokens scale with headcount too; `per_dev_token_burn=false` models a shared/reused context) vs Onramp's flat price; leaders record the exact scenario (`POST /ramp/efficiency-benchmark/headcount`) and read back the saved record history — the scaling story (agent cost grows with every hire on both dimensions, Onramp stays flat) tracked over time | ✅ Built (`token_efficiency_benchmark(dev_count=…, per_dev_token_burn=…)` + `record_headcount_scenario`, hiring dial + per-dev toggle + record button + history in `EfficiencyBenchmarkPanel`) |
| Benchmark | **Multi-product scaling** — "several devs × several products": `product_count` treats each product as its own codebase, so agent re-reads compound devs × products × changes while Onramp's flat price never moves (refresh scales only with total changed files); recorded scenarios carry `product_count`; **public `CostAtScaleCalculator` on the Why Onramp marketing page** (devs/products/changes sliders → live agent vs Onramp monthly totals) | ✅ Built (`token_efficiency_benchmark(product_count=…)`, products slider + history label in `EfficiencyBenchmarkPanel`, `CostAtScaleCalculator.tsx` on `WhyOnrampPage.tsx`) |
| Tests | Settings resolution/override/validation · sensitivity band · endpoint authz · summary honors override · ROI math · React scoping · price override · snapshot history · agent comparison parity · React labelling · snapshot roundtrip · **live subscription wins over default · team override wins over subscription · free-tier fallback · efficiency math (token rate, ratios) · measured-usage aggregation (free %, sub-cent spend) · tunable inputs + file-count default · endpoint 401 · headcount scaling (agent-only) · headcount record roundtrip · headcount 401s · per-dev token burn (tokens scale with headcount) · shared-context mode · multi-product compounding (devs × products, Onramp refresh scales only with total tokens)** | ✅ 32 tests, all passing |
| Tests | Settings resolution/override/validation · sensitivity band · endpoint authz · summary honors override · ROI math · React scoping · price override · snapshot history · agent comparison parity · React labelling · snapshot roundtrip · **live subscription wins over default · team override wins over subscription · free-tier fallback · efficiency math (token rate, ratios) · measured-usage aggregation (free %, sub-cent spend) · tunable inputs + file-count default · endpoint 401 · headcount scaling (agent-only) · headcount record roundtrip · headcount 401s** | ✅ 29 tests, all passing |
| Tests | Settings resolution/override/validation · sensitivity band · endpoint authz · summary honors override · ROI math · React scoping · price override · snapshot history · agent comparison parity · React labelling · snapshot roundtrip · **live subscription wins over default · team override wins over subscription · free-tier fallback · efficiency math (token rate, ratios) · measured-usage aggregation (free %, sub-cent spend) · tunable inputs + file-count default · endpoint 401** | ✅ 25 tests, all passing |
| Tests | Settings resolution/override/validation · sensitivity band · endpoint authz · summary honors override · ROI math · React scoping · price override · snapshot history · agent comparison parity · React labelling · snapshot roundtrip | ✅ 17 tests, all passing |

### Next (wave 4)

- Run the 5-team validation interviews and converge the defaults from real calibration data.
- P4 (stale docs) — drift detection + wiki freshness (built) never standalone.

---

## ⏸️ Shelved / De-prioritized

| Item | Why shelved | Revisit when |
| --- | --- | --- |
| AIaaS gateway / SDK / usage-based billing | A different business (AI-API reselling) — conflicts with the onboarding problem | We deliberately decide to pivot |
| Community marketplace | Ecosystem, not problem-solving | Wedge is proven with paying teams |
| Ollama self-hosted models | Enterprise niche | Self-host demand from a real deal |
| SSO/SAML, SCIM, SOC2, tenant isolation, secrets vault | Enterprise stage-gates, not problems | An enterprise deal requires them |
| "Senior Dev Roast", codebase trailer, hot-take review, DevScore crowns | No problem attached | Never, unless engagement data says otherwise |

---

## 🧪 Testing & Reliability

- **Backend:** 737+ passing pytest (async fixtures, dual memory+postgres storage), incl. observability (25), API contract (31), load/performance (12).
- **Frontend:** 58+ Vitest + RTL tests; strict-mode TypeScript, zero errors.
- **SDK:** 6 tests. **E2E:** 65+ Playwright (auth, dashboard, review-queue, explore, team, billing, a11y).
- **CI:** GitHub Actions — backend (compileall + alembic + pytest) and frontend (tsc + vitest + build).
- **Observability:** Prometheus (10 metric families), Grafana dashboard, JSON logging, request correlation IDs.

## 📊 Key Metrics

| Metric | Current |
| --- | --- |
| Backend API endpoints | 115+ |
| Frontend pages / AI agents / DB tables | 44 / 10 / 39+ |
| Tests (backend + frontend + sdk) | 800+ |
| Auth providers | 4 (email, Google, GitHub, SSO) |
| Integrations | 7 (Slack, GitHub, Webhooks, Jira, Linear, GitLab, Bitbucket) |
| Notification event types | 15 |

---

*This roadmap is a living document. Every item traces back to the problem statement in [PROBLEM.md](./PROBLEM.md) — if it doesn't, it's cut.*
