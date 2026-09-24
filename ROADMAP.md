# Onramp — Consolidated Product & Technical Roadmap

**Last updated:** 24 September 2026
**Status:** Release-candidate hardening and the v1.4–v1.6 wedge are built. Production launch remains gated by staging verification, customer validation, billing verification, backup/restore proof, and operational readiness.
**Planning convention:** The windows below are sequencing estimates, not committed launch dates. The configured Neon OnRamp schema migration was explicitly approved and executed on 24 September 2026; no application deployment or traffic cutover has been performed.

This document is the source of truth for the future roadmap. `STATUS.md` records current implementation status; `features_mvp.md`, `versions.md`, and `GAPS.md` are supporting audits and may contain historical assumptions that must be re-verified before they are used as release gates.

---

## 1. Mission, wedge, and guardrails

### North Star

> New developers waste expensive senior-developer time while ramping up, and engineering leaders have no reliable way to track the ramp or intercept the drain.

Onramp exists to make institutional knowledge flow to the people who need it:

1. **Track** — make ramp progress, work, questions, reviews, and blockers visible.
2. **Quantify** — measure senior time, review friction, ramp lag, and delivery outcomes.
3. **Intercept** — route stuck developers to self-serve answers and leaders to timely interventions.

Every proposed feature must improve at least one part of that loop. Features without a clear problem trace are deferred.

### Product principles

- **Tenant-safe by default** — every repository, index, job, session, event, document, and MCP result is team-scoped and membership-checked.
- **Truthful by default** — never imply certifications, customer logos, benchmarks, savings, or compliance that have not been verified.
- **Measure before optimizing** — collect baselines before declaring a product or cost win.
- **Graceful failure** — provider, Redis, queue, and integration failures must be bounded, observable, and recoverable.
- **Small reversible increments** — append-only migrations, feature flags, and versioned APIs.
- **No speculative enterprise work** — build SSO, SCIM, residency, and self-hosting when a real deal or regulatory requirement creates the trigger.

### Primary hypotheses to validate

These are targets from `PROBLEM.md`, not claims about current customer results:

- Median time-to-first-merged-PR decreases from a measured baseline.
- Senior time per new developer decreases materially after self-serve interception.
- A meaningful majority of new-developer questions resolve without a senior developer.
- Leaders receive a stuck-developer signal within 24 hours.
- Review turnaround and rework improve without increasing review workload.

---

## 2. Current baseline

### Shipped product and platform

| Area | Current state |
| --- | --- |
| Core product | Architecture Explorer, First-PR Accelerator, Learning Path Generator, Repo Q&A, onboarding reports, task workflow, dashboards, notifications, integrations, and billing surfaces are implemented. |
| Wedge | Ramp profiles, senior-time cost model, stuck detection, org health, retention curves, headcount flows, review load/suggestion/consistency, ROI and efficiency benchmark harnesses are built. |
| Repository intelligence | Team-owned repository registration, durable grants, single and batch indexing, job status APIs, revocation, deletion cleanup, derived embeddings, and graph context are implemented. |
| Developer platform | `cf_` API keys, TypeScript SDK, repository/index/ramp/onboarding methods, read-only tenant-scoped MCP tools, and CI coverage are implemented. |
| Evaluation | A provider-agnostic grounded-answer harness with fixtures, CLI integration, and documentation is built; production regression datasets and model-change gates remain future work. |
| Automation | GitHub/webhook and n8n signing, timestamped replay protection, deterministic idempotency, per-team delivery boundaries, and platform-admin allowlists are implemented. |
| Security hardening | Tenant isolation, HttpOnly cookie auth, API-key hashing, SSRF controls, webhook verification, refresh-token rotation, production boundary validation, and truthful public copy are implemented. |
| Observability | Structured logs, correlation IDs, `/health`, `/ready`, `/metrics`, provider LLM latency/error metrics, and frontend health surfaces are available. |
| Data/migrations | Alembic chain is through `031_embedding_chunk_tenant_scope`; offline upgrade/downgrade SQL generation is covered by tests. The configured Neon OnRamp database is at head, with migrations `030` and `031` applied and tenant columns/constraints verified; backup/restore and deployed smoke verification remain open. |

