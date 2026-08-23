# Onboarding → Telegram via n8n

Faculty wants every onboarding session event mirrored to Telegram.

## Architecture

```
Onramp (FastAPI)
  onboarding_plan_service.create_plan / complete_milestone / complete_preboarding / submit_pulse
    └─▶ n8n_service.notify_onboarding(event, payload) ──POST─▶ n8n Webhook
                                                            └─▶ Telegram Bot node → channel / DM
```

All publishes are **fire-and-forget** (no request blocked, no hard failure when n8n is down).

## Events emitted

| event | when |
|---|---|
| `onboarding.plan_created` | `POST /api/v1/onboarding-plans` |
| `onboarding.plan_updated` | `PATCH /api/v1/onboarding-plans/{id}` |
| `onboarding.plan_generated` | `POST /api/v1/onboarding-plans/generate` (AI) |
| `onboarding.milestone_completed` | `POST /api/v1/onboarding-plans/milestones/{id}/complete` |
| `onboarding.preboarding_completed` | `POST /api/v1/onboarding-plans/pre-boarding/{id}/complete` |
| `onboarding.pulse_submitted` | `POST /api/v1/onboarding-plans/{id}/pulse` |
| `onboarding.test` | `POST /api/v1/integrations/telegram/test` |

**Payload shape** (POST to n8n):
```json
{
  "event": "onboarding.milestone_completed",
  "source": "onramp",
  "timestamp": 1715020000,
  "data": { "milestone": {...}, "plan": { "id":"...", "team_id":"...", "user_id":"...", "status":"draft" } }
}
```

If `N8N_HMAC_SECRET` is set, the request carries `X-Onramp-Signature: sha256=<hex>` and `X-Onramp-Timestamp` — verify in n8n's Function node.

## 1. Create the Telegram bot

1. Talk to `@BotFather` → `/newbot` → note `TELEGRAM_BOT_TOKEN`.
2. Add the bot to the faculty channel (make it admin if you want it to post), or DM it.
3. Get the `chat_id`:
   ```bash
   curl https://api.telegram.org/bot<TOKEN>/getUpdates
   # channel: look for channel_post.chat.id (e.g. -100123456789)
   # DM: message.chat.id
   ```

## 2. n8n workflow (import this)

n8n → Workflows → **Import from file** → paste `docs/n8n-workflow-onboarding-telegram.json`.

Flow: **Webhook (POST /onramp-onboarding)** → **Function (format message)** → **Telegram (sendMessage)**.

Webhook URL will be like `https://n8n.yourdomain.com/webhook/<uuid>` — copy it.

## 3. Wire Onramp to n8n

### Option A — env (global, zero code)

```bash
# backend/.env
N8N_ONBOARDING_WEBHOOK_URL=https://n8n.yourdomain.com/webhook/<uuid>
# optional
N8N_HMAC_SECRET=change-me-random-32
```

Restart API. Verify:

```bash
curl -H "Authorization: Bearer <jwt>" https://api.yourdomain.com/api/v1/integrations/telegram/status
# → { env_configured: true }
```

### Option B — per-team (no restart, faculty self-serve)

```bash
curl -X PUT https://api.yourdomain.com/api/v1/integrations/telegram/config \
  -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" \
  -d '{"team_id":"<team_uuid>","webhook_url":"https://n8n.yourdomain.com/webhook/<uuid>","telegram_chat_id":"-100123456789"}'
```

Team webhook wins over env for that team's events.

## 4. Test in one click

```bash
curl -X POST https://api.yourdomain.com/api/v1/integrations/telegram/test \
  -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" \
  -d '{"team_id":"<team_uuid>","message":"Hello faculty — onboarding is live"}'
```

You should see the message in Telegram instantly. The admin can also trigger from **Settings → Telegram** if you wire the UI to `POST /integrations/telegram/test`.

## 5. Message formatting (what Telegram shows)

The bundled Function node formats:

- `plan_created` → 🟢 New onboarding plan for <user> (team <team>) — 30/60/90 roadmap ready.
- `milestone_completed` → ✅ Milestone completed: "<title>" (Day <N>) — plan <id>.
- `preboarding_completed` → 📋 Pre-boarding done: "<title>".
- `pulse_submitted` → 💬 Pulse week <W>: confidence <n>/10, sentiment <sentiment>.
- `plan_generated` → 🤖 AI plan generated from <repo_url>.

Edit the Function node to change tone / add faculty @mentions / route by `team_id` to different `chat_id`.

## Troubleshooting

| symptom | check |
|---|---|
| No message in Telegram | n8n Executions tab — did the Webhook fire? Check `N8N_ONBOARDING_WEBHOOK_URL` and that the Webhook is **active** (toggle in n8n). |
| 502 onboarding.test | `GET /api/v1/integrations/telegram/status` → `env_configured` must be true or PUT a team config. |
| HMAC failure | In n8n Function, compute `sha256(payload, env N8N_HMAC_SECRET)` and compare to header `X-Onramp-Signature`. |
| Wrong channel | `telegram_chat_id` in n8n's Telegram node — use `-100…` for channels, numeric for DMs. Bot must be admin in the channel. |

## Security

- n8n webhook URL is a secret (capability URL) — treat like a password.
- Enable `N8N_HMAC_SECRET` so n8n can reject forged posts.
- Onramp never blocks onboarding on n8n failure — Telegram is observability, not the write path.
