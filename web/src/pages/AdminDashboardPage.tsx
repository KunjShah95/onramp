/*
 * ─── DIRECTION CONTRACT · ONRAMP MISSION CONTROL ────────────────────────────
 * THESIS: The admin seat is the systems console — org fleet, treasury of LLM
 *   spend, and the security event log. Instrument panels, not neon cards.
 * OWN-WORLD: Daylit ops room, seated panels, signal-only colour, mono telemetry.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ShieldCheck, Users, Key, Heartbeat, Lock, PencilSimple, Trash, Spinner } from '@phosphor-icons/react'
import ConsolePanel from '../components/ui/console-panel'
import ReadoutBank, { type Readout } from '../components/ui/readout-bank'
import StatusTile from '../components/ui/status-tile'
import { PageHeader } from '../components/ui/page-header'
import { AdminDashboardSkeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/empty-state'
import {
  adminGetUsage, adminGetTeamUsage, adminListApiKeys, adminListAuditEvents,
  adminListProviderKeys, adminSetProviderKey, adminDeleteProviderKey,
} from '../lib/api'
import type {
  AdminAuditEvent, AdminUsageResponse, AdminProviderKeyInfo,
} from '../lib/api'
import { useToast } from '../context/ToastContext'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { PROVIDER_OPTIONS } from '../lib/providers'

// Signal palette + tooltip style — consistent with the DORA / CTO dashboards.
const SIG = {
  go: '#17A34A',
  blue: '#2472C4',
  axis: 'rgb(var(--text-tertiary) / 0.75)',
  grid: 'rgb(var(--border-rgb) / 0.10)',
}
const TOOLTIP = {
  background: 'rgb(var(--bg-elevated))',
  border: '1px solid rgb(var(--border-rgb) / 0.18)',
  borderRadius: '4px',
  fontSize: '12px',
  color: 'rgb(var(--text-primary))',
  boxShadow: '0 4px 16px rgb(var(--border-rgb) / 0.12)',
}

// Audit event → signal status. Colour means status, never decoration.
const AUDIT_TONE: Record<string, { tone: 'go' | 'standby' | 'caution' | 'abort'; label: string }> = {
  auth: { tone: 'standby', label: 'Auth' },
  config: { tone: 'caution', label: 'Config' },
  access: { tone: 'standby', label: 'Access' },
  deploy: { tone: 'go', label: 'Deploy' },
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const item = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 90, damping: 18 } },
}

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [usage, setUsage] = useState<number | null>(null)
  const [usageDetail, setUsageDetail] = useState<AdminUsageResponse | null>(null)
  const [keys, setKeys] = useState<number | null>(null)
  const [teams, setTeams] = useState<number | null>(null)
  const [members, setMembers] = useState<number | null>(null)
  const [audit, setAudit] = useState<AdminAuditEvent[]>([])
  const [providerKeys, setProviderKeys] = useState<Record<string, AdminProviderKeyInfo>>({})
  const [editingProvider, setEditingProvider] = useState<string | null>(null)
  const [providerKeyInput, setProviderKeyInput] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [confirmDeleteProvider, setConfirmDeleteProvider] = useState<string | null>(null)
  const toast = useToast()

  async function fetchAdminData() {
    setLoading(true); setError('')
    try {
      await Promise.all([
        adminGetUsage(undefined, 14).then((u) => { setUsage(u.total_requests); setUsageDetail(u) }).catch(() => {}),
        adminListApiKeys().then((k) => setKeys(k.count)).catch(() => {}),
        adminGetTeamUsage().then((t) => {
          setTeams(t.count)
          setMembers(t.teams.reduce((acc, x) => acc + (x.member_count || 0), 0))
        }).catch(() => {}),
        adminListAuditEvents({ limit: 8 }).then((a) => setAudit(a.events)).catch(() => {}),
        fetchProviderKeys().catch(() => {}),
      ])
    } catch (err: any) {
      setError(err.message || 'Failed to load admin data.')
    } finally {
      setLoading(false)
    }
  }

  async function fetchProviderKeys() {
    const data = await adminListProviderKeys()
    const map: Record<string, AdminProviderKeyInfo> = {}
    ;(data.providers || []).forEach((p) => { map[p.provider] = p })
    setProviderKeys(map)
  }

  async function handleSaveProviderKey() {
    if (!editingProvider) return
    setSavingKey(true)
    try {
      await adminSetProviderKey(editingProvider, providerKeyInput.trim())
      setEditingProvider(null); setProviderKeyInput('')
      await fetchProviderKeys()
      toast.success('Saved', `${editingProvider} key updated · applied to the router immediately`)
    } catch (err: any) {
      toast.error('Failed', err.message || 'Failed to save provider key')
    }
    setSavingKey(false)
  }

  async function handleDeleteProviderKey(provider: string) {
    try {
      await adminDeleteProviderKey(provider)
      await fetchProviderKeys()
      setConfirmDeleteProvider(null)
      toast.success('Removed', `${provider} key removed · platform fallback now applies`)
    } catch (err: any) {
      toast.error('Failed', err.message || 'Failed to remove provider key')
    }
  }

  useEffect(() => { fetchAdminData() }, [])

  const fmt = (n: number | null) => (n == null ? 'N/A' : n.toLocaleString())
  const fmtUsd = (n: number) => (n >= 100 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`)
  const series = usageDetail?.provider_series ?? []

  const readouts: Readout[] = [
    { label: 'API Calls · 24h', value: usage ?? 'N/A', color: 'text-go' },
    { label: 'Active Teams', value: teams ?? 'N/A', color: 'text-mission' },
    { label: 'Active Members', value: members ?? 'N/A', color: 'text-ink' },
    { label: 'Active API Keys', value: keys ?? 'N/A', color: 'text-mission' },
  ]

  return (
    <motion.div variants={container} initial="hidden" animate="visible" className="min-h-[calc(100vh-4rem)] p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <motion.div variants={item}>
        <PageHeader
          eyebrow="Folio 04 · Admin"
          title="Admin Console"
          subtitle="System-wide monitoring and management."
          actions={
            <button onClick={fetchAdminData} disabled={loading} className="btn-glass disabled:opacity-50">Refresh</button>
          }
        />
      </motion.div>

      {error && (
        <motion.div variants={item}>
          <ConsolePanel rail="Signal Lost" designator="SYSTEMS" status="abort">
            <div className="flex items-center justify-between gap-4">
              <p className="text-abort text-body-sm font-code">{error}</p>
              <button onClick={fetchAdminData} disabled={loading} className="btn-glass !px-3 !py-1.5 text-caption shrink-0">Reacquire</button>
            </div>
          </ConsolePanel>
        </motion.div>
      )}

      {loading ? (
        <div className="py-2"><AdminDashboardSkeleton /></div>
      ) : (
        <>
          {/* Systems telemetry */}
          <motion.div variants={item}>
            <ReadoutBank callsign="Systems" items={readouts} columns={4} />
          </motion.div>

          {/* LLM Cost Savings */}
          <motion.div variants={item}>
            <ConsolePanel
              rail="Treasury · LLM Cost Savings"
              designator={`FREE VS PAID · ${series.length || 14}D`}
              status="go"
              live
              action={usageDetail && usageDetail.tracked_requests > 0 ? (
                <div className="flex items-center gap-3 text-caption">
                  <span className="flex items-center gap-1.5 text-ink-muted"><span className="w-2 h-2 rounded-tile" style={{ backgroundColor: SIG.go }} /> Free</span>
                  <span className="flex items-center gap-1.5 text-ink-muted"><span className="w-2 h-2 rounded-tile" style={{ backgroundColor: SIG.blue }} /> Paid</span>
                </div>
              ) : undefined}
            >
              {!usageDetail || usageDetail.tracked_requests === 0 ? (
                <EmptyState title="No LLM traffic tracked yet" description="Gateway and agent requests will appear here once the router starts serving traffic." />
              ) : (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
                    {[
                      { label: 'Free traffic', value: `${usageDetail.free_pct}%`, sub: `${usageDetail.free_requests} free · ${usageDetail.paid_requests} paid`, color: 'text-go' },
                      { label: 'Cost avoided', value: fmtUsd(usageDetail.total_cost_avoided_usd), sub: 'vs paid baseline model', color: 'text-go' },
                      { label: 'Actual cost', value: fmtUsd(usageDetail.total_cost_usd), sub: `${usageDetail.tracked_requests} tracked requests`, color: 'text-mission' },
                      { label: 'Total requests', value: fmt(usageDetail.total_requests), sub: 'all endpoints', color: 'text-ink' },
                    ].map((stat) => (
                      <div key={stat.label} className="rounded-tile border border-seam bg-well p-3">
                        <p className="text-caption text-ink-muted">{stat.label}</p>
                        <p className={`font-code tabular-nums text-body font-semibold mt-0.5 ${stat.color}`}>{stat.value}</p>
                        <p className="text-caption text-ink-muted/60 mt-0.5">{stat.sub}</p>
                      </div>
                    ))}
                  </div>
                  <div className="h-52 bg-plot-grid rounded-tile">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={series} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="freeGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={SIG.go} stopOpacity={0.30} />
                            <stop offset="95%" stopColor={SIG.go} stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="paidGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={SIG.blue} stopOpacity={0.30} />
                            <stop offset="95%" stopColor={SIG.blue} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="2 4" stroke={SIG.grid} />
                        <XAxis dataKey="date" tick={{ fill: SIG.axis, fontSize: 10, fontFamily: 'IBM Plex Mono' }} axisLine={false} tickLine={false} tickFormatter={(v: string) => v.slice(5)} />
                        <YAxis tick={{ fill: SIG.axis, fontSize: 10, fontFamily: 'IBM Plex Mono' }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip contentStyle={TOOLTIP} formatter={(value, name) => [value, name === 'free' ? 'Free' : 'Paid']} labelFormatter={(label) => new Date(label + 'T00:00:00Z').toLocaleDateString()} />
                        <Area type="monotone" dataKey="free" stackId="traffic" stroke={SIG.go} fill="url(#freeGrad)" strokeWidth={2} />
                        <Area type="monotone" dataKey="paid" stackId="traffic" stroke={SIG.blue} fill="url(#paidGrad)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </ConsolePanel>
          </motion.div>

          {/* Platform Provider Keys — managed via the website, not .env */}
          <motion.div variants={item}>
            <ConsolePanel
              rail="Provider Keys · Platform"
              designator={`${Object.keys(providerKeys).length}/${PROVIDER_OPTIONS.length} CONFIGURED`}
              status={Object.keys(providerKeys).length ? 'go' : 'standby'}
              live={Object.keys(providerKeys).length > 0}
            >
              <p className="text-caption text-ink-muted mb-4">
                Platform-wide LLM &amp; embedding provider keys · configured here instead of <span className="font-code text-ink/80">backend/.env</span>. Encrypted at rest and applied to the router immediately.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {PROVIDER_OPTIONS.map((p) => {
                  const info = providerKeys[p.id]
                  const configured = !!info?.configured
                  return (
                    <div key={p.id} className="rounded-tile border border-seam bg-well p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-2 h-2 rounded-tile shrink-0 ${configured ? 'bg-go' : 'bg-inset'}`} />
                          <span className="text-body-xs font-medium text-ink truncate">{p.label}</span>
                        </div>
                        {configured ? (
                          <span className="font-code text-[9px] uppercase tracking-wider text-go bg-go/10 px-1.5 py-0.5 rounded shrink-0">Set</span>
                        ) : (
                          <span className="font-code text-[9px] uppercase tracking-wider text-ink-muted/60 shrink-0">Env/Unset</span>
                        )}
                      </div>
                      <p className="font-code text-[9px] text-ink-muted/60 mb-2 truncate">overrides {p.envVar}</p>
                      {configured && info.updated_at && (
                        <p className="text-caption text-ink-muted/70 mb-2">Updated {relativeTime(info.updated_at)}</p>
                      )}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            if (editingProvider === p.id) {
                              setEditingProvider(null); setProviderKeyInput('')
                            } else {
                              setEditingProvider(p.id); setProviderKeyInput('')
                            }
                          }}
                          className="flex items-center gap-1.5 text-caption text-go hover:text-go/80 transition-colors"
                        >
                          <PencilSimple size={12} />
                          {configured ? 'Update' : 'Add key'}
                        </button>
                        {configured && (confirmDeleteProvider !== p.id ? (
                          <button
                            onClick={() => setConfirmDeleteProvider(p.id)}
                            className="flex items-center gap-1.5 text-caption text-ink-muted hover:text-abort transition-colors"
                          >
                            <Trash size={12} />
                            Remove
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDeleteProviderKey(p.id)}
                            onBlur={() => setConfirmDeleteProvider(null)}
                            className="flex items-center gap-1.5 text-caption font-semibold text-abort hover:text-abort/80 transition-colors"
                          >
                            <Trash size={12} />
                            Confirm?
                          </button>
                        ))}
                      </div>
                      {editingProvider === p.id && (
                        <div className="mt-2.5 flex items-center gap-2">
                          <input
                            type="password"
                            value={providerKeyInput}
                            onChange={(e) => setProviderKeyInput(e.target.value)}
                            placeholder="sk-..."
                            autoFocus
                            className="flex-1 min-w-0 rounded-tile border border-seam bg-well px-2.5 py-1.5 font-code text-body-xs text-ink placeholder:text-ink-muted/30 outline-none focus:border-go/50 transition-colors"
                          />
                          <button
                            onClick={handleSaveProviderKey}
                            disabled={savingKey || !providerKeyInput.trim()}
                            className="btn-primary !px-3 !py-1.5 text-caption shrink-0 disabled:opacity-40"
                          >
                            {savingKey ? <Spinner size={12} className="animate-spin" /> : 'Save'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center gap-2 mt-4 text-caption text-ink-muted/70">
                <Lock size={12} className="shrink-0" />
                Keys are Fernet-encrypted at rest and win over environment variables. Per-team BYOK keys (Developer Portal) still take precedence for that team's gateway calls.
              </div>
            </ConsolePanel>
          </motion.div>

          {/* Org health + audit log */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <motion.div variants={item}>
              <ConsolePanel rail="Fleet · Org Health" designator="STATUS" status="go">
                <div className="space-y-2.5">
                  {[
                    { label: 'Teams', value: teams ?? 0 },
                    { label: 'Members', value: members ?? 0 },
                    { label: 'API Keys', value: keys ?? 0 },
                    { label: 'Requests · 24h', value: usage ?? 0 },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-seam last:border-0">
                      <span className="text-body-sm text-ink-secondary">{row.label}</span>
                      <span className="readout text-ink tabular-nums">{fmt(row.value as number)}</span>
                    </div>
                  ))}
                </div>
              </ConsolePanel>
            </motion.div>

            <motion.div variants={item}>
              <ConsolePanel rail="Event Log · Audit" designator={`${audit.length} EVENTS`} status="standby">
                {audit.length === 0 ? (
                  <EmptyState title="No audit events" description="Security and config events will appear here." />
                ) : (
                  <div className="space-y-0.5">
                    {audit.map((entry, i) => {
                      const tone = AUDIT_TONE[entry.event_type] ?? { tone: 'standby' as const, label: entry.event_type.replace(/_/g, ' ') }
                      return (
                        <motion.div key={entry.event_id || i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                          className="flex items-center gap-3 p-2 rounded-tile hover:bg-well/60 transition-colors">
                          <StatusTile status={tone.tone} label={tone.label} />
                          <div className="flex-1 min-w-0">
                            <p className="text-body-xs text-ink truncate">
                              <span className="font-medium">{entry.actor_id}</span>
                              <span className="text-ink-muted"> → {entry.target_id || 'N/A'}</span>
                            </p>
                          </div>
                          <span className="text-caption text-ink-muted readout shrink-0">{relativeTime(entry.timestamp)}</span>
                        </motion.div>
                      )
                    })}
                  </div>
                )}
              </ConsolePanel>
            </motion.div>
          </div>

          {/* Quick actions */}
          <motion.div variants={item} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Manage Users', icon: Users },
              { label: 'View API Keys', icon: Key },
              { label: 'View Audit Log', icon: ShieldCheck },
              { label: 'System Health', icon: Heartbeat },
            ].map((action) => (
              <button key={action.label} className="btn-secondary justify-start gap-2.5 !py-2.5">
                <action.icon size={16} weight="regular" className="text-ink-muted shrink-0" />
                <span className="text-caption font-medium">{action.label}</span>
              </button>
            ))}
          </motion.div>
        </>
      )}
    </motion.div>
  )
}
