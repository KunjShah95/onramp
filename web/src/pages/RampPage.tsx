import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '../lib/utils'
import {
  fetchRampSummary,
  fetchRampHealth,
  runRampCheck,
  type RampSummary,
  type RampHealth,
  type RampTraineeProfile,
  type RampStuckEntry,
} from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { isLeaderRole } from '../components/dashboard/RampPanel'
import CostModelPanel from '../components/dashboard/CostModelPanel'
import AgentBenchmarkPanel from '../components/dashboard/AgentBenchmarkPanel'
import EfficiencyBenchmarkPanel from '../components/dashboard/EfficiencyBenchmarkPanel'

function formatDays(days: number | null | undefined): string {
  if (days == null) return '—'
  return `${Math.round(days * 10) / 10}d`
}

function formatUsd(v: number): string {
  return `$${Math.round(v).toLocaleString()}`
}

function StatCard({
  icon,
  label,
  value,
  sub,
  tone = 'default',
}: {
  icon: string
  label: string
  value: string
  sub?: string
  tone?: 'default' | 'accent' | 'warn'
}) {
  return (
    <div className="rounded-tile bg-bg-primary border border-border p-4 shadow-card">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            'material-symbols-outlined text-lg',
            tone === 'accent' && 'text-accent-from',
            tone === 'warn' && 'text-error',
            tone === 'default' && 'text-text-muted'
          )}
        >
          {icon}
        </span>
        <span className="overline text-text-muted/70">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-text-primary tracking-tight font-display">
        {value}
      </div>
      {sub && <div className="mt-0.5 text-caption text-text-muted">{sub}</div>}
    </div>
  )
}

