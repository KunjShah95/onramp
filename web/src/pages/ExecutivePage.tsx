/*
 * ─── DIRECTION CONTRACT · ONRAMP MISSION CONTROL ────────────────────────────
 * THESIS: The executive seat stands at FLIGHT with the big board overhead —
 *   revenue trajectory, fleet status, treasury. Leadership metrics render as a
 *   plotboard + mono readouts, never a row of identical hero cards.
 * OWN-WORLD: Daylit ops room, seated panels, signal-only colour, mono telemetry.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useMemo } from 'react'

import { TrendUp, CaretUp, CaretDown } from '@phosphor-icons/react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import ConsolePanel from '../components/ui/console-panel'
import ReadoutBank, { type Readout } from '../components/ui/readout-bank'
import StatusTile from '../components/ui/status-tile'
import { PageHeader } from '../components/ui/page-header'
import { EmptyState } from '../components/ui/empty-state'
import { cn } from '../lib/utils'
import { fetchSeedRoleData } from '../lib/api'
import { useThemeSignals } from '../hooks/useThemeSignals'
import ApiCostTracking from '../components/dashboard/ApiCostTracking'
import RampPanel from '../components/dashboard/RampPanel'
import CohortTrendPanel from '../components/dashboard/CohortTrendPanel'
import RetentionCurvesPanel from '../components/dashboard/RetentionCurvesPanel'
import HeadcountFlowPanel from '../components/dashboard/HeadcountFlowPanel'

/* Chart signal colors resolve from theme tokens via useThemeSignals() —
   hardcoded hex here rendered the same palette in every theme. */
const TOOLTIP = {
  background: 'rgb(var(--bg-elevated))',
  border: '1px solid rgb(var(--border-rgb) / 0.18)',
  borderRadius: '4px',
  fontSize: '12px',
  color: 'rgb(var(--text-primary))',
  boxShadow: '0 4px 16px rgb(var(--border-rgb) / 0.12)',
}


