/*
 * ─── DIRECTION CONTRACT · ONRAMP WORKBENCH · FOLIO 01 ─────────────────────
 * THESIS: One verdict, four readouts, one trajectory, one review queue.
 *   The page opens like a section of a technical journal: folio index,
 *   statement title, then the verdict as a ruled strip — not a card.
 *   Readouts sit in a single metric strip split by hairlines, the queue
 *   renders as a real table. No chart swarm, no decorative metric grid.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { cn } from '../lib/utils'
import { fetchCTODashboard, fetchHealthScore, fetchRepos } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import StatusBadge from '../components/ui/status-badge'
import ConsolePanel from '../components/ui/console-panel'
import { ScrollProgress } from '../components/ui/landing-motion'
import { StatusVerdict, ConsoleCard } from '../components/ui/first-principles'
import { MetricStrip, MetricCell } from '../components/ui/metric-strip'
import { Table, THead, TBody, TR, TH, TD } from '../components/ui/table'
import DoraMetricsPanel from '../components/dashboard/DoraMetricsPanel'
import ApiCostTracking from '../components/dashboard/ApiCostTracking'
import FirstRunDashboard from '../components/dashboard/FirstRunDashboard'
import RampPanel, { isLeaderRole } from '../components/dashboard/RampPanel'
import AutopilotPanel from '../components/dashboard/AutopilotPanel'
import { DashboardSkeleton } from '../components/ui/Skeleton'
import { ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, AreaChart, Area } from 'recharts'
import { WarningCircle, ArrowRight } from '@phosphor-icons/react'

/** Resolve theme tokens to concrete rgb() strings for SVG chart attributes. */
function useSignals() {
  const { theme } = useTheme()
  return useMemo(() => {
    const root = document.documentElement
    const read = (name: string) => getComputedStyle(root).getPropertyValue(name).trim()
    const solid = (name: string) => {
      const v = read(name)
      return v ? `rgb(${v})` : '#888888'
    }
    const alpha = (name: string, a: number) => {
      const v = read(name)
      return v ? `rgb(${v} / ${a})` : '#888888'
    }
    return {
      go: solid('--go'),
      blue: solid('--mission'),
      amber: solid('--caution'),
      red: solid('--abort'),
      grid: alpha('--border-rgb', 0.10),
      axis: alpha('--text-tertiary', 0.75),
      goSoft: alpha('--go', 0.28),
      amberSoft: alpha('--caution', 0.22),
    }
  }, [theme])
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
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
}

