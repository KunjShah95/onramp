/*
 * ─── DIRECTION CONTRACT · ONRAMP MISSION CONTROL · FIRST PRINCIPLES ─────────
 * THESIS: Status at 5 meters, action at 1. One verdict, four readouts, one
 *   velocity chart, one review rail. No chart swarm. No decorative metric grid.
 *   Cut from 7 tabs → 3 tabs (overview / reviews / dora).
 * STORY: A flight director needs the verdict first ("GO / HOLD / STANDBY"),
 *   then four numbers that mean something, then the queue that needs action.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { cn } from '../lib/utils'
import { fetchCTODashboard, fetchHealthScore, fetchRepos } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import StatusBadge from '../components/ui/status-badge'
import ConsolePanel from '../components/ui/console-panel'
import { ScrollProgress } from '../components/ui/landing-motion'
import { StatusVerdict, ConsoleCard } from '../components/ui/first-principles'
import DoraMetricsPanel from '../components/dashboard/DoraMetricsPanel'
import ApiCostTracking from '../components/dashboard/ApiCostTracking'
import FirstRunDashboard from '../components/dashboard/FirstRunDashboard'
import RampPanel, { isLeaderRole } from '../components/dashboard/RampPanel'
import AutopilotPanel from '../components/dashboard/AutopilotPanel'
import { DashboardSkeleton } from '../components/ui/Skeleton'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  XAxis, YAxis, CartesianGrid, AreaChart, Area,
} from 'recharts'
import {
  WarningCircle,
  ArrowRight,
} from '@phosphor-icons/react'

const SIG = {
  go: '#17A34A',
  blue: '#2472C4',
  amber: '#D6870F',
  red: '#D24C3F',
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
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
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
    { name: 'Completed', value: completed_tasks, color: SIG.go },
    { name: 'In Progress', value: in_progress_tasks, color: SIG.blue },
    { name: 'Pending Review', value: pending_review_tasks, color: SIG.amber },
    { name: 'Blocked', value: blocked_tasks, color: SIG.red },
  ].filter(d => d.value > 0), [completed_tasks, in_progress_tasks, pending_review_tasks, blocked_tasks])

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
        <div className="max-w-md w-full rounded-card border border-abort/25 bg-panel shadow-seam overflow-hidden">
          <div className="console-rail !bg-abort/10">
            <span className="callsign text-abort">SIGNAL LOST</span>
            <span className="w-1.5 h-1.5 rounded-full bg-abort ml-auto animate-blink" />
          </div>
          <div className="p-6 text-center">
            <WarningCircle size={28} className="text-abort mx-auto mb-4" />
            <p className="text-abort text-body-sm font-code mb-1">{(error as Error)?.message || 'Failed to acquire dashboard telemetry.'}</p>
            <p className="text-ink-muted text-caption font-code mb-5">Confirm the backend is on station.</p>
            <button onClick={() => window.location.reload()} className="btn-glass">Reacquire</button>
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
    verdict === 'go' ? 'All Systems GO' :
    verdict === 'hold' ? 'Hold · Blocked' :
    'Standby · Heavy Queue'
  const verdictDetail =
    verdict === 'go' ? `${total_members} crew on station · ${pending_review_tasks} review${pending_review_tasks !== 1 ? 's' : ''} pending` :
    verdict === 'hold' ? `${blocked_tasks} task${blocked_tasks !== 1 ? 's' : ''} blocked · clear them to resume` :
    `${pending_review_tasks} reviews pending · review queue saturated`

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
    <motion.div variants={container} initial="hidden" animate="show" className="min-h-[calc(100vh-4rem)] p-4 sm:p-6 max-w-full overflow-x-hidden">
      <ScrollProgress />

      {/* ── Header ───────────────────────────────────────────────────── */}
      <motion.div variants={item} className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="designator opacity-50">FLIGHT · CTO CONSOLE</span>
          </div>
          <h1 className="text-display-md md:text-display-lg text-ink">Mission Control</h1>
          <p className="text-body-sm text-ink-secondary mt-1 font-code">
            {total_members} crew · {total_trainees} trainee{total_trainees !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-well rounded-btn border border-seam p-0.5 gap-0.5">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'relative px-3 py-1.5 text-caption font-display uppercase tracking-wide rounded-[2px] transition-colors',
                  activeTab === tab.key ? 'text-panel-raised' : 'text-ink-muted hover:text-ink'
                )}
                style={{ letterSpacing: '0.06em' }}
              >
                {activeTab === tab.key && (
                  <motion.div layoutId="activeTab" className="absolute inset-0 bg-ink rounded-[2px]" />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className={cn('font-code text-[11px]', activeTab === tab.key ? 'text-panel-raised opacity-80' : 'text-ink-muted/70')}>
                      {tab.count}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
          <button onClick={() => navigate('/reviews')} className="btn-glass hidden sm:inline-flex">
            Review Queue
            <ArrowRight size={14} weight="bold" className="ml-1.5" />
          </button>
        </div>
      </motion.div>

      {activeTab === 'overview' && (
        <>
          {/* ── Verdict ────────────────────────────────────────────────── */}
          <motion.div variants={item} className="mb-5">
            <StatusVerdict
              verdict={verdict}
              label={verdictLabel}
              detail={verdictDetail}
              action={
                <button onClick={() => navigate('/reviews')} className="btn-glass">
                  Open Queue
                  <ArrowRight size={14} weight="bold" className="ml-1.5" />
                </button>
              }
            />
          </motion.div>

          {/* ── Four Readouts ──────────────────────────────────────────── */}
          <motion.div variants={item} className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-5">
            <ConsoleCard rail="Active Engineers" designator="CREW">
              <div className="space-y-1">
                <div className="font-code tabular-nums text-3xl md:text-4xl font-semibold leading-none text-ink">{total_members}</div>
                <div className="overline text-ink-muted/60 mt-2">+ {total_trainees} trainee{total_trainees !== 1 ? 's' : ''}</div>
              </div>
            </ConsoleCard>

            <ConsoleCard rail="Open Reviews" designator="QUEUE" status={pending_review_tasks > 0 ? 'caution' : 'go'}>
              <div className="space-y-1">
                <div className={cn(
                  'font-code tabular-nums text-3xl md:text-4xl font-semibold leading-none',
                  pending_review_tasks > 0 ? 'text-caution' : 'text-go'
                )}>{pending_review_tasks}</div>
                <div className="overline text-ink-muted/60 mt-2">{in_progress_tasks} in flight</div>
              </div>
            </ConsoleCard>

            <ConsoleCard rail="Last Deploy" designator="SHIP">
              <div className="space-y-1">
                <div className="font-code tabular-nums text-2xl md:text-3xl font-semibold leading-none text-ink">{lastDeploy}</div>
                <div className="overline text-ink-muted/60 mt-2">{completion_rate}% completion</div>
              </div>
            </ConsoleCard>

            <ConsoleCard rail="Repo Health" designator="CODE" status={codeHealth !== null && codeHealth >= 70 ? 'go' : codeHealth !== null && codeHealth >= 50 ? 'caution' : 'idle'}>
              <div className="space-y-1">
                <div className="font-code tabular-nums text-3xl md:text-4xl font-semibold leading-none text-ink">
                  {codeHealth !== null ? `${codeHealth}%` : '—'}
                </div>
                <div className="overline text-ink-muted/60 mt-2">{total_tasks} tasks total</div>
              </div>
            </ConsoleCard>
          </motion.div>

          {/* ── Velocity + Distribution ────────────────────────────────── */}
          <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 mb-5">
            <ConsoleCard
              rail="Velocity"
              designator="TRAJ · 7-DAY"
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
                          <stop offset="5%" stopColor={SIG.go} stopOpacity={0.28} />
                          <stop offset="95%" stopColor={SIG.go} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="fpColorSubmitted" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={SIG.amber} stopOpacity={0.22} />
                          <stop offset="95%" stopColor={SIG.amber} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={SIG.grid} vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: SIG.axis, fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} dy={6} />
                      <YAxis tick={{ fill: SIG.axis, fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} dx={-6} />
                      <Tooltip contentStyle={TOOLTIP} cursor={{ stroke: SIG.grid, strokeDasharray: '2 2' }} />
                      <Area type="monotone" dataKey="completed" stroke={SIG.go} strokeWidth={2} fill="url(#fpColorCompleted)" />
                      <Area type="monotone" dataKey="submitted" stroke={SIG.amber} strokeWidth={2} fill="url(#fpColorSubmitted)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ConsoleCard>

            <ConsoleCard
              rail="Signal Matrix"
              designator="FIDO"
              className="lg:col-span-4"
            >
              {total_tasks === 0 ? (
                <div className="text-center py-6 text-ink-muted text-body-sm">No tasks on station.</div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="w-28 h-28 shrink-0 relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={taskDistribution} cx="50%" cy="50%" innerRadius={28} outerRadius={50} paddingAngle={2} dataKey="value" stroke="none">
                          {taskDistribution.map((d) => <Cell key={d.name} fill={d.color} />)}
                        </Pie>
                        <Tooltip contentStyle={TOOLTIP} formatter={(value) => [value]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2 min-w-0">
                    {taskDistribution.map((d) => (
                      <div key={d.name} className="flex items-center justify-between text-caption">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: d.color }} />
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
            <motion.div variants={item} className="mb-5">
              <RampPanel />
            </motion.div>
          )}

          {/* ── Autopilot · Repo Pipeline ──────────────────────────────── */}
          {showRamp && (
            <motion.div variants={item} className="mb-5">
              <AutopilotPanel />
            </motion.div>
          )}

          {/* ── Review Rail ────────────────────────────────────────────── */}
          <motion.div variants={item} className="mb-5">
            <Panel callsign="Review Queue" designator={pending_reviews.length ? `${pending_reviews.length} HOLDING` : 'CLEAR'}
              action={<button onClick={() => navigate('/reviews')} className="text-caption text-ink-muted/50 hover:text-ink-secondary transition-colors font-semibold flex items-center gap-1">Queue <ArrowRight size={12} weight="bold" /></button>}>
              {pending_reviews.length === 0 ? (
                <div className="text-center py-6 text-ink-muted text-body-sm">Review queue clear. Good velocity.</div>
              ) : (
                <div className="divide-y divide-seam -mx-5">
                  {pending_reviews.slice(0, 5).map((pr, i) => {
                    const priority = pr.state === 'needs_changes' ? SIG.red : pr.state === 'submitted' || pr.state === 'under_review' ? SIG.amber : SIG.blue
                    return (
                      <motion.div key={pr.task_id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                        onClick={() => navigate('/reviews')}
                        className="flex items-start gap-3 px-5 py-3 hover:bg-well/60 cursor-pointer transition-colors">
                        <div className="w-1 self-stretch rounded-sm shrink-0" style={{ backgroundColor: priority }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-body-sm text-ink font-medium truncate">{pr.title}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <StatusBadge state={pr.state} />
                            {pr.module && <Link to={`/module/${encodeURIComponent(pr.module)}`} onClick={(e) => e.stopPropagation()} className="text-caption text-mission hover:text-mission-lit font-code transition-colors">{pr.module}</Link>}
                            {pr.assigned_to && <span className="text-caption text-ink-muted">by {memberName(pr.assigned_to)}</span>}
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              )}
            </Panel>
          </motion.div>

          {/* ── API Cost ───────────────────────────────────────────────── */}
          <motion.div variants={item}>
            <Panel callsign="API Cost" designator="KEYS · BUDGET">
              <ApiCostTracking />
            </Panel>
          </motion.div>
        </>
      )}

      {/* ── Reviews tab ──────────────────────────────────────────────── */}
      {activeTab === 'reviews' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Panel callsign="Pending Reviews" designator={pending_reviews.length ? `${pending_reviews.length} HOLDING` : 'CLEAR'}
            action={<button onClick={() => navigate('/reviews')} className="text-caption text-ink-muted/50 hover:text-ink-secondary transition-colors font-semibold flex items-center gap-1">Queue <ArrowRight size={12} weight="bold" /></button>}>
            {pending_reviews.length === 0 ? (
              <div className="text-center py-8 text-ink-muted text-body-sm">Review queue clear. Good velocity.</div>
            ) : (
              <div className="space-y-2">
                {pending_reviews.map((pr, i) => (
                  <motion.div key={pr.task_id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                    onClick={() => navigate('/reviews')}
                    className="flex items-start gap-3 p-2.5 rounded-tile bg-well/60 border border-seam cursor-pointer hover:border-caution/40 transition-colors">
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
          <Panel callsign="DORA Metrics" designator="DEVOPS RESEARCH & ASSESSMENT">
            <DoraMetricsPanel />
          </Panel>
        </motion.div>
      )}
    </motion.div>
  )
}
