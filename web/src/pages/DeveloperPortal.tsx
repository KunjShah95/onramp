import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useAuth, KEY_MANAGER_ROLES } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { listApiKeys, createApiKey, revokeApiKey, getUsageSummary, listTiers, listAgents, executeAgent, listProviderKeys, setProviderKey, deleteProviderKey, addProviderKey, fetchModelCatalog, type ApiKey, type RateLimitInfo, type AgentInfo, type ProviderKeyInfo, type ModelCatalog, type OpenRouterCatalogModel } from '../lib/api'
import { daysUntilExpiry, formatKeyDate } from '../lib/utils'
import { Code, Key, Clock, Info, Copy, Check, Trash, Spinner, ArrowRight, ShieldCheck, Lightning, Eye, Warning, Play, Robot, Terminal, Lock, PencilSimple, Stack, MagnifyingGlass, Plus } from '@phosphor-icons/react'
import CardSpotlight from '../components/ui/card-spotlight'
import { PageHeader } from '../components/ui/page-header'
import CodeEditor from '../components/ui/monaco-editor'
import { PROVIDER_OPTIONS } from '../lib/providers'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
}

const codeBlock = (label: string, code: string) => (
  <div className="bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
    <div className="flex items-center gap-2 px-4 py-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/80">
      <Code className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]/60" />
      <span className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{label}</span>
    </div>
    <pre className="p-4 font-mono text-xs text-[hsl(var(--accent))] overflow-x-auto leading-relaxed">{code}</pre>
  </div>
)

