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
3. Complete-bus workflow:
   - Open **Send Telegram** → create/select a **Telegram Bot** credential
     (talk to `@BotFather` → `/newbot` → paste the token into n8n).
   - Change `@your_channel` in **Format Telegram Message** to your channel/chat id.
   - Open **Send Slack** / **Send Escalation** → create/select a **Slack OAuth2** credential,
     confirm `#onboarding` / `#onboarding-alerts` channels exist.
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
