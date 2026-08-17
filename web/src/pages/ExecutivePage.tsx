/*
 * ─── DIRECTION CONTRACT · ONRAMP MISSION CONTROL ────────────────────────────
 * THESIS: The executive seat stands at FLIGHT with the big board overhead —
 *   revenue trajectory, fleet status, treasury. Leadership metrics render as a
 *   plotboard + mono readouts, never a row of identical hero cards.
 * OWN-WORLD: Daylit ops room, seated panels, signal-only colour, mono telemetry.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { TrendUp, CaretUp, CaretDown } from '@phosphor-icons/react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import ConsolePanel from '../components/ui/console-panel'
import ReadoutBank, { type Readout } from '../components/ui/readout-bank'
import StatusTile from '../components/ui/status-tile'
import { EmptyState } from '../components/ui/empty-state'
import { cn } from '../lib/utils'
import { fetchSeedRoleData } from '../lib/api'
import ApiCostTracking from '../components/dashboard/ApiCostTracking'
import RampPanel from '../components/dashboard/RampPanel'
import CohortTrendPanel from '../components/dashboard/CohortTrendPanel'
import RetentionCurvesPanel from '../components/dashboard/RetentionCurvesPanel'
import HeadcountFlowPanel from '../components/dashboard/HeadcountFlowPanel'

const SIG = {
  go: '#17A34A',
  blue: '#2472C4',
  grid: 'rgb(var(--border-rgb) / 0.10)',
  axis: 'rgb(var(--text-tertiary) / 0.75)',
}
const TOOLTIP = {
  background: 'rgb(var(--bg-elevated))',
  border: '1px solid rgb(var(--border-rgb) / 0.18)',
  borderRadius: '4px',
  fontSize: '12px',
  color: 'rgb(var(--text-primary))',
  boxShadow: '0 4px 16px rgb(var(--border-rgb) / 0.12)',
}

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const item = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 90, damping: 18 } },
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function ExecutivePage() {
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
    <motion.div variants={container} initial="hidden" animate="visible" className="min-h-[calc(100vh-4rem)] p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <motion.div variants={item} className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="tile tile-go">Flight · Executive</span>
            <span className="designator opacity-50">BIG BOARD · ORG</span>
          </div>
          <h1 className="text-display-md md:text-display-lg text-ink">Executive Console</h1>
          <p className="text-body-sm text-ink-secondary mt-1 font-code">Revenue trajectory · fleet status · treasury.</p>
        </div>
      </motion.div>

      {error && (
        <motion.div variants={item}>
          <ConsolePanel rail="Signal Lost" designator="ORG" status="abort">
            <p className="text-abort text-body-sm font-code">{error}</p>
          </ConsolePanel>
        </motion.div>
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
          <motion.div variants={item}>
            <ReadoutBank callsign="ORG TELEMETRY" items={readouts} columns={4} />
          </motion.div>

          {/* Revenue trajectory + fleet */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <motion.div variants={item} className="lg:col-span-3">
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
                      <XAxis dataKey="month" tick={{ fill: SIG.axis, fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: SIG.axis, fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} width={44}
                        tickFormatter={(v) => `$${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
                      <Tooltip contentStyle={TOOLTIP} formatter={(v) => [`$${Number(v).toLocaleString()}`, 'MRR']} />
                      <Area type="monotone" dataKey="mrr" stroke={SIG.go} fill="url(#mrrFill)" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </ConsolePanel>
            </motion.div>

            {/* Top Teams */}
            <motion.div variants={item} className="lg:col-span-2">
              <ConsolePanel rail="Fleet · Top Teams" designator={`${d?.top_teams?.length ?? 0} TRACKED`} status="standby">
                {!d?.top_teams?.length ? (
                  <EmptyState title="No teams" description="Teams will appear once created." />
                ) : (
                  <div className="space-y-2.5">
                    {d.top_teams.map((team: any, i: number) => (
                      <motion.div key={team.name} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                        className="p-2.5 rounded-tile bg-well border border-seam">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-body-xs font-medium text-ink truncate">{team.name}</span>
                          <span className="text-caption text-ink-muted font-code">{team.members} crew</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-tile bg-well overflow-hidden border border-seam">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${team.completion_rate}%` }} transition={{ duration: 0.7, delay: i * 0.05 }}
                              className={cn('h-full', team.completion_rate >= 80 ? 'bg-success' : team.completion_rate >= 60 ? 'bg-info' : 'bg-error')} />
                          </div>
                          <span className={cn('readout text-caption tabular-nums', team.completion_rate >= 80 ? 'text-go' : team.completion_rate >= 60 ? 'text-mission' : 'text-abort')}>
                            {team.completion_rate}%
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-1 text-caption text-ink-muted">
                          <TrendUp size={11} weight="bold" /> <span className="font-code">Velocity {team.velocity}x</span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </ConsolePanel>
            </motion.div>
          </div>

          {/* Treasury + audit */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Billing */}
            <motion.div variants={item}>
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
                          <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} className={cn('h-full', t.bar)} />
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
            </motion.div>

            {/* Audit */}
            <motion.div variants={item}>
              <ConsolePanel rail="Event Log · Audit" designator={`${d?.recent_audit_events?.length ?? 0} EVENTS`} status="standby">
                {!d?.recent_audit_events?.length ? (
                  <EmptyState title="No audit events" description="Security events will appear here." />
                ) : (
                  <div className="space-y-0.5">
                    {d.recent_audit_events.map((event: any, i: number) => {
                      const isDeploy = (event.action ?? '').toLowerCase().includes('deploy')
                      return (
                        <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                          className="flex items-center gap-3 p-2 rounded-tile hover:bg-well/60 transition-colors">
                          <StatusTile status={isDeploy ? 'go' : 'standby'} label={isDeploy ? 'Deploy' : 'Auth'} />
                          <div className="flex-1 min-w-0">
                            <p className="text-body-xs text-ink truncate">
                              <span className="font-medium">{event.actor}</span> <span className="text-ink-muted">{event.action}</span>
                            </p>
                          </div>
                          <span className="text-caption text-ink-muted readout shrink-0">{event.time}</span>
                        </motion.div>
                      )
                    })}
                  </div>
                )}
              </ConsolePanel>
            </motion.div>
          </div>

          {/* Ramp · Senior-Time — health score, ramp cost + stuck devs for the C-suite */}
          <motion.div variants={item}>
            <RampPanel />
          </motion.div>

          {/* Cohort trend — onboarding improvement across hiring cohorts */}
          <motion.div variants={item}>
            <CohortTrendPanel />
          </motion.div>

          {/* Retention curves + headcount flow — survival & hiring/attrition */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <motion.div variants={item}>
              <RetentionCurvesPanel />
            </motion.div>
            <motion.div variants={item}>
              <HeadcountFlowPanel />
            </motion.div>
          </div>

          {/* Credential cost tracking — live API key budgets for the C-suite */}
          <motion.div variants={item}>
            <ConsolePanel rail="Credential Cost · Tracking" designator="COST TELEMETRY" status="go">
              <p className="text-caption text-ink-muted mb-4 font-code">
                API key spend vs. budget — live from the gateway.
              </p>
              <ApiCostTracking />
            </ConsolePanel>
          </motion.div>
        </>
      )}
    </motion.div>
  )
}