function Panel({ callsign, designator, action, className, children }: {
  callsign: string; designator?: string; action?: ReactNode; className?: string; children: ReactNode
}) {
  return (
    <ConsolePanel rail={callsign} designator={designator} action={action} className={className}>
      {children}
    </ConsolePanel>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const sig = useSignals()
  const [activeTab, setActiveTab] = useState<'overview' | 'reviews' | 'dora'>('overview')
  const { role, activeTeamId } = useAuth()
  const showRamp = isLeaderRole(role)

  const { data: dashboard, isLoading, error } = useQuery({
    queryKey: ['ctoDashboard'],
    queryFn: fetchCTODashboard,
    staleTime: 30_000,
  })

  const { data: reposData } = useQuery({
    queryKey: ['repos'],
    queryFn: fetchRepos,
    staleTime: 60_000,
  })

  const { data: healthData } = useQuery({
    queryKey: ['healthScore', reposData?.repos?.[0]?.owner, reposData?.repos?.[0]?.name],
    queryFn: () => {
      const repo = reposData?.repos?.[0]
      if (!repo) return null
      return fetchHealthScore(repo.owner, repo.name, {})
    },
    enabled: !!reposData?.repos?.length,
    staleTime: 60_000,
  })

  const codeHealth = healthData?.overall_score ?? null

  const defaultDash = {
    total_tasks: 0, completed_tasks: 0, in_progress_tasks: 0, pending_review_tasks: 0,
    blocked_tasks: 0, completion_rate: 0, total_members: 0, total_trainees: 0,
    first_prs_merged: 0, member_progress: [] as any[], pending_reviews: [] as any[],
    recent_activity: [] as any[], actions: [] as any[],
  }
  const {
    total_tasks, completed_tasks, in_progress_tasks, pending_review_tasks, blocked_tasks,
    completion_rate, total_members, total_trainees, first_prs_merged,
    pending_reviews = [], recent_activity = [],
  } = dashboard ?? defaultDash

  // Map user UUID → display name for "by <name>" attribution in review rails.
  const memberNames = useMemo(() => {
    const map: Record<string, string> = {}
    for (const m of dashboard?.member_progress ?? []) {
      if (m.user_id && m.name) map[m.user_id] = m.name
    }
    return map
  }, [dashboard?.member_progress])
  const memberName = (uid: string | null | undefined) =>
    (uid && memberNames[uid]) || (uid ? uid.slice(0, 8) : '')

  const taskDistribution = useMemo(() => [
    { name: 'Completed', value: completed_tasks, color: sig.go },
    { name: 'In progress', value: in_progress_tasks, color: sig.blue },
    { name: 'Pending review', value: pending_review_tasks, color: sig.amber },
    { name: 'Blocked', value: blocked_tasks, color: sig.red },
  ].filter(d => d.value > 0), [completed_tasks, in_progress_tasks, pending_review_tasks, blocked_tasks, sig])

  const activityTrendData = useMemo(() => {
    const grouped: Record<string, { date: string; completed: number; submitted: number }> = {}
    for (const act of recent_activity) {
      const day = act.updated_at ? `${new Date(act.updated_at).getMonth()}-${new Date(act.updated_at).getDate()}` : 'Today'
      if (!grouped[day]) grouped[day] = { date: day, completed: 0, submitted: 0 }
      if (act.state === 'completed') grouped[day].completed++
      else if (act.state === 'submitted' || act.state === 'under_review') grouped[day].submitted++
    }
    return Object.values(grouped).reverse()
  }, [recent_activity])

  if (isLoading) {
    return <DashboardSkeleton />
  }

  if (error || !dashboard) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-card border border-abort/25 bg-panel shadow-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-abort/20 bg-abort/5 px-5 py-2.5">
            <span className="text-body-sm font-medium text-abort">Connection lost</span>
            <span className="w-1.5 h-1.5 rounded-full bg-abort" />
          </div>
          <div className="p-6 text-center">
            <WarningCircle size={28} className="text-abort mx-auto mb-4" />
            <p className="text-abort text-body-sm font-code mb-1">{(error as Error)?.message || 'Failed to load dashboard data.'}</p>
            <p className="text-ink-muted text-caption font-code mb-5">Check that the backend is running.</p>
            <button onClick={() => window.location.reload()} className="btn-glass">Reconnect</button>
          </div>
        </div>
      </div>
    )
  }

  // Brand-new user (no team membership) or a fresh team with zero data gets
  // the first-run experience instead of a zero-filled mission console.
  const isEmptyWorkspace =
    (total_members ?? 0) === 0 && (total_tasks ?? 0) === 0 && (reposData?.repos?.length ?? 0) === 0
  const showFirstRun = isEmptyWorkspace && (!activeTeamId || !role)
  if (showFirstRun) {
    return <FirstRunDashboard hasTeam={!!activeTeamId} />
  }

  // Verdict logic — HOLD if blocked, STANDBY if many pending reviews, GO otherwise
  const missionGo = blocked_tasks === 0
  const heavyReview = pending_review_tasks >= 10
  const verdict: 'go' | 'hold' | 'standby' = !missionGo ? 'hold' : heavyReview ? 'standby' : 'go'
  const verdictLabel =
    verdict === 'go' ? 'All systems go' :
    verdict === 'hold' ? 'Hold — blocked work' :
    'Standby — review queue'
  const verdictDetail =
    verdict === 'go' ? `${total_members} engineers on the bench · ${pending_review_tasks} review${pending_review_tasks !== 1 ? 's' : ''} pending` :
    verdict === 'hold' ? `${blocked_tasks} task${blocked_tasks !== 1 ? 's' : ''} blocked · clear them to resume` :
    `${pending_review_tasks} reviews pending · the queue needs attention`

  const tabs = [
    { key: 'overview' as const, label: 'Overview' },
    { key: 'reviews' as const, label: 'Reviews', count: pending_reviews.length },
    { key: 'dora' as const, label: 'DORA' },
  ]

  // Four readouts only — Active Engineers, Open Reviews, Last Deploy, Repo Health
  const lastDeploy = first_prs_merged > 0
    ? `${first_prs_merged} PR${first_prs_merged !== 1 ? 's' : ''} merged`
    : '—'

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="min-h-[calc(100vh-4rem)] max-w-full overflow-x-hidden">
      <ScrollProgress />

      {/* ── Header ───────────────────────────────────────────────────── */}
      <motion.div variants={item} className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <div className="index-kicker mb-2.5">Folio 01 · Mission Control</div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-display-lg md:text-display-xl text-ink tracking-tight">Mission Control</h1>
            <span className="rule-accent hidden md:inline-block self-center" aria-hidden />
          </div>
          <p className="text-body-sm text-ink-tertiary mt-2 font-code">
            {total_members} engineers · {total_trainees} trainee{total_trainees !== 1 ? 's' : ''} on the bench
          </p>
        </div>
      </motion.div>

      {/* ── Contents line: tabs + primary action ─────────────────────── */}
      <motion.div variants={item} className="flex items-center justify-between gap-4 border-b border-seam mb-6">
        <div className="flex gap-6 -mb-px overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'pb-2 text-[13px] font-medium -mb-px border-b-2 transition-colors whitespace-nowrap',
                activeTab === tab.key
                  ? 'border-go text-ink'
                  : 'border-transparent text-ink-muted hover:text-ink-secondary'
              )}
            >
              <span className="flex items-center gap-1.5">
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="font-code text-[10px] text-ink-muted tabular-nums">{tab.count}</span>
                )}
              </span>
            </button>
          ))}
        </div>
        <button onClick={() => navigate('/reviews')} className="btn-glass hidden sm:inline-flex shrink-0">
          Review queue
          <ArrowRight size={14} weight="bold" className="ml-1.5" />
        </button>
      </motion.div>

      {activeTab === 'overview' && (
        <>
          {/* ── Verdict ────────────────────────────────────────────────── */}
          <motion.div variants={item} className="mb-6">
            <StatusVerdict
              verdict={verdict}
              label={verdictLabel}
              detail={verdictDetail}
              action={
                <button onClick={() => navigate('/reviews')} className="btn-glass">
                  Open queue
                  <ArrowRight size={14} weight="bold" className="ml-1.5" />
                </button>
              }
            />
          </motion.div>

          {/* ── Four Readouts — one ruled strip, hairline-divided ─────── */}
          <motion.div variants={item} className="mb-6">
            <MetricStrip className="grid-cols-2 lg:grid-cols-4">
              <MetricCell label="Active engineers" value={total_members} sub={`+ ${total_trainees} trainee${total_trainees !== 1 ? 's' : ''}`} />
              <MetricCell
                label="Open reviews"
                value={pending_review_tasks}
                accent={pending_review_tasks > 0 ? 'text-caution' : 'text-go'}
                sub={`${in_progress_tasks} in flight`}
              />
              <MetricCell label="Last deploy" value={lastDeploy} sub={`${completion_rate}% completion`} />
              <MetricCell
                label="Repo health"
                value={codeHealth !== null ? `${codeHealth}%` : '—'}
                accent={codeHealth !== null && codeHealth < 50 ? 'text-abort' : undefined}
                sub={`${total_tasks} tasks total`}
              />
            </MetricStrip>
          </motion.div>

          {/* ── Velocity + Distribution ────────────────────────────────── */}
          <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 mb-6">
            <ConsoleCard
              rail="Velocity"
              designator="TRAJECTORY · 7 DAYS"
              className="lg:col-span-8"
            >
              {activityTrendData.length === 0 ? (
                <div className="text-center py-8 text-ink-muted text-body-sm">No trajectory yet.</div>
              ) : (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={activityTrendData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="fpColorCompleted" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={sig.go} stopOpacity={0.28} />
                          <stop offset="95%" stopColor={sig.go} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="fpColorSubmitted" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={sig.amber} stopOpacity={0.22} />
                          <stop offset="95%" stopColor={sig.amber} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={sig.grid} vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: sig.axis, fontSize: 10, fontFamily: 'IBM Plex Mono' }} axisLine={false} tickLine={false} dy={6} />
                      <YAxis tick={{ fill: sig.axis, fontSize: 10, fontFamily: 'IBM Plex Mono' }} axisLine={false} tickLine={false} dx={-6} />
                      <Tooltip contentStyle={TOOLTIP} cursor={{ stroke: sig.grid, strokeDasharray: '2 2' }} />
                      <Area type="monotone" dataKey="completed" stroke={sig.go} strokeWidth={1.5} fill="url(#fpColorCompleted)" />
                      <Area type="monotone" dataKey="submitted" stroke={sig.amber} strokeWidth={1.5} fill="url(#fpColorSubmitted)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ConsoleCard>

            <ConsoleCard
              rail="Signal matrix"
              designator="TASK MIX"
              className="lg:col-span-4"
            >
              {total_tasks === 0 ? (
                <div className="text-center py-6 text-ink-muted text-body-sm">No tasks on the bench.</div>
              ) : (
                <div>
                  <div className="flex h-2 rounded-[2px] overflow-hidden bg-well" aria-hidden>
                    {taskDistribution.map((d) => (
                      <div
                        key={d.name}
                        className="h-full"
                        style={{ width: `${(d.value / total_tasks) * 100}%`, backgroundColor: d.color }}
                      />
                    ))}
                  </div>
                  <div className="mt-4 space-y-2">
                    {taskDistribution.map((d) => (
                      <div key={d.name} className="flex items-center justify-between text-caption">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-[2px] shrink-0" style={{ backgroundColor: d.color }} />
                          <span className="text-ink-secondary truncate">{d.name}</span>
                        </div>
                        <span className="font-code tabular-nums text-ink">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </ConsoleCard>
          </motion.div>

          {/* ── Ramp · Senior-Time ─────────────────────────────────────── */}
          {showRamp && (
            <motion.div variants={item} className="mb-6">
              <RampPanel />
            </motion.div>
          )}

          {/* ── Autopilot · Repo Pipeline ──────────────────────────────── */}
          {showRamp && (
            <motion.div variants={item} className="mb-6">
              <AutopilotPanel />
            </motion.div>
          )}

          {/* ── Review Rail ────────────────────────────────────────────── */}
          <motion.div variants={item} className="mb-6">
            <Panel callsign="Review queue" designator={pending_reviews.length ? `${pending_reviews.length} pending` : 'clear'}
              action={<button onClick={() => navigate('/reviews')} className="text-caption text-ink-muted/60 hover:text-ink-secondary transition-colors font-semibold flex items-center gap-1">Queue <ArrowRight size={12} weight="bold" /></button>}>
              {pending_reviews.length === 0 ? (
                <div className="text-center py-6 text-ink-muted text-body-sm">Review queue clear. Good velocity.</div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Task</TH>
                      <TH>Status</TH>
                      <TH>Module</TH>
                      <TH className="hidden md:table-cell">By</TH>
                      <TH className="hidden sm:table-cell">Submitted</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {pending_reviews.slice(0, 5).map((pr) => (
                      <TR key={pr.task_id} hoverable onClick={() => navigate('/reviews')}>
                        <TD>
                          <span className="font-medium">{pr.title}</span>
                        </TD>
                        <TD><StatusBadge state={pr.state} /></TD>
                        <TD>
                          {pr.module ? (
                            <Link
                              to={`/module/${encodeURIComponent(pr.module)}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-code text-caption text-mission hover:text-mission-lit transition-colors"
                            >
                              {pr.module}
                            </Link>
                          ) : (
                            <span className="text-ink-muted">—</span>
                          )}
                        </TD>
                        <TD className="hidden md:table-cell text-ink-secondary">
                          {memberName(pr.assigned_to) || '—'}
                        </TD>
                        <TD className="hidden sm:table-cell">
                          <span className="font-code text-caption text-ink-muted tabular-nums">
                            {pr.created_at ? new Date(pr.created_at).toLocaleDateString() : '—'}
                          </span>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </Panel>
          </motion.div>

          {/* ── API Cost ───────────────────────────────────────────────── */}
          <motion.div variants={item}>
            <Panel callsign="API cost" designator="KEYS · BUDGET">
              <ApiCostTracking />
            </Panel>
          </motion.div>
        </>
      )}

      {/* ── Reviews tab ──────────────────────────────────────────────── */}
      {activeTab === 'reviews' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Panel callsign="Pending reviews" designator={pending_reviews.length ? `${pending_reviews.length} pending` : 'clear'}
            action={<button onClick={() => navigate('/reviews')} className="text-caption text-ink-muted/60 hover:text-ink-secondary transition-colors font-semibold flex items-center gap-1">Queue <ArrowRight size={12} weight="bold" /></button>}>
            {pending_reviews.length === 0 ? (
              <div className="text-center py-8 text-ink-muted text-body-sm">Review queue clear. Good velocity.</div>
            ) : (
              <div className="divide-y divide-seam">
                {pending_reviews.map((pr, i) => (
                  <motion.div key={pr.task_id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                    onClick={() => navigate('/reviews')}
                    className="flex items-start gap-3 py-3 hover:bg-well/50 cursor-pointer transition-colors rounded-sm px-1 -mx-1">
                    <div className="flex-1 min-w-0">
                      <div className="text-body-xs text-ink font-medium truncate">{pr.title}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <StatusBadge state={pr.state} />
                        {pr.module && <Link to={`/module/${encodeURIComponent(pr.module)}`} className="text-caption text-mission hover:text-mission-lit font-code transition-colors">{pr.module}</Link>}
                        {pr.assigned_to && <span className="text-caption text-ink-muted">by {memberName(pr.assigned_to)}</span>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {pr.pr_url && (
                        <a href={pr.pr_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-caption text-mission hover:text-mission-lit hover:underline">View PR →</a>
                      )}
                      <span className="text-caption text-ink-muted readout shrink-0">{new Date(pr.created_at).toLocaleDateString()}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </Panel>
        </motion.div>
      )}

      {/* ── DORA tab ─────────────────────────────────────────────────── */}
      {activeTab === 'dora' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Panel callsign="DORA metrics" designator="DEVOPS RESEARCH & ASSESSMENT">
            <DoraMetricsPanel />
          </Panel>
        </motion.div>
      )}
    </motion.div>
  )
}
