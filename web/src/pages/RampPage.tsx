/*
 * ─── DIRECTION CONTRACT · ONRAMP MISSION CONTROL ────────────────────────────
 * THESIS: Ramp visibility exists to intercept stuck developers. The page used
 *   to open with three benchmark panels — cost model, agent comparison, token
 *   efficiency — before showing a single person who was stuck. Now the
 *   intervention list is first, the health score explains it, and the three
 *   benchmarks plus the per-trainee table sit behind counted disclosures.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Compass, Info, Warning, Users } from '@phosphor-icons/react'
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
import { SkeletonBase } from '../components/ui/Skeleton'
import { PageHeader } from '../components/ui/page-header'
import { NextUp, FilterChips, ShowMore, Disclosure } from '../components/ui/progressive'

import { Table, THead, TBody, TR, TH, TD } from '../components/ui/table'

function formatDays(days: number | null | undefined): string {
  if (days == null) return 'N/A'
  return `${Math.round(days * 10) / 10}d`
}

function formatUsd(v: number): string {
  return `$${Math.round(v).toLocaleString()}`
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
          <span className={`font-code text-caption ${entry.severity === 'high' ? 'text-abort' : 'text-caution'}`}>
            {entry.severity === 'high' ? 'STUCK' : 'AT RISK'}
          </span>
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
              <span className="text-ink-muted"> · {s.detail}</span>
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
            <span className={`font-code text-caption ${
 status === 'go' ? 'text-go' :
 status === 'caution' ? 'text-caution' :
 status === 'abort' ? 'text-abort' :
 'text-ink-muted'
 }`}>
              {label}
            </span>
          </div>
          <div className="mt-3 text-4xl font-semibold text-ink tracking-tight font-code tabular-nums">
            {health.health_score ?? 'N/A'}
            <span className="text-body-sm text-ink-muted font-normal ml-2">/ 100</span>
          </div>
          <p className="text-caption text-ink-muted mt-1">
            {health.trainee_count} trainee{health.trainee_count === 1 ? '' : 's'} · {health.stuck_count} stuck · {health.at_risk_count} at risk
          </p>
        </div>
        <div className="flex-1 min-w-[260px] w-full max-w-xl space-y-2.5">
          {comps.length === 0 && (
            <p className="text-caption text-ink-muted py-4">
              No trainees yet. Add junior-dev members and the score will compute from ramp, review, and PR data.
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
    return <span className="font-code text-caption text-abort">STUCK</span>
  }
  if (profile.stuck_severity === 'medium') {
    return <span className="font-code text-caption text-caution">AT RISK</span>
  }
  if (profile.ramp_days != null) {
    return <span className="font-code text-caption text-go">RAMPED</span>
  }
  return <span className="font-code text-caption text-ink-muted">ONBOARDING</span>
}

export default function RampPage() {
  const queryClient = useQueryClient()
  const { role, activeTeamId } = useAuth()
  const canRunCheck = isLeaderRole(role)
  const [checkResult, setCheckResult] = useState<string | null>(null)
  const [band, setBand] = useState<'all' | 'stuck' | 'at_risk' | 'ramped'>('all')

  const { data, isLoading, error } = useQuery<RampSummary>({
    queryKey: ['ramp-summary', activeTeamId],
    queryFn: () => fetchRampSummary(activeTeamId ?? undefined),
    enabled: !!activeTeamId,
  })
  const { data: health } = useQuery<RampHealth>({
    queryKey: ['ramp-health', activeTeamId],
    queryFn: () => fetchRampHealth(activeTeamId ?? undefined),
    enabled: !!activeTeamId,
  })

  const checkMutation = useMutation({
    mutationFn: () => runRampCheck(activeTeamId ?? undefined),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['ramp-summary'] })
      setCheckResult(
        res.alerts_fired > 0
          ? `${res.alerts_fired} alert${res.alerts_fired === 1 ? '' : 's'} sent · leaders notified`
          : res.stuck_count > 0
            ? 'Alerts already sent in the last 24h · no duplicates fired'
            : 'No stuck devs found · team looks healthy'
      )
    },
    onError: (e: Error) => setCheckResult(`Check failed: ${e.message}`),
  })

  const stuck = data?.stuck?.stuck ?? []
  const ramped = data?.ramped_count ?? 0
  const profiles = data?.profiles ?? []

  // ── Reduce the roster before the table renders ────────────────────────
  const bandOf = (p: RampTraineeProfile): 'stuck' | 'at_risk' | 'ramped' =>
    p.stuck_severity === 'high' ? 'stuck'
      : p.stuck_severity === 'medium' ? 'at_risk'
        : p.ramp_days != null ? 'ramped' : 'at_risk'

  const bandCounts = useMemo(() => {
    const counts = { all: profiles.length, stuck: 0, at_risk: 0, ramped: 0 }
    for (const p of profiles) counts[bandOf(p)] += 1
    return counts
  }, [profiles])

  const visibleProfiles = useMemo(
    () => (band === 'all' ? profiles : profiles.filter((p) => bandOf(p) === band)),
    [profiles, band],
  )

  const stuckCost = stuck.reduce((s, e) => s + e.senior_cost_usd, 0)

  const verdict = stuck.length > 0
    ? {
        tone: 'abort' as const,
        headline: `${stuck.length} developer${stuck.length === 1 ? '' : 's'} stuck — intercept now`,
        detail: `~${formatUsd(stuckCost)} of senior time already spent on them. Every day of drift costs more.`,
      }
    : bandCounts.at_risk > 0
      ? {
          tone: 'caution' as const,
          headline: `${bandCounts.at_risk} developer${bandCounts.at_risk === 1 ? '' : 's'} at risk`,
          detail: 'Not stuck yet, but the signals are moving the wrong way. Worth a conversation.',
        }
      : {
          tone: 'go' as const,
          headline: 'Nobody is stuck on this team',
          detail: `${ramped}/${data?.trainee_count ?? 0} have ramped. Re-run the check after the next hiring cohort.`,
        }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" role="status" aria-label="Loading ramp data">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBase key={i} className="h-[92px] rounded-card border border-seam" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-card border border-abort/30 bg-abort/[0.04] px-4 py-3 text-caption text-abort">
          Failed to load ramp data · {error.message}
        </div>
      )}

      {data && !error && (
        <>
          {/* ── Intercept first. Everything below explains this verdict. ── */}
          <NextUp
            tone={verdict.tone}
            eyebrow="Intervention"
            headline={verdict.headline}
            detail={verdict.detail}
            primary={
              stuck.length > 0
                ? { id: 'first-stuck', label: 'Open the intervention list', detail: `${stuck.length} case${stuck.length === 1 ? '' : 's'} to work`, icon: Warning, tone: 'abort', onClick: () => document.getElementById('ramp-stuck')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
                : { id: 'roster', label: 'Open the per-trainee table', detail: `${bandCounts.at_risk} at risk`, icon: Users, tone: 'caution', onClick: () => document.getElementById('ramp-roster')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
            }
            secondary={[
              ...stuck.slice(0, 3).map((e) => ({
                id: e.user_id,
                label: e.name,
                detail: e.signals[0]?.detail ?? 'stuck',
                icon: Warning,
                tone: 'abort' as const,
                onClick: () => document.getElementById('ramp-stuck')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
              })),
              { id: 'economics', label: 'Senior-time economics', detail: 'What ramp-up actually costs', icon: Compass, tone: 'mission' as const },
            ]}
          />

          {/* ── The people, not the benchmarks ─────────────────────────── */}
          {stuck.length > 0 && (
            <div id="ramp-stuck">
              <ConsolePanel
                rail="Stuck Devs · Intercept Now"
                designator={`${stuck.length} INTERVENTION`}
                status="abort"
                pad="none"
              >
                <div className="grid md:grid-cols-2 gap-3 p-3.5">
                  {stuck.map((entry, i) => (
                    <div key={entry.user_id} className="reveal-row" style={{ animationDelay: `${i * 40}ms` }}>
                      <StuckCard entry={entry} />
                    </div>
                  ))}
                </div>
              </ConsolePanel>
            </div>
          )}

          {/* Health score with component breakdown */}
          <HealthCard health={health} />

          {/* Stat strip — one ruled band, not four floating cards */}
          <MetricStripGrid
            benchmark={formatDays(data.benchmark_days)}
            benchmarkSub={`to first task · ${formatDays(data.first_pr_benchmark_days)} to first PR`}
            trainees={`${ramped}/${data.trainee_count}`}
            traineesSub="ramped / total tracked"
            seniorTime={`${Math.round(data.totals.senior_hours * 10) / 10}h`}
            seniorTimeSub="estimated senior hours consumed"
            seniorCost={formatUsd(data.totals.senior_cost_usd)}
            seniorCostSub={`~${data.cost_model?.settings?.senior_hourly_rate_usd ?? 90}/hr fully-loaded estimate`}
            warn={stuck.length > 0}
          />

          {/* Trainee table — filtered by band, then capped on a big team */}
          <div id="ramp-roster" className="space-y-3">
            <FilterChips
              label="Show"
              value={band}
              onChange={(v) => setBand(v as typeof band)}
              options={[
                { value: 'all', label: 'All', count: bandCounts.all },
                { value: 'stuck', label: 'Stuck', count: bandCounts.stuck },
                { value: 'at_risk', label: 'At risk', count: bandCounts.at_risk },
                { value: 'ramped', label: 'Ramped', count: bandCounts.ramped },
              ]}
              summary={`${visibleProfiles.length} of ${profiles.length}`}
            />
            <ConsolePanel
              rail="Per-Trainee Ramp"
              action={<span className="text-caption text-ink-muted">sorted: not-yet-ramped first</span>}
              pad="none"
            >
              <ShowMore
                items={visibleProfiles}
                limit={8}
                noun="trainee"
                resetKey={band}
                /* One message per empty case. The band filter and "no trainees
                   at all" are different situations and get different copy —
                   previously both fired at once and the table said it twice. */
                emptyState={(
                  <p className="py-10 text-center text-body-sm text-ink-muted">
                    {profiles.length === 0
                      ? 'No trainees on this team yet. Add junior-dev members to start tracking ramps.'
                      : 'No trainees in this band — try "All".'}
                  </p>
                )}
              >
                {(rows) => (
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
                {rows.map((p) => {
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
                          <span className="text-ink-muted">N/A</span>
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
              </TBody>
            </Table>
                )}
              </ShowMore>
            </ConsolePanel>
          </div>

          {/* ── The economics, sealed. Three panels of benchmarking that a
              leader wants on a schedule, not on every visit. ─────────── */}
          <Disclosure
            label="Cost model & competitive benchmarks"
            designator="3 PANELS"
            tone="idle"
            hint="Senior hourly rate · agent comparison · token efficiency"
          >
            <div className="space-y-5">
              {/* Phase 0 — cost-model assumptions under the hood */}
              <CostModelPanel />

              {/* Competitive benchmark — terminal coding agents vs Onramp */}
              <AgentBenchmarkPanel />

              {/* Efficiency story — tokens AND dollars: agents re-read, Onramp refreshes */}
              <EfficiencyBenchmarkPanel />
            </div>
          </Disclosure>
        </>
      )}
    </div>
  )
}

/** The four ramp figures as one ruled band, not four floating cards. */
function MetricStripGrid(props: {
  benchmark: string
  benchmarkSub: string
  trainees: string
  traineesSub: string
  seniorTime: string
  seniorTimeSub: string
  seniorCost: string
  seniorCostSub: string
  warn: boolean
}) {
  const cells = [
    { label: 'Team benchmark', value: props.benchmark, sub: props.benchmarkSub, tone: 'text-ink' },
    { label: 'Trainees', value: props.trainees, sub: props.traineesSub, tone: 'text-ink' },
    { label: 'Senior time', value: props.seniorTime, sub: props.seniorTimeSub, tone: 'text-mission' },
    { label: 'Senior cost', value: props.seniorCost, sub: props.seniorCostSub, tone: props.warn ? 'text-abort' : 'text-ink' },
  ]
  return (
    <div className="metric-strip grid-cols-2 lg:grid-cols-4">
      {cells.map((c) => (
        <div key={c.label} className="metric-cell">
          <div className="overline text-ink-muted/80">{c.label}</div>
          <div className={cn('font-code tabular-nums text-2xl md:text-[28px] font-semibold leading-none mt-2', c.tone)}>
            {c.value}
          </div>
          <div className="text-caption text-ink-muted mt-1.5">{c.sub}</div>
        </div>
      ))}
    </div>
  )
}
