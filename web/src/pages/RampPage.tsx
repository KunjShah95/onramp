import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Compass, Info } from '@phosphor-icons/react'
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
import ConsolePanel from '../components/ui/console-panel'
import { PageHeader } from '../components/ui/page-header'
import StatusTile from '../components/ui/status-tile'
import { Table, THead, TBody, TR, TH, TD } from '../components/ui/table'

function formatDays(days: number | null | undefined): string {
  if (days == null) return '—'
  return `${Math.round(days * 10) / 10}d`
}

function formatUsd(v: number): string {
  return `$${Math.round(v).toLocaleString()}`
}

function StatCard({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string
  value: string
  sub?: string
  tone?: 'default' | 'accent' | 'warn'
}) {
  const toneColor =
    tone === 'accent' ? 'text-mission' : tone === 'warn' ? 'text-abort' : 'text-ink'
  return (
    <div className="rounded-card border border-seam bg-panel p-5">
      <div className="overline text-ink-muted">{label}</div>
      <div className={cn('mt-2 font-code tabular-nums text-2xl md:text-3xl font-semibold tracking-tight leading-none', toneColor)}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-caption text-ink-muted">{sub}</div>}
    </div>
  )
}

function StuckCard({ entry }: { entry: RampStuckEntry }) {
  return (
    <div
      className={cn(
        'rounded-card border p-3.5 flex flex-col gap-2',
        entry.severity === 'high'
          ? 'bg-abort/[0.03] border-abort/25'
          : 'bg-caution/[0.03] border-caution/25'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <StatusTile
            status={entry.severity === 'high' ? 'abort' : 'caution'}
            label={entry.severity === 'high' ? 'STUCK' : 'AT RISK'}
          />
          <span className="text-body-sm font-semibold text-ink truncate">
            {entry.name}
          </span>
        </div>
        <span className="text-caption text-ink-muted font-code tabular-nums shrink-0">
          ~{formatUsd(entry.senior_cost_usd)} senior cost
        </span>
      </div>
      <ul className="flex flex-col gap-1">
        {entry.signals.map((s, i) => (
          <li key={i} className="flex items-start gap-1.5 text-caption text-ink-secondary">
            <span className="text-ink-muted mt-px">›</span>
            <span>
              <span className="text-ink font-medium">{s.label}</span>
              <span className="text-ink-muted"> — {s.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const GRADE_STATUS: Record<string, 'go' | 'caution' | 'abort' | 'idle'> = {
  healthy: 'go',
  at_risk: 'caution',
  critical: 'abort',
  no_data: 'idle',
}
const GRADE_LABEL: Record<string, string> = {
  healthy: 'HEALTHY',
  at_risk: 'AT RISK',
  critical: 'CRITICAL',
  no_data: 'NO DATA',
}

function HealthCard({ health }: { health: RampHealth | undefined }) {
  if (!health) return null
  const status = GRADE_STATUS[health.grade] ?? 'idle'
  const label = GRADE_LABEL[health.grade] ?? 'NO DATA'
  const comps = Object.entries(health.components ?? {})
  const tone = (score: number) =>
    score >= 80 ? 'bg-go' : score >= 50 ? 'bg-caution' : 'bg-abort'
  return (
    <section className="rounded-card border border-seam bg-panel p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <StatusTile status={status} label={label} />
          </div>
          <div className="mt-3 text-4xl font-semibold text-ink tracking-tight font-code tabular-nums">
            {health.health_score ?? '—'}
            <span className="text-body-sm text-ink-muted font-normal ml-2">/ 100</span>
          </div>
          <p className="text-caption text-ink-muted mt-1">
            {health.trainee_count} trainee{health.trainee_count === 1 ? '' : 's'} · {health.stuck_count} stuck · {health.at_risk_count} at risk
          </p>
        </div>
        <div className="flex-1 min-w-[260px] w-full max-w-xl space-y-2.5">
          {comps.length === 0 && (
            <p className="text-caption text-ink-muted py-4">
              No trainees yet — add junior-dev members and the score will compute from ramp, review, and PR data.
            </p>
          )}
          {comps.map(([key, c]) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-caption font-medium text-ink-secondary capitalize">
                  {key.replace(/_/g, ' ')}
                  <span className="text-ink-muted/60 ml-1">· {Math.round(c.weight * 100)}%</span>
                </span>
                <span className="text-caption text-ink-muted font-code tabular-nums">{c.score}</span>
              </div>
              <div className="h-1.5 rounded-sm bg-well overflow-hidden border border-seam">
                <div
                  className={`h-full ${tone(c.score)} transition-all`}
                  style={{ width: `${c.score}%` }}
                />
              </div>
              <p className="text-caption text-ink-muted mt-0.5">{c.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function RampStatusBadge({ profile }: { profile: RampTraineeProfile }) {
  if (profile.stuck_severity === 'high') {
    return <StatusTile status="abort" label="STUCK" />
  }
  if (profile.stuck_severity === 'medium') {
    return <StatusTile status="caution" label="AT RISK" />
  }
  if (profile.ramp_days != null) {
    return <StatusTile status="go" label="RAMPED" />
  }
  return <StatusTile status="idle" label="ONBOARDING" />
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
      <PageHeader
        eyebrow="Ramp Visibility"
        title="Ramp Visibility"
        subtitle="Track new-developer ramp-up, put a cost on the senior time it consumes, and intercept stuck devs before they burn more."
        actions={canRunCheck && (
          <button
            onClick={() => checkMutation.mutate()}
            disabled={checkMutation.isPending}
            className="btn"
          >
            <Compass size={16} weight="bold" />
            {checkMutation.isPending ? 'Checking…' : 'Run stuck check'}
          </button>
        )}
      />

      {checkResult && (
        <div className="flex items-center gap-2 text-caption text-ink-secondary bg-well/70 border border-seam rounded-card px-3.5 py-2.5">
          <Info size={15} className="text-mission shrink-0" />
          {checkResult}
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[92px] rounded-card border border-seam bg-panel animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-card border border-abort/30 bg-abort/[0.04] px-4 py-3 text-caption text-abort">
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
              label="Team benchmark"
              value={formatDays(data.benchmark_days)}
              sub={`to first task · ${formatDays(data.first_pr_benchmark_days)} to first PR`}
            />
            <StatCard
              label="Trainees"
              value={`${ramped}/${data.trainee_count}`}
              sub="ramped / total tracked"
            />
            <StatCard
              label="Senior time"
              value={`${Math.round(data.totals.senior_hours * 10) / 10}h`}
              sub="estimated senior hours consumed"
              tone="accent"
            />
            <StatCard
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
            <ConsolePanel
              rail="Stuck Devs — Intercept Now"
              designator={`${stuck.length} INTERVENTION`}
              status="abort"
              pad="none"
            >
              <div className="grid md:grid-cols-2 gap-3 p-3.5">
                {stuck.map((entry) => (
                  <StuckCard key={entry.user_id} entry={entry} />
                ))}
              </div>
            </ConsolePanel>
          )}

          {/* Trainee table */}
          <ConsolePanel
            rail="Per-Trainee Ramp"
            action={<span className="text-caption text-ink-muted">sorted: not-yet-ramped first</span>}
            pad="none"
          >
            <Table>
              <THead>
                <TR>
                  <TH>Trainee</TH>
                  <TH>Ramp</TH>
                  <TH>First PR</TH>
                  <TH>Complete</TH>
                  <TH>Rework</TH>
                  <TH>Asked</TH>
                  <TH>Senior cost</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {data.profiles.map((p) => {
                  const delta = p.vs_benchmark_days
                  return (
                    <TR key={p.user_id} hoverable>
                      <TD>
                        <div className="font-medium text-ink">{p.name}</div>
                        <div className="text-caption text-ink-muted">{p.role}</div>
                      </TD>
                      <TD>
                        <div className="text-ink font-medium font-code tabular-nums">{formatDays(p.ramp_days)}</div>
                        {delta != null && (
                          <div className={cn('text-caption font-code tabular-nums', delta <= 0 ? 'text-go' : 'text-abort')}>
                            {delta <= 0 ? '−' : '+'}
                            {Math.abs(Math.round(delta * 10) / 10)}d vs benchmark
                          </div>
                        )}
                      </TD>
                      <TD>
                        <div className="text-ink font-medium font-code tabular-nums">{formatDays(p.days_to_first_pr)}</div>
                        {p.first_pr_source && (
                          <div className="text-caption text-ink-muted">
                            {p.first_pr_source === 'github' ? 'via GitHub' : 'via merged PR'}
                          </div>
                        )}
                      </TD>
                      <TD className="text-ink-secondary font-code tabular-nums">
                        {p.tasks_completed}/{p.tasks_total} · {p.completion_pct}%
                      </TD>
                      <TD className="text-ink-secondary font-code tabular-nums">
                        {p.review_cycles > 0 ? (
                          <span className="text-caution">{p.review_cycles} cycle{p.review_cycles === 1 ? '' : 's'}</span>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </TD>
                      <TD className="text-ink-secondary font-code tabular-nums">{p.questions_asked}</TD>
                      <TD>
                        <div className="text-ink font-medium font-code tabular-nums">{formatUsd(p.senior_cost_usd)}</div>
                        <div className="text-caption text-ink-muted font-code tabular-nums">{p.senior_hours}h</div>
                      </TD>
                      <TD>
                        <RampStatusBadge profile={p} />
                      </TD>
                    </TR>
                  )
                })}
                {data.profiles.length === 0 && (
                  <TR>
                    <TD colSpan={8} className="text-center text-ink-muted py-10">
                      No trainees on this team yet — add junior-dev members to start tracking ramps.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </ConsolePanel>
        </>
      )}
    </div>
  )
}