const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function ExecutivePage() {
  const SIG = useThemeSignals()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [seedData, setSeedData] = useState<any>(null)

  useEffect(() => {
    let cancelled = false
    fetchSeedRoleData()
      .then((res) => { if (!cancelled) { setSeedData(res.data); setLoading(false) } })
      .catch((err) => { if (!cancelled) { setError(err.message); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  const d = seedData
  const mrr = d?.mrr ?? 0
  const growth = d?.mrr_growth ?? 0

  // Trailing MRR trajectory reconstructed from current MRR + MoM growth rate.
  const trajectory = useMemo(() => {
    const g = growth / 100
    const now = new Date().getMonth()
    return Array.from({ length: 6 }).map((_, k) => {
      const back = 5 - k
      const val = g > -1 ? mrr / Math.pow(1 + g, back) : mrr
      return { month: MONTHS[(now - back + 12) % 12], mrr: Math.round(val) }
    })
  }, [mrr, growth])

  const readouts: Readout[] = [
    { label: 'Monthly Revenue', value: mrr, prefix: '$', color: 'text-go', delta: growth },
    { label: 'Active Teams', value: d?.stats?.active_teams ?? 0, color: 'text-mission' },
    { label: 'Active Users', value: d?.stats?.total_users ?? 0, color: 'text-ink' },
    { label: 'Credits · 24h', value: d?.stats?.api_calls_24h ?? 0, color: 'text-mission' },
  ]

  return (
    <div className="min-h-[calc(100vh-4rem)] max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <PageHeader
          eyebrow="Folio 03 · Executive"
          title="Executive Console"
          subtitle="Revenue trajectory · fleet status · treasury."
          pills={[{ label: 'Data', value: 'Demo' }]}
        />
      </div>

      {error && (
        <div>
          <ConsolePanel rail="Signal Lost" designator="ORG" status="abort">
            <p className="text-abort text-body-sm font-code">{error}</p>
          </ConsolePanel>
        </div>
      )}

      {loading ? (
        <div className="space-y-6">
          <div className="h-28 rounded-card bg-panel border border-seam animate-skeleton" />
          <div className="h-56 rounded-card bg-panel border border-seam animate-skeleton" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-64 rounded-card bg-panel border border-seam animate-skeleton" />
            <div className="h-64 rounded-card bg-panel border border-seam animate-skeleton" />
          </div>
        </div>
      ) : (
        <>
          {/* Big board readouts */}
          <div>
            <ReadoutBank callsign="Org" items={readouts} columns={4} />
          </div>

          {/* Revenue trajectory + fleet */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-3">
              <ConsolePanel rail="Revenue Trajectory" designator="MRR · 6-MO" status="go" live>
                <div className="flex items-baseline gap-3 mb-3">
                  <span className="font-code tabular-nums text-3xl md:text-4xl font-semibold text-go leading-none">
                    ${mrr.toLocaleString()}
                  </span>
                  <span className={cn('inline-flex items-center gap-0.5 font-code text-caption tabular-nums', growth >= 0 ? 'text-go' : 'text-abort')}>
                    {growth >= 0 ? <CaretUp size={11} weight="bold" /> : <CaretDown size={11} weight="bold" />}
                    {Math.abs(growth)}% MoM
                  </span>
                  <span className="text-caption text-ink-muted">· {d?.active_subscriptions ?? 0} active subs</span>
                </div>
                <div className="h-48 bg-plot-grid rounded-tile">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trajectory} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="mrrFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={SIG.go} stopOpacity={0.26} />
                          <stop offset="95%" stopColor={SIG.go} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="2 4" stroke={SIG.grid} />
                      <XAxis dataKey="month" tick={{ fill: SIG.axis, fontSize: 10, fontFamily: 'IBM Plex Mono' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: SIG.axis, fontSize: 10, fontFamily: 'IBM Plex Mono' }} axisLine={false} tickLine={false} width={44}
                        tickFormatter={(v) => `$${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
                      <Tooltip contentStyle={TOOLTIP} formatter={(v) => [`$${Number(v).toLocaleString()}`, 'MRR']} />
                      <Area type="monotone" dataKey="mrr" stroke={SIG.go} fill="url(#mrrFill)" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </ConsolePanel>
            </div>

            {/* Top Teams */}
            <div className="lg:col-span-2">
              <ConsolePanel rail="Fleet · Top Teams" designator={`${d?.top_teams?.length ?? 0} TRACKED`} status="standby">
                {!d?.top_teams?.length ? (
                  <EmptyState title="No teams" description="Teams will appear once created." />
                ) : (
                  <div className="space-y-2.5">
                    {d.top_teams.map((team: any) => (
                      <div key={team.name} className="p-2.5 rounded-tile bg-well border border-seam">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-body-xs font-medium text-ink truncate">{team.name}</span>
                          <span className="text-caption text-ink-muted font-code">{team.members} crew</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-tile bg-well overflow-hidden border border-seam">
                            <div className={cn('h-full', team.completion_rate >= 80 ? 'bg-success' : team.completion_rate >= 60 ? 'bg-info' : 'bg-error')} style={{ width: `${team.completion_rate}%` }} />
                          </div>
                          <span className={cn('readout text-caption tabular-nums', team.completion_rate >= 80 ? 'text-go' : team.completion_rate >= 60 ? 'text-mission' : 'text-abort')}>
                            {team.completion_rate}%
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-1 text-caption text-ink-muted">
                          <TrendUp size={11} weight="bold" /> <span className="font-code">Velocity {team.velocity}x</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ConsolePanel>
            </div>
          </div>

          {/* Treasury + audit */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Billing */}
            <div>
              <ConsolePanel rail="Treasury · Billing" designator={`${d?.active_subscriptions ?? 0} SUBS`} status="go">
                <div className="space-y-2.5">
                  {[
                    { tier: 'Active', key: 'active', bar: 'bg-success', tone: 'go' as const },
                    { tier: 'Past Due', key: 'past_due', bar: 'bg-error', tone: 'abort' as const },
                    { tier: 'Trialing', key: 'trialing', bar: 'bg-info', tone: 'standby' as const },
                    { tier: 'Canceled', key: 'canceled', bar: 'bg-ink-disabled', tone: 'idle' as const },
                  ].map((t) => {
                    const count = d?.billing_summary?.[t.key] ?? 0
                    const total = d?.active_subscriptions ?? 1
                    const pct = Math.round((count / Math.max(total, 1)) * 100)
                    return (
                      <div key={t.key} className="flex items-center gap-3">
                        <span className="w-20 shrink-0"><StatusTile status={t.tone} label={t.tier} /></span>
                        <div className="flex-1 h-2 rounded-tile bg-well overflow-hidden border border-seam">
                          <div className={cn('h-full', t.bar)} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="flex items-center gap-1.5 shrink-0">
                          <span className="readout text-ink tabular-nums">{count}</span>
                          <span className="text-caption text-ink-muted">{pct}%</span>
                        </span>
                      </div>
                    )
                  })}
                </div>
              </ConsolePanel>
            </div>

            {/* Audit */}
            <div>
              <ConsolePanel rail="Event Log · Audit" designator={`${d?.recent_audit_events?.length ?? 0} EVENTS`} status="standby">
                {!d?.recent_audit_events?.length ? (
                  <EmptyState title="No audit events" description="Security events will appear here." />
                ) : (
                  <div className="space-y-0.5">
                    {d.recent_audit_events.map((event: any, i: number) => {
                      const isDeploy = (event.action ?? '').toLowerCase().includes('deploy')
                      return (
                        <div key={i} className="flex items-center gap-3 p-2 rounded-tile hover:bg-well/60 transition-colors">
                          <StatusTile status={isDeploy ? 'go' : 'standby'} label={isDeploy ? 'Deploy' : 'Auth'} />
                          <div className="flex-1 min-w-0">
                            <p className="text-body-xs text-ink truncate">
                              <span className="font-medium">{event.actor}</span> <span className="text-ink-muted">{event.action}</span>
                            </p>
                          </div>
                          <span className="text-caption text-ink-muted readout shrink-0">{event.time}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </ConsolePanel>
            </div>
          </div>

          {/* Ramp · Senior-Time — health score, ramp cost + stuck devs for the C-suite */}
          <div>
            <RampPanel />
          </div>

          {/* Cohort trend — onboarding improvement across hiring cohorts */}
          <div>
            <CohortTrendPanel />
          </div>

          {/* Retention curves + headcount flow — survival & hiring/attrition */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <RetentionCurvesPanel />
            </div>
            <div>
              <HeadcountFlowPanel />
            </div>
          </div>

          {/* Credential cost tracking — live API key budgets for the C-suite */}
          <div>
            <ConsolePanel rail="Credential Cost · Tracking" designator="Live · gateway" status="go">
              <p className="text-caption text-ink-muted mb-4 font-code">
                API key spend vs. budget · live from the gateway.
              </p>
              <ApiCostTracking />
            </ConsolePanel>
          </div>
        </>
      )}
    </div>
  )
}
