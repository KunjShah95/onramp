import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth, KEY_MANAGER_ROLES } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { copyText } from '../lib/clipboard'
import { listApiKeys, createApiKey, revokeApiKey, getUsageSummary, listTiers, listAgents, executeAgent, listProviderKeys, setProviderKey, deleteProviderKey, addProviderKey, fetchModelCatalog, fetchRoutingMode, setRoutingMode, type ApiKey, type RateLimitInfo, type AgentInfo, type ProviderKeyInfo, type ModelCatalog, type OpenRouterCatalogModel } from '../lib/api'
import { daysUntilExpiry, formatKeyDate } from '../lib/utils'
import { Code, Key, Copy, Check, Trash, Spinner, ArrowRight, ShieldCheck, Play, Robot, Terminal, PencilSimple, CheckCircle, Circle, BookOpen, Gauge } from '@phosphor-icons/react'
import { PageHeader } from '../components/ui/page-header'
import CodeEditor from '../components/ui/monaco-editor'
import { PROVIDER_OPTIONS } from '../lib/providers'
import { cn } from '../lib/utils'

/* ------------------------------------------------------------------
 * Developer Portal — PayPal-grade redesign.
 * One task per tab. Playground KEPT (sandbox drives activation)
 * but debugged: loading/empty states, required-param validation,
 * abort-safe runs, safe result rendering, 44px targets, aria.
 * ------------------------------------------------------------------ */

type TabId = 'overview' | 'keys' | 'models' | 'usage' | 'playground'

const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: 'overview', label: 'Get started', hint: '3 steps to first call' },
  { id: 'keys', label: 'API keys', hint: 'Credentials' },
  { id: 'models', label: 'Models & routing', hint: 'Providers + catalog' },
  { id: 'usage', label: 'Usage & limits', hint: 'Spend + quotas' },
  { id: 'playground', label: 'Playground', hint: 'Try it live' },
]

