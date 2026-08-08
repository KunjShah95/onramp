import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OnrampClient, OnrampApiError } from '../src/index.js'

function mockFetch(handler: (url: string, init: RequestInit) => Response) {
  const fn = vi.fn(handler)
  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('OnrampClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('sends Bearer auth header and API base', () => {
    const fetchMock = mockFetch(() => jsonResponse({ object: 'list', data: [] }))
    const client = new OnrampClient({ baseUrl: 'https://api.example.com', apiKey: 'cf_test' })

    void client.listModels()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.example.com/v1/models')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer cf_test')
  })

  it('chat posts messages and returns completion', async () => {
    const completion = {
      id: 'chatcmpl-x',
      object: 'chat.completion',
      created: 1,
      model: 'groq/llama',
      choices: [{ index: 0, message: { role: 'assistant', content: 'hi' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
    }
    mockFetch(() => jsonResponse(completion))
    const client = new OnrampClient({ apiKey: 'k' })

    const result = await client.chat([{ role: 'user', content: 'hello' }], { model: 'reasoning' })
    expect(result.choices[0].message.content).toBe('hi')
  })

  it('unwrap envelope for agent endpoints', async () => {
    mockFetch(() =>
      jsonResponse({ success: true, data: { agents: [{ name: 'health' }], count: 1 } }),
    )
    const client = new OnrampClient({ apiKey: 'k' })
    const agents = await client.listAgents()
    expect(agents).toEqual([{ name: 'health' }])
  })

  it('throws OnrampApiError with detail on 401', async () => {
    mockFetch(() =>
      jsonResponse({ detail: 'Invalid API key' }, 401),
    )
    const client = new OnrampClient({ apiKey: 'bad' })
    await expect(client.listModels()).rejects.toMatchObject({
      status: 401,
      message: 'Invalid API key',
    })
  })

  it('embeddings request body shape', async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse({ object: 'list', data: [], model: 'gemini/x', usage: { prompt_tokens: 3, total_tokens: 3 } }),
    )
    const client = new OnrampClient({ apiKey: 'k' })
    await client.embeddings(['a', 'b'], { model: 'gemini' })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.input).toEqual(['a', 'b'])
    expect(body.model).toBe('gemini')
  })

  it('chatStream parses SSE deltas', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"lo"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      )) as typeof fetch

    const client = new OnrampClient({ apiKey: 'k', timeoutMs: 5000 })
    const tokens: string[] = []
    for await (const token of await client.chatStream([{ role: 'user', content: 'hi' }])) {
      tokens.push(token)
    }
    expect(tokens).toEqual(['Hel', 'lo'])
  })
})