### Verification baseline

| Check | Latest verified result |
| --- | --- |
| Backend | 1,252 passed, 202 skipped in memory mode |
| Frontend | 82 Vitest/RTL tests; TypeScript, build, SEO check, and `npm audit` pass |
| SDK | 10 tests; typecheck and build pass |
| Playwright | 70 selected tests pass across auth/cookie, accessibility, billing, core flows, load, and Lighthouse suites |
| Backend dependency audit | `pip-audit` reports no known vulnerabilities |
| Frontend dependency audit | `npm audit --audit-level=high` reports zero vulnerabilities |
| Migrations | Offline upgrade and downgrade SQL generation pass; `alembic current` is `031_embedding_chunk_tenant_scope`. `alembic check` reports pre-existing model/schema drift that still needs a deliberate parity migration. |

### Current external blockers

- The configured Neon OnRamp database is reachable and verified at `031_embedding_chunk_tenant_scope`; migrations `030` and `031` were applied on 24 September 2026 after explicit approval.
- Online data state for migrations `010_backfill_email_hash` and `022_backfill_encrypt_pii` was verified by aggregate checks: all 39 users have `email_hash`, and all 39 user email/name values use the encrypted field format.
- A separate staging clone, verified backup restore, and deployed smoke test are still pending.
- Razorpay test-mode credentials and real webhook delivery are not available.
- Five-team customer validation has not been completed.
- OpenTelemetry export, production uptime alerting, and enterprise controls remain future work.

---

## 3. Roadmap map and dependencies

```text
P0 Release readiness
  ├─ staging migrations + health/readiness + backup restore
  ├─ Razorpay test-mode E2E + n8n replay/idempotency verification
  └─ secrets, CI, smoke, monitoring
          ↓
Validation gate: five teams + calibrated baselines
          ↓
v1.7 Intercept hardening
          ↓
v1.8 Review intelligence
          ↓
v1.9 Org / multi-repo visibility
          ↓
v2.0 Platform hardening and scale
          ↓
v2.1 Growth and monetization
          ↓
v2.2 Enterprise controls (demand-gated)
```

Platform hardening, security, documentation, and operational work may run in parallel, but no growth feature should make the release gate less truthful or less reliable.

---

## 4. P0 — Release readiness and controlled launch

**Window:** Immediately, before production traffic
**Owner:** Platform/Infra + Backend + Finance/Operations
**Dependency:** Staging environment, secret manager, database/Redis access, payment test credentials

| ID | Workstream | Deliverable | Status | Evidence required |
| --- | --- | --- | --- | --- |
| REL-01 | Database | Run `alembic upgrade head` online against a production-shaped staging clone; inspect migrations `010`, `022`, `030`, and `031`; verify user, session, repository, index, event, and embedding tenant data. | ✅ Configured Neon OnRamp applied through `031`; clone/restore rehearsal and model-parity migration pending | Migration log, schema queries, row counts, rollback/restore notes |
| REL-02 | Data safety | Verify automated Postgres backups/PITR retention and perform a restore drill into an isolated database. | 🔴 Not started | Restore timestamp, application smoke result, documented RPO/RTO |
| REL-03 | Runtime | Verify `/health`, `/ready`, Redis connectivity, database connectivity, worker connectivity, and graceful dependency degradation. | 🟡 Partially implemented; staging pending | Smoke-test output from the deployed image |
| REL-04 | Secrets | Move database, LLM, GitHub, encryption, billing, and n8n secrets to the production secret manager; rotate the local throwaway database credential. | 🔴 Operator action | Secret inventory and rotation record; no secrets in git/logs |
| REL-05 | Payments | Run Razorpay test-mode checkout → active subscription → cancellation → downgrade using signed webhooks and reconciliation checks. | 🔴 Credentials unavailable | Test transaction IDs, webhook signatures, idempotency result, final subscription state |
| REL-06 | Automation | Exercise n8n inbound replay, timestamp expiry, duplicate delivery, invalid signature, unauthorized team, and outbound delivery behavior. | 🟡 Code tested; live integration pending | Staging n8n run and webhook audit trail |
| REL-07 | CI/CD | Require backend, frontend, SDK, lint, dependency audit, migration SQL, and selected Playwright gates on `main`. | 🟡 Workflows wired; host CI confirmation pending | Green CI run and immutable build/artifact reference |
| REL-08 | Observability | Configure uptime monitoring, error alerting, log retention, and a rollback owner for the launch window. | 🟡 Metrics/logs exist; external alerting pending | Alert test and incident runbook |
| REL-09 | Launch smoke | Deploy the exact candidate artifact, exercise health/readiness, login/cookie session, one repository index, one Q&A request, and one billing read path. | 🔴 Pending staging | Timestamped smoke report tied to the release commit |
| REL-10 | Customer comms | Update pricing, security, privacy, DPA, retention, and status language to match verified capabilities only. | ✅ Truthfulness pass complete; legal review remains | Legal/product sign-off before publication |