function StuckCard({ entry }: { entry: RampStuckEntry }) {
  return (
    <div
      className={cn(
        'rounded-tile border p-3.5 flex flex-col gap-2',
        entry.severity === 'high'
          ? 'bg-error/[0.04] border-error/30'
          : 'bg-amber-500/[0.04] border-amber-500/30'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              'material-symbols-outlined text-lg shrink-0',
              entry.severity === 'high' ? 'text-error' : 'text-amber-400'
            )}
          >
            {entry.severity === 'high' ? 'priority_high' : 'warning'}
          </span>
          <span className="text-body-sm font-semibold text-text-primary truncate">
            {entry.name}
          </span>
          <span
            className={cn(
              'px-1.5 py-0.5 rounded-md text-caption font-medium uppercase tracking-wide',
              entry.severity === 'high'
                ? 'bg-error/10 text-error'
                : 'bg-amber-500/10 text-amber-400'
            )}
          >
            {entry.severity}
          </span>
        </div>
        <span className="text-caption text-text-muted font-mono shrink-0">
          ~{formatUsd(entry.senior_cost_usd)} senior cost
        </span>
      </div>
      <ul className="flex flex-col gap-1">
        {entry.signals.map((s, i) => (
          <li key={i} className="flex items-start gap-1.5 text-caption text-text-secondary">
            <span className="material-symbols-outlined text-sm text-text-muted shrink-0 mt-px">chevron_right</span>
            <span>
              <span className="text-text-primary font-medium">{s.label}</span>
              <span className="text-text-muted"> — {s.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const GRADE_CHIP: Record<string, { label: string; cls: string }> = {
  healthy: { label: 'Healthy', cls: 'bg-success/10 text-success' },
  at_risk: { label: 'At risk', cls: 'bg-amber-500/10 text-amber-400' },
  critical: { label: 'Critical', cls: 'bg-error/10 text-error' },
  no_data: { label: 'No data', cls: 'bg-bg-tertiary text-text-muted' },
}

function HealthCard({ health }: { health: RampHealth | undefined }) {
  if (!health) return null
  const chip = GRADE_CHIP[health.grade] ?? GRADE_CHIP.no_data
  const comps = Object.entries(health.components ?? {})
  const tone = (score: number) =>
    score >= 80 ? 'bg-success' : score >= 50 ? 'bg-amber-400' : 'bg-error'
  return (
    <section className="rounded-tile bg-bg-primary border border-border p-4 shadow-card">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-lg text-accent-from">monitor_heart</span>
            <span className="overline text-text-muted/70">Org ramp health</span>
            <span className={`px-1.5 py-0.5 rounded-md text-caption font-medium ${chip.cls}`}>
              {chip.label}
            </span>
          </div>
          <div className="mt-2 text-4xl font-semibold text-text-primary tracking-tight font-display tabular-nums">
            {health.health_score ?? '—'}
            <span className="text-body-sm text-text-muted font-normal ml-2">/ 100</span>
          </div>
          <p className="text-caption text-text-muted mt-1">
            {health.trainee_count} trainee{health.trainee_count === 1 ? '' : 's'} · {health.stuck_count} stuck · {health.at_risk_count} at risk
          </p>
        </div>
        <div className="flex-1 min-w-[260px] w-full max-w-xl space-y-2.5">
          {comps.length === 0 && (
            <p className="text-caption text-text-muted py-4">
              No trainees yet — add new-dev members and the score will compute from ramp, review, and PR data.
            </p>
          )}
          {comps.map(([key, c]) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-caption font-medium text-text-secondary capitalize">
                  {key.replace(/_/g, ' ')}
                  <span className="text-text-muted/60 ml-1">· {Math.round(c.weight * 100)}%</span>
                </span>
                <span className="text-caption text-text-muted font-mono">{c.score}</span>
              </div>
              <div className="h-1.5 rounded-tile bg-bg-tertiary overflow-hidden border border-border">
                <div
                  className={`h-full ${tone(c.score)} transition-all`}
                  style={{ width: `${c.score}%` }}
                />
              </div>
              <p className="text-caption text-text-muted mt-0.5">{c.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function RampStatusBadge({ profile }: { profile: RampTraineeProfile }) {
  if (profile.stuck_severity === 'high') {
    return <span className="px-1.5 py-0.5 rounded-md bg-error/10 text-error text-caption font-medium">Stuck</span>
  }
  if (profile.stuck_severity === 'medium') {
    return <span className="px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-400 text-caption font-medium">At risk</span>
  }
  if (profile.ramp_days != null) {
    return <span className="px-1.5 py-0.5 rounded-md bg-success/10 text-success text-caption font-medium">Ramped</span>
  }
  return <span className="px-1.5 py-0.5 rounded-md bg-bg-tertiary text-text-muted text-caption font-medium">Onboarding</span>
}

export default function RampPage() {
  const queryClient = useQueryClient()
  const { role } = useAuth()
  const canRunCheck = isLeaderRole(role)
  const [checkResult, setCheckResult] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery<RampSummary>({
    queryKey: ['ramp-summary'],
    queryFn: () => fetchRampSummary(),
  })
  const { data: health } = useQuery<RampHealth>({
    queryKey: ['ramp-health'],
    queryFn: () => fetchRampHealth(),
  })

  const checkMutation = useMutation({
    mutationFn: () => runRampCheck(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['ramp-summary'] })
      setCheckResult(
        res.alerts_fired > 0
          ? `${res.alerts_fired} alert${res.alerts_fired === 1 ? '' : 's'} sent — leaders notified`
          : res.stuck_count > 0
            ? 'Alerts already sent in the last 24h — no duplicates fired'
            : 'No stuck devs found — team looks healthy'
      )
    },
    onError: (e: Error) => setCheckResult(`Check failed: ${e.message}`),
  })

  const stuck = data?.stuck?.stuck ?? []
  const ramped = data?.ramped_count ?? 0

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary font-display tracking-tight">
            Ramp Visibility
          </h1>
          <p className="text-body-sm text-text-muted mt-1 max-w-2xl">
            Track new-developer ramp-up, put a cost on the senior time it consumes, and
            intercept stuck devs before they burn more. The v1.4 wedge.
          </p>
        </div>
        {canRunCheck && (
          <button
            onClick={() => checkMutation.mutate()}
            disabled={checkMutation.isPending}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-btn text-body-sm font-medium transition-all',
              'bg-accent-from text-white shadow-lit hover:opacity-90 active:scale-[0.98]',
              checkMutation.isPending && 'opacity-60 pointer-events-none'
            )}
          >
            <span className="material-symbols-outlined text-base">
              {checkMutation.isPending ? 'progress_activity' : 'radar'}
            </span>
            {checkMutation.isPending ? 'Checking…' : 'Run stuck check'}
          </button>
        )}
      </div>

      {checkResult && (
        <div className="flex items-center gap-2 text-caption text-text-secondary bg-bg-tertiary/60 border border-border rounded-tile px-3.5 py-2.5">
          <span className="material-symbols-outlined text-base text-accent-from">info</span>
          {checkResult}
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[92px] rounded-tile bg-bg-tertiary/50 animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-tile border border-error/30 bg-error/[0.04] px-4 py-3 text-caption text-error">
          Failed to load ramp data — {error.message}
        </div>
      )}

      {data && !error && (
        <>
          {/* Health score with component breakdown */}
          <HealthCard health={health} />

          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon="flag"
              label="Team benchmark"
              value={formatDays(data.benchmark_days)}
              sub={`to first task · ${formatDays(data.first_pr_benchmark_days)} to first PR`}
            />
            <StatCard
              icon="groups"
              label="Trainees"
              value={`${ramped}/${data.trainee_count}`}
              sub="ramped / total tracked"
            />
            <StatCard
              icon="schedule"
              label="Senior time"
              value={`${Math.round(data.totals.senior_hours * 10) / 10}h`}
              sub="estimated senior hours consumed"
              tone="accent"
            />
            <StatCard
              icon="payments"
              label="Senior cost"
              value={formatUsd(data.totals.senior_cost_usd)}
              sub={`~${data.cost_model?.settings?.senior_hourly_rate_usd ?? 90}/hr fully-loaded estimate`}
              tone={stuck.length > 0 ? 'warn' : 'default'}
            />
          </div>

          {/* Phase 0 — cost-model assumptions under the hood */}
          <CostModelPanel />

          {/* Competitive benchmark — terminal coding agents vs Onramp */}
          <AgentBenchmarkPanel />

          {/* Efficiency story — tokens AND dollars: agents re-read, Onramp refreshes */}
          <EfficiencyBenchmarkPanel />

          {/* Stuck panel */}
          {stuck.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-lg text-error">person_search</span>
                <h2 className="text-body-sm font-semibold text-text-primary">
                  Stuck devs — intercept now
                </h2>
                <span className="px-1.5 py-0.5 rounded-md bg-error/10 text-error text-caption font-medium">
                  {stuck.length}
                </span>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                {stuck.map((entry) => (
                  <StuckCard key={entry.user_id} entry={entry} />
                ))}
              </div>
            </section>
          )}

          {/* Trainee table */}
          <section className="rounded-tile bg-bg-primary border border-border overflow-hidden shadow-card">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-body-sm font-semibold text-text-primary">Per-trainee ramp</h2>
              <span className="text-caption text-text-muted">sorted: not-yet-ramped first</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body-sm">
                <thead>
                  <tr className="text-caption text-text-muted/70 border-b border-border/60">
                    <th className="px-4 py-2.5 font-medium">Trainee</th>
                    <th className="px-3 py-2.5 font-medium">Ramp</th>
                    <th className="px-3 py-2.5 font-medium">First PR</th>
                    <th className="px-3 py-2.5 font-medium">Complete</th>
                    <th className="px-3 py-2.5 font-medium">Rework</th>
                    <th className="px-3 py-2.5 font-medium">Asked</th>
                    <th className="px-3 py-2.5 font-medium">Senior cost</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.profiles.map((p) => {
                    const delta = p.vs_benchmark_days
                    return (
                      <tr key={p.user_id} className="border-b border-border/40 last:border-0 hover:bg-bg-tertiary/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-text-primary">{p.name}</div>
                          <div className="text-caption text-text-muted">{p.role}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-text-primary font-medium">{formatDays(p.ramp_days)}</div>
                          {delta != null && (
                            <div
                              className={cn(
                                'text-caption font-mono',
                                delta <= 0 ? 'text-success' : 'text-error'
                              )}
                            >
                              {delta <= 0 ? '−' : '+'}
                              {Math.abs(Math.round(delta * 10) / 10)}d vs benchmark
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-text-primary font-medium">{formatDays(p.days_to_first_pr)}</div>
                          {p.first_pr_source && (
                            <div className="text-caption text-text-muted">
                              {p.first_pr_source === 'github' ? 'via GitHub' : 'via merged PR'}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-text-secondary">
                          {p.tasks_completed}/{p.tasks_total} · {p.completion_pct}%
                        </td>
                        <td className="px-3 py-3 text-text-secondary">
                          {p.review_cycles > 0 ? (
                            <span className="text-error">{p.review_cycles} cycle{p.review_cycles === 1 ? '' : 's'}</span>
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-text-secondary">{p.questions_asked}</td>
                        <td className="px-3 py-3">
                          <div className="text-text-primary font-medium">{formatUsd(p.senior_cost_usd)}</div>
                          <div className="text-caption text-text-muted">{p.senior_hours}h</div>
                        </td>
                        <td className="px-4 py-3">
                          <RampStatusBadge profile={p} />
                        </td>
                      </tr>
                    )
                  })}
                  {data.profiles.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-caption text-text-muted">
                        No trainees on this team yet — add new-dev members to start tracking ramps.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
