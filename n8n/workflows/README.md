# n8n Workflows — ready to import

Two directly-importable workflows for the faculty. No manual node building needed.

| File | Direction | Trigger | What it does |
|---|---|---|---|
| `onramp-complete-bus.json` | Onramp → n8n | Webhook `POST /webhook/onramp` | Routes every Onramp event: `onboarding.*` → Telegram, `task.*` → Slack `#onboarding`, `ramp.*`/`pr.merged` → Slack `#onboarding-alerts`, `test.ping` → `ok` |
| `onramp-inbound-task-seeding.json` | n8n → Onramp | Schedule daily 08:00 | Builds a `create_task` payload, HMAC-signs it with `N8N_INBOUND_SECRET`, `POST`s to `/api/v1/webhooks/n8n` |

Regenerate after editing the generator: `python scripts/generate_n8n_workflows.py`

## Import (2 minutes per workflow)

1. Start n8n: `docker compose --profile n8n up -d` → open http://localhost:5678
2. Workflows (left sidebar) → `⋯` → **Import from File** → select the `.json`
3. Complete-bus workflow — **Slack setup (Incoming Webhooks, no OAuth)**:
   - Go to https://api.slack.com/apps → **Create New App** → **From scratch**
   - **Incoming Webhooks** → toggle On → **Add New Webhook to Workspace**
   - Pick `#onboarding` → copy the webhook URL (starts with `https://hooks.slack.com/...`)
   - Repeat → pick `#onboarding-alerts` → copy that URL too
   - In n8n: **Settings → Environment Variables** → add:
     - `SLACK_WEBHOOK_ONBOARDING` = first URL
     - `SLACK_WEBHOOK_ALERTS` = second URL
   - **Telegram** (optional): Open **Send Telegram** → create/select a **Telegram Bot** credential
     (talk to `@BotFather` → `/newbot` → paste token). Set `TEAM_TELEGRAM_CHAT_IDS` to a JSON object mapping each `team_id` to its own chat id, for example `{"team-a":"-1001234567890"}`. Events without a team-specific target are not delivered to a global channel.
   - Toggle **Active** (top-right). Copy the **Production URL**
     (`https://<n8n-host>/webhook/onramp` — never the `/webhook-test/` URL).
4. Inbound workflow:
   - n8n → Variables/Env: set `N8N_INBOUND_SECRET` to the SAME value as the
     backend's `N8N_INBOUND_SECRET`.
   - Edit **Build Task Payload** → set your real `team_id`.
   - Edit **POST to Onramp** → set your backend URL
     (from inside Docker use `http://host.docker.internal:8000/...` on
     Docker Desktop, or your backend host — `localhost` inside the n8n
     container points at n8n itself, not your laptop).
   - Toggle **Active**, then **Execute Workflow** once manually.
5. Back in Onramp: Settings → Integrations → **n8n** → paste the production
   webhook URL → **Test connection** → **Connect** → **Fire event**.

## Production (Render `onramp-n8n`)

1. Blueprint already creates `onramp-n8n` (`Dockerfile.n8n`, `/healthz`, disk
   `/home/node/.n8n`). After first deploy set `WEBHOOK_URL=https://<your-n8n>.onrender.com/`
   and `N8N_INBOUND_SECRET` = backend's value, then redeploy.
2. Import the `.json` files, recreate Slack OAuth2 with redirect
   `https://<your-n8n>.onrender.com/rest/oauth2-credential/callback`, Activate.
3. Set `N8N_ALLOWED_TEAM_IDS` in the backend environment to a comma-separated allow-list of team IDs that this automation may modify. Leave it unset only in a trusted single-tenant development environment.
4. Inbound workflow: POST to `https://<onramp-api>.onrender.com/api/v1/webhooks/n8n`.
5. Verify: `GET /integrations/n8n/status` → `env_configured:true, inbound_configured:true`.
