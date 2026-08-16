import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { cn } from '../../lib/utils'
import ConsolePanel from '../ui/console-panel'
import {
  fetchRampSummary,
  fetchRampHealth,
  type RampSummary,
  type RampHealth,
} from '../../lib/api'
import { useAuth } from '../../context/AuthContext'

// Same set the /ramp route + sidebar use — the panel is a leadership surface.
// 'hr' is included: org ramp health is people telemetry (the HR console
// already owns attrition risk, ramp time, and completion).
export const LEADER_ROLES = ['senior_dev', 'senior', 'admin', 'ceo', 'cto', 'hr']

export function isLeaderRole(role?: string | null): boolean {
  return !!role && LEADER_ROLES.includes(role)
}

const fmtDays = (v: number | null | undefined) =>
  v == null ? '—' : `${Math.round(v * 10) / 10}d`
const fmtUsd = (v: number) => `$${Math.round(v).toLocaleString()}`

const hasHighStuck = (stuck: { severity: string }[]) =>
  stuck.some((s) => s.severity === 'high')

function Readout({ label, value, tone }: { label: string; value: string; tone?: 'go' | 'caution' | 'abort' }) {
  return (
    <div>
      <div className="overline text-ink-muted/60">{label}</div>
      <div
        className={cn(
          'font-code tabular-nums text-2xl md:text-3xl font-semibold leading-none mt-1.5',
          tone === 'go' && 'text-go',
          tone === 'caution' && 'text-caution',
          tone === 'abort' && 'text-abort',
          !tone && 'text-text-primary'
        )}
      >
        {value}
      </div>
    </div>
  )
}

/**
 * Ramp · Senior-Time — the v1.4 wedge telemetry for the leadership consoles.
 *
 * Self-contained: resolves the team scope (prop → active team → backend
 * primary-team default), fetches `GET /ramp/summary`, and renders the two
 * numbers leadership cares about — senior-time cost and stuck devs — with a
 * compact stuck list and a link to the full Ramp view. Hidden for non-leader
 * roles (matches the /ramp route guard).
 */
export default function RampPanel({ teamId }: { teamId?: string }) {
  const { role, activeTeamId } = useAuth()
  const isLeader = isLeaderRole(role)

  const resolvedId = (teamId || activeTeamId || '').trim()

  const { data, isLoading, error } = useQuery<RampSummary>({
    queryKey: ['rampPanel', resolvedId],
    queryFn: () => fetchRampSummary(resolvedId || undefined),
    staleTime: 60_000,
    enabled: isLeader,
  })
  const { data: health } = useQuery<RampHealth>({
    queryKey: ['rampHealthPanel', resolvedId],
    queryFn: () => fetchRampHealth(resolvedId || undefined),
    staleTime: 60_000,
    enabled: isLeader,
  })

  if (!isLeader) return null

  const stuck = data?.stuck?.stuck ?? []
  const grade = health?.grade
  // The v1.6 health grade drives the LED (a superset of the stuck signal);
  // fall back to stuck-only logic when health is unavailable.
  const status: 'go' | 'standby' | 'caution' | 'abort' =
    grade === 'critical' ? 'abort'
      : grade === 'at_risk' ? 'caution'
        : grade === 'healthy' ? 'go'
          : hasHighStuck(stuck) ? 'abort'
            : stuck.length > 0 ? 'caution'
              : 'standby'
  const designator = health?.health_score != null
    ? `${health.health_score} HEALTH`
    : data
      ? `${stuck.length} STUCK · ${fmtUsd(data.totals?.senior_cost_usd ?? 0)}`
      : 'SENIOR-TIME'

  return (
    <ConsolePanel
      rail="Ramp · Senior-Time"
      designator={designator}
      status={status}
      action={
        <Link
          to="/ramp"
          className="text-caption text-text-muted/50 hover:text-text-secondary transition-colors font-semibold flex items-center gap-1"
        >
          Ramp <span aria-hidden>→</span>
        </Link>
      }
    >
      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-tile bg-bg-tertiary/40 animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="text-error text-body-sm font-code">Ramp telemetry unavailable.</div>
      )}

      {data && !error && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Readouts — health score first, then the wedge telemetry. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <Readout
              label="Health"
              value={health?.health_score != null ? String(health.health_score) : '—'}
              tone={grade === 'healthy' ? 'go' : grade === 'at_risk' ? 'caution' : grade === 'critical' ? 'abort' : undefined}
            />
            <Readout label="Benchmark" value={fmtDays(data.benchmark_days)} />
            <Readout label="First PR" value={fmtDays(data.first_pr_benchmark_days)} />
            <Readout
              label="Ramped"
              value={`${data.ramped_count}/${data.trainee_count}`}
              tone={data.ramped_count >= data.trainee_count && data.trainee_count > 0 ? 'go' : undefined}
            />
            <Readout label="Senior Time" value={`${Math.round((data.totals?.senior_hours ?? 0) * 10) / 10}h`} />
            <Readout
              label="Senior Cost"
              value={fmtUsd(data.totals?.senior_cost_usd ?? 0)}
              tone={stuck.length > 0 ? (grade === 'critical' ? 'abort' : 'caution') : undefined}
            />
          </div>

          {/* Stuck list */}
          {stuck.length > 0 ? (
            <div className="divide-y divide-seam -mx-5">
              {stuck.slice(0, 3).map((s) => (
                <Link
                  key={s.user_id}
                  to="/ramp"
                  className="flex items-center gap-3 px-5 py-2.5 hover:bg-bg-tertiary/40 transition-colors"
                >
                  <span
                    className={cn(
                      'w-1 self-stretch rounded-sm shrink-0',
                      s.severity === 'high' ? 'bg-abort' : 'bg-caution'
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-body-sm text-text-primary font-medium truncate">{s.name}</span>
                      <span
                        className={cn(
                          'text-caption font-semibold uppercase tracking-wide',
                          s.severity === 'high' ? 'text-abort' : 'text-caution'
                        )}
                      >
                        {s.severity}
                      </span>
                    </div>
                    <div className="text-caption text-text-muted truncate mt-0.5">
                      {s.signals[0]?.label}
                      {s.signals.length > 1 && ` +${s.signals.length - 1} more`}
                    </div>
                  </div>
                  <span className="text-caption text-text-muted font-mono shrink-0">
                    {fmtUsd(s.senior_cost_usd)}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-caption text-text-muted font-code">
              No stuck devs · {data.trainee_count} trainee{data.trainee_count === 1 ? '' : 's'} on ramp
            </p>
          )}
        </motion.div>
      )}
    </ConsolePanel>
  )
}
