/*
 * ─── DIRECTION CONTRACT · ONRAMP MISSION CONTROL ────────────────────────────
 * THESIS: The admin seat is the systems console — org fleet, treasury of LLM
 *   spend, and the security event log. Instrument panels, not neon cards.
 * OWN-WORLD: Daylit ops room, seated panels, signal-only colour, mono telemetry.
 * DISCLOSURE: ten provider cards with inline editors is a form, not a
 *   dashboard. The page now opens on what is unconfigured, filters the key
 *   shelf to Configured / Unset, keeps each editor collapsed until it is
 *   opened, and gives the quick actions real destinations instead of dead
 *   buttons.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'

import { ShieldCheck, Users, Lock, PencilSimple, Trash, Spinner, Key, Gauge } from '@phosphor-icons/react'
import { useAuth } from '../context/AuthContext'
import ConsolePanel from '../components/ui/console-panel'
import ReadoutBank, { type Readout } from '../components/ui/readout-bank'
import StatusTile from '../components/ui/status-tile'
import { PageHeader } from '../components/ui/page-header'
import { AdminDashboardSkeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/empty-state'
import { NextUp, FilterChips, ShowMore, Disclosure } from '../components/ui/progressive'
import { cn } from '../lib/utils'
import {
  adminGetUsage, adminGetTeamUsage, adminListAuditEvents,
  adminListProviderKeys, adminSetProviderKey, adminDeleteProviderKey,
} from '../lib/api'
import type {
  AdminAuditEvent, AdminUsageResponse, AdminProviderKeyInfo,
} from '../lib/api'
import { useToast } from '../context/ToastContext'
import { useThemeSignals } from '../hooks/useThemeSignals'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { PROVIDER_OPTIONS } from '../lib/providers'

// Signal palette + tooltip style — consistent with the DORA / CTO dashboards.
// go/blue resolve from theme tokens via useThemeSignals() (theme-aware).
const SIG_STATIC = {
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


const ADMIN_ROLES = new Set(['ceo', 'cto', 'admin'])

type ProviderOption = (typeof PROVIDER_OPTIONS)[number]

/**
 * One provider on the key shelf. The editor is a Disclosure, not an inline
 * field that mounts for all ten providers — an input per card meant ten
 * password fields in the tab order, nine of them invisible.
 */
function ProviderKeyCard({
  provider, configured, info, canEdit, editing, value, saving, confirmDelete,
  onEdit, onValueChange, onSave, onDeleteRequest, onDeleteConfirm, onDeleteCancel,
}: {
  provider: ProviderOption
  configured: boolean
  info?: AdminProviderKeyInfo
  canEdit: boolean
  editing: boolean
  value: string
  saving: boolean
  confirmDelete: boolean
  onEdit: () => void
  onValueChange: (v: string) => void
  onSave: () => void
  onDeleteRequest: () => void
  onDeleteConfirm: () => void
  onDeleteCancel: () => void
}) {
  return (
    <div className={cn(
      'rounded-tile border p-3 transition-colors',
      configured ? 'border-seam bg-well' : 'border-caution/25 bg-caution/[0.03]',
    )}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('w-2 h-2 rounded-tile shrink-0', configured ? 'bg-go' : 'bg-caution')} />
          <span className="text-body-xs font-medium text-ink truncate">{provider.label}</span>
        </div>
        {configured ? (
          <span className="font-code text-[9px] uppercase tracking-wider text-go bg-go/10 px-1.5 py-0.5 rounded shrink-0">Set</span>
        ) : (
          <span className="font-code text-[9px] uppercase tracking-wider text-caution bg-caution/10 px-1.5 py-0.5 rounded shrink-0">Unset</span>
        )}
      </div>
      <p className="font-code text-[9px] text-ink-muted/60 mb-2 truncate">overrides {provider.envVar}</p>
      {configured && info?.updated_at && (
        <p className="text-caption text-ink-muted/70 mb-2">Updated {relativeTime(info.updated_at)}</p>
      )}
      {canEdit ? (
        <>
          <div className="flex items-center gap-3">
            <button
              onClick={onEdit}
              aria-expanded={editing}
              className="flex items-center gap-1.5 text-caption text-go hover:text-go/80 transition-colors"
            >
              <PencilSimple size={12} />
              {configured ? 'Update' : 'Add key'}
            </button>
            {configured && (confirmDelete ? (
              <button
                onClick={onDeleteConfirm}
                onBlur={onDeleteCancel}
                className="flex items-center gap-1.5 text-caption font-semibold text-abort hover:text-abort/80 transition-colors"
              >
                <Trash size={12} />
                Confirm?
              </button>
            ) : (
              <button
                onClick={onDeleteRequest}
                className="flex items-center gap-1.5 text-caption text-ink-muted hover:text-abort transition-colors"
              >
                <Trash size={12} />
                Remove
              </button>
            ))}
          </div>
          {editing && (
            <div className="mt-2.5 flex items-center gap-2 reveal-row">
              <input
                type="password"
                value={value}
                onChange={(e) => onValueChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && value.trim() && !saving) onSave() }}
                placeholder="sk-..."
                autoFocus
                aria-label={`${provider.label} API key`}
                className="flex-1 min-w-0 rounded-tile border border-seam bg-base px-2.5 py-1.5 font-code text-body-xs text-ink placeholder:text-ink-muted/30 outline-none focus:border-go/50 transition-colors"
              />
              <button
                onClick={onSave}
                disabled={saving || !value.trim()}
                className="btn-primary !px-3 !py-1.5 text-caption shrink-0 disabled:opacity-40"
              >
                {saving ? <Spinner size={12} className="animate-spin" /> : 'Save'}
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="text-caption text-ink-muted/60 mt-1">Admin role required to modify</p>
      )}
    </div>
  )
}

