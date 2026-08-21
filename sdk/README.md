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
  apiKey: process.env.ONRAMP_API_KEY, // cf_... key or JWT
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

// Usage + keys
await onramp.validateApiKey('cf_...')
const created = await onramp.createApiKey('my-org', 'free')
await onramp.getUsage('my-org')
await onramp.listTiers()
```

## Client options

| Option | Default | Description |
|----------|---------|-------------|
| `baseUrl` | `ONRAMP_API_URL` or `http://localhost:8000` | API base URL (trailing slashes trimmed) |
| `apiKey` | `ONRAMP_API_KEY` | Onramp API key (`cf_...`) or JWT access token |
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

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `listAgents()` | `GET /api/v1/ai/agents` | List available agents + required params |
| `executeAgent(agent, params)` | `POST /api/v1/ai/agents/{agent}/execute` | Run an agent, returns result + credits used |

### Keys & usage

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `validateApiKey(rawKey)` | `GET /api/v1/ai/keys/validate` | Validate a key, returns org + tier |
| `createApiKey(orgName, tier)` | `POST /api/v1/ai/keys` | Create a new API key |
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
| `ONRAMP_API_KEY` | API key (`cf_...`) or JWT access token |

## Development

```bash
npm run build       # compile TypeScript → dist/
npm run typecheck   # tsc --noEmit
npm test            # vitest
```

## License

MIT