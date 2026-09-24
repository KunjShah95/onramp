# Trust Center (living document — verify before selling)

Last updated: 2026-09-23. Status: DRAFT — items marked Roadmap are not implemented.

## Architecture & data flow

- Repos connect via GitHub App/URL → isolated clone → parse → dependency
  graph → embeddings → tenant-scoped index. Raw clones discarded after index.
- Retained: encrypted code excerpts + embedding chunks + graph/symbols,
  scoped to workspace. Export/deletion on request (contact support).
- LLM routing: free-first multi-provider; BYOK keys stored per team.

## Retention

- Indexes: TTL/eviction per deployment (default 24h context cache; embedding
  rows until repo deleted or re-indexed). Backup/restore tests: PENDING.
- Logs/events: agent events retained for audit; unscoped legacy rows are
  never broadcast.

## Subprocessors / infra

- Hosting: cloud provider per deployment (see render.yaml / deploy docs).
- Status/uptime: no public SLA yet except Enterprise 99.9% (contractual).

## Encryption

- In transit: TLS 1.3 min. At rest: AES-256 platform-managed keys.
- Per-tenant BYOK + 90-day rotation: ROADMAP (Enterprise).

## Access control

- Auth: cookie JWT. SSO/SAML/OIDC, SCIM, MFA-admin: ROADMAP.
- Authorization: team membership enforced on sessions/events (2026-09-23);
  row-level security: IN PROGRESS.

## Compliance

- SOC 2 Type II: IN PROGRESS, not certified. GDPR controls: IN PROGRESS.
- DPA available on request. Data residency: single region today; US/EU: ROADMAP.
- Incident history: none published yet; process: contact security team.

## Verify before claiming

Do not state certified/compliant/residency/immutable-logs until audit
artifacts exist. Update this file with dates + report links when complete.
