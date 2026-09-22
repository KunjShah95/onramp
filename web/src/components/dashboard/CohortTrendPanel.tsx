import { useQuery } from '@tanstack/react-query'
import { cn } from '../../lib/utils'
import ConsolePanel from '../ui/console-panel'
import { EmptyRow } from '../ui/empty-state'
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

  const { data, isLoading, isError, refetch } = useQuery<CohortComparisonResponse>({
    queryKey: ['cohortTrend', resolvedId],
    queryFn: () => fetchCohortComparison(resolvedId),
    enabled: isLeader && !!resolvedId,
    staleTime: 120_000,
  })

  if (!isLeader || !resolvedId) {
    if (isLoading || isError) {
      return isError ? (
        <section aria-busy="true" aria-label="Loading cohort trend" className="rounded-tile bg-base border border-seam p-4 shadow-seam animate-pulse">
          <p className="text-sm text-abort font-medium" role="alert">Cohort trend unavailable.</p>
          <p className="text-caption text-ink-muted mt-1">Check your connection and retry.</p>
          <button onClick={() => refetch()} className="mt-3 btn-secondary !px-3 !py-1.5 text-caption focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-go/50">Retry</button>
        </section>
      ) : (
        <ConsolePanel rail="Cohort Trend · Ramp" designator="No team" status="standby">
          <p className="text-sm text-ink-muted">Select a team to see cohort trend.</p>
        </ConsolePanel>
      )
    }
    return null
  }

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
        <EmptyRow label="No cohorts yet — groups form as developers join." />
      ) : (
        <div className="space-y-3">
          {improving !== null && (
            <p className="text-caption text-ink-muted">
              Ramp trend:{' '}
              <span className={improving ? 'text-go font-medium' : 'text-caution font-medium'}>
                {improving ? 'improving' : 'slipping'}
              </span>{' '}
              · {totalBlockers} blocker{totalBlockers === 1 ? '' : 's'} across cohorts
            </p>
          )}
          {cohorts.map((c) => (
            <div key={c.cohort}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-body-xs text-ink font-medium truncate">
                  {c.label} <span className="text-ink-muted font-normal">({c.member_count})</span>
                </span>
                <span className="readout text-caption tabular-nums text-ink-muted">
                  {c.avg_ramp_days != null ? `${c.avg_ramp_days}d` : 'N/A'} ramp
                </span>
              </div>
              <div className="h-1.5 rounded-tile bg-well overflow-hidden border border-seam">
                <div
                  style={{ width: `${Math.min(((c.avg_ramp_days ?? 30) / 30) * 100, 100)}%` }}
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
        </div>
      )}
    </ConsolePanel>
  )
}
