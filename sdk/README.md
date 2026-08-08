# @onramp/sdk

Official TypeScript SDK for the **Onramp 2.0 API** — a multi-provider AI
gateway, AIaaS agents, embeddings and usage metering, wrapped in a typed,
dependency-free client.

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

// Streaming chat
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
const result = await onramp.executeAgent('health', {
  owner: 'KunjShah95',
  repo: 'onramp',
  repo_url: 'https://github.com/KunjShah95/onramp',
})

// Usage + keys
await onramp.validateApiKey('cf_...')
await onramp.getUsage('my-org')
```

## OpenAI-compatible mode

The gateway is OpenAI-compatible, so you can also point any OpenAI SDK at it:

```ts
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.ONRAMP_API_KEY,
  baseURL: 'https://api.onramp.dev/v1',
})
```

## Environment variables

| Variable | Purpose |
|----------|---------|
| `ONRAMP_API_URL` | API base URL (default `http://localhost:8000`) |
| `ONRAMP_API_KEY` | API key (`cf_...`) or JWT access token |

## License

MIT
