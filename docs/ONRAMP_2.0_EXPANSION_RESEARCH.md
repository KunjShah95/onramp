# Onramp 2.0 — Future Expansion & Improvement Research (record)

Date: 2026-09-23. Read-only review of backend, web, SDK, n8n, deployment.
No tracked files were changed by the research pass itself.

## Executive conclusion (from research)

Foundation strengths: repo context/graph, onboarding paths, ramp visibility,
multi-provider routing, agent workflows, team/HR/billing surfaces.
Priority is not more agents/pages. Make existing product tenant-safe,
truthful, reliable, measurable, and useful in the first 10 days.

## P0 findings (recorded)

- Tenant isolation: `/ask/index` accepted unrestricted `repo_path`;
  indexes deterministic/unscoped; agent bus fell back to global fan-out;
  session/bus endpoints lacked strict team checks.
- Claims: source-retention, SOC 2 Type II, named customers/testimonials,
  SAML/MFA/residency/immutable-log claims unverified.
- Dependency/CI: 15 frontend vulns (1 critical/5 high), unused Neon dep,
  `continue-on-error` audits, no SDK workflow, no n8n validation.

## Remediation applied 2026-09-23 (this branch)

Backend:
- `backend/app/api/v1/ask.py`: `/index` now requires auth, accepts only
  https:// repo URLs, clones to isolated temp dir, rejects local paths.
- `backend/app/services/agent_bus.py`: removed global WS fan-out; events
  without `team_id` are persisted/local-only. `team_id` persisted to
  `onramp_agent_events`. `list_events(team_id=...)` added.
- `backend/app/api/v1/agent_sessions.py`: create/list require team
  membership; unfiltered list returns only owned/member sessions;
  `/agent-bus/events` requires `team_id` + membership;
  `/agent-bus/publish` requires `payload.team_id` + membership + session access.

Web claims:
- Pricing/landing enterprise + FAQ: SOC 2 marked "in progress", source
  retention states encrypted excerpts/embeddings with export/deletion.
- Customers page: anonymized design-partner testimonials, TBD metrics.
- Security page: softened keys/SSO/MFA/residency/audit/GDPR to actual/roadmap.
- Blog SOC 2 post retitled as work-in-progress.

Hygiene/CI:
- Removed `@neondatabase/neon-js`, bumped `react-router-dom` 7.11.0 → 7.18.4.
- Frontend + backend audits now blocking (removed `continue-on-error`).
- Added `.github/workflows/sdk.yml` (install/typecheck/audit/test/build).
- Removed legacy Neon OAuth helpers and test mock.

## Still open (Phase 0 remainder)

- Tenant-scoped `repository_context` table + opaque index IDs (design in
  research report; not yet migrated).
- team_id/user_id through every Celery task; two-team isolation tests.
- Durable jobs for /ask/index, /autopilot/run, /explore/analyze.
- Redis/Postgres for ASK sessions; incremental multi-repo indexing; evals.
- Full backend suite in clean env; npm audit re-run after lockfile update;
  Playwright cookie-auth contract tests; lint ratchet.
- Trust Center page (`/trust`) + STATUS/ROADMAP/PRODUCT reconciliation.
- Legal review for EU AI Act employment-signal use.

See also: `docs/TRUST_CENTER.md`.