### Release gate exit criteria

Production launch is allowed only when:

- The online migration chain and data backfills succeed on a staging clone.
- A backup restores successfully and the restored application passes smoke checks.
- Production-shaped secrets are supplied by the secret manager and rotated where required.
- Razorpay test-mode lifecycle and signed webhook reconciliation pass.
- CI is green and the candidate artifact is reproducible.
- Uptime/error alerts have been tested.
- A rollback plan, owner, and incident window are documented.

---

## 5. Validation gate — prove the wedge before expanding it

**Window:** Immediately after release readiness; blocks v1.7+ feature expansion
**Owner:** Product + Customer Success + Engineering
**Dependency:** Five design-partner teams, interview script, baseline data access

| ID | Activity | Outcome | Status |
| --- | --- | --- | --- |
| VAL-01 | Run the five-team interview protocol in `docs/validation-interview-script.md`. | Evidence on current ramp pain, senior time, alert value, and willingness to pay. | 🔴 Required |
| VAL-02 | Capture a pre-onboarding baseline for each team. | Time-to-first-PR, review turnaround, question volume, senior interruptions, and retention starting point. | 🔴 Required |
| VAL-03 | Calibrate team cost assumptions through `PUT /ramp/cost-model`. | Team-specific ranges replace generic estimates where evidence supports them. | 🟡 Harness built; interviews pending |
| VAL-04 | Measure first-10-day onboarding progress. | Activation, first useful answer, first task/PR, and early stuck signals per team. | 🟡 Endpoint/UI/SDK built; baseline pending |
| VAL-05 | Review results with product and customers. | Decide whether to continue, narrow, or change the wedge before adding scope. | 🔴 Decision gate |
| VAL-06 | Expand the provider-agnostic grounded-answer evaluation harness. | Add representative fixtures, citation/grounding checks, model/provider regression runs, and a reviewed failure taxonomy without treating benchmark scores as customer outcomes. | 🟡 Harness built; production dataset pending |

### Validation decision rule

Do not ship v1.7–v1.9 feature scope until:

- At least three of five leaders show the measured problem is material.
- At least four of five confirm that stuck alerts or self-serve routing are valuable.
- The cost model is plausible for at least three teams or is explicitly narrowed to a different metric.
- The team agrees on a baseline and a follow-up measurement window.

If the evidence fails, update the problem statement and cut scope rather than adding more dashboards.

---

## 6. v1.7 — Intercept hardening

**Theme:** An alert is useful only when it routes a developer to an answer and a leader to an action.
**Window:** After validation; estimated 2–3 weeks
**Dependency:** Existing ramp alerts, repository Q&A, learning paths, wiki, notification system, and WebSocket infrastructure

