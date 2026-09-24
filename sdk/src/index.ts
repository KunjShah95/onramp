/**
 * Onramp SDK — TypeScript client for the Onramp 2.0 API.
 *
 * Covers:
 *   - OpenAI-compatible gateway (/v1): chat completions (incl. streaming),
 *     embeddings, model listing — usable with any OpenAI SDK by pointing
 *     base_url at the gateway, or natively through this client.
 *   - AIaaS agent endpoints (/api/v1/ai): list agents, execute agents,
 *     API-key management, usage + quota.
 *
 * The client authenticates with an Onramp API key (``cf_...``) sent as
 * ``Authorization: Bearer``, or a JWT access token — same header, so the
 * client is agnostic.
 */

export const SDK_VERSION = '0.1.0'

// ── Types ───────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'developer' | 'tool'
  content: string
}

export interface ChatCompletionOptions {
  model?: string
  maxTokens?: number
  temperature?: number
  stream?: boolean
  user?: string
}

export interface ChatCompletion {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: { role: string; content: string }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface EmbeddingOptions {
  model?: string
  user?: string
}

export interface EmbeddingObject {
  object: 'embedding'
  index: number
  embedding: number[]
}

export interface EmbeddingResult {
  object: 'list'
  data: EmbeddingObject[]
  model: string
  usage: { prompt_tokens: number; total_tokens: number }
  cost_usd?: number
  cost_inr?: number
}

export interface ModelInfo {
  id: string
  object: string
  owned_by: string
  available?: boolean
  dimensions?: number
}

export interface AgentInfo {
  name: string
  description: string
  required_params: string[]
  credit_cost: number
  query_type: string | null
  model: string | null
}

export interface AgentExecutionResult {
  agent: string
  result: unknown
  credits_used: number
  tier: string
}

export interface ApiKeyResult {
  key_id: string
  raw_key?: string
  org_name: string
  tier: string
}

export interface UsageRecord {
  org_name: string
  period: string
  total_credits: number
  total_requests: number
  endpoint_breakdown: Record<string, number>
}

export interface TierLimits {
  requests_per_minute: number
  requests_per_day: number
  credits_per_month: number
  max_repos: number
}

export interface TierLimitsInfo {
  tiers: Record<string, TierLimits>
  credit_costs: Record<string, number>
}

export interface RepositoryRecord {
  id?: string
  name: string
  owner: string
  team_id?: string
  url?: string
  status?: string
  [key: string]: unknown
}

export interface RepositoryIndexOptions {
  branch?: string
  maxFiles?: number
  force?: boolean
  asyncBuild?: boolean
  teamId?: string
}

export interface RepositoryIndexResult {
  index_id: string
  repo_url?: string
  branch?: string
  team_id?: string
  queued?: boolean
  task_id?: string
  [key: string]: unknown
}

export interface RepositoryIndexBatchResult {
  queued: boolean
  count: number
  jobs: RepositoryIndexResult[]
}

export interface IndexJob {
  task_id: string
  status: string
  result?: RepositoryIndexResult
  error?: string
}

export interface RampSummary {
  team_id?: string
  profiles?: unknown[]
  benchmark?: Record<string, unknown>
  cost_model?: Record<string, unknown>
  totals?: Record<string, unknown>
  [key: string]: unknown
}

export interface RampCostModel {
  senior_hourly_rate_usd?: number
  review_hours_per_cycle?: number
  stalled_weekly_hours?: number
}

export interface OnboardingProgress {
  plan_id: string
  team_id?: string
  user_id?: string
  days_elapsed: number
  completion_percent: number
  milestones: { completed: number; total: number }
  pre_boarding: { completed: number; total: number }
  next_milestone?: Record<string, unknown>
  next_pre_boarding_task?: Record<string, unknown>
}

export interface McpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

// ── Errors ──────────────────────────────────────────────────────────────

export class OnrampApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'OnrampApiError'
    this.status = status
    this.code = code
  }
}

// ── Client ──────────────────────────────────────────────────────────────

export interface OnrampClientOptions {
  /** Base URL, e.g. https://api.onramp.dev — defaults to local dev. */
  baseUrl?: string
  /** Onramp API key (cf_...) or JWT access token. */
  apiKey?: string
  /** Default gateway model when none is passed per-call. */
  defaultModel?: string
  /** Extra headers appended to every request. */
  headers?: Record<string, string>
  fetch?: typeof fetch
  /** Timeout (ms) for non-streaming requests. Default 120_000 (LLM calls are slow). */
  timeoutMs?: number
}

