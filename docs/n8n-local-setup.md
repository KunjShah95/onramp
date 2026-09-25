# n8n — Local Setup Runbook (Windows / Git Bash)

How n8n runs **on this device**, how to start it day-to-day, and the gotchas hit during setup.
For the workflow import + production (Render) guide see [`n8n/workflows/README.md`](../n8n/workflows/README.md);
for the Telegram onboarding design see [`docs/n8n-telegram-onboarding.md`](./n8n-telegram-onboarding.md).

## How it fits together

```
OUTBOUND:  Onramp backend (uvicorn :8000)
             └─ n8n_service.notify(event, payload)  ← task.*, onboarding.*, ramp.*, pr.* events
                  └─ HMAC-signed POST (X-Onramp-Signature) → http://localhost:5678/webhook/onramp
                       └─ n8n "Complete Automation Bus" workflow
                            └─ Telegram Bot credential → chat 5685985489 (Varad @Boss_17OP)

INBOUND:   n8n "Nightly Task Seeding" workflow (08:00 UTC cron)
             └─ signs payload (X-N8N-Signature = HMAC(timestamp.body, N8N_INBOUND_SECRET))
                  └─ POST http://host.docker.internal:8000/api/v1/webhooks/n8n
                       └─ backend creates task (idempotency_key dedupes replays)
```

## Daily run

```bash
# 1. Infrastructure (n8n + postgres + redis; n8n is behind the "n8n" compose profile)
docker compose --profile n8n up -d

# 2. Backend (separate terminal — it is NOT in Docker on this device)
cd backend
./.venv/Scripts/python.exe -m uvicorn app.main:app --port 8000

# 3. Frontend (optional)
cd web && npm run dev          # http://localhost:5173
```

| Service | URL | Notes |
|---|---|---|
| n8n UI | http://localhost:5678 | login `admin@onramp.local` (password set during setup — not committed; see your password manager) |
| Backend | http://localhost:8000 | `/health`, `/docs` |
| Outbound webhook | http://localhost:5678/webhook/onramp | production URL (never `/webhook-test/`) |
| Inbound webhook | `POST http://localhost:8000/api/v1/webhooks/n8n` | HMAC required |

Stop everything: `docker compose --profile n8n down` (keeps data; add `-v` to wipe volumes — this deletes n8n workflows/credentials, they live in the `n8n_data` volume).

## One-time setup (already applied on this device)

Re-run these only if you reset volumes or move to another machine.

1. **Root `.env`** (used by docker compose):
   - `N8N_INBOUND_SECRET=...` — must match `backend/.env`
   - `TELEGRAM_CHAT_ID=5685985489` — default Telegram DM target
2. **`backend/.env`**:
   - `N8N_WEBHOOK_URL=http://localhost:5678/webhook/onramp` (outbound fan-out)
   - `N8N_INBOUND_SECRET=...` (inbound verification; fail-closed if unset)
   - `N8N_HMAC_SECRET=...` (signs outbound payloads; optional but prod-parity)
   - **Restart uvicorn after changing these** — env is read at boot, the status API shows
     `hmac_outbound/inbound_configured` so you can confirm: `GET /api/v1/integrations/n8n/status`.
3. **`docker-compose.yml`** n8n service passes through: `N8N_INBOUND_SECRET`,
   `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` (lets Code nodes read `$env.N8N_INBOUND_SECRET`),
   `NODE_FUNCTION_ALLOW_BUILTIN=crypto` (HMAC signing in Code nodes), `TELEGRAM_CHAT_ID`.
4. **n8n owner account**: `admin@onramp.local` (created via
   `POST /rest/owner/setup` — the UI would also prompt on first visit; password is
   local-only and intentionally not committed to this repo).
5. **Test user for smoke tests**: `n8n-local-test@example.com` (password local-only,
   not committed) — a throwaway account used to exercise the integration APIs.