| ID | Feature | Implementation boundary | Status | Success measure |
| --- | --- | --- | --- | --- |
| INT-01 | Deep-link stuck nudges | Enrich `dev_stuck` notifications with signal, task, and repository context; route to Ask, Learning Path, Wiki, or the failing task. | 🟡 Next | Nudge click-through and self-serve resolution rate |
| INT-02 | Slack intercept | Mirror deduped stuck signals to the configured team channel with Ramp/Ask actions and quiet-hour handling. | 🟡 Next | Useful alert rate; no alert-volume regression |
| INT-03 | Live ramp updates | Publish throttled `ramp_update` events containing team-scoped health/stuck deltas. | 🟡 Next | Reduced polling; no unscoped WebSocket delivery |
| INT-04 | Intercept analytics | Add source-tagged events for stuck → Ask/Wiki/Learn and a team-authorized intercept-stats endpoint. | 🟡 Next | ≥70% self-serve resolution hypothesis validated against baseline |
| INT-05 | Signal hygiene | Clear stale/resolved signals when the underlying task, PR, or conversation is resolved; prevent alert fatigue. | 🟡 Next | Lower repeat-alert rate; faster 48h clearance |

### v1.7 exit criteria

- Every stuck signal has a safe, team-scoped next action.
- A stuck signal can be traced to its originating task and cleared after resolution.
- WebSocket events are tenant-scoped and bounded.
- Interception metrics can be calculated without exposing prompts, source code, or customer content.

---

## 7. v1.8 — Review intelligence

**Theme:** Measure and reduce the review bottleneck without hiding workload or rewarding unsafe speed.
**Window:** After v1.7 intercept data; estimated 3 weeks
**Dependency:** `task_service` transitions, Review Ops, ramp cost model, review queue

| ID | Feature | Implementation boundary | Status | Guardrail |
| --- | --- | --- | --- | --- |
| REV-01 | Review-events ledger | Add append-only, tenant-scoped review events for decision, reviewer, elapsed time, rework, and prior decision. | 🟡 Next | Immutable audit trail; no prompt/code content |
| REV-02 | Turnaround in ramp economics | Feed measured review-cycle time into the ramp cost model and sensitivity band. | 🟡 Next | Show measured vs assumed values |
| REV-03 | Inline reviewer suggestion | Surface the existing task-scoped reviewer suggestion in queue rows and provide an authorized assignment action. | 🟡 Next | Exclude unauthorized/self-review assignments |
| REV-04 | Consistency v2 | Recalculate consistency using rework, variance, and approval stickiness only after enough events exist. | 🟡 Next | Keep null below a documented sample threshold |
| REV-05 | Review accelerators | Attach generated PR description and regression checklist to the review drawer behind a feature flag. | 🟡 Next | Human approval remains mandatory |
| REV-06 | Review quality guardrails | Track escaped defects, reopen rate, and review latency together; do not optimize a single metric. | 🟡 Next | Publish methodology and sample-size caveats |

### v1.8 exit criteria

- Review events are created on every relevant task transition.
- Queue suggestions and assignment actions are authorization-tested.
- Review metrics are reproducible and explainable from the event ledger.
- No metric implies developer quality or productivity from a small, biased sample.

---

## 8. v1.9 — Organization and multi-repository visibility

**Theme:** A single repository is a demo; real teams need a trustworthy portfolio view.
**Window:** After v1.8 and validated org-level demand; estimated 3–4 weeks
**Dependency:** Repository grants, durable index jobs, team health, DORA, existing batch-index work

| ID | Feature | Implementation boundary | Status | Guardrail |
| --- | --- | --- | --- | --- |
| SCALE-01 | Multi-repository rollup | Aggregate repository ownership, language mix, file counts, index freshness, and job health by team. | 🟡 Partially grounded | Team membership required for every repository |
| SCALE-02 | Organization health | Add an explicitly authorized org/portfolio scope with a documented weighted aggregation method. | 🟡 Next | No implicit cross-team access |
| SCALE-03 | Freshness signal | Surface index/wiki freshness as a small health component until interviews justify a standalone P4 product. | 🟡 Next | Label stale and unknown states separately |
| SCALE-04 | DORA × ramp view | Join deployment frequency/lead time to ramp and retention views without inventing causality. | 🟡 Next | Correlation is not presented as causation |
| SCALE-05 | Batch autopilot | Extend existing single-repo orchestration to bounded, idempotent multi-repo batches. | 🟡 Existing batch indexing is built; orchestration remains | Per-repo authorization, rate limits, retries, and partial failure reporting |
| SCALE-06 | Portfolio retention/deletion | Make repository deletion remove derived documents, embeddings, graph data, and queued jobs consistently. | ✅ Core cleanup built; portfolio UX pending | Verify no orphaned derived data |