export default function AdminDashboardPage() {
  const SIG = { ...SIG_STATIC, ...useThemeSignals() }
  const { role } = useAuth()
  const isAdmin = !!role && ADMIN_ROLES.has(role)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [usage, setUsage] = useState<number | null>(null)
  const [usageDetail, setUsageDetail] = useState<AdminUsageResponse | null>(null)
  const [teams, setTeams] = useState<number | null>(null)
  const [members, setMembers] = useState<number | null>(null)
  const [audit, setAudit] = useState<AdminAuditEvent[]>([])
  const [providerKeys, setProviderKeys] = useState<Record<string, AdminProviderKeyInfo>>({})
  const [editingProvider, setEditingProvider] = useState<string | null>(null)
  const [providerKeyInput, setProviderKeyInput] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [confirmDeleteProvider, setConfirmDeleteProvider] = useState<string | null>(null)
  const [keyFilter, setKeyFilter] = useState<'all' | 'configured' | 'unset'>('all')
  const toast = useToast()

  // Single loader shared by the mount effect (cancel-guarded) and the manual
  // Refresh buttons. Previously these were copy-paste twins that could drift.
  async function fetchAdminData(isCancelled: () => boolean = () => false) {
    setLoading(true); setError('')
    try {
      await Promise.all([
        adminGetUsage(undefined, 14).then((u) => { if (!isCancelled()) { setUsage(u.total_requests); setUsageDetail(u) } }).catch(() => {}),
        adminGetTeamUsage().then((t) => {
          if (!isCancelled()) {
            setTeams(t.count)
            setMembers(t.teams.reduce((acc, x) => acc + (x.member_count || 0), 0))
          }
        }).catch(() => {}),
        adminListAuditEvents({ limit: 8 }).then((a) => { if (!isCancelled()) setAudit(a.events) }).catch(() => {}),
        fetchProviderKeys(isCancelled).catch(() => {}),
      ])
    } catch (err: any) {
      if (!isCancelled()) setError(err.message || 'Failed to load admin data.')
    } finally {
      if (!isCancelled()) setLoading(false)
    }
  }

  async function fetchProviderKeys(isCancelled: () => boolean = () => false) {
    const data = await adminListProviderKeys()
    if (isCancelled()) return
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

  useEffect(() => {
    let cancelled = false
    fetchAdminData(() => cancelled)
    return () => { cancelled = true }
  }, [])

  const fmt = (n: number | null) => (n == null ? 'N/A' : n.toLocaleString())
  const fmtUsd = (n: number) => (n >= 100 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`)
  const series = usageDetail?.provider_series ?? []

  const readouts: Readout[] = [
    { label: 'API Calls · 24h', value: usage ?? 'N/A', color: 'text-go' },
    { label: 'Active Teams', value: teams ?? 'N/A', color: 'text-mission' },
    { label: 'Active Members', value: members ?? 'N/A', color: 'text-ink' },
  ]

  // ── Reduce the key shelf before rendering ten editors ────────────────
  const keyRows = useMemo(
    () => PROVIDER_OPTIONS.map((p) => {
      const info = providerKeys[p.id]
      return { ...p, info, configured: !!info?.configured }
    }),
    [providerKeys],
  )
  const configuredCount = keyRows.filter((r) => r.configured).length
  const unsetCount = keyRows.length - configuredCount

  const visibleKeys = useMemo(() => {
    if (keyFilter === 'configured') return keyRows.filter((r) => r.configured)
    if (keyFilter === 'unset') return keyRows.filter((r) => !r.configured)
    // Default view leads with what is live; unset providers are a setup chore.
    return [...keyRows].sort((a, b) => Number(b.configured) - Number(a.configured))
  }, [keyRows, keyFilter])

  const verdict = unsetCount > 0
    ? {
        tone: 'caution' as const,
        headline: `${unsetCount} provider${unsetCount === 1 ? '' : 's'} not configured`,
        detail: `The router falls back to environment variables for those. Set them here to take the platform over.`,
      }
    : {
        tone: 'go' as const,
        headline: `All ${keyRows.length} providers configured`,
        detail: 'The router is fully under admin control — no env-var dependency.',
      }

  return (
    <div className="min-h-[calc(100vh-4rem)] max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <PageHeader
          eyebrow="Folio 04 · Admin"
          title="Admin Console"
          subtitle="System-wide monitoring and management."
          actions={
            <button onClick={() => fetchAdminData()} disabled={loading} className="btn-glass disabled:opacity-50">Refresh</button>
          }
        />
      </div>

      {error && (
        <div>
          <ConsolePanel rail="Signal Lost" designator="SYSTEMS" status="abort">
            <div className="flex items-center justify-between gap-4">
              <p className="text-abort text-body-sm font-code">{error}</p>
              <button onClick={() => fetchAdminData()} disabled={loading} className="btn-glass !px-3 !py-1.5 text-caption shrink-0">Reacquire</button>
            </div>
          </ConsolePanel>
        </div>
      )}

      {loading ? (
        <div className="py-2"><AdminDashboardSkeleton /></div>
      ) : (
        <>
          {/* ── What needs setup, then the board ─────────────────────── */}
          <NextUp
            tone={verdict.tone}
            eyebrow="Platform setup"
            headline={verdict.headline}
            detail={verdict.detail}
            primary={
              unsetCount > 0
                ? {
                    id: 'unset',
                    label: 'Show the unconfigured ones',
                    detail: `${unsetCount} provider${unsetCount === 1 ? '' : 's'} to set`,
                    icon: Key,
                    tone: 'caution',
                    onClick: () => setKeyFilter('unset'),
                  }
                : { id: 'keys', label: 'Review the key shelf', detail: `${configuredCount} configured`, icon: Key, tone: 'go' }
            }
            secondary={[
              { id: 'audit', label: 'Full audit log', detail: 'Every security and config event', to: '/admin/audit', icon: ShieldCheck, tone: 'mission' },
              { id: 'flags', label: 'Feature flags', detail: 'What is switched on for whom', to: '/admin/feature-flags', icon: Gauge, tone: 'mission' },
              { id: 'users', label: 'Create an account', detail: 'Provision a seat by hand', to: '/admin/create-account', icon: Users, tone: 'ink' },
            ]}
          />

          {/* Systems telemetry */}
          <div>
            <ReadoutBank callsign="Systems" items={readouts} columns={4} />
          </div>

          {/* LLM Cost Savings */}
          <div>
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
                <EmptyState eyebrow="Treasury" title="No LLM traffic tracked yet" description="Gateway and agent requests will appear here once the router starts serving traffic." />
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
                    <ResponsiveContainer width="100%" height={240} minWidth={0} minHeight={0}>
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
          </div>

          {/* Platform Provider Keys — managed via the website, not .env */}
          <div>
            <ConsolePanel
              rail="Provider Keys · Platform"
              designator={`${Object.keys(providerKeys).length}/${PROVIDER_OPTIONS.length} CONFIGURED`}
              status={Object.keys(providerKeys).length ? 'go' : 'standby'}
              live={Object.keys(providerKeys).length > 0}
            >
              <p className="text-caption text-ink-muted mb-4">
                Platform-wide LLM &amp; embedding provider keys · configured here instead of <span className="font-code text-ink/80">backend/.env</span>. Encrypted at rest and applied to the router immediately.
              </p>

              <FilterChips
                label="Show"
                value={keyFilter}
                onChange={(v) => setKeyFilter(v as typeof keyFilter)}
                options={[
                  { value: 'all', label: 'All', count: keyRows.length },
                  { value: 'configured', label: 'Configured', count: configuredCount },
                  { value: 'unset', label: 'Not set', count: unsetCount },
                ]}
                summary={`${visibleKeys.length} of ${keyRows.length}`}
              />

              <div className="mt-4">
                <ShowMore
                  items={visibleKeys}
                  limit={6}
                  noun="provider"
                  resetKey={keyFilter}
                  emptyState={(
                    <EmptyState
                      eyebrow="Provider keys"
                      title={keyFilter === 'unset' ? 'Everything is configured' : 'Nothing configured yet'}
                      description={keyFilter === 'unset'
                        ? 'Every provider in the catalogue has a key set on the platform.'
                        : 'Add a key to take a provider under admin control.'}
                      compact
                    />
                  )}
                >
                  {(rows) => (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {rows.map((p) => (
                        <ProviderKeyCard
                          key={p.id}
                          provider={p}
                          configured={p.configured}
                          info={p.info}
                          canEdit={isAdmin}
                          editing={editingProvider === p.id}
                          value={providerKeyInput}
                          saving={savingKey}
                          confirmDelete={confirmDeleteProvider === p.id}
                          onEdit={() => {
                            if (editingProvider === p.id) { setEditingProvider(null); setProviderKeyInput('') }
                            else { setEditingProvider(p.id); setProviderKeyInput('') }
                          }}
                          onValueChange={setProviderKeyInput}
                          onSave={handleSaveProviderKey}
                          onDeleteRequest={() => setConfirmDeleteProvider(p.id)}
                          onDeleteConfirm={() => handleDeleteProviderKey(p.id)}
                          onDeleteCancel={() => setConfirmDeleteProvider(null)}
                        />
                      ))}
                    </div>
                  )}
                </ShowMore>
              </div>
              <div className="flex items-center gap-2 mt-4 text-caption text-ink-muted/70">
                <Lock size={12} className="shrink-0" />
                Keys are Fernet-encrypted at rest and win over environment variables. Per-team BYOK keys (Developer Portal) still take precedence for that team's gateway calls.
              </div>
            </ConsolePanel>
          </div>

          {/* Quick actions — real destinations, not dead buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: 'Create an account', to: '/admin/create-account', icon: Users, hint: 'Provision a seat' },
              { label: 'View the audit log', to: '/admin/audit', icon: ShieldCheck, hint: 'Security + config events' },
              { label: 'Feature flags', to: '/admin/feature-flags', icon: Gauge, hint: 'What is on, and for whom' },
            ].map((action) => (
              <Link
                key={action.to}
                to={action.to}
                className="group flex items-center gap-3 rounded-card border border-seam bg-panel px-4 py-3 transition-[border-color,background-color,transform] duration-150 ease-out hover:-translate-y-px hover:border-seam-strong hover:bg-panel-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-go"
              >
                <action.icon size={16} weight="regular" className="text-ink-muted shrink-0 group-hover:text-go transition-colors" />
                <span className="min-w-0 flex-1">
                  <span className="block text-caption font-medium text-ink truncate">{action.label}</span>
                  <span className="block text-caption text-ink-muted/70 truncate">{action.hint}</span>
                </span>
              </Link>
            ))}
          </div>

          {/* Deep surfaces — read on a schedule, not on every visit */}
          <Disclosure
            label="System health & audit tail"
            designator="2 PANELS"
            tone="idle"
            hint={`Org totals · ${audit.length} recent events`}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <ConsolePanel rail="Fleet · Org Health" designator="STATUS" status="go" pad="none">
                <div className="space-y-2.5 p-5">
                  {[
                    { label: 'Teams', value: teams ?? 0 },
                    { label: 'Members', value: members ?? 0 },
                    { label: 'Requests · 24h', value: usage ?? 0 },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-seam last:border-0">
                      <span className="text-body-sm text-ink-secondary">{row.label}</span>
                      <span className="readout text-ink tabular-nums">{fmt(row.value as number)}</span>
                    </div>
                  ))}
                </div>
              </ConsolePanel>

              <ConsolePanel rail="Event Log · Audit" designator={`${audit.length} EVENTS`} status="standby">
                {audit.length === 0 ? (
                  <EmptyState title="No audit events" description="Security and config events will appear here." compact />
                ) : (
                  <div className="space-y-0.5">
                    {audit.map((entry, i) => {
                      const tone = AUDIT_TONE[entry.event_type] ?? { tone: 'standby' as const, label: entry.event_type.replace(/_/g, ' ') }
                      return (
                        <div key={entry.event_id || i} className="flex items-center gap-3 p-2 rounded-tile hover:bg-well/60 transition-colors">
                          <StatusTile status={tone.tone} label={tone.label} />
                          <div className="flex-1 min-w-0">
                            <p className="text-body-xs text-ink truncate">
                              <span className="font-medium">{entry.actor_id}</span>
                              <span className="text-ink-muted"> → {entry.target_id || 'N/A'}</span>
                            </p>
                          </div>
                          <span className="text-caption text-ink-muted readout shrink-0">{relativeTime(entry.timestamp)}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </ConsolePanel>
            </div>
          </Disclosure>
        </>
      )}
    </div>
  )
}
