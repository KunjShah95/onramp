import { lazy, Suspense, useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { copyText } from '../lib/clipboard'
import { getUsageSummary, listTiers, listAgents, executeAgent, fetchModelCatalog, fetchRoutingMode, setRoutingMode, type RateLimitInfo, type AgentInfo, type ModelCatalog, type OpenRouterCatalogModel } from '../lib/api'
import { Code, Copy, Check, Spinner, ShieldCheck, Play, Robot, Terminal, Gauge } from '@phosphor-icons/react'
import { PageHeader } from '../components/ui/page-header'
import { EmptyRow } from '../components/ui/empty-state'
import { cn } from '../lib/utils'

const CodeEditor = lazy(() => import('../components/ui/monaco-editor'))

/* ------------------------------------------------------------------
 * Developer Portal — PayPal-grade redesign.
 * One task per tab. Playground KEPT (sandbox drives activation)
 * but debugged: loading/empty states, required-param validation,
 * abort-safe runs, safe result rendering, 44px targets, aria.
 * ------------------------------------------------------------------ */

type TabId = 'models' | 'usage' | 'playground'

const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: 'models', label: 'Models & routing', hint: 'Providers + catalog' },
  { id: 'usage', label: 'Usage & limits', hint: 'Spend + quotas' },
  { id: 'playground', label: 'Playground', hint: 'Try it live' },
]

/** Prefill params so the selected agent's required keys always exist. */
function templateParams(agent: AgentInfo | undefined): string {
  const base: Record<string, unknown> = { repo_url: 'https://github.com/facebook/react' }
  for (const k of agent?.required_params ?? []) {
    if (!(k in base)) {
      if (k === 'index_id') base[k] = 'abc123'
      else if (k === 'question') base[k] = 'Where is auth verified?'
      else base[k] = ''
    }
  }
  return JSON.stringify(base, null, 2)
}

export default function DeveloperPortal() {
  const { activeTeamId } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState<TabId>('models')

  const [usage, setUsage] = useState<any>(null)
  const [tierInfo, setTierInfo] = useState<RateLimitInfo | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogSearch, setCatalogSearch] = useState('')
  const [routingMode, setRoutingModeState] = useState<number | null>(null)
  const [routingModeLoading, setRoutingModeLoading] = useState(false)
  const [savingRoutingMode, setSavingRoutingMode] = useState(false)

  useEffect(() => {
    if (!activeTeamId) return
    fetchUsage(); fetchTiers(); fetchCatalog(); fetchRoutingModePref()
  }, [activeTeamId])

  async function fetchCatalog() {
    setCatalogLoading(true)
    try { setCatalog(await fetchModelCatalog()) } catch { setCatalog(null) }
    setCatalogLoading(false)
  }
  async function fetchUsage() {
    if (!activeTeamId) return
    try { setUsage(await getUsageSummary(activeTeamId)) } catch { setUsage(null) }
  }
  async function fetchTiers() {
    try { setTierInfo(await listTiers()) } catch { /* empty */ }
  }
  async function fetchRoutingModePref() {
    if (!activeTeamId) return
    setRoutingModeLoading(true)
    try { setRoutingModeState((await fetchRoutingMode(activeTeamId)).routing_mode) } catch { /* best-effort */ }
    setRoutingModeLoading(false)
  }
  async function handleSetRoutingMode(mode: string | number) {
    if (!activeTeamId) return
    setSavingRoutingMode(true)
    try {
      const res = await setRoutingMode(activeTeamId, mode)
      setRoutingModeState(res.routing_mode)
      toast.success('Routing mode updated', 'Takes effect on your next request.')
    } catch (err: any) { toast.error('Failed to update routing mode', err.message) }
    setSavingRoutingMode(false)
  }
  async function handleCopy(id: string, content: string) {
    try {
      if (await copyText(content)) { setCopiedId(id); setTimeout(() => setCopiedId(null), 2000) }
    } catch { /* clipboard unavailable — helper never throws */ }
  }

  if (!activeTeamId) {
    return (
      <div className="max-w-3xl mx-auto">
        <PageHeader eyebrow="Developer portal" title="Developer portal" subtitle="Models, routing, usage, and playground tools in one place." />
        <div className="card p-8 text-center text-ink-tertiary text-sm">Select a team to access developer settings.</div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        eyebrow="Developer portal"
        title="Developer portal"
        subtitle="Models, routing, usage, and playground tools in one place."
        pills={[
          { label: 'credits used', value: usage?.total_credits ?? '—', color: 'text-go' },
          { label: 'models', value: catalog?.openrouter_catalog?.length ?? '—' },
        ]}
      />

      <div className="sticky top-11 z-30 -mx-4 px-4 sm:mx-0 sm:px-0 bg-bg/90 backdrop-blur-xl border-b border-seam mb-6" role="tablist" aria-label="Developer portal sections">
        <div className="flex gap-1 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] py-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'shrink-0 min-h-[44px] px-4 py-2 rounded-btn text-left transition-all',
                tab === t.id ? 'bg-go/12 text-ink border border-go/25' : 'text-ink-tertiary border border-transparent hover:text-ink hover:bg-bg-tertiary/60'
              )}
            >
              <span className="block text-[13px] font-semibold leading-tight">{t.label}</span>
              <span className="block text-[11px] opacity-70 leading-tight">{t.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {tab === 'models' && (
        <ModelsTab
          catalog={catalog} catalogLoading={catalogLoading}
          catalogSearch={catalogSearch} setCatalogSearch={setCatalogSearch}
          copiedId={copiedId} onCopy={handleCopy}
          routingMode={routingMode} routingModeLoading={routingModeLoading}
          savingRoutingMode={savingRoutingMode} onRouting={handleSetRoutingMode} />
      )}
      {tab === 'usage' && <UsageTab usage={usage} tierInfo={tierInfo} />}
      {tab === 'playground' && <PlaygroundTab />}
    </div>
  )
}

