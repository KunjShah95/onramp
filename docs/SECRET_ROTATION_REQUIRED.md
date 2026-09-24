# Secret rotation required — 2026-09-24

The local workspace contains ignored files `backend/.env` and `backend/.env.backup`
with production-looking credentials. They were not included in git, but they must
be treated as exposed to every process/user that can read this workstation.

## Immediate operator actions

1. Revoke and rotate the database credential, GitHub PAT/OAuth secrets, provider
   API keys, webhook secrets, PII/GitHub token encryption keys, API-key HMAC
   secret, JWT secret, and n8n HMAC/inbound secrets.
2. Delete `backend/.env` and `backend/.env.backup` from this workstation and
   backups after confirming the replacement values are in the deployment secret
   manager.
3. Search repository history, CI logs, Render logs, and backups for the old
   values. Do not paste any value into an issue or chat.
4. Re-encrypt data encrypted with rotated PII/GitHub-token keys before deleting
   the old key material.
5. Confirm `N8N_ALLOWED_TEAM_IDS` is set before enabling inbound automation in
   production.

## Code changes in this pass

- User-configured outbound integrations reject private/loopback/link-local and
  reserved destinations.
- n8n, Telegram, Slack, Jira, and generic webhook paths use the shared outbound
  URL policy and do not follow redirects.
- GitHub PR/Autopilot repository access requires a registered repository owned
  by a team the caller belongs to.
- The Git remote-helper fallback was removed after strict clone validation.
- Slack and contributor webhook verification fail closed.
- Team, task, billing, playbook, quiz, and contributor routes now enforce more
  explicit tenant/role boundaries.

This document intentionally contains no secret values.