### v1.9 exit criteria

- A three-repository team can see freshness and health without leaking another team's data.
- Organization aggregates are reproducible from member-team data.
- Multi-repo jobs expose per-item success, retry, and cancellation state.
- DORA and ramp measures are shown as separate, methodologically honest signals.

---

## 9. v2.0 — Platform hardening, reliability, and scale

**Theme:** Make the platform boringly dependable before adding more surface area.
**Window:** Parallel with v1.7–v1.9; estimated 3–6 weeks
**Dependency:** Ongoing; no feature may bypass tenant/auth/test gates

### 9.1 Correctness and API contracts

| ID | Work | Status | Exit evidence |
| --- | --- | --- | --- |
| OPS-01 | Re-audit `GAPS.md` against the current code; close or explicitly accept billing `None` returns, architecture error semantics, WebSocket null handling, Redis failure logging, route-header logging, missing OpenAPI 404s, and the model/schema drift reported by `alembic check`. | 🟡 Re-audit required | Regression test and issue disposition for each gap |
| OPS-02 | Move response envelopes out of body-buffering middleware where practical; make SSE exclusions explicit and test streaming under load. | 🟡 Partial exclusion exists | No buffering/regression for `/ask/query/stream` |
| OPS-03 | Validate digest schedules, provider configuration, webhook payloads, and external-service timeouts at write time. | 🟡 Verify | Negative tests for invalid configuration |
| OPS-04 | Complete the Firestore/dynamic-document migration plan or document the supported compatibility boundary. | 🟡 Partial | Typed data inventory and migration decision |

### 9.2 Runtime and data reliability

| ID | Work | Status | Exit evidence |
| --- | --- | --- | --- |
| OPS-05 | Queue-backed digests, batch notifications, report generation, and index maintenance with bounded retries and dead-letter handling. | 🟡 Partial | Worker failure/retry dashboard and runbook |
| OPS-06 | Define Redis cache persistence, invalidation, and graceful-degradation semantics per surface. | 🟡 Partial | Cache hit/miss dashboards and documented behavior |
| OPS-07 | Validate DB pool sizing, worker count, provider quotas, and backpressure under expected load. | 🟡 Pending staging | p95 latency and saturation report |
| OPS-08 | Add data retention, account deletion, export, and audit-tombstone workflows for PII and derived repository data. | 🟡 Partial | End-to-end deletion/export test with audit evidence |
| OPS-09 | Expand Prometheus metrics into provider cost/latency dashboards and optional OpenTelemetry export without exporting prompts, responses, secrets, or customer identifiers. | 🟡 Bounded metrics built; OTel future | Dashboard and exporter contract |

### 9.3 Supply chain and delivery

| ID | Work | Status | Exit evidence |
| --- | --- | --- | --- |
| OPS-10 | Keep `ruff`, frontend lint/type checks, `pip-audit`, `npm audit`, migration SQL checks, and Playwright required in CI. | 🟡 Wired; host confirmation pending | Green protected-branch run |
| OPS-11 | Add dependency review, lockfile drift checks, artifact provenance, and release signing where supported by the deployment target. | 🟡 Next | CI policy and release artifact record |
| OPS-12 | Add p95 API/SSE budgets, bundle-size budgets, and Lighthouse budgets to CI. | 🟡 Next | Performance report stored per release |
| OPS-13 | Maintain rollback, incident response, dependency outage, and customer-communication runbooks. | 🟡 Next | Tabletop exercise completed |

### v2.0 exit criteria

- The current gap audit has no unowned high-severity item.
- Streaming, queues, Redis, and database failure modes are tested and observable.
- Data export/deletion and backup restoration are proven.
- CI and performance gates protect the release branch.
- OTel is optional and bounded; Prometheus remains the baseline.

---

## 10. v2.1 — Growth, monetization, and product-led adoption