/* ================= Models & routing ================= */

function ModelsTab(props: {
  catalog: ModelCatalog | null; catalogLoading: boolean; catalogSearch: string; setCatalogSearch: (v: string) => void
  copiedId: string | null; onCopy: (id: string, c: string) => void
  routingMode: number | null; routingModeLoading: boolean; savingRoutingMode: boolean; onRouting: (m: number) => void
}) {
  return (
    <div className="space-y-5">
      <section className="card p-6">
        <h2 className="font-display text-[15px] font-semibold text-ink">How smart vs. how cheap?</h2>
        <p className="text-xs text-ink-tertiary mt-0.5 mb-4">One dial. Applies to chat + API on your next request.</p>
        {props.routingModeLoading ? (
          <div className="flex items-center gap-2 py-2"><Spinner className="w-4 h-4 animate-spin text-go" /><span className="text-xs text-ink-tertiary">Loading…</span></div>
        ) : (
          <div className="grid grid-cols-3 gap-2 p-1 rounded-card bg-well border border-seam" role="radiogroup" aria-label="Routing mode">
            {([
              { v: 2, label: 'Save', sub: 'Cheapest' },
              { v: 5, label: 'Balanced', sub: 'Recommended' },
              { v: 8, label: 'Best', sub: 'Smartest' },
            ] as const).map((o) => (
              <button key={o.label} type="button" role="radio" aria-checked={props.routingMode === o.v}
                disabled={props.savingRoutingMode}
                onClick={() => props.onRouting(o.v)}
                className={cn('min-h-[52px] rounded-btn px-2 py-2 text-center transition-all disabled:opacity-50',
                  props.routingMode === o.v ? 'bg-panel-raised text-ink shadow border border-go/30' : 'text-ink-tertiary hover:text-ink')}>
                <span className="block text-[13px] font-bold">{o.label}</span>
                <span className="block text-[11px] opacity-70">{o.sub}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-ink">Which model can I call?</h2>
            <p className="text-xs text-ink-tertiary mt-0.5">Pass any id to <code className="font-mono bg-well px-1 rounded">/v1/chat/completions</code></p>
          </div>
          <input value={props.catalogSearch} onChange={(e) => props.setCatalogSearch(e.target.value)}
            placeholder="Search models…" className="input sm:w-56" aria-label="Search models" />
        </div>
        {props.catalogLoading && !props.catalog
          ? <div className="flex justify-center py-8"><Spinner className="w-5 h-5 animate-spin text-go" aria-label="Loading catalog" /></div>
          : props.catalog?.openrouter_catalog?.length
            ? <CatalogList models={props.catalog.openrouter_catalog} search={props.catalogSearch} copiedId={props.copiedId} onCopy={props.onCopy} />
            : <p className="text-[13px] text-ink-tertiary py-4">Live catalog unavailable — any <code className="font-mono bg-well px-1 rounded">vendor/model</code> id still routes through the gateway.</p>}
      </section>
    </div>
  )
}

/* ================= Usage ================= */

function UsageTab({ usage, tierInfo }: { usage: any; tierInfo: RateLimitInfo | null }) {
  const pct = usage?.monthly_limit ? Math.min(100, Math.round(((usage.total_credits ?? 0) / usage.monthly_limit) * 100)) : 0
  return (
    <div className="space-y-5">
      <section className="card p-6">
        <h2 className="font-display text-[15px] font-semibold text-ink mb-3">This month</h2>
        {usage ? (
          <>
            <div className="flex items-end justify-between gap-3 mb-2">
              <p className="text-3xl font-bold text-ink tabular-nums">{usage.total_credits}<span className="text-base font-medium text-ink-tertiary"> / {usage.monthly_limit}</span></p>
              <span className="font-mono text-xs text-go">{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-well overflow-hidden mb-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className={cn('h-full rounded-full', pct >= 90 ? 'bg-abort' : 'bg-go')} style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-ink-tertiary mb-4">{new Date(usage.period_start).toLocaleDateString()} – {new Date(usage.period_end).toLocaleDateString()}</p>
            {Object.keys(usage.endpoint_breakdown || {}).length > 0 && (
              <ul className="space-y-1.5">
                {Object.entries(usage.endpoint_breakdown).map(([ep, n]) => (
                  <li key={ep} className="flex items-center justify-between gap-3 text-[13px] py-1.5 border-t border-seam first:border-0">
                    <code className="font-mono text-ink bg-well px-2 py-0.5 rounded truncate">{ep}</code>
                    <span className="font-mono text-ink-tertiary shrink-0">{String(n)} calls</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <EmptyRow label="No usage yet — make a call and it shows up here." />
        )}
      </section>

      <section className="card p-6">
        <h2 className="font-display text-[15px] font-semibold text-ink mb-1 flex items-center gap-2"><Gauge size={16} className="text-go" /> Rate limits</h2>
        <p className="text-xs text-ink-tertiary mb-4">What each tier can do for workspace usage.</p>
        {tierInfo ? (
          <div className="overflow-x-auto -mx-6 px-6 overscroll-x-contain">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead>
                <tr className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-tertiary border-b border-seam">
                  <th className="py-2 pr-3 font-medium">Tier</th>
                  <th className="py-2 pr-3 font-medium">Per min</th>
                  <th className="py-2 pr-3 font-medium">Per day</th>
                  <th className="py-2 pr-3 font-medium">Credits/mo</th>
                  <th className="py-2 font-medium">Repos</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(tierInfo.tiers).map(([tier, l]) => (
                  <tr key={tier} className="border-b border-seam last:border-0">
                    <td className="py-2.5 pr-3 font-semibold text-ink capitalize">{tier}</td>
                    <td className="py-2.5 pr-3 font-mono text-go">{l.requests_per_minute}</td>
                    <td className="py-2.5 pr-3 font-mono">{l.requests_per_day.toLocaleString()}</td>
                    <td className="py-2.5 pr-3 font-mono">{l.credits_per_month > 0 ? l.credits_per_month.toLocaleString() : '∞'}</td>
                    <td className="py-2.5 font-mono">{l.max_repos < 0 ? '∞' : l.max_repos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-ink-tertiary flex items-center gap-2"><ShieldCheck size={16} /> Limits load with server connection.</p>
        )}
        <details className="mt-4 text-xs text-ink-tertiary">
          <summary className="cursor-pointer text-[13px] font-medium text-ink min-h-[44px] inline-flex items-center">What happens at 429?</summary>
          <p className="mt-1 leading-relaxed">HTTP 429 with <code className="font-mono bg-well px-1 rounded">X-RateLimit-Remaining</code> / <code className="font-mono bg-well px-1 rounded">X-RateLimit-Reset</code> headers. Back off until the reset time.</p>
        </details>
      </section>
    </div>
  )
}

/* ================= Playground — KEPT + debugged =================
 * Senior-designer decision: KEEP. A developer portal without a
 * sandbox is PayPal without the sandbox dashboard — activation
 * collapses because users must leave the product to get confidence.
 * Bugs fixed vs. the old stacked version (see inline FIX comments).
 */

function PlaygroundTab() {
  const toast = useToast()
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [agentsLoading, setAgentsLoading] = useState(true) // FIX: was no loading state (blank chips)
  const [agentsError, setAgentsError] = useState('') // FIX: was mixed into run-error line
  const [selectedAgent, setSelectedAgent] = useState('')
  const [paramsInput, setParamsInput] = useState('{\n  "repo_url": "https://github.com/facebook/react"\n}')
  const [result, setResult] = useState<{ result?: unknown; credits_used?: number; tier?: string } | null>(null)
  const [error, setError] = useState('')
  const [testing, setTesting] = useState(false)
  const [copiedResult, setCopiedResult] = useState(false)
  const mounted = useRef(true)
  const runId = useRef(0)

  useEffect(() => {
    mounted.current = true
    setAgentsLoading(true)
    listAgents()
      .then((d) => {
        if (!mounted.current) return
        const list = d.agents ?? []
        setAgents(list)
        if (list.length) {
          setSelectedAgent(list[0].name)
          setParamsInput(templateParams(list[0]))
        }
      })
      .catch((e: unknown) => {
        if (mounted.current) setAgentsError(e instanceof Error ? e.message : 'Could not load agents. Check server connection.')
      })
      .finally(() => { if (mounted.current) setAgentsLoading(false) })
    return () => { mounted.current = false }
  }, [])

  const agent = agents.find((a) => a.name === selectedAgent)

  function selectAgent(name: string) {
    setSelectedAgent(name)
    setError('') // FIX: stale run error persisted across agent switch
    setResult(null)
    const next = agents.find((a) => a.name === name)
    setParamsInput(templateParams(next)) // FIX: params now match the agent's required keys
  }

  async function handleRun() {
    if (!selectedAgent) { setError('Pick an agent first.'); return }
    let params: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(paramsInput)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not-object')
      params = parsed as Record<string, unknown>
    } catch {
      setError('Params must be a JSON object — check commas and quotes.')
      return
    }
    // FIX: client-side required-param check (was a 400 round-trip).
    const missing = (agent?.required_params ?? []).filter((k) => {
      if (k in params) return false
      return !(k === 'repo_structure' && 'index_id' in params) // backend allows index_id substitute
    })
    if (missing.length) { setError(`Missing: ${missing.join(', ')}. Add them to the JSON above.`); return }

    const myRun = ++runId.current // FIX: stale late responses can't overwrite a newer run
    setError(''); setResult(null); setTesting(true)
    try {
      const res = await executeAgent(selectedAgent, params)
      if (mounted.current && myRun === runId.current) {
        setResult(res)
        toast.success(`"${selectedAgent}" ran`)
      }
    } catch (err: any) {
      if (mounted.current && myRun === runId.current) setError(err?.message || 'Run failed')
    } finally {
      if (mounted.current && myRun === runId.current) setTesting(false)
    }
  }

  async function handleCopyResult() {
    const text = JSON.stringify(result?.result ?? result, null, 2) ?? ''
    if (await copyText(text)) {
      setCopiedResult(true)
      setTimeout(() => { if (mounted.current) setCopiedResult(false) }, 2000)
    }
  }

  return (
    <div className="space-y-5">
      <section className="card p-6" aria-label="API playground">
        <h2 className="font-display text-[15px] font-semibold text-ink">Try an agent</h2>
        <p className="text-xs text-ink-tertiary mt-0.5 mb-4">Pick one, press Run. Uses your session unless you paste a key. Nothing here bills until it runs.</p>

        {agentsLoading ? (
          <div className="flex items-center gap-2 py-4" role="status">
            <Spinner className="w-4 h-4 animate-spin text-go" />
            <span className="text-xs text-ink-tertiary">Loading agents…</span>
          </div>
        ) : agentsError ? (
          <div className="p-4 rounded-card bg-abort/8 border border-abort/20 text-[13px] text-abort" role="alert">
            {agentsError}{' '}
            <button type="button" onClick={() => window.location.reload()} className="underline font-medium">Retry</button>
          </div>
        ) : agents.length === 0 ? (
          <EmptyRow label="No agents available on this server yet." />
        ) : (
          <>
            <span className="field-label" id="agent-label">Agent</span>
            <div className="flex gap-2 overflow-x-auto pb-1 mt-1.5 overscroll-x-contain" role="radiogroup" aria-labelledby="agent-label">
              {agents.map((a) => (
                <button key={a.name} type="button" role="radio" aria-checked={selectedAgent === a.name} onClick={() => selectAgent(a.name)}
                  className={cn('shrink-0 min-h-[44px] px-4 rounded-btn text-[13px] font-medium border inline-flex items-center gap-1.5',
                    selectedAgent === a.name ? 'bg-go/15 text-go border-go/30' : 'bg-well text-ink-tertiary border-seam hover:border-seam-strong')}>
                  <Robot size={13} />{a.name}
                </button>
              ))}
            </div>
          </>
        )}

        {agent && (
          <p className="text-xs text-ink-tertiary mt-2">
            {agent.description} · {agent.credit_cost} credit(s)
            {agent.required_params?.length ? ` · needs ${agent.required_params.join(', ')}` : ''}
            {agent.model ? <span className="font-mono text-[11px] text-go/80 block mt-0.5">{agent.query_type} → {agent.model}</span> : null}
          </p>
        )}

        <div className="mt-4">
          <label className="field-label" htmlFor="pg-params">Input (JSON object)</label>
          <div className="mt-1.5 rounded-card overflow-hidden border border-seam">
            <Suspense fallback={<div className="h-40 flex items-center justify-center text-xs text-ink-tertiary">Loading editor…</div>}>
              <CodeEditor value={paramsInput} onChange={setParamsInput} language="json" height={160} />
            </Suspense>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 mt-4">
          <div className="flex gap-2">
            <button type="button" onClick={handleRun} disabled={testing || !selectedAgent || agentsLoading}
              className="btn btn-primary min-h-[44px] px-6 text-[13px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40"
              aria-busy={testing}>
              {testing ? <Spinner size={15} className="animate-spin" /> : <Play size={14} weight="fill" />}{testing ? 'Running…' : 'Run'}
            </button>
            {(result || error) && !testing && (
              <button type="button" onClick={() => { setResult(null); setError('') }}
                className="min-h-[44px] px-4 rounded-btn border border-seam text-[13px] text-ink-tertiary hover:text-ink">
                Reset
              </button>
            )}
          </div>
        </div>
        {error && <p className="text-[13px] text-abort mt-2.5" role="alert">{error}</p>}

        {result && (
          <div className="mt-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[13px] font-medium text-ink flex items-center gap-1.5">
                <Terminal size={13} className="text-go" /> Done
                {result.credits_used != null && <span className="text-ink-tertiary">· {result.credits_used} credit(s)</span>}
                {result.tier && <span className="text-ink-tertiary">· {result.tier} tier</span>}
              </p>
              <button type="button" onClick={handleCopyResult}
                className="min-h-[44px] min-w-[44px] rounded-btn flex items-center justify-center text-ink-muted hover:text-go"
                aria-label="Copy result JSON">
                {copiedResult ? <Check size={15} className="text-go" /> : <Copy size={15} />}
              </button>
            </div>
            <pre className="bg-panel border border-seam rounded-card p-4 font-mono text-xs text-ink-secondary overflow-auto max-h-[380px] leading-relaxed">
              {JSON.stringify(result.result ?? result, null, 2)}
            </pre>
          </div>
        )}
      </section>

      <section className="card p-6">
        <h2 className="font-display text-[15px] font-semibold text-ink mb-3">Core endpoints</h2>
        <div className="space-y-2.5">
          {([
            { m: 'POST', p: '/api/v1/analyze', d: 'Index a repo', b: '{\n  "repo_url": "https://github.com/owner/repo",\n  "branch": "main"\n}' },
            { m: 'POST', p: '/api/v1/ask', d: 'Ask about indexed code', b: '{\n  "index_id": "abc123",\n  "question": "Where is the webhook signature verified?"\n}' },
          ] as const).map((e) => (
            <details key={e.p} className="rounded-card bg-panel border border-seam">
              <summary className="cursor-pointer min-h-[44px] flex items-center gap-2.5 px-4 py-2.5 list-none">
                <span className="font-mono text-[10px] font-bold bg-mission/10 text-mission border border-mission/20 px-2 py-0.5 rounded">{e.m}</span>
                <span className="font-mono text-xs text-ink">{e.p}</span>
                <span className="text-xs text-ink-tertiary ml-auto hidden sm:inline">{e.d}</span>
              </summary>
              <div className="px-4 pb-4"><CodeBlock label="Body" code={e.b} /></div>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}

/* ================= Shared bits ================= */

function CodeBlock({ label, code, copied, onCopy }: { label: string; code: string; copied?: boolean; onCopy?: () => void }) {
  return (
    <div className="bg-well border border-seam rounded-card overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-seam">
        <span className="flex items-center gap-2 font-mono text-[11px] text-ink-tertiary"><Code size={13} />{label}</span>
        {onCopy && (
          <button type="button" onClick={onCopy} aria-label={`Copy ${label}`}
            className="min-h-[44px] min-w-[44px] -my-1 rounded-btn flex items-center justify-center text-ink-muted hover:text-go">
            {copied ? <Check size={14} className="text-go" /> : <Copy size={14} />}
          </button>
        )}
      </div>
      <pre className="p-4 font-mono text-xs text-ink-secondary overflow-x-auto leading-relaxed whitespace-pre">{code}</pre>
    </div>
  )
}

function CatalogList({ models, search, copiedId, onCopy }: {
  models: OpenRouterCatalogModel[]; search: string; copiedId: string | null; onCopy: (id: string, c: string) => void
}) {
  const q = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    const f = q ? models.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)) : models
    return f.slice(0, 60)
  }, [models, q])
  const free = models.filter((m) => m.free).length
  return (
    <>
      <p className="font-mono text-[11px] text-ink-tertiary mb-2">{models.length} models · {free} free{q && ` · showing ${filtered.length} for “${search}”`}</p>
      <ul className="max-h-[320px] overflow-y-auto space-y-1.5 pr-1 overscroll-contain">
        {filtered.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 bg-panel border border-seam rounded-card px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs text-ink truncate">{m.id}
                <span className={cn('ml-2 font-mono text-[9px] uppercase px-1.5 py-0.5 rounded border',
                  m.free ? 'text-go/80 bg-go/10 border-go/20' : 'text-caution/80 bg-caution/10 border-caution/20')}>{m.free ? 'Free' : 'Paid'}</span>
              </p>
              <p className="text-[11px] text-ink-tertiary truncate">{m.name}</p>
            </div>
            <button type="button" onClick={() => onCopy(`model-${m.id}`, m.id)} aria-label={`Copy ${m.id}`}
              className="min-h-[44px] min-w-[44px] rounded-btn flex items-center justify-center text-ink-muted hover:text-go shrink-0">
              {copiedId === `model-${m.id}` ? <Check size={14} className="text-go" /> : <Copy size={14} />}
            </button>
          </li>
        ))}
      </ul>
      {models.length > 60 && !q && <p className="text-[11px] text-ink-tertiary mt-1.5">Showing 60 of {models.length} — search to narrow.</p>}
    </>
  )
}
