import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { cn } from '../../lib/utils'
import ConsolePanel from '../ui/console-panel'
import { fetchCohortRetention, type CohortRetentionResponse } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { isLeaderRole } from './RampPanel'

/**
 * Retention Curves (v1.6 wave 2 — P3: blind leaders) — do newer cohorts
 * retain better than older ones? Survival curves at 30/60/90/120/180d after
 * joining, per join-month cohort, on the leadership console.
 *
 * Rides the new `GET /hr/cohort-retention` (retained_pct = still on team,
 * active_pct = task activity in the bucket window). The newest cohort's
 * curves are charted; a footer lists every cohort's 180-day retention so the
 * trend across cohorts is legible. Leader-gated like CohortTrendPanel.
 */
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

function retentionTone(pct: number): 'go' | 'caution' | 'abort' {
  if (pct >= 70) return 'go'
  if (pct >= 50) return 'caution'
  return 'abort'
}

export default function RetentionCurvesPanel({ teamId }: { teamId?: string }) {
  const { role, activeTeamId } = useAuth()
  const isLeader = isLeaderRole(role)
  const resolvedId = (teamId || activeTeamId || '').trim()

  const { data } = useQuery<CohortRetentionResponse>({
    queryKey: ['cohortRetention', resolvedId],
    queryFn: () => fetchCohortRetention(resolvedId),
    enabled: isLeader && !!resolvedId,
    staleTime: 120_000,
  })

  if (!isLeader || !resolvedId) return null

  const cohorts = (data?.cohorts ?? []).slice(0, 6)
  const latest = cohorts[cohorts.length - 1]
  const chartData = latest?.series.map((p) => ({ ...p, day: `${p.day}d` })) ?? []
  // 180-day retention per cohort → the across-cohort trend line.
  const cohortEndpoints = cohorts.map((c) => {
    const last = c.series[c.series.length - 1]
    return { label: c.label, member_count: c.member_count, retained: last?.retained_pct ?? 0 }
  })
  const improving = cohortEndpoints.length >= 2
    ? cohortEndpoints[cohortEndpoints.length - 1].retained >= cohortEndpoints[0].retained
    : null
  const tone = latest ? retentionTone(cohortEndpoints[cohortEndpoints.length - 1]?.retained ?? 0) : 'standby'

  return (
    <ConsolePanel
      rail="Cohort Retention · Survival"
      designator={`${cohorts.length} COHORTS`}
      status={tone}
      live={tone === 'go'}
    >
      {cohorts.length === 0 ? (
        <p className="text-caption text-text-muted font-code py-2">
          No cohorts yet — retention curves form as developers join.
        </p>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {latest && (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-body-xs text-text-primary font-medium">
                  {latest.label} <span className="text-text-muted font-normal">({latest.member_count}) — latest cohort</span>
                </p>
                <p className="text-caption text-text-muted">
                  <span className="text-go font-medium">retained</span> / <span className="text-info font-medium">active</span> after joining
                </p>
              </div>
              <div className="h-44 bg-plot-grid rounded-tile">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke={SIG.grid} />
                    <XAxis dataKey="day" tick={{ fill: SIG.axis, fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: SIG.axis, fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} width={30}
                      tickFormatter={(v) => `${v}%`} />
                    <Tooltip
                      contentStyle={TOOLTIP}
                      formatter={(v, name) => [`${Number(v).toFixed(1)}%`, name === 'retained_pct' ? 'retained' : 'active']}
                    />
                    <Line type="monotone" dataKey="retained_pct" stroke={SIG.go} strokeWidth={2} dot={{ r: 2.5, fill: SIG.go }} />
                    <Line type="monotone" dataKey="active_pct" stroke={SIG.blue} strokeWidth={2} strokeDasharray="4 3" dot={{ r: 2.5, fill: SIG.blue }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {improving !== null && (
            <p className="text-caption text-text-muted">
              Retention trend:{' '}
              <span className={improving ? 'text-go font-medium' : 'text-caution font-medium'}>
                {improving ? 'improving' : 'slipping'}
              </span>{' '}
              across cohorts (180d)
            </p>
          )}

          <div className="space-y-2">
            {cohortEndpoints.map((c, i) => {
              const t = retentionTone(c.retained)
              return (
                <div key={c.label} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-caption text-text-muted truncate">{c.label}</span>
                  <div className="flex-1 h-1.5 rounded-tile bg-bg-tertiary overflow-hidden border border-seam">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${c.retained}%` }}
                      transition={{ duration: 0.5, delay: i * 0.06, ease: 'easeOut' }}
                      className={cn('h-full', t === 'go' ? 'bg-go' : t === 'caution' ? 'bg-caution' : 'bg-abort')}
                    />
                  </div>
                  <span className={cn('readout text-caption tabular-nums shrink-0 w-16 text-right', t === 'go' ? 'text-go' : t === 'caution' ? 'text-caution' : 'text-abort')}>
                    {c.retained.toFixed(0)}%
                  </span>
                </div>
              )
            })}
          </div>
        </motion.div>
      )}
    </ConsolePanel>
  )
}