**Theme:** Turn validated wedge value into sustainable adoption without changing the core problem.
**Window:** After v2.0 reliability and Razorpay E2E; estimated 4–6 weeks
**Dependency:** Five-team evidence, stable billing, trustworthy metrics, support capacity

| ID | Workstream | Roadmap item | Status | Guardrail |
| --- | --- | --- | --- | --- |
| GROW-01 | Activation | First-10-day onboarding checklist, role-specific paths, first useful answer, and first-PR milestones. | 🟡 Progress endpoint/UI/SDK built; activation loop next | Measure activation, not vanity signups |
| GROW-02 | Expansion | Team-level usage, seat/team limits, invitations, and expansion prompts tied to actual value events. | 🟡 Next | Never pressure users with unverified savings claims |
| GROW-03 | Billing | Surface metered LLM spend, credits, plan limits, invoices, and downgrade paths transparently. | 🟡 Partial | Reconcile every charge with usage records |
| GROW-04 | Developer adoption | Publish generated API docs, SDK examples for Ramp/Repositories/Onboarding, and quickstarts for CI and MCP. | 🟡 SDK expanded; portal/examples next | Examples must use tenant-safe auth |
| GROW-05 | Content | Turn validated ramp/review evidence into anonymized, methodologically transparent case studies. | ⏸️ Evidence-gated | No invented customers, testimonials, or outcomes |
| GROW-06 | Marketplace | Mature playbooks only after internal usage proves value; add ratings/installs only with moderation and abuse controls. | ⏸️ Deprioritized | Ecosystem work must not displace the wedge |
| GROW-07 | Lifecycle | Transactional email, Slack, and in-product guidance for onboarding, stuck signals, billing, and incidents. | 🟡 Partial | Deliverability and unsubscribe controls required |

### v2.1 exit criteria

- Activation and retention can be measured from first login through first PR.
- Billing is understandable, reconciled, and reversible.
- SDK/API examples work against a clean environment.
- Public claims are linked to evidence or clearly labeled as estimates.

---

## 11. v2.2 — Enterprise controls (demand-gated)

**Theme:** Build controls when a real customer, contract, or regulatory obligation requires them.
**Window:** No committed date; revisit at deal review
**Dependency:** Signed design-partner requirement and explicit scope/owner

| ID | Control | Trigger | Current posture | Required proof |
| --- | --- | --- | --- | --- |
| ENT-01 | Production SSO/OIDC | Enterprise deal requires centralized identity | Scaffold only; not a production claim | Provider conformance, key rotation, JIT/session tests, recovery runbook |
| ENT-02 | SAML | Enterprise deal requires SAML | `sso_service.py` scaffold exists; requires security review and protocol tests | Signed assertion validation, replay protection, tenant mapping |
| ENT-03 | SCIM provisioning | Customer requires automated user lifecycle | Not committed | Deactivate/disable behavior, group mapping, audit trail |
| ENT-04 | Admin MFA and session policy | Privileged production access requires stronger authentication | Not committed | phishing-resistant factor, recovery, lockout, break-glass procedure |
| ENT-05 | Audit export and retention | Contract requires export or defined retention | Audit foundation exists; export/retention policy next | Immutable export, access control, deletion/retention tests |
| ENT-06 | Data residency/self-host/VPC | Contract requires deployment or storage control | Self-host compose exists; no VPC product | Isolated deployment, upgrade path, restore runbook |
| ENT-07 | Multi-org analytics | Customer operates multiple teams under one org | Team-scoped foundation exists | Explicit org grants, weighted metrics, cross-team tests |
| ENT-08 | SLA/status page | Paid contract requires uptime commitment | Internal health endpoints exist | External status, alert escalation, incident communication |
| ENT-09 | Enterprise support | Contract requires response targets | Not committed | Severity taxonomy, on-call ownership, customer communication templates |

### Enterprise gate

Do not begin an enterprise control merely because a scaffold exists. Require a named customer requirement, acceptance criteria, security review, support owner, and maintenance plan first.

---

## 12. Long-term and exploratory roadmap

These are deliberately not scheduled. They require evidence or an explicit strategy change.

