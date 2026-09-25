# @onramp/sdk

Official TypeScript SDK for the **Onramp 2.0 API** — a multi-provider AI
gateway with free-first model routing, AIaaS agents, embeddings, and usage
metering. Zero runtime dependencies, works in Node.js 18+ and browsers.

## Install

```bash
npm install @onramp/sdk
```

## Quick start

```ts
import { OnrampClient } from '@onramp/sdk'

const onramp = new OnrampClient({
  baseUrl: process.env.ONRAMP_API_URL ?? 'https://api.onramp.dev',
  apiKey: process.env.ONRAMP_API_KEY, // cf_... key for gateway calls
  sessionToken: process.env.ONRAMP_SESSION_TOKEN, // JWT for workspace calls
})

// Non-streaming chat (routed free-first by query type)
const completion = await onramp.chat(
  [{ role: 'user', content: 'Explain how the repo context index works' }],
  { model: 'reasoning' },
)
console.log(completion.choices[0].message.content)

// Streaming chat (SSE)
for await (const token of await onramp.chatStream(
  [{ role: 'user', content: 'Write a FastAPI healthcheck' }],
  { model: 'code' },
)) {
  process.stdout.write(token)
}

// Embeddings (pluggable providers, free-first)
const vec = await onramp.embeddings('onramp embedding router', { model: 'gemini' })

// List available models / providers
const models = await onramp.listModels()

// AIaaS agents
const agents = await onramp.listAgents()
const result = await onramp.executeAgent('health', {
  owner: 'KunjShah95',
  repo: 'onramp',
  repo_url: 'https://github.com/KunjShah95/onramp',
})
console.log(result.credits_used, result.tier)

// API-key validation and key management use a JWT session, not the gateway key.
const session = new OnrampClient({
  baseUrl: 'https://api.onramp.dev',
  apiKey: process.env.ONRAMP_API_KEY,       // cf_... gateway authentication
  sessionToken: process.env.ONRAMP_SESSION_TOKEN, // JWT workspace auth
})
const validation = await session.validateApiKey('cf_...')
const created = await session.createApiKey('my-org', 'free')
const budgeted = await session.createApiKey('my-org', 'pro', { credit_limit: 5000, expires_in_days: 90 })
const keys = await session.listApiKeys('my-org')
await session.revokeApiKey(created.key_id)
await session.getUsage('my-org')
await session.listTiers()

// Repository + onboarding APIs (use a JWT/session token for user-scoped routes)
const repos = await onramp.listRepositories('team-123')
const index = await onramp.buildRepositoryIndex('https://github.com/acme/app', {
  teamId: 'team-123',
  asyncBuild: true,
})
if (index.queued) {
  const job = await onramp.getIndexJob(index.task_id!)
  console.log(job.status)
}
const ramp = await onramp.getRampSummary('team-123')

// Optional read-only MCP tools (tenant authorization is enforced server-side)
const tools = await onramp.listMcpTools()
const context = await onramp.callMcpTool('repo_context', {
  index_id: index.index_id,
  requirement: 'authentication flow',
})

## Client options

| Option | Default | Description |
|----------|---------|-------------|
| `baseUrl` | `ONRAMP_API_URL` or `http://localhost:8000` | API base URL (trailing slashes trimmed) |
| `apiKey` | `ONRAMP_API_KEY` | Onramp gateway API key (`cf_...`); never used for JWT-only management routes |
| `sessionToken` | `ONRAMP_SESSION_TOKEN` | JWT access token for workspace and API-key management routes |
| `defaultModel` | `chat` | Default gateway model when none passed per-call |
| `headers` | — | Extra headers appended to every request |
| `fetch` | `globalThis.fetch` | Custom fetch implementation (test mocks, polyfills) |
| `timeoutMs` | `120_000` | Timeout for non-streaming requests (LLM calls are slow) |

## Methods

### OpenAI-compatible gateway (`/v1`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `chat(messages, options)` | `POST /v1/chat/completions` | Chat completion (non-streaming) |
| `chatStream(messages, options)` | `POST /v1/chat/completions` (SSE) | Streamed chat completion, yields text tokens |
| `embeddings(input, options)` | `POST /v1/embeddings` | Text embeddings |
| `listModels()` | `GET /v1/models` | List router + embedding models |

The gateway is OpenAI-compatible, so you can also point any OpenAI SDK at it:

```ts
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.ONRAMP_API_KEY,
  baseURL: 'https://api.onramp.dev/v1',
})
```

### AIaaS agents (`/api/v1/ai`)

| Method | Auth | Endpoint | Purpose |
|--------|------|----------|---------|
| `listAgents()` | JWT session | `GET /api/v1/ai/agents` | List available agents + required params |
| `executeAgent(agent, params)` | API key or JWT session | `POST /api/v1/ai/agents/{agent}/execute` | Run an agent, returns result + credits used |

### Keys & usage (JWT session only)

These endpoints are workspace management operations. Supply `sessionToken` (or
`ONRAMP_SESSION_TOKEN`); the gateway `apiKey` is not a substitute for a JWT.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `validateApiKey(rawKey)` | `POST /api/v1/ai/keys/validate` | Validate a key, returns org + tier; invalid keys throw `OnrampApiError` |
| `createApiKey(orgName, tier, opts?)` | `POST /api/v1/ai/keys` | Create a new API key; `opts` accepts `credit_limit` (monthly credit budget), `daily_credit_cap` (daily cap, resets each UTC day), and `expires_in_days` |
| `listApiKeys(orgName?)` | `GET /api/v1/ai/keys` | List keys visible to the session |
| `revokeApiKey(keyId)` | `DELETE /api/v1/ai/keys/{keyId}` | Revoke a key |
| `rotateApiKey(keyId, opts?)` | `POST /api/v1/ai/keys/{keyId}/rotate` | Revoke and replace a key |
| `getUsage(orgName)` | `GET /api/v1/ai/usage/{orgName}` | Credit + request usage with endpoint breakdown |
| `listTiers()` | `GET /api/v1/ai/tiers` | Tier limits + credit costs |

## Errors

Failed requests throw `OnrampApiError` with `.status` (HTTP code) and `.code`
(when the API provides one, e.g. `TIMEOUT`). Timeouts throw `OnrampApiError`
with status `408`.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `ONRAMP_API_URL` | API base URL (default `http://localhost:8000`) |
| `ONRAMP_API_KEY` | Gateway API key (`cf_...`) |
| `ONRAMP_SESSION_TOKEN` | JWT access token for workspace/key management |

## Development

```bash
npm run build       # compile TypeScript → dist/
npm run typecheck   # tsc --noEmit
npm test            # vitest
```

## License

MIT