interface SseEvent {
  data: string
}

export class OnrampClient {
  readonly baseUrl: string
  readonly gatewayUrl: string
  private apiKey?: string
  private defaultModel?: string
  private extraHeaders: Record<string, string>
  private fetchFn: typeof fetch
  private timeoutMs: number

  constructor(options: OnrampClientOptions = {}) {
    const base = (
      options.baseUrl ||
      (typeof process !== 'undefined' ? process.env.ONRAMP_API_URL : undefined) ||
      'http://localhost:8000'
    ).replace(/\/+$/, '')
    this.baseUrl = base
    // The OpenAI-compatible gateway lives at /v1 (no /api/v1 prefix).
    this.gatewayUrl = `${base}/v1`
    this.apiKey =
      options.apiKey ||
      (typeof process !== 'undefined' ? process.env.ONRAMP_API_KEY : undefined)
    this.defaultModel = options.defaultModel || 'chat'
    this.extraHeaders = options.headers || {}
    this.fetchFn = options.fetch || globalThis.fetch.bind(globalThis)
    this.timeoutMs = options.timeoutMs ?? 120_000
  }

  // ── Low-level helpers ───────────────────────────────────────────────

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'User-Agent': `onramp-sdk/${SDK_VERSION}`,
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      ...this.extraHeaders,
      ...extra,
    }
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const res = await this.fetchFn(url, { ...init, signal: controller.signal })
      if (!res.ok) {
        let message = `Onramp API error ${res.status}`
        let code: string | undefined
        try {
          const body = await res.json()
          if (typeof body === 'object' && body) {
            message = (body as { detail?: string }).detail || message
            code = (body as { code?: string }).code
          }
        } catch {
          /* non-JSON error body — keep the status message */
        }
        throw new OnrampApiError(message, res.status, code)
      }
      return (await res.json()) as T
    } catch (err) {
      if (err instanceof OnrampApiError) throw err
      if (err instanceof Error && err.name === 'AbortError') {
        throw new OnrampApiError('Request timed out', 408, 'TIMEOUT')
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  /** Unwrap the backend's {success, data} envelope when present. */
  private unwrap<T>(json: T): T {
    const record = json as Record<string, unknown> | null
    if (record && typeof record === 'object' && 'success' in record && 'data' in record) {
      return (record as unknown as { data: T }).data
    }
    return json
  }

  // ── OpenAI-compatible gateway ───────────────────────────────────────

  /** List available models from the router + embedding catalogs. */
  async listModels(): Promise<ModelInfo[]> {
    const res = await this.request<{ object: string; data: ModelInfo[] }>(
      `${this.gatewayUrl}/models`,
      { method: 'GET', headers: this.headers() },
    )
    return res.data
  }

  /** Non-streaming chat completion via the query-type router. */
  async chat(
    messages: ChatMessage[],
    options: ChatCompletionOptions = {},
  ): Promise<ChatCompletion> {
    const res = await this.request<ChatCompletion>(`${this.gatewayUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: options.model ?? this.defaultModel,
        messages,
        max_tokens: options.maxTokens ?? 2000,
        temperature: options.temperature,
        stream: false,
        user: options.user,
      }),
    })
    return res
  }

  /**
   * Streaming chat completion. Yields content deltas as they arrive and
   * resolves when the stream finishes. Pass an AbortSignal to cancel.
   */
  async chatStream(
    messages: ChatMessage[],
    options: ChatCompletionOptions & { signal?: AbortSignal } = {},
  ): Promise<AsyncIterable<string>> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    const { signal: external } = options
    const onExternalAbort = () => controller.abort()
    external?.addEventListener('abort', onExternalAbort)

    const res = await this.fetchFn(`${this.gatewayUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers({ Accept: 'text/event-stream' }),
      body: JSON.stringify({
        model: options.model ?? this.defaultModel,
        messages,
        max_tokens: options.maxTokens ?? 2000,
        temperature: options.temperature,
        stream: true,
        user: options.user,
      }),
      signal: controller.signal,
    })

    if (!res.ok || !res.body) {
      clearTimeout(timeout)
      throw new OnrampApiError(`Onramp API error ${res.status}`, res.status)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    async function* generate(): AsyncGenerator<string> {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const events = buffer.split('\n\n')
          buffer = events.pop() ?? ''
          for (const raw of events) {
            const data = raw
              .split('\n')
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trim())
            for (const payload of data) {
              if (payload === '[DONE]') return
              try {
                const evt = JSON.parse(payload) as {
                  choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>
                  error?: { message?: string }
                }
                if (evt.error?.message) {
                  throw new OnrampApiError(evt.error.message, 502, 'STREAM_ERROR')
                }
                const delta = evt.choices?.[0]?.delta?.content
                if (delta) yield delta
              } catch (err) {
                if (err instanceof OnrampApiError) throw err
                /* ignore malformed keep-alive lines */
              }
            }
          }
        }
      } finally {
        clearTimeout(timeout)
        external?.removeEventListener('abort', onExternalAbort)
      }
    }
    return generate()
  }

  /** Create embeddings through the pluggable embedding router. */
  async embeddings(
    input: string | string[],
    options: EmbeddingOptions = {},
  ): Promise<EmbeddingResult> {
    return this.request<EmbeddingResult>(`${this.gatewayUrl}/embeddings`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: options.model,
        input,
        user: options.user,
      }),
    })
  }

  // ── Repository, index, and ramp APIs ────────────────────────────────

  private apiUrl(path: string): string {
    return `${this.baseUrl}/api/v1${path}`
  }

  private withQuery(path: string, params: Record<string, string | number | undefined> = {}): string {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') query.set(key, String(value))
    }
    const suffix = query.toString() ? `?${query.toString()}` : ''
    return this.apiUrl(`${path}${suffix}`)
  }

  /** List repositories visible to the authenticated workspace. */
  async listRepositories(teamId?: string): Promise<RepositoryRecord[]> {
    const res = await this.request<{ repos: RepositoryRecord[] }>(
      this.withQuery('/repos', { team_id: teamId }),
      { method: 'GET', headers: this.headers() },
    )
    return this.unwrap(res).repos
  }

  /** Register a repository for a team before indexing or analysis. */
  async createRepository(input: {
    name: string
    owner: string
    url?: string
    language?: string
    description?: string
    teamId?: string
  }): Promise<RepositoryRecord> {
    const res = await this.request<RepositoryRecord>(this.apiUrl('/repos'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        name: input.name,
        owner: input.owner,
        url: input.url,
        language: input.language,
        description: input.description,
        team_id: input.teamId,
      }),
    })
    return this.unwrap(res)
  }

  /** Build or queue a repository context/embedding index. */
  async buildRepositoryIndex(
    repoUrl: string,
    options: RepositoryIndexOptions = {},
  ): Promise<RepositoryIndexResult> {
    const res = await this.request<RepositoryIndexResult>(this.apiUrl('/repos/index'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        repo_url: repoUrl,
        branch: options.branch ?? 'main',
        max_files: options.maxFiles ?? 1000,
        force: options.force ?? false,
        async_build: options.asyncBuild ?? false,
        team_id: options.teamId,
      }),
    })
    return this.unwrap(res)
  }

  /** Queue up to twenty registered repositories in one asynchronous batch. */
  async buildRepositoryIndexBatch(
    repoUrls: string[],
    options: Omit<RepositoryIndexOptions, 'asyncBuild'> = {},
  ): Promise<RepositoryIndexBatchResult> {
    const res = await this.request<RepositoryIndexBatchResult>(this.apiUrl('/repos/index/batch'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        repo_urls: repoUrls,
        branch: options.branch ?? 'main',
        max_files: options.maxFiles ?? 1000,
        force: options.force ?? false,
        async_build: true,
        team_id: options.teamId,
      }),
    })
    return this.unwrap(res)
  }

  /** Poll an asynchronous repository-index job. */
  async getIndexJob(taskId: string): Promise<IndexJob> {
    const res = await this.request<IndexJob>(this.apiUrl(`/ask/jobs/${encodeURIComponent(taskId)}`), {
      method: 'GET',
      headers: this.headers(),
    })
    return this.unwrap(res)
  }

  /** Poll a graph-context repository-index job created by a batch build. */
  async getRepositoryIndexJob(taskId: string): Promise<IndexJob> {
    const res = await this.request<IndexJob>(this.apiUrl(`/repos/index/jobs/${encodeURIComponent(taskId)}`), {
      method: 'GET',
      headers: this.headers(),
    })
    return this.unwrap(res)
  }

  /** Fetch the Track → Quantify → Intercept ramp summary. */
  async getRampSummary(teamId?: string): Promise<RampSummary> {
    const res = await this.request<RampSummary>(
      this.withQuery('/ramp/summary', { team_id: teamId }),
      { method: 'GET', headers: this.headers() },
    )
    return this.unwrap(res)
  }

  /** Fetch the current stuck-dev list without firing alerts. */
  async getRampStuck(teamId?: string): Promise<Record<string, unknown>> {
    const res = await this.request<Record<string, unknown>>(
      this.withQuery('/ramp/stuck', { team_id: teamId }),
      { method: 'GET', headers: this.headers() },
    )
    return this.unwrap(res)
  }

  /** Update a team's calibrated senior-time cost model (leader role required). */
  async updateRampCostModel(
    model: RampCostModel,
    teamId?: string,
  ): Promise<Record<string, unknown>> {
    const res = await this.request<Record<string, unknown>>(
      this.withQuery('/ramp/cost-model', { team_id: teamId }),
      {
        method: 'PUT',
        headers: this.headers(),
        body: JSON.stringify(model),
      },
    )
    return this.unwrap(res)
  }
  /** Fetch the compact first-10-days progress view for an onboarding plan. */
  async getOnboardingProgress(planId: string): Promise<OnboardingProgress> {
    const res = await this.request<OnboardingProgress>(
      this.apiUrl(`/onboarding-plans/${encodeURIComponent(planId)}/progress`),
      { method: 'GET', headers: this.headers() },
    )
    return this.unwrap(res)
  }

  private async mcpRequest<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const res = await this.request<{ result?: T; error?: { message?: string } }>(this.apiUrl('/mcp'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    })
    if (res.error) {
      throw new OnrampApiError(res.error.message || 'MCP request failed', 400, 'MCP_ERROR')
    }
    return (res.result ?? {}) as T
  }

  /** List tools exposed by the tenant-scoped read-only MCP server. */
  async listMcpTools(): Promise<McpTool[]> {
    const result = await this.mcpRequest<{ tools: McpTool[] }>('tools/list')
    return result.tools ?? []
  }

  /** Call one read-only MCP tool. */
  async callMcpTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const result = await this.mcpRequest<{ structuredContent?: Record<string, unknown> }>('tools/call', {
      name,
      arguments: args,
    })
    return result.structuredContent ?? {}
  }

  // ── AIaaS agent endpoints ───────────────────────────────────────────

  async listAgents(): Promise<AgentInfo[]> {
    const res = await this.request<{ agents: AgentInfo[] }>(`${this.baseUrl}/api/v1/ai/agents`, {
      method: 'GET',
      headers: this.headers(),
    })
    return this.unwrap(res).agents
  }

  async executeAgent(
    name: string,
    params: Record<string, unknown>,
  ): Promise<AgentExecutionResult> {
    const res = await this.request<AgentExecutionResult>(
      `${this.baseUrl}/api/v1/ai/agents/${name}`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(params),
      },
    )
    return this.unwrap(res)
  }

  /** Validate an API key (send the raw key in the body, never the URL). */
  async validateApiKey(rawKey: string): Promise<{ valid: boolean; org_name: string; tier: string }> {
    const res = await this.request<{ valid: boolean; org_name: string; tier: string }>(
      `${this.baseUrl}/api/v1/ai/keys/validate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_key: rawKey }),
      },
    )
    return this.unwrap(res)
  }

  /** Create a new API key for an org.
   *
   * `opts.credit_limit` sets an optional per-key monthly credit budget and
   * `opts.expires_in_days` an optional expiry window — both are forwarded to
   * `POST /api/v1/ai/keys` (see backend/app/api/v1/ai_gateway.py).
   */
  async createApiKey(
    orgName: string,
    tier = 'free',
    opts: { credit_limit?: number; daily_credit_cap?: number; expires_in_days?: number } = {},
  ): Promise<ApiKeyResult> {
    const res = await this.request<ApiKeyResult>(`${this.baseUrl}/api/v1/ai/keys`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ org_name: orgName, tier, ...opts }),
    })
    return this.unwrap(res)
  }

  /** Fetch usage for an org. */
  async getUsage(orgName: string): Promise<UsageRecord> {
    const res = await this.request<UsageRecord>(
      `${this.baseUrl}/api/v1/ai/usage/${orgName}`,
      { method: 'GET', headers: this.headers() },
    )
    return this.unwrap(res)
  }

  /** Fetch tier limits + credit costs. */
  async listTiers(): Promise<TierLimitsInfo> {
    const res = await this.request<unknown>(`${this.baseUrl}/api/v1/ai/tiers`, {
      method: 'GET',
      headers: this.headers(),
    })
    return this.unwrap(res) as TierLimitsInfo
  }
}