export default function DeveloperPortal() {
  const { activeTeamId, role } = useAuth()
  const toast = useToast()
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

  // Earliest selectable expiry date (today) — past dates mean "no expiry".
  const today = new Date().toISOString().split('T')[0]

  // Engineering + executive seats may issue credentials; other roles see the
  // roster read-only (matches the Settings API Keys panel).
  const canManageKeys = !!role && KEY_MANAGER_ROLES.includes(role)

  useEffect(() => {
    if (!activeTeamId) return
    fetchKeys()
    fetchUsage()
    fetchTiers()
    fetchProviderKeys()
    fetchCatalog()
  }, [activeTeamId])

  async function fetchCatalog() {
    setCatalogLoading(true)
    try {
      const data = await fetchModelCatalog()
      setCatalog(data)
    } catch {
      setCatalog(null)
    }
    setCatalogLoading(false)
  }

  async function fetchKeys() {
    if (!activeTeamId) return
    setLoading(true)
    try {
      const data = await listApiKeys(activeTeamId)
      setKeys(data.keys || [])
    } catch (err: any) {
      setKeyError(err.message || 'Failed to load API keys')
    }
    setLoading(false)
  }

  async function fetchUsage() {
    if (!activeTeamId) return
    try {
      const data = await getUsageSummary(activeTeamId)
      setUsage(data)
    } catch {
      setUsage(null)
    }
  }

  async function fetchTiers() {
    try {
      const data = await listTiers()
      setTierInfo(data)
    } catch {
      // Fall back to empty state
    }
  }

  async function fetchProviderKeys() {
    if (!activeTeamId) return
    try {
      const data = await listProviderKeys(activeTeamId)
      const map: Record<string, ProviderKeyInfo> = {}
      const counts: Record<string, number> = {}
      ;(data.providers || []).forEach((p) => {
        counts[p.provider] = (counts[p.provider] || 0) + 1
        // Primary wins the card's "configured" state; extra keys still count.
        if (!map[p.provider] || p.is_primary) map[p.provider] = p
      })
      setProviderKeys(map)
      setProviderKeyCounts(counts)
    } catch {
      // Silent — section stays read-only / empty
    }
  }

  async function handleSaveProviderKey() {
    if (!activeTeamId || !editingProvider) return
    setSavingProviderKey(true)
    try {
      if (addingPoolKey) {
        await addProviderKey(activeTeamId, editingProvider, providerKeyInput.trim())
      } else {
        await setProviderKey(activeTeamId, editingProvider, providerKeyInput.trim())
      }
      setEditingProvider(null)
      setAddingPoolKey(false)
      setProviderKeyInput('')
      await fetchProviderKeys()
      toast.success('Saved', addingPoolKey
        ? `${editingProvider} pool key added — traffic now rotates across ${(providerKeyCounts[editingProvider] || 0) + 1} keys`
        : `${editingProvider} key updated`)
    } catch (err: any) {
      toast.error('Failed', err.message || 'Failed to save provider key')
    }
    setSavingProviderKey(false)
  }

  async function handleDeleteProviderKey(provider: string) {
    if (!activeTeamId) return
    try {
      await deleteProviderKey(activeTeamId, provider)
      await fetchProviderKeys()
      setConfirmDeleteProvider(null)
      toast.success('Removed', `${provider} key removed — platform key will be used`)
    } catch (err: any) {
      toast.error('Failed', err.message || 'Failed to remove provider key')
    }
  }

  async function handleCreateKey() {
    if (!activeTeamId) return
    setCreatingKey(true); setKeyError('')
    // 0/empty = no limit (matches backend semantics where a 0 budget is free).
    const raw = Number(newKeyCostLimit.trim() || '')
    const costLimit = Number.isFinite(raw) && raw > 0 ? raw : undefined
    const expiresInDays = daysUntilExpiry(newKeyExpiry)
    try {
      const data = await createApiKey(activeTeamId, newKeyTier, newKeyName.trim() || undefined, costLimit, expiresInDays)
      setNewKey(data.raw_key)
      setShowCreateForm(false); setNewKeyName(''); setNewKeyTier('pro'); setNewKeyCostLimit(''); setNewKeyExpiry('')
      await fetchKeys()
      toast.success('Created', 'API key created — copy it now')
    } catch (err: any) {
      setKeyError(err.message || 'Failed to create API key')
    }
    setCreatingKey(false)
  }

  async function handleRevokeKey(keyId: string) {
    if (!activeTeamId) return
    setLoading(true)
    try {
      await revokeApiKey(keyId)
      await fetchKeys()
      toast.success('Revoked', 'API key revoked')
    } catch (err: any) {
      toast.error('Failed', err.message || 'Failed to revoke key')
    }
    setLoading(false)
  }

  function handleCopy(id: string, content: string) {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="max-w-4xl mx-auto">
      <PageHeader
        title="Developer Portal"
        subtitle="API keys, rate limits, and usage analytics"
      />

      {!activeTeamId && (
        <motion.div variants={itemVariants} className="card p-6 text-center text-text-tertiary text-body-sm">
          Select a team to access developer settings.
        </motion.div>
      )}

      {activeTeamId && (
        <div className="space-y-8">
          {/* API Keys */}
          <motion.div variants={itemVariants}>
            <CardSpotlight className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Key className="w-5 h-5 text-go" weight="fill" />
                  <div>
                    <h3 className="font-display font-bold">API Keys</h3>
                    <p className="text-xs text-text-tertiary">Manage API keys for programmatic access</p>
                  </div>
                </div>
                <button
                  onClick={() => { setNewKey(null); setShowCreateForm(!showCreateForm) }}
                  disabled={!canManageKeys}
                  className="btn btn-primary text-caption px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-40"
                  title={canManageKeys ? (showCreateForm ? 'Cancel' : 'Create a new API key') : 'Key creation is restricted to engineering & executive seats'}
                >
                  <Key size={14} />
                  {showCreateForm ? 'Cancel' : 'New Key'}
                </button>
              </div>

              {showCreateForm && canManageKeys && (
                <div className="mb-5 p-5 rounded-xl bg-bg-secondary border border-border space-y-4">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-go" weight="fill" />
                    <span className="font-mono text-[11px] text-go uppercase tracking-wider">New Credential</span>
                  </div>
                  <div>
                    <label className="text-[10px] text-text-tertiary/60 uppercase tracking-wider font-medium block mb-1.5">Key Name</label>
                    <input
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="e.g., CI pipeline, staging, prod"
                      className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-tertiary/30 outline-none focus:border-go/40 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-text-tertiary/60 uppercase tracking-wider font-medium block mb-1.5">Tier</label>
                    <div className="flex flex-wrap gap-2">
                      {['free', 'pro', 'team', 'enterprise'].map((t) => (
                        <button
                          key={t}
                          onClick={() => setNewKeyTier(t)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
                            newKeyTier === t
                              ? 'bg-go/15 text-go border border-go/30'
                              : 'bg-bg-tertiary/50 text-text-tertiary border border-border hover:border-border-hover'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-text-tertiary/60 uppercase tracking-wider font-medium block mb-1.5">
                      Cost Limit <span className="text-text-tertiary/30 normal-case">(credits / month)</span>
                    </label>
                    <input
                      value={newKeyCostLimit}
                      onChange={(e) => setNewKeyCostLimit(e.target.value.replace(/[^0-9]/g, ''))}
                      type="number"
                      min={0}
                      placeholder="e.g., 5000 — leave blank for no limit"
                      className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-tertiary/30 outline-none focus:border-go/40 transition-colors"
                    />
                    <p className="text-[10px] text-text-tertiary mt-1.5">The key stops working once its usage reaches this budget.</p>
                  </div>
                  <div>
                    <label className="text-[10px] text-text-tertiary/60 uppercase tracking-wider font-medium block mb-1.5">
                      Expires On <span className="text-text-tertiary/30 normal-case">(optional)</span>
                    </label>
                    <input
                      value={newKeyExpiry}
                      onChange={(e) => setNewKeyExpiry(e.target.value)}
                      type="date" min={today}
                      className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-tertiary/30 outline-none focus:border-go/40 transition-colors"
                    />
                    <p className="text-[10px] text-text-tertiary mt-1.5">The key stops working after this date. Leave blank for no expiry.</p>
                  </div>
                  <div className="flex justify-end gap-3 pt-1">
                    <button onClick={() => setShowCreateForm(false)} className="px-3 py-1.5 rounded-lg text-xs text-text-tertiary hover:text-text-primary transition-colors">
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateKey}
                      disabled={creatingKey}
                      className="btn btn-primary text-caption px-4 py-1.5 flex items-center gap-1.5"
                    >
                      {creatingKey && <Spinner className="w-3.5 h-3.5 animate-spin" />}
                      {creatingKey ? 'Creating…' : 'Create Key'}
                    </button>
                  </div>
                </div>
              )}

              {keyError && (
                <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/8 border border-red-500/20 text-red-400 text-sm">{keyError}</div>
              )}

              {newKey && (
                <div className="mb-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Info className="w-4 h-4 text-amber-400" />
                    <span className="font-mono text-[11px] text-amber-400 uppercase tracking-wider">New API Key</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-xs text-amber-400 bg-amber-500/15 px-2 py-1 rounded">{newKey}</code>
                    <button
                      onClick={() => handleCopy('new-key', newKey)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-amber-400 hover:text-amber-300 transition-colors"
                    >
                      {copiedId === 'new-key' ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                  <p className="text-xs text-amber-400/80 mt-2">This key will only be shown once. Copy it now.</p>
                </div>
              )}

              {loading && !keys.length ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner className="w-5 h-5 text-go animate-spin" />
                </div>
              ) : keys.length ? (
                <div className="space-y-3">
                  {keys.map((key) => {
                    const limit = key.credit_limit ?? 0
                    const used = key.credits_used ?? key.usage_count ?? 0
                    const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
                    const exhausted = limit > 0 && used >= limit
                    return (
                      <div key={key.key_id} className="flex items-center justify-between gap-4 p-3 rounded-xl bg-bg-secondary border border-border">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <Key className="w-4 h-4 text-text-tertiary shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-text-primary truncate">{key.name || 'Unnamed Key'}</p>
                            <p className="font-mono text-[10px] text-text-tertiary truncate">
                              {key.key_id} • {key.tier} • {key.is_active ? 'Active' : 'Revoked'}
                            </p>
                            <p className="font-mono text-[10px] text-text-tertiary/60 mt-0.5">
                              Created {formatKeyDate(key.created_at)}
                              {key.last_used_at && <> · last used {formatKeyDate(key.last_used_at)}</>}
                              {key.expires_at && <> · expires {formatKeyDate(key.expires_at)}</>}
                            </p>
                            {key.credit_limit != null && (
                              <div className="flex items-center gap-2 mt-1.5">
                                <div className="h-1.5 w-24 rounded-full bg-bg-tertiary/50 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${exhausted ? 'bg-red-500' : 'bg-go'}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className={`font-mono text-[10px] ${exhausted ? 'text-red-400' : 'text-text-tertiary'}`}>
                                  {used}/{key.credit_limit} credits{exhausted ? ' • limit reached' : ''}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleRevokeKey(key.key_id)}
                            disabled={!key.is_active || loading || !canManageKeys}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-error hover:bg-error/10 transition-all disabled:opacity-30"
                          >
                            <Trash size={14} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-text-tertiary text-sm">
                  No API keys found. Create one to get started.
                </div>
              )}
            </CardSpotlight>
          </motion.div>

          {/* Provider Keys (BYOK) */}
          <motion.div variants={itemVariants}>
            <CardSpotlight className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <Lock className="w-5 h-5 text-go" weight="fill" />
                <div>
                  <h3 className="font-display font-bold">Provider Keys (BYOK)</h3>
                  <p className="text-xs text-text-tertiary">
                    Bring your own LLM &amp; embedding provider keys for the OpenAI-compatible gateway — requests made with this team's API key use your keys instead of the platform defaults.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                {PROVIDER_OPTIONS.map((p) => {
                  const info = providerKeys[p.id]
                  const configured = !!info?.configured
                  const keyCount = providerKeyCounts[p.id] || 0
                  return (
                    <div key={p.id} className="bg-bg-secondary border border-border rounded-xl p-3.5">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${configured ? 'bg-go' : 'bg-bg-tertiary'}`} />
                          <span className="font-medium text-text-primary text-xs truncate">{p.label}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {configured ? (
                            <span className="font-mono text-[9px] uppercase tracking-wider text-go/80 bg-go/10 border border-go/20 px-1.5 py-0.5 rounded">Configured</span>
                          ) : (
                            <span className="font-mono text-[9px] uppercase tracking-wider text-text-tertiary/50">Platform</span>
                          )}
                          {keyCount > 1 && (
                            <span
                              className="font-mono text-[9px] uppercase tracking-wider text-text-tertiary/70 bg-bg-tertiary/40 px-1.5 py-0.5 rounded"
                              title={`${keyCount} keys in this provider's pool — the router rotates across them`}
                            >
                              {keyCount} keys
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="font-mono text-[9px] text-text-tertiary/60 mb-2.5 truncate">overrides {p.envVar}</p>
                      {configured && info.updated_at && (
                        <p className="text-[10px] text-text-tertiary/70 mb-2.5">Updated {formatKeyDate(info.updated_at)}</p>
                      )}
                      {canManageKeys && (
                        <div className="flex items-center gap-3 flex-wrap">
                          <button
                            onClick={() => {
                              if (editingProvider === p.id) {
                                setEditingProvider(null)
                                setProviderKeyInput('')
                              } else {
                                setAddingPoolKey(false)
                                setEditingProvider(p.id)
                                setProviderKeyInput('')
                              }
                            }}
                            className="flex items-center gap-1.5 text-[11px] text-go hover:text-go/80 transition-colors"
                          >
                            <PencilSimple size={12} />
                            {configured ? 'Update' : 'Add key'}
                          </button>
                          {configured && (
                            <button
                              onClick={() => {
                                setAddingPoolKey(true)
                                setEditingProvider(p.id)
                                setProviderKeyInput('')
                              }}
                              className="flex items-center gap-1.5 text-[11px] text-text-tertiary hover:text-go transition-colors"
                              title="Add another key — traffic rotates round-robin across the pool"
                            >
                              <Plus size={12} />
                              Add key
                            </button>
                          )}
                          {configured && (confirmDeleteProvider !== p.id ? (
                            <button
                              onClick={() => setConfirmDeleteProvider(p.id)}
                              className="flex items-center gap-1.5 text-[11px] text-text-muted hover:text-error transition-colors"
                            >
                              <Trash size={12} />
                              Remove
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDeleteProviderKey(p.id)}
                              onBlur={() => setConfirmDeleteProvider(null)}
                              className="flex items-center gap-1.5 text-[11px] font-semibold text-red-400 hover:text-red-300 transition-colors"
                            >
                              <Trash size={12} />
                              Confirm?
                            </button>
                          ))}
                        </div>
                      )}
                      {editingProvider === p.id && (
                        <div className="mt-3 flex items-center gap-2">
                          <input
                            type="password"
                            value={providerKeyInput}
                            onChange={(e) => setProviderKeyInput(e.target.value)}
                            placeholder={addingPoolKey ? 'sk-... (extra pool key)' : 'sk-...'}
                            autoFocus
                            className="flex-1 min-w-0 bg-bg-primary border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-tertiary/30 outline-none focus:border-go/40 transition-colors"
                          />
                          <button
                            onClick={handleSaveProviderKey}
                            disabled={savingProviderKey || !providerKeyInput.trim()}
                            className="px-2.5 py-1.5 rounded-lg bg-go hover:bg-go/90 disabled:opacity-40 text-white text-[11px] font-semibold transition-all shrink-0"
                          >
                            {savingProviderKey ? <Spinner className="w-3.5 h-3.5 animate-spin" /> : (addingPoolKey ? 'Add' : 'Save')}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <p className="text-[10px] text-text-tertiary/60">
                Keys are encrypted at rest and apply to OpenAI-compatible gateway calls (<code className="font-mono text-[9px] bg-bg-tertiary/50 px-1 rounded">/v1/chat/completions</code>, <code className="font-mono text-[9px] bg-bg-tertiary/50 px-1 rounded">/v1/embeddings</code>) authenticated with this team's API key. Leave a provider on “Platform” to use the shared platform key.
              </p>
            </CardSpotlight>
          </motion.div>

          {/* Model Catalog */}
          <motion.div variants={itemVariants}>
            <CardSpotlight className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <Stack className="w-5 h-5 text-go" weight="fill" />
                <div>
                  <h3 className="font-display font-bold">Model Catalog</h3>
                  <p className="text-xs text-text-tertiary">
                    Query-type routing, pinned defaults, and the live OpenRouter catalog — pick any <code className="font-mono text-[10px] bg-bg-tertiary/50 px-1 rounded">vendor/model</code> id and pass it to <code className="font-mono text-[10px] bg-bg-tertiary/50 px-1 rounded">/v1/chat/completions</code>.
                  </p>
                </div>
              </div>

              {catalogLoading && !catalog ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner className="w-5 h-5 text-go animate-spin" />
                </div>
              ) : !catalog ? (
                <div className="text-center py-8 text-text-tertiary text-sm">
                  <Stack className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>Model catalog unavailable.</p>
                </div>
              ) : (
                <>
                  {/* Query-type routing */}
                  <div className="bg-bg-secondary border border-border rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Lightning className="w-4 h-4 text-go" />
                      <span className="font-mono text-[11px] text-go uppercase tracking-wider">Query-Type Routing</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {Object.entries(catalog.query_types || {}).map(([qtype, qinfo]) => (
                        <div key={qtype} className="bg-bg-primary border border-border rounded-lg p-3">
                          <p className="font-bold text-text-primary text-xs mb-0.5">{qtype}</p>
                          <p className="text-[10px] text-text-tertiary leading-relaxed mb-1.5">{qinfo.description}</p>
                          <p className="font-mono text-[9px] text-go/80 truncate">
                            {(qinfo.preferred_providers || []).join(' → ') || 'free-first fallback chain'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Pinned provider defaults */}
                  <div className="bg-bg-secondary border border-border rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Terminal className="w-4 h-4 text-go" />
                      <span className="font-mono text-[11px] text-go uppercase tracking-wider">Pinned Defaults</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {Object.entries(catalog.providers || {}).map(([provider, pinfo]) => (
                        <div key={provider} className="flex items-center justify-between gap-2 bg-bg-primary border border-border rounded-lg px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-text-primary capitalize truncate">{provider}</p>
                            <p className="font-mono text-[9px] text-text-tertiary truncate">{pinfo.model}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {pinfo.free ? (
                              <span className="font-mono text-[9px] uppercase tracking-wider text-go/80 bg-go/10 border border-go/20 px-1.5 py-0.5 rounded">Free</span>
                            ) : (
                              <span className="font-mono text-[9px] uppercase tracking-wider text-amber-400/80 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">Paid</span>
                            )}
                            {!pinfo.available && (
                              <span className="font-mono text-[9px] uppercase tracking-wider text-text-tertiary/50">unconfigured</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Dynamic OpenRouter catalog */}
                  <div className="bg-bg-secondary border border-border rounded-xl p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        <Stack className="w-4 h-4 text-go" />
                        <span className="font-mono text-[11px] text-go uppercase tracking-wider">OpenRouter Catalog</span>
                        {!!catalog.openrouter_catalog?.length && (
                          <span className="font-mono text-[9px] text-text-tertiary/60">{catalog.openrouter_catalog.length} models</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 bg-bg-primary border border-border rounded-lg px-2.5 py-1.5 w-52">
                        <MagnifyingGlass size={12} className="text-text-tertiary/50 shrink-0" />
                        <input
                          value={catalogSearch}
                          onChange={(e) => setCatalogSearch(e.target.value)}
                          placeholder="Filter by vendor or id…"
                          className="flex-1 min-w-0 bg-transparent text-[11px] font-mono text-text-primary placeholder:text-text-tertiary/30 outline-none"
                        />
                      </div>
                    </div>

                    {catalog.openrouter_catalog?.length ? (
                      <CatalogModelList
                        models={catalog.openrouter_catalog}
                        search={catalogSearch}
                        copiedId={copiedId}
                        onCopy={handleCopy}
                      />
                    ) : (
                      <p className="text-[11px] text-text-tertiary py-3">
                        {catalog.catalog_fetched === false
                          ? 'The live catalog could not be fetched right now — passthrough model ids still work; they are just not listed here.'
                          : 'Live OpenRouter catalog not yet merged. Pin a provider key above and refresh; any vendor/model id still routes through the gateway.'}
                      </p>
                    )}
                  </div>
                </>
              )}
            </CardSpotlight>
          </motion.div>

          {/* Rate Limits */}
          <motion.div variants={itemVariants}>
            <CardSpotlight className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <ShieldCheck className="w-5 h-5 text-go" weight="fill" />
                <div>
                  <h3 className="font-display font-bold">Rate Limits</h3>
                  <p className="text-xs text-text-tertiary">API rate limits per tier — live from server</p>
                </div>
              </div>

              {tierInfo ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs mb-6">
                    {Object.entries(tierInfo.tiers).map(([tier, limits]) => (
                      <div key={tier} className="bg-bg-secondary border border-border rounded-lg p-4">
                        <p className="font-bold text-text-primary mb-2 capitalize">{tier} Tier</p>
                        <div className="grid grid-cols-2 gap-y-2 gap-x-3">
                          <div>
                            <span className="text-[10px] text-text-tertiary block">Per Minute</span>
                            <span className="font-mono text-xs text-go">{limits.requests_per_minute}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-text-tertiary block">Per Day</span>
                            <span className="font-mono text-xs text-go">{limits.requests_per_day.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-text-tertiary block">Credits/Month</span>
                            <span className="font-mono text-xs text-go">{limits.credits_per_month > 0 ? limits.credits_per_month.toLocaleString() : 'Unlimited'}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-text-tertiary block">Max Repos</span>
                            <span className="font-mono text-xs text-go">{limits.max_repos < 0 ? 'Unlimited' : limits.max_repos}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Route Group Limits */}
                  <div className="bg-bg-secondary border border-border rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Lightning className="w-4 h-4 text-go" />
                      <span className="font-mono text-[11px] text-go uppercase tracking-wider">Route-Specific Limits</span>
                    </div>
                    <p className="text-xs text-text-tertiary mb-3">Different API routes have independent rate limit buckets:</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { group: 'LLM', limit: '20/min', routes: '/ask, /ai, /explore' },
                        { group: 'Auth', limit: '10/min', routes: '/auth/login, /auth/register' },
                        { group: 'Admin', limit: '60/min', routes: '/admin/*' },
                        { group: 'General', limit: '200/min', routes: 'All other endpoints' },
                      ].map((r) => (
                        <div key={r.group} className="bg-bg-primary border border-border rounded-lg p-3">
                          <p className="font-bold text-text-primary text-xs mb-1">{r.group}</p>
                          <p className="font-mono text-[11px] text-go">{r.limit}</p>
                          <p className="text-[10px] text-text-tertiary mt-1">{r.routes}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-text-tertiary mt-2 italic">
                      Limits can be overridden via environment variables: RATE_LIMIT_LLM, RATE_LIMIT_AUTH, etc.
                    </p>
                  </div>

                  {/* Response Headers Documentation */}
                  <div className="bg-bg-secondary border border-border rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Info className="w-4 h-4 text-go" />
                      <span className="font-mono text-[11px] text-go uppercase tracking-wider">Response Headers</span>
                    </div>
                    <p className="text-xs text-text-tertiary mb-3">Every API response includes rate limit headers:</p>
                    {codeBlock('Rate Limit Headers', `X-RateLimit-Limit: 200
X-RateLimit-Remaining: 185
X-RateLimit-Reset: 1704067200`)}
                    <div className="mt-3 space-y-1.5 text-xs">
                      <div className="flex items-start gap-2">
                        <code className="font-mono text-[10px] bg-bg-tertiary/50 px-1.5 py-0.5 rounded shrink-0">X-RateLimit-Limit</code>
                        <span className="text-text-tertiary">The maximum number of requests allowed in the current window</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <code className="font-mono text-[10px] bg-bg-tertiary/50 px-1.5 py-0.5 rounded shrink-0">X-RateLimit-Remaining</code>
                        <span className="text-text-tertiary">How many requests remain in the current window</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <code className="font-mono text-[10px] bg-bg-tertiary/50 px-1.5 py-0.5 rounded shrink-0">X-RateLimit-Reset</code>
                        <span className="text-text-tertiary">Unix timestamp when the window resets</span>
                      </div>
                    </div>
                  </div>

                  {/* Error Handling */}
                  <div className="bg-bg-secondary border border-border rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Warning className="w-4 h-4 text-amber-400" />
                      <span className="font-mono text-[11px] text-amber-400 uppercase tracking-wider">Error Handling</span>
                    </div>
                    <p className="text-xs text-text-tertiary mb-3">
                      When a rate limit is exceeded, the API returns HTTP 429 Too Many Requests:
                    </p>
                    {codeBlock('429 Response', `{
  "success": false,
  "error": "Rate limit exceeded. Try again later.",
  "code": "RATE_LIMIT_EXCEEDED",
  "group": "api",
  "limit": 200,
  "window": 60
}`)}
                    <div className="mt-3 space-y-2 text-xs">
                      <div className="flex items-start gap-2 p-2 bg-amber-500/5 border border-amber-500/15 rounded-lg">
                        <Eye className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium text-amber-400">Best Practice</p>
                          <p className="text-text-tertiary mt-0.5">
                            Check the <code className="font-mono text-[10px] bg-bg-tertiary/50 px-1">X-RateLimit-Remaining</code> header
                            on every response. When it drops below 10%, throttle your requests by
                            waiting for the <code className="font-mono text-[10px] bg-bg-tertiary/50 px-1">X-RateLimit-Reset</code> time.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-6 text-text-tertiary text-sm">
                  <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>Rate limit tiers available after server connection.</p>
                  <p className="text-xs mt-1">Default limits are shown in the API documentation below.</p>
                </div>
              )}
            </CardSpotlight>
          </motion.div>

          {/* Credit Quotas */}
          <motion.div variants={itemVariants}>
            <CardSpotlight className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <Clock className="w-5 h-5 text-go" weight="fill" />
                <div>
                  <h3 className="font-display font-bold">Credit Quotas</h3>
                  <p className="text-xs text-text-tertiary">Monthly credit usage by action</p>
                </div>
              </div>

              {usage ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="bg-bg-secondary border border-border rounded-lg p-4">
                      <p className="font-bold text-text-primary mb-1">Total Credits</p>
                      <p className="text-2xl font-bold text-go">{usage.total_credits}</p>
                      <p className="text-text-tertiary">/{usage.monthly_limit} credits</p>
                    </div>
                    <div className="bg-bg-secondary border border-border rounded-lg p-4">
                      <p className="font-bold text-text-primary mb-1">Period</p>
                      <p className="text-text-tertiary">{new Date(usage.period_start).toLocaleDateString()} - {new Date(usage.period_end).toLocaleDateString()}</p>
                    </div>
                  </div>

                  <div className="bg-bg-secondary border border-border rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <ArrowRight className="w-4 h-4 text-go" />
                      <span className="font-mono text-[11px] text-go uppercase tracking-wider">Usage by Endpoint</span>
                    </div>
                    <div className="space-y-2">
                      {Object.entries(usage.endpoint_breakdown || {}).map(([endpoint, count]) => (
                        <div key={endpoint} className="flex items-center justify-between gap-4 text-xs">
                          <code className="font-mono text-text-primary bg-bg-tertiary/50 px-2 py-0.5 rounded">{endpoint}</code>
                          <span className="font-mono text-text-tertiary">{String(count)} requests</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-text-tertiary text-sm">
                  No usage data available.
                </div>
              )}
            </CardSpotlight>
          </motion.div>

          {/* API Documentation */}
          <motion.div variants={itemVariants}>
            <CardSpotlight className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <Code className="w-5 h-5 text-go" weight="fill" />
                <div>
                  <h3 className="font-display font-bold">API Documentation</h3>
                  <p className="text-xs text-text-tertiary">Endpoints and usage examples</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-bg-secondary border border-border rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-[10px] bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded">POST</span>
                    <span className="font-mono text-[11px] text-text-primary">/api/v1/analyze</span>
                  </div>
                  <p className="text-xs text-text-tertiary mb-2">Analyze a GitHub repository</p>
                  {codeBlock('Request', `{
  "repo_url": "https://github.com/owner/repo",
  "branch": "main"
}`)}
                </div>

                <div className="bg-bg-secondary border border-border rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-[10px] bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded">POST</span>
                    <span className="font-mono text-[11px] text-text-primary">/api/v1/ask</span>
                  </div>
                  <p className="text-xs text-text-tertiary mb-2">Ask questions about an indexed repository</p>
                  {codeBlock('Request', `{
  "index_id": "abc123",
  "question": "Where is the webhook signature verified?"
}`)}
                </div>

                <div className="text-center mt-6">
                  <a
                    href="/docs#api"
                    className="inline-flex items-center gap-2 text-go hover:text-go/80 transition-colors"
                  >
                    View full API reference <ArrowRight size={14} />
                  </a>
                </div>
              </div>
            </CardSpotlight>
          </motion.div>

          {/* API Playground */}
          <APIPlaygroundSection />
        </div>
      )}
    </motion.div>
  )
}

function CatalogModelList({ models, search, copiedId, onCopy }: {
  models: OpenRouterCatalogModel[]
  search: string
  copiedId: string | null
  onCopy: (id: string, content: string) => void
}) {
  const q = search.trim().toLowerCase()
  const filtered = q
    ? models.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q) || m.vendor.toLowerCase().includes(q))
    : models
  const freeCount = models.filter((m) => m.free).length

  return (
    <>
      <p className="font-mono text-[9px] text-text-tertiary/60 mb-2">
        {models.length} models · {freeCount} free · {models.length - freeCount} paid
      </p>
      <div className="max-h-[320px] overflow-y-auto space-y-1.5 pr-1">
        {filtered.length === 0 && (
          <p className="text-[11px] text-text-tertiary py-3">No models match “{search}”.</p>
        )}
        {filtered.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between gap-3 bg-bg-primary border border-border rounded-lg px-3 py-2 hover:border-go/30 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-text-primary truncate">{m.id}</span>
                {m.free ? (
                  <span className="font-mono text-[9px] uppercase tracking-wider text-go/80 bg-go/10 border border-go/20 px-1.5 py-0.5 rounded shrink-0">Free</span>
                ) : (
                  <span className="font-mono text-[9px] uppercase tracking-wider text-amber-400/80 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded shrink-0">Paid</span>
                )}
              </div>
              <p className="text-[10px] text-text-tertiary/80 truncate mt-0.5">
                {m.name}
                {m.context_length > 0 && <> · {m.context_length.toLocaleString()} ctx</>}
                {m.pricing.prompt > 0 && <> · ${m.pricing.prompt}/1M in · ${m.pricing.completion}/1M out</>}
              </p>
            </div>
            <button
              onClick={() => onCopy(`model-${m.id}`, m.id)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-go hover:bg-go/10 transition-all shrink-0"
              aria-label={`Copy model id ${m.id}`}
              title="Copy model id"
            >
              {copiedId === `model-${m.id}` ? <Check size={13} className="text-go" /> : <Copy size={13} />}
            </button>
          </div>
        ))}
      </div>
    </>
  )
}

function APIPlaygroundSection() {
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [selectedAgent, setSelectedAgent] = useState('')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [paramsInput, setParamsInput] = useState('{\n  "repo_url": "https://github.com/facebook/react"\n}')
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [testing, setTesting] = useState(false)

  const toast = useToast()

  useEffect(() => {
    listAgents().then((d) => {
      setAgents(d.agents ?? [])
      if (d.agents?.length) {
        setSelectedAgent(d.agents[0].name)
      }
    }).catch(() => {/* silent */})
  }, [])

  const agent = agents.find((a) => a.name === selectedAgent)

  async function handleRun() {
    setError(''); setResult(null)
    let params: Record<string, unknown>
    try {
      params = JSON.parse(paramsInput)
    } catch {
      setError('Invalid JSON in params. Check your syntax.'); return
    }
    setTesting(true)
    try {
      const res = await executeAgent(selectedAgent, params, apiKeyInput || undefined)
      setResult(res)
      toast.success(`Agent "${selectedAgent}" executed`)
    } catch (err: any) {
      setError(err.message || 'Agent execution failed')
    } finally {
      setTesting(false)
    }
  }

  return (
    <motion.div variants={itemVariants}>
      <CardSpotlight className="p-6">
        <div className="flex items-start gap-3 mb-4">
          <Play className="w-5 h-5 text-go" weight="fill" />
          <div>
            <h3 className="font-display font-bold">API Playground</h3>
            <p className="text-xs text-text-tertiary">Test AI agents with an API key or your JWT session</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] text-text-tertiary/60 uppercase tracking-wider font-medium block mb-1.5">Agent</label>
            <div className="flex flex-wrap gap-1.5">
              {agents.map((a) => (
                <button
                  key={a.name}
                  onClick={() => setSelectedAgent(a.name)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    selectedAgent === a.name
                      ? 'bg-go/15 text-go border border-go/30'
                      : 'bg-bg-tertiary/50 text-text-tertiary border border-border hover:border-border-hover'
                  }`}
                >
                  <Robot size={12} className="inline-block mr-1" />
                  {a.name}
                </button>
              ))}
            </div>
            {agent && (
              <div className="text-[11px] text-text-tertiary mt-2 space-y-0.5">
                <p>
                  {agent.description} — costs {agent.credit_cost} credit(s)
                </p>
                <p className="font-mono text-[10px] text-go/80">
                  {agent.model
                    ? `${agent.query_type} → ${agent.model}`
                    : 'No LLM — rule-based agent'}
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="text-[10px] text-text-tertiary/60 uppercase tracking-wider font-medium block mb-1.5">
              API Key <span className="text-text-tertiary/30">(optional — uses session if empty)</span>
            </label>
            <div className="flex items-center gap-2 bg-bg-secondary border border-border rounded-lg px-3 py-2">
              <Key size={12} className="text-text-tertiary/40 shrink-0" />
              <input
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="cf_..."
                className="flex-1 bg-transparent text-[12px] font-mono text-text-primary placeholder:text-text-tertiary/20 outline-none border-none"
              />
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] text-text-tertiary/60 uppercase tracking-wider font-medium">
              Params <span className="text-text-tertiary/30">(JSON)</span>
            </label>
            {agent && (
              <span className="text-[10px] text-text-tertiary/40">
                Required: {agent.required_params.join(', ')}
              </span>
            )}
          </div>
          <CodeEditor
            value={paramsInput}
            onChange={setParamsInput}
            language="json"
            height={180}
          />
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={handleRun}
            disabled={testing || !selectedAgent}
            className="flex items-center gap-2 bg-go hover:bg-go/90 disabled:opacity-40 text-white px-4 py-2 rounded-xl text-xs font-semibold transition-all"
          >
            {testing ? (
              <Spinner size={14} className="animate-spin" />
            ) : (
              <Play size={14} weight="fill" />
            )}
            {testing ? 'Running...' : 'Run'}
          </button>
          {error && <span className="text-[11px] text-red-400">{error}</span>}
        </div>

        {result && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-2">
              <Terminal size={12} className="text-emerald-400" />
              <span className="text-[11px] font-medium text-text-primary">
                Result — {result.credits_used} credit(s) used ({result.tier} tier)
              </span>
            </div>
            <pre className="bg-bg-secondary border border-border rounded-xl p-4 font-mono text-[11px] text-text-secondary overflow-x-auto max-h-[400px] overflow-y-auto leading-relaxed">
              {JSON.stringify(result.result, null, 2)}
            </pre>
          </div>
        )}
      </CardSpotlight>
    </motion.div>
  )
}
