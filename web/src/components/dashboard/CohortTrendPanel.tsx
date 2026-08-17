import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { cn } from '../../lib/utils'
import ConsolePanel from '../ui/console-panel'
import { fetchCohortComparison, type CohortComparisonResponse } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { isLeaderRole } from './RampPanel'

/**
 * Cohort Trend (v1.6 — P3: blind leaders) — how onboarding is improving
 * across hiring cohorts, on the leadership console.
 *
 * Rides the existing `GET /hr/cohort-comparison` (join-month cohorts: avg
 * ramp days, avg days to first PR, completion, blockers). Self-contained and
 * leader-gated like RampPanel; hidden when no team scope resolves.
 */
export default function CohortTrendPanel({ teamId }: { teamId?: string }) {
  const { role, activeTeamId } = useAuth()
  const isLeader = isLeaderRole(role)
  const resolvedId = (teamId || activeTeamId || '').trim()

  const { data } = useQuery<CohortComparisonResponse>({
    queryKey: ['cohortTrend', resolvedId],
    queryFn: () => fetchCohortComparison(resolvedId),
    enabled: isLeader && !!resolvedId,
    staleTime: 120_000,
  })

  if (!isLeader || !resolvedId) return null

  const cohorts = (data?.cohorts ?? []).slice(0, 6)
  const improving = cohorts.length >= 2
    ? cohorts[cohorts.length - 1].avg_ramp_days != null &&
      cohorts[0].avg_ramp_days != null &&
      cohorts[cohorts.length - 1].avg_ramp_days! <= cohorts[0].avg_ramp_days!
    : null
  const totalBlockers = cohorts.reduce((s, c) => s + (c.blocker_count || 0), 0)

  return (
    <ConsolePanel
      rail="Cohort Trend · Ramp"
      designator={`${cohorts.length} COHORTS`}
      status={improving === false || totalBlockers > 0 ? 'caution' : improving === true ? 'go' : 'standby'}
      live={improving === true}
    >
      {cohorts.length === 0 ? (
        <p className="text-caption text-ink-muted font-code py-2">
          No cohorts yet — groups form as developers join.
        </p>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          {improving !== null && (
            <p className="text-caption text-ink-muted">
              Ramp trend:{' '}
              <span className={improving ? 'text-go font-medium' : 'text-caution font-medium'}>
                {improving ? 'improving' : 'slipping'}
              </span>{' '}
              · {totalBlockers} blocker{totalBlockers === 1 ? '' : 's'} across cohorts
            </p>
          )}
          {cohorts.map((c, i) => (
            <div key={c.cohort}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-body-xs text-ink font-medium truncate">
                  {c.label} <span className="text-ink-muted font-normal">({c.member_count})</span>
                </span>
                <span className="readout text-caption tabular-nums text-ink-muted">
                  {c.avg_ramp_days != null ? `${c.avg_ramp_days}d` : '—'} ramp
                </span>
              </div>
              <div className="h-1.5 rounded-tile bg-well overflow-hidden border border-seam">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(((c.avg_ramp_days ?? 30) / 30) * 100, 100)}%` }}
                  transition={{ duration: 0.5, delay: i * 0.06, ease: 'easeOut' }}
                  className={cn(
                    'h-full',
                    c.avg_ramp_days != null && c.avg_ramp_days <= 7 ? 'bg-go'
                      : c.avg_ramp_days != null && c.avg_ramp_days <= 14 ? 'bg-mission'
                        : 'bg-caution'
                  )}
                />
              </div>
              <div className="flex gap-3 mt-1 text-caption text-ink-muted font-code">
                <span>{c.avg_days_to_first_pr != null ? `1st PR ${c.avg_days_to_first_pr}d` : 'no 1st PR'}</span>
                <span>completion {c.avg_completion_pct ?? 0}%</span>
                <span className={c.blocker_count > 0 ? 'text-caution' : ''}>blockers {c.blocker_count}</span>
              </div>
            </div>
          ))}
        </motion.div>
      )}
    </ConsolePanel>
  )
}