| Area | Option | Revisit trigger |
| --- | --- | --- |
| Ecosystem | Public playbook marketplace and community content | Internal playbook usage and moderation capacity are proven |
| Developer surface | VS Code extension for repository walkthroughs and pair programming | Sustained usage of Silent Pair Programming and a supported extension owner |
| Local models | Self-hosted/Ollama enterprise offering | Customer data-residency or air-gapped requirement |
| Research | Autonomous coding and broader issue-to-PR automation | Demonstrated review quality, rollback safety, and customer demand |
| Platform pivot | AIaaS gateway as a separate business | Explicit board/product decision; it is not part of the current onboarding wedge |
| Advanced analytics | Causal ROI, skill graphs, and predictive ramp modeling | Sufficient longitudinal data and transparent methodology |

---

## 13. Cross-cutting workstreams

These apply to every roadmap phase and are not optional “later” work.

### Security and trust

- Maintain tenant isolation and membership checks for every new read/write/event path.
- Keep replay protection, signature verification, idempotency, and revocation in place.
- Rotate secrets and encryption keys through the secret manager.
- Treat repository source, prompts, embeddings, audit records, and telemetry as sensitive data.
- Keep public security/compliance language truthful and review it with legal before publication.

### Data and privacy

- Minimize collection; document purpose, retention, deletion, and access paths.
- Encrypt sensitive fields and avoid logging request bodies or source content.
- Make tenant export/deletion cover derived documents, embeddings, graph data, jobs, and sessions.
- Record data lineage for index and benchmark records.

### Reliability

- Define SLOs for API availability, index freshness, job completion, Q&A latency, and alert delivery.
- Use bounded timeouts, retries with jitter, circuit breakers, idempotency, and dead-letter handling.
- Test dependency outages, partial batch failures, queue restarts, Redis loss, and database failover.
- Keep `/health` for liveness and `/ready` for dependency readiness.

### Developer experience

- Every external API has typed SDK coverage, examples, authentication guidance, and contract tests.
- Every long-running operation has a job/status/cancellation contract.
- Every migration has online/offline behavior documented and an append-only rollback policy.
- Keep local, CI, and staging configuration shapes documented without copying secrets.

### Customer success and evidence

- Maintain a customer-validation record for every material product claim.
- Review activation, first-10-day progress, first-PR time, alert usefulness, support burden, and retention.
- Treat user feedback as evidence, not as a substitute for measurement.

### Legal and communications

- Keep privacy, terms, DPA, retention, security, and pricing pages synchronized with actual behavior.
- Do not publish “SOC 2 certified,” “GDPR compliant,” customer logos, or savings claims without the required evidence and review.
- Maintain a changelog entry for behavior changes, migrations, and breaking API changes.

---

## 14. Metrics and measurement plan

### Product outcomes

| Metric | Definition | First use |
| --- | --- | --- |
| Time to first merged PR | Median elapsed time from team join/first task to first merged PR | Baseline in VAL-02, compare after v1.7 |
| Senior minutes per new developer | Measured review/question/re-engagement minutes, split by source | Ramp cost model and interviews |
| Self-serve resolution | Stuck-sourced questions resolved through Ask/Wiki/Learn without senior escalation | v1.7 intercept analytics |
| Stuck-signal latency | Time from qualifying stall to leader notification | v1.4/v1.7 operational metric |
| Review turnaround | Time from review request to decision, with rework shown separately | v1.8 |
| Ramp health | Existing composite score with component drill-down | v1.6, method documented |
| Retention/activation | Join-relative retention and first-10-day progress | VAL-04 and v2.1 |

### Operational metrics

- API p50/p95/p99 latency and error rate by route.
- Q&A/SSE time to first token and completion failures.
- Index queue depth, job success/retry/cancel rate, and index freshness.
- WebSocket connection count, delivery failures, and reconnect rate.
- Provider request latency, error class, token/cost attribution, and fallback rate.
- n8n/webhook signature failures, replay blocks, idempotent duplicates, and delivery latency.
- Database pool utilization, Redis hit/miss/failure rate, and queue dead letters.

### Business metrics