const QUICKSTART_CALL = `curl https://onramp.app/api/v1/ask \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"question": "Where is auth verified?"}'`

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
  const { activeTeamId, role } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState<TabId>('overview')

  const [keys, setKeys] = useState<ApiKey[]>([])
  const [newKey, setNewKey] = useState<string | null>(null)
  const [keyError, setKeyError] = useState('')
  const [loading, setLoading] = useState(false)
  const [usage, setUsage] = useState<any>(null)
  const [tierInfo, setTierInfo] = useState<RateLimitInfo | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyTier, setNewKeyTier] = useState('pro')
  const [newKeyCostLimit, setNewKeyCostLimit] = useState('')
  const [newKeyExpiry, setNewKeyExpiry] = useState('')
  const [creatingKey, setCreatingKey] = useState(false)
  const [providerKeys, setProviderKeys] = useState<Record<string, ProviderKeyInfo>>({})
  const [providerKeyCounts, setProviderKeyCounts] = useState<Record<string, number>>({})
  const [editingProvider, setEditingProvider] = useState<string | null>(null)
  const [addingPoolKey, setAddingPoolKey] = useState(false)
  const [providerKeyInput, setProviderKeyInput] = useState('')
  const [savingProviderKey, setSavingProviderKey] = useState(false)
  const [confirmDeleteProvider, setConfirmDeleteProvider] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogSearch, setCatalogSearch] = useState('')
  const [routingMode, setRoutingModeState] = useState<number | null>(null)
  const [routingModeLoading, setRoutingModeLoading] = useState(false)
  const [savingRoutingMode, setSavingRoutingMode] = useState(false)

  const today = new Date().toISOString().split('T')[0]
  const canManageKeys = !!role && KEY_MANAGER_ROLES.includes(role)

  useEffect(() => {
    if (!activeTeamId) return
    fetchKeys(); fetchUsage(); fetchTiers(); fetchProviderKeys(); fetchCatalog(); fetchRoutingModePref()
  }, [activeTeamId])

  async function fetchCatalog() {
    setCatalogLoading(true)
    try { setCatalog(await fetchModelCatalog()) } catch { setCatalog(null) }
    setCatalogLoading(false)
  }
  async function fetchKeys() {
    if (!activeTeamId) return
    setLoading(true)
    try { setKeys((await listApiKeys(activeTeamId)).keys || []) }
    catch (err: any) { setKeyError(err.message || 'Failed to load API keys') }
    setLoading(false)
  }
  async function fetchUsage() {
    if (!activeTeamId) return
    try { setUsage(await getUsageSummary(activeTeamId)) } catch { setUsage(null) }
  }
  async function fetchTiers() {
    try { setTierInfo(await listTiers()) } catch { /* empty */ }
  }
  async function fetchProviderKeys() {
    if (!activeTeamId) return
    try {
      const data = await listProviderKeys(activeTeamId)
      const map: Record<string, ProviderKeyInfo> = {}
      const counts: Record<string, number> = {}
      ;(data.providers || []).forEach((p) => {
        counts[p.provider] = (counts[p.provider] || 0) + 1
        if (!map[p.provider] || p.is_primary) map[p.provider] = p
      })
      setProviderKeys(map); setProviderKeyCounts(counts)
    } catch { /* silent */ }
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
  async function handleSaveProviderKey() {
    if (!activeTeamId || !editingProvider) return
    setSavingProviderKey(true)
    try {
      if (addingPoolKey) await addProviderKey(activeTeamId, editingProvider, providerKeyInput.trim())
      else await setProviderKey(activeTeamId, editingProvider, providerKeyInput.trim())
      setEditingProvider(null); setAddingPoolKey(false); setProviderKeyInput('')
      await fetchProviderKeys()
      toast.success('Saved', `${editingProvider} key updated`)
    } catch (err: any) { toast.error('Failed', err.message || 'Failed to save provider key') }
    setSavingProviderKey(false)
  }
  async function handleDeleteProviderKey(provider: string) {
    if (!activeTeamId) return
    try {
      await deleteProviderKey(activeTeamId, provider)
      await fetchProviderKeys(); setConfirmDeleteProvider(null)
      toast.success('Removed', `${provider} key removed · platform default will be used`)
    } catch (err: any) { toast.error('Failed', err.message || 'Failed to remove provider key') }
  }
  async function handleCreateKey() {
    if (!activeTeamId) return
    setCreatingKey(true); setKeyError('')
    const raw = Number(newKeyCostLimit.trim() || '')
    const costLimit = Number.isFinite(raw) && raw > 0 ? raw : undefined
    const expiresInDays = daysUntilExpiry(newKeyExpiry)
    try {
      const data = await createApiKey(activeTeamId, newKeyTier, newKeyName.trim() || undefined, costLimit, expiresInDays)
      setNewKey(data.raw_key)
      setShowCreateForm(false); setNewKeyName(''); setNewKeyTier('pro'); setNewKeyCostLimit(''); setNewKeyExpiry('')
      await fetchKeys()
      toast.success('Created', 'API key created · copy it now')
      setTab('overview')
    } catch (err: any) { setKeyError(err.message || 'Failed to create API key') }
    setCreatingKey(false)
  }
  async function handleRevokeKey(keyId: string) {
    if (!activeTeamId) return
    setLoading(true)
    try { await revokeApiKey(keyId); await fetchKeys(); toast.success('Revoked', 'API key revoked') }
    catch (err: any) { toast.error('Failed', err.message || 'Failed to revoke key') }
    setLoading(false)
  }
  async function handleCopy(id: string, content: string) {
    try {
      if (await copyText(content)) { setCopiedId(id); setTimeout(() => setCopiedId(null), 2000) }
    } catch { /* clipboard unavailable — helper never throws */ }
  }

  const activeKeys = useMemo(() => keys.filter((k) => k.is_active), [keys])
  const steps = useMemo(() => ([
    { done: activeKeys.length > 0, title: 'Create an API key', sub: activeKeys.length ? `${activeKeys.length} active` : 'Takes 10 seconds' },
    { done: (usage?.total_credits ?? 0) > 0, title: 'Make your first call', sub: 'Copy the curl below or press Run in Playground' },
    { done: Object.keys(providerKeys).length > 0, title: 'Connect a provider (optional)', sub: 'Use your own LLM key or stay on platform' },
  ]), [activeKeys.length, usage, providerKeys])
  const doneCount = steps.filter((s) => s.done).length

  if (!activeTeamId) {
    return (
      <div className="max-w-3xl mx-auto">
        <PageHeader eyebrow="Developer portal" title="Developer portal" subtitle="API keys, models, and usage — in one calm place." />
        <div className="card p-8 text-center text-ink-tertiary text-sm">Select a team to access developer settings.</div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        eyebrow="Developer portal"
        title="Developer portal"
        subtitle="Ship your first API call in under a minute. Keys, models, spend — one task at a time."
        pills={[
          { label: 'active keys', value: activeKeys.length },
          { label: 'credits used', value: usage?.total_credits ?? '—', color: 'text-go' },
          { label: 'providers', value: Object.keys(providerKeys).length },
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

      {tab === 'overview' && (
        <OverviewTab steps={steps} doneCount={doneCount} newKey={newKey} copiedId={copiedId}
          onCopy={handleCopy} onCreate={() => { setShowCreateForm(true); setTab('keys') }}
          hasKeys={activeKeys.length > 0} onGoPlayground={() => setTab('playground')} />
      )}
      {tab === 'keys' && (
        <KeysTab
          keys={keys} loading={loading} keyError={keyError} newKey={newKey} copiedId={copiedId}
          showCreateForm={showCreateForm} setShowCreateForm={setShowCreateForm}
          newKeyName={newKeyName} setNewKeyName={setNewKeyName} newKeyTier={newKeyTier} setNewKeyTier={setNewKeyTier}
          newKeyCostLimit={newKeyCostLimit} setNewKeyCostLimit={setNewKeyCostLimit}
          newKeyExpiry={newKeyExpiry} setNewKeyExpiry={setNewKeyExpiry} today={today}
          creatingKey={creatingKey} canManageKeys={canManageKeys}
          onCreate={handleCreateKey} onRevoke={handleRevokeKey} onCopy={handleCopy} />
      )}
      {tab === 'models' && (
        <ModelsTab
          providerKeys={providerKeys} providerKeyCounts={providerKeyCounts}
          editingProvider={editingProvider} setEditingProvider={setEditingProvider}
          addingPoolKey={addingPoolKey} setAddingPoolKey={setAddingPoolKey}
          providerKeyInput={providerKeyInput} setProviderKeyInput={setProviderKeyInput}
          savingProviderKey={savingProviderKey} confirmDeleteProvider={confirmDeleteProvider}
          setConfirmDeleteProvider={setConfirmDeleteProvider}
          onSave={handleSaveProviderKey} onDelete={handleDeleteProviderKey}
          canManageKeys={canManageKeys} catalog={catalog} catalogLoading={catalogLoading}
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

/* ================= Overview ================= */

function OverviewTab({ steps, doneCount, newKey, copiedId, onCopy, onCreate, hasKeys, onGoPlayground }: {
  steps: { done: boolean; title: string; sub: string }[]
  doneCount: number; newKey: string | null; copiedId: string | null
  onCopy: (id: string, c: string) => void; onCreate: () => void; hasKeys: boolean; onGoPlayground: () => void
}) {
  return (
    <div className="space-y-5">
      {newKey && <NewKeyBanner value={newKey} copied={copiedId === 'new-key'} onCopy={() => onCopy('new-key', newKey)} />}
      <section className="card p-6" aria-label="Setup progress">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h2 className="font-display text-[15px] font-semibold text-ink">Get to your first call</h2>
          <span className="font-mono text-xs text-go">{doneCount}/3 done</span>
        </div>
        <div className="h-1.5 rounded-full bg-well overflow-hidden mb-4" role="progressbar" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={3}>
          <div className="h-full bg-go rounded-full transition-all" style={{ width: `${(doneCount / 3) * 100}%` }} />
        </div>
        <ol className="space-y-2.5">
          {steps.map((s, i) => (
            <li key={s.title} className="flex items-start gap-3 p-3 rounded-card bg-panel border border-seam">
              {s.done
                ? <CheckCircle size={20} weight="fill" className="text-go shrink-0 mt-0.5" aria-label="done" />
                : <Circle size={20} className="text-ink-tertiary shrink-0 mt-0.5" aria-hidden />}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-ink"><span className="font-mono text-[11px] text-ink-tertiary mr-2">{i + 1}</span>{s.title}</p>
                <p className="text-xs text-ink-tertiary">{s.sub}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2.5 mt-4">
          {!hasKeys && (
            <button type="button" onClick={onCreate} className="btn btn-primary min-h-[44px] px-5 text-[13px] font-semibold inline-flex items-center gap-2">
              <Key size={15} /> Create API key
            </button>
          )}
          <button type="button" onClick={onGoPlayground} className="min-h-[44px] px-5 rounded-btn border border-seam text-[13px] font-semibold text-ink hover:border-go/40 hover:text-go transition-all inline-flex items-center gap-2">
            <Play size={14} weight="fill" /> Try playground
          </button>
        </div>
      </section>

      <section className="card p-6" aria-label="Quickstart">
        <h2 className="font-display text-[15px] font-semibold text-ink mb-1">Make a call</h2>
        <p className="text-xs text-ink-tertiary mb-3">Replace <code className="font-mono bg-well px-1 rounded">YOUR_API_KEY</code> and paste into your terminal.</p>
        <CodeBlock label="curl · first request" code={QUICKSTART_CALL} copied={copiedId === 'quickstart'} onCopy={() => onCopy('quickstart', QUICKSTART_CALL)} />
        <a href="/docs#api" className="inline-flex items-center gap-1.5 mt-3 text-[13px] font-medium text-go hover:text-go/80">
          <BookOpen size={14} /> Full API reference <ArrowRight size={13} />
        </a>
      </section>
    </div>
  )
}

/* ================= Keys ================= */

function KeysTab(props: {
  keys: ApiKey[]; loading: boolean; keyError: string; newKey: string | null; copiedId: string | null
  showCreateForm: boolean; setShowCreateForm: (v: boolean) => void
  newKeyName: string; setNewKeyName: (v: string) => void; newKeyTier: string; setNewKeyTier: (v: string) => void
  newKeyCostLimit: string; setNewKeyCostLimit: (v: string) => void
  newKeyExpiry: string; setNewKeyExpiry: (v: string) => void; today: string
  creatingKey: boolean; canManageKeys: boolean
  onCreate: () => void; onRevoke: (id: string) => void; onCopy: (id: string, c: string) => void
}) {
  const { keys, loading } = props
  const active = keys.filter((k) => k.is_active)
  return (
    <div className="space-y-5">
      {props.newKey && <NewKeyBanner value={props.newKey} copied={props.copiedId === 'new-key'} onCopy={() => props.onCopy('new-key', props.newKey!)} />}
      <section className="card p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-ink">API keys</h2>
            <p className="text-xs text-ink-tertiary mt-0.5">{active.length} active · revoked keys stay listed for audit</p>
          </div>
          <button
            type="button"
            onClick={() => props.setShowCreateForm(!props.showCreateForm)}
            disabled={!props.canManageKeys}
            className="btn btn-primary min-h-[44px] px-4 text-[13px] font-semibold inline-flex items-center gap-2 disabled:opacity-40 shrink-0"
          >
            <Key size={14} /> {props.showCreateForm ? 'Close' : 'New key'}
          </button>
        </div>

        {props.showCreateForm && props.canManageKeys && (
          <div className="mb-5 p-5 rounded-card bg-panel border border-go/20 space-y-4">
            <Field label="Name">
              <input value={props.newKeyName} onChange={(e) => props.setNewKeyName(e.target.value)} placeholder="e.g. CI pipeline, staging, prod" className="input w-full" />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="field-label">Tier</span>
                <div className="flex flex-wrap gap-2 mt-1.5" role="radiogroup" aria-label="Key tier">
                  {['free', 'pro', 'team', 'enterprise'].map((t) => (
                    <button key={t} type="button" role="radio" aria-checked={props.newKeyTier === t} onClick={() => props.setNewKeyTier(t)}
                      className={cn('min-h-[44px] px-4 rounded-btn text-[13px] font-medium capitalize border transition-all',
                        props.newKeyTier === t ? 'bg-go/15 text-go border-go/30' : 'bg-well text-ink-tertiary border-seam')}>{t}</button>
                  ))}
                </div>
              </div>
              <Field label="Expires on (optional)">
                <input value={props.newKeyExpiry} onChange={(e) => props.setNewKeyExpiry(e.target.value)} type="date" min={props.today} className="input w-full" />
              </Field>
            </div>
            <Field label="Monthly credit cap (optional)" hint="Blank = no limit. The key stops working at this budget.">
              <input value={props.newKeyCostLimit} onChange={(e) => props.setNewKeyCostLimit(e.target.value.replace(/[^0-9]/g, ''))}
                inputMode="numeric" placeholder="e.g. 5000" className="input w-full" />
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => props.setShowCreateForm(false)} className="min-h-[44px] px-4 text-[13px] text-ink-tertiary">Cancel</button>
              <button type="button" onClick={props.onCreate} disabled={props.creatingKey} className="btn btn-primary min-h-[44px] px-5 text-[13px] font-semibold inline-flex items-center gap-2">
                {props.creatingKey && <Spinner className="w-4 h-4 animate-spin" />}{props.creatingKey ? 'Creating…' : 'Create key'}
              </button>
            </div>
          </div>
        )}

        {props.keyError && <div className="mb-4 px-4 py-3 rounded-card bg-abort/8 border border-abort/20 text-abort text-sm" role="alert">{props.keyError}</div>}

        {loading && !keys.length
          ? <div className="flex justify-center py-10"><Spinner className="w-6 h-6 text-go animate-spin" aria-label="Loading keys" /></div>
          : keys.length ? (
            <ul className="space-y-2.5">
              {keys.map((key) => {
                const limit = key.credit_limit ?? 0
                const used = key.credits_used ?? key.usage_count ?? 0
                const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
                const exhausted = limit > 0 && used >= limit
                return (
                  <li key={key.key_id} className={cn('p-4 rounded-card bg-panel border', key.is_active ? 'border-seam' : 'border-seam opacity-60')}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={cn('w-2 h-2 rounded-full shrink-0', key.is_active ? 'bg-go' : 'bg-ink-tertiary')} aria-hidden />
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-ink truncate">{key.name || 'Unnamed key'}</p>
                          <p className="font-mono text-[11px] text-ink-tertiary truncate">{key.key_id} · {key.tier} · {key.is_active ? 'Active' : 'Revoked'}</p>
                        </div>
                      </div>
                      <button type="button" onClick={() => props.onRevoke(key.key_id)} disabled={!key.is_active || loading || !props.canManageKeys}
                        aria-label={`Revoke ${key.name || key.key_id}`}
                        className="min-h-[44px] min-w-[44px] rounded-btn flex items-center justify-center text-ink-muted hover:text-abort hover:bg-abort/10 disabled:opacity-30">
                        <Trash size={16} />
                      </button>
                    </div>
                    <p className="font-mono text-[11px] text-ink-tertiary mt-1.5">
                      Created {formatKeyDate(key.created_at)}
                      {key.last_used_at && <> · used {formatKeyDate(key.last_used_at)}</>}
                      {key.expires_at && <> · expires {formatKeyDate(key.expires_at)}</>}
                    </p>
                    {key.credit_limit != null && (
                      <div className="flex items-center gap-2 mt-2">
                        <div className="h-1.5 flex-1 max-w-40 rounded-full bg-well overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                          <div className={cn('h-full rounded-full', exhausted ? 'bg-abort' : 'bg-go')} style={{ width: `${pct}%` }} />
                        </div>
                        <span className={cn('font-mono text-[11px]', exhausted ? 'text-abort' : 'text-ink-tertiary')}>{used}/{key.credit_limit}{exhausted ? ' · capped' : ''}</span>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="text-center py-10 text-sm text-ink-tertiary">No keys yet. Create one to make your first call.</div>
          )}
      </section>
    </div>
  )
}

/* ================= Models & routing ================= */

function ModelsTab(props: {
  providerKeys: Record<string, ProviderKeyInfo>; providerKeyCounts: Record<string, number>
  editingProvider: string | null; setEditingProvider: (v: string | null) => void
  addingPoolKey: boolean; setAddingPoolKey: (v: boolean) => void
  providerKeyInput: string; setProviderKeyInput: (v: string) => void
  savingProviderKey: boolean; confirmDeleteProvider: string | null; setConfirmDeleteProvider: (v: string | null) => void
  onSave: () => void; onDelete: (p: string) => void; canManageKeys: boolean
  catalog: ModelCatalog | null; catalogLoading: boolean; catalogSearch: string; setCatalogSearch: (v: string) => void
  copiedId: string | null; onCopy: (id: string, c: string) => void
  routingMode: number | null; routingModeLoading: boolean; savingRoutingMode: boolean; onRouting: (m: number) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const [providerFilter, setProviderFilter] = useState('')
  const configured = PROVIDER_OPTIONS.filter((p) => props.providerKeys[p.id]?.configured)
  const popular = PROVIDER_OPTIONS.filter((p) => ['openrouter', 'openai', 'anthropic', 'gemini', 'groq'].includes(p.id) && !props.providerKeys[p.id]?.configured)
  const rest = PROVIDER_OPTIONS.filter((p) => ![...configured, ...popular].some((x) => x.id === p.id))
    .filter((p) => p.label.toLowerCase().includes(providerFilter.toLowerCase()))
  const visible = showAll ? [...configured, ...popular, ...rest] : [...configured, ...popular]

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
                disabled={props.savingRoutingMode || !props.canManageKeys}
                onClick={() => props.onRouting(o.v)}
                className={cn('min-h-[52px] rounded-btn px-2 py-2 text-center transition-all disabled:opacity-50',
                  props.routingMode === o.v ? 'bg-bg text-ink shadow border border-go/30' : 'text-ink-tertiary hover:text-ink')}>
                <span className="block text-[13px] font-bold">{o.label}</span>
                <span className="block text-[11px] opacity-70">{o.sub}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="card p-6">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-ink">Your model keys</h2>
            <p className="text-xs text-ink-tertiary mt-0.5">{configured.length} connected · leave the rest on platform defaults</p>
          </div>
        </div>
        <ul className="divide-y divide-seam">
          {visible.map((p) => {
            const info = props.providerKeys[p.id]
            const on = !!info?.configured
            const editing = props.editingProvider === p.id
            return (
              <li key={p.id} className="py-3.5">
                <div className="flex items-center justify-between gap-3 min-h-[44px]">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={cn('w-2 h-2 rounded-full shrink-0', on ? 'bg-go' : 'bg-ink-tertiary/40')} aria-hidden />
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-ink truncate">{p.label}</p>
                      <p className="font-mono text-[11px] text-ink-tertiary">{on ? `Connected${(props.providerKeyCounts[p.id] || 1) > 1 ? ` · ${props.providerKeyCounts[p.id]} keys rotate` : ''}` : 'Using platform key'}</p>
                    </div>
                  </div>
                  {props.canManageKeys && (
                    <button type="button" onClick={() => { props.setAddingPoolKey(false); props.setEditingProvider(editing ? null : p.id); props.setProviderKeyInput('') }}
                      className="min-h-[44px] px-3.5 rounded-btn border border-seam text-[12px] font-semibold text-ink hover:border-go/40 hover:text-go shrink-0 inline-flex items-center gap-1.5">
                      <PencilSimple size={13} />{on ? 'Update' : 'Connect'}
                    </button>
                  )}
                </div>
                {editing && (
                  <div className="mt-2.5 flex flex-col sm:flex-row gap-2">
                    <input type="password" value={props.providerKeyInput} onChange={(e) => props.setProviderKeyInput(e.target.value)}
                      placeholder="Paste key…" autoFocus className="input flex-1 font-mono" aria-label={`${p.label} key`} />
                    <div className="flex gap-2">
                      <button type="button" onClick={props.onSave} disabled={props.savingProviderKey || !props.providerKeyInput.trim()}
                        className="btn btn-primary min-h-[44px] px-4 text-[13px] font-semibold disabled:opacity-40">
                        {props.savingProviderKey ? 'Saving…' : 'Save'}
                      </button>
                      {on && (
                        <button type="button" onClick={() => props.confirmDeleteProvider === p.id ? props.onDelete(p.id) : props.setConfirmDeleteProvider(p.id)}
                          className="min-h-[44px] px-3 rounded-btn text-[12px] text-ink-muted hover:text-abort">
                          {props.confirmDeleteProvider === p.id ? 'Confirm remove?' : 'Remove'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        <div className="flex flex-col sm:flex-row gap-2 mt-3">
          {showAll && (
            <input value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} placeholder="Filter providers…"
              className="input sm:max-w-56" aria-label="Filter providers" />
          )}
          <button type="button" onClick={() => setShowAll(!showAll)} className="min-h-[44px] text-[13px] font-medium text-go text-left">
            {showAll ? 'Show fewer' : `Show all ${PROVIDER_OPTIONS.length} providers`}
          </button>
        </div>
        <details className="mt-4 text-xs text-ink-tertiary">
          <summary className="cursor-pointer text-[13px] font-medium text-ink min-h-[44px] inline-flex items-center">How does this work?</summary>
          <p className="mt-1 leading-relaxed">Requests made with this team's API key use your keys instead of platform defaults, for <code className="font-mono bg-well px-1 rounded">/v1/chat/completions</code> and <code className="font-mono bg-well px-1 rounded">/v1/embeddings</code>. Keys are encrypted at rest.</p>
        </details>
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
          <p className="text-sm text-ink-tertiary py-4">No usage yet — make a call and it shows up here.</p>
        )}
      </section>

      <section className="card p-6">
        <h2 className="font-display text-[15px] font-semibold text-ink mb-1 flex items-center gap-2"><Gauge size={16} className="text-go" /> Rate limits</h2>
        <p className="text-xs text-ink-tertiary mb-4">What each tier can do. Your key's tier is shown on the Keys tab.</p>
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
  const [apiKeyInput, setApiKeyInput] = useState('')
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
      const res = await executeAgent(selectedAgent, params, apiKeyInput.trim() || undefined)
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
          <p className="text-[13px] text-ink-tertiary py-4">No agents available on this server yet.</p>
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
            <CodeEditor value={paramsInput} onChange={setParamsInput} language="json" height={160} />
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
          <input value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} placeholder="Optional key override (cf_…)"
            className="input sm:max-w-64 font-mono" aria-label="API key override" autoComplete="off" spellCheck={false} />
        </div>
        <p className="text-[11px] text-ink-tertiary mt-2">Empty key field = your signed-in session. Paste a <code className="font-mono bg-well px-1 rounded">cf_…</code> key to test exactly what your app sends (header <code className="font-mono bg-well px-1 rounded">X-API-Key</code>).</p>

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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="text-[11px] text-ink-tertiary mt-1">{hint}</p>}
    </div>
  )
}

function NewKeyBanner({ value, copied, onCopy }: { value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="p-4 rounded-card bg-caution/10 border border-caution/25" role="alert">
      <p className="font-mono text-[11px] font-bold text-caution uppercase tracking-wider mb-2">Copy this now — shown once</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 font-mono text-xs text-caution bg-caution/10 px-2.5 py-2 rounded truncate">{value}</code>
        <button type="button" onClick={onCopy} aria-label="Copy new API key"
          className="min-h-[44px] min-w-[44px] rounded-btn flex items-center justify-center text-caution hover:bg-caution/15 shrink-0">
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>
    </div>
  )
}

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