6. **Workflows**: imported via CLI with fixed ids `onramp-bus` / `onramp-seed`, both **active**.
   The seed workflow's `team_id` is set to `6bf8835b-…` ("QA Mobile's Team") and its POST URL
   to `http://host.docker.internal:8000/api/v1/webhooks/n8n`.
7. **Telegram credential**: named **`Telegram Bot`** with id `1` — the id/name match the
   `Send Telegram` node's credential reference so it binds automatically.

## Verify it works (60-second smoke test)

```bash
# n8n up?
curl -s http://localhost:5678/healthz

# Outbound webhook path (bus workflow answers "ok" for test.ping)
curl -s -X POST http://localhost:5678/webhook/onramp \
  -H 'Content-Type: application/json' \
  -d '{"event":"test.ping","source":"onramp","timestamp":0,"data":{}}'

# Backend sees the integration?
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"n8n-local-test@example.com","password":"<local-test-password>"}' \
  | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
curl -s http://localhost:8000/api/v1/integrations/n8n/status \
  -H "Authorization: Bearer $TOKEN" | grep -oE '"(env_configured|hmac_outbound|inbound_configured)":[a-z]+'

# Full real event: create team + task, then assign → fires task.assigned → n8n → Telegram
# (see POST /api/v1/teams, POST /api/v1/tasks, POST /api/v1/tasks/{id}/assign)
```

Then check **n8n UI → Executions** (bus workflow) — every real event should show `success`,
and the Telegram message should arrive in the configured chat.

## Gotchas (hit for real on this device)

- **Git Bash mangles paths in `docker exec`** — `/tmp/x.json` becomes `C:/Users/.../Temp/x.json`.
  Prefix container-path commands with `MSYS_NO_PATHCONV=1`.
- **CLI `import:workflow` requires an `id` field** in the JSON (repo workflow files ship without
  one; the UI import auto-generates). Inject e.g. `j.id='onramp-bus'` first or you get
  `SQLITE_CONSTRAINT: NOT NULL constraint failed: workflow_entity.id`.
- **CLI cannot activate workflows in regular (non-queue) mode** — `--activeState=fromJson` errors
  out. Activate via UI toggle, or `POST /rest/workflows/{id}/activate` with `{"versionId": ...}`
  from a cookie-authenticated session (login via `POST /rest/login` with
  `{"emailOrLdapLoginId": ...}`).
- **`n8n execute --id=...` doesn't work for cron-triggered workflows** (needs an Execute Workflow
  Trigger node) and conflicts with the running instance's task broker. To test the seed workflow,
  click **Execute Workflow** in the UI.
- **`localhost` inside the n8n container is n8n itself** — the backend running on the host is
  reachable at `host.docker.internal:8000`, not `localhost:8000`.
- **`docker compose up -d n8n` recreates the container and wipes `/tmp`** inside it — re-copy any
  files you had staged there. Workflow/credential data is safe (it's in the `n8n_data` volume).
- **Credential id must match the workflow node's reference** (`credentials.telegramApi.id`) or the
  node runs unbound and Telegram delivery silently no-ops (`onError: continue`).
- **Backend env changes need a uvicorn restart** — `.env` is only read at process start.
- **Python 3 is missing inside the n8n container** → harmless "Python task runner" log line; JS
  Code nodes run fine.

## Secrets & hygiene

- All values here are **local-dev only**. Rotate `N8N_INBOUND_SECRET` / `N8N_HMAC_SECRET` /
  `N8N_ENCRYPTION_KEY` before any shared or production use, and set `N8N_ALLOWED_TEAM_IDS`
  (comma-separated team allowlist) — the backend enforces it in `ENV=production`.
- The Telegram bot token in use was shared over chat; revoke it via @BotFather `/revoke` and
  re-import the credential if this machine is ever shared.
- Per-team chat routing: set `TEAM_TELEGRAM_CHAT_IDS` on the n8n container as a JSON map
  `{"<team_id>": "<chat_id>"}` — the bus workflow's Normalize Event node reads it.