- Activation: team reaches first useful indexed answer and first assigned task.
- Paid conversion and expansion, with refunds/downgrades reconciled to billing events.
- Support contacts per active team and time to resolution.
- Retention by cohort and plan, without implying causation from benchmark models.

Every dashboard must show its time window, sample size, source, and known limitations.

---

## 15. Decision gates and kill criteria

### Stop or narrow a feature when

- It does not trace to a validated onboarding/review/visibility pain.
- It adds unscoped data access, unreviewed AI output, or an unrecoverable migration.
- It increases senior workload, alert volume, or support burden without a measured benefit.
- It relies on invented customer evidence, unverified pricing, or compliance language.
- It cannot be tested with a tenant boundary, failure mode, and rollback plan.

### Required gates

- **Security gate:** threat model, tenant/auth tests, secret handling, and data classification complete.
- **Data gate:** migration, backup, retention, deletion, and rollback plan complete.
- **Reliability gate:** timeout, retry, idempotency, queue, and dependency-outage tests complete.
- **Customer gate:** baseline and success metric defined before claiming improvement.
- **Launch gate:** CI, staging smoke, payment test, monitoring, and rollback evidence complete.

---

## 16. Definition of Done

A roadmap item is done only when:

1. The user/problem outcome and non-goals are documented.
2. Acceptance criteria and failure behavior are explicit.
3. Tenant/authz tests cover allowed, denied, and cross-tenant cases.
4. Unit and integration tests cover happy path, malformed input, dependency failure, and retries where relevant.
5. API/SDK/OpenAPI documentation is updated for externally visible behavior.
6. Metrics and logs are bounded and do not contain secrets or customer content.
7. Migrations are append-only and have online/offline behavior documented.
8. CI passes and a staging smoke test is attached for release-affecting work.
9. Product, engineering, and security/legal reviewers approve their respective concerns.
10. The changelog and `STATUS.md` reflect the actual state.

---

## 17. Working cadence and ownership

- **Weekly:** release-gate status, customer validation evidence, security/reliability risks, and dependency health.
- **Per phase:** review scope against the problem statement and remove work that is not measurable.
- **Per release:** tag the exact candidate, attach test/smoke/migration evidence, and record rollback owner.
- **Monthly:** review activation, retention, support burden, cost, and reliability trends with product and customer success.
- **Quarterly:** re-evaluate enterprise triggers, shelved items, and whether the wedge should be narrowed or expanded.

Suggested accountable roles:

| Area | Accountable role |
| --- | --- |
| Wedge and customer evidence | Product + Customer Success |
| Backend/API/data | Backend lead |
| Web/E2E/accessibility | Frontend lead |
| Platform/SRE/security | Platform/Infra + Security |
| Billing/operations | Finance/Operations |
| Legal/privacy/claims | Legal/Privacy reviewer |

---

## 18. Versioning policy

- Use SemVer; breaking API changes require a major version.
- Keep `/api/v1` stable through v1.x; add versioned endpoints for incompatible changes.
- Treat Alembic migrations as append-only after release; never rewrite a shipped migration without a documented recovery plan.
- Tag releases from `main` only after CI, staging, and smoke evidence pass.
- Maintain `CHANGELOG.md` for user-visible behavior, security fixes, migrations, and breaking changes.
- Keep `STATUS.md` as the current implementation snapshot and update it in the same change as shipped work.

---

## 19. Source documents

- `STATUS.md` — current implementation, test counts, blockers, and truthfulness notes.
- `PROBLEM.md` — problem statement, personas, working cost assumptions, and success hypotheses.
- `features_mvp.md` — historical release-readiness audit; re-verify before using as a gate.
- `versions.md` — historical version plan; this roadmap supersedes its future sequencing.
- `GAPS.md` — code audit; re-check statuses against the current tree.
- `docs/DEPLOYMENT.md` — migration, deployment, observability, and staging runbook.
- `docs/validation-interview-script.md` — five-team validation protocol.

---

*This is a living roadmap. Update it when evidence changes, not merely when code ships. Every future item must name the problem it serves, the evidence that will validate it, and the safety boundary that prevents it from damaging trust.*
