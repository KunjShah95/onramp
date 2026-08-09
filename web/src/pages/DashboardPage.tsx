/*
 * ─── DIRECTION CONTRACT · ONRAMP MISSION CONTROL ────────────────────────────
 * THESIS: The CTO dashboard is a flight director's console, not a SaaS card grid.
 *   It refuses the hero-metric template (big number + label + accent, repeated).
 * OWN-WORLD: Daylit ops room — cool gray-green ground, near-white panels seamed
 *   by hairlines, ink nomenclature, signal-only color (GO green / mission blue /
 *   caution amber / abort red). Archivo Expanded call-signs, Public Sans body,
 *   JetBrains Mono telemetry. Radii <=4px. No glow, no dark, no serif.
 * STORY: A director scans mission status in seconds — is the team GO? — then
 *   drills into distribution, velocity, crew, and the review queue.
 * FIRST VIEWPORT: Mission-status rail (GO/HOLD tile + crew designators) over a
 *   butted readout bank of the seven core metrics; the primary "Review Queue"
 *   action sits top-right. Instrument banks, not floating cards.
 * FORM: Mission Control, grounded direction #6 of 7; seed key 3a081be2.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { cn } from '../lib/utils'
import { fetchCTODashboard, fetchHealthScore, fetchRepos } from '../lib/api'
import StatusBadge from '../components/ui/status-badge'
import ConsolePanel from '../components/ui/console-panel'
import { ScrollProgress } from '../components/ui/landing-motion'
import { type Readout } from '../components/ui/readout-bank'
import DoraMetricsPanel from '../components/dashboard/DoraMetricsPanel'
import { StatsGridSkeleton, SkeletonHeading, SkeletonText, SkeletonBase, SkeletonCard } from '../components/ui/Skeleton'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  XAxis, YAxis, CartesianGrid,
  AreaChart, Area, Line,
} from 'recharts'
import {
  WarningCircle,
  ArrowRight, ArrowUpRight,
} from '@phosphor-icons/react'

// Signal palette (recharts + tints) — see DESIGN.md
const SIG = {
  go: '#17A34A',
  blue: '#2472C4',
  amber: '#D6870F',
  red: '#D24C3F',
  ink: 'rgb(var(--text-primary))',
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
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 80, damping: 16 } },
}

/**
 * Console panel with a call-sign rail — thin wrapper over the shared kit.
 */
function Panel({ callsign, designator, action, className, children, status = 'go' as const }: {
  callsign: string; designator?: string; action?: ReactNode; className?: string; status?: 'go' | 'standby' | 'caution' | 'abort' | 'idle'; children: ReactNode
}) {
  return (
    <ConsolePanel rail={callsign} designator={designator} status={status} action={action} className={className}>
      {children}
    </ConsolePanel>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'overview' | 'trainees' | 'reviews' | 'activity' | 'dora'>('overview')

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
    member_progress = [], pending_reviews = [], recent_activity = [], actions = [],
  } = dashboard ?? defaultDash

  const taskDistribution = useMemo(() => [
    { name: 'Completed', value: completed_tasks, color: SIG.go },
    { name: 'In Progress', value: in_progress_tasks, color: SIG.blue },
    { name: 'Pending Review', value: pending_review_tasks, color: SIG.amber },
    { name: 'Blocked', value: blocked_tasks, color: SIG.red },
  ].filter(d => d.value > 0), [completed_tasks, in_progress_tasks, pending_review_tasks, blocked_tasks])

  const activityTrendData = useMemo(() => {
    const grouped: Record<string, { date: string; completed: number; submitted: number; started: number }> = {}
    for (const act of recent_activity) {
      const day = act.updated_at ? `${new Date(act.updated_at).getMonth()}-${new Date(act.updated_at).getDate()}` : 'Today'
      if (!grouped[day]) grouped[day] = { date: day, completed: 0, submitted: 0, started: 0 }
      if (act.state === 'completed') grouped[day].completed++
      else if (act.state === 'submitted' || act.state === 'under_review') grouped[day].submitted++
      else grouped[day].started++
    }
    const sorted = Object.values(grouped).reverse()
    return sorted.map((d, i) => {
      const prev = sorted.slice(Math.max(0, i - 2), i + 1)
      const velocity = prev.length > 0 ? Math.round((prev.reduce((s, p) => s + p.completed, 0) / prev.length) * 10) / 10 : 0
      return { ...d, velocity }
    })
  }, [recent_activity])

  if (isLoading) {
    return (
      <div className="animate-in w-full min-h-[calc(100vh-4rem)] p-4 sm:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <SkeletonHeading />
            <SkeletonText className="w-48" />
          </div>
          <SkeletonBase className="h-9 w-48 rounded-btn" />
        </div>
        <StatsGridSkeleton count={6} />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2"><SkeletonCard /></div>
          <div className="lg:col-span-3"><SkeletonCard /></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3"><SkeletonCard /></div>
          <div className="lg:col-span-2"><SkeletonCard /></div>
        </div>
      </div>
    )
  }

  if (error || !dashboard) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-card border border-error/25 bg-bg-secondary shadow-card overflow-hidden">
          <div className="console-rail !bg-error-muted">
            <span className="callsign text-error">SIGNAL LOST</span>
            <span className="w-1.5 h-1.5 rounded-full bg-error ml-auto animate-blink" />
          </div>
          <div className="p-6 text-center">
            <WarningCircle size={28} className="text-error mx-auto mb-4" />
            <p className="text-error text-body-sm font-code mb-1">{(error as Error)?.message || 'Failed to acquire dashboard telemetry.'}</p>
            <p className="text-text-muted text-caption font-code mb-5">Confirm the backend is on station.</p>
            <button onClick={() => window.location.reload()} className="btn-glass">Reacquire</button>
          </div>
        </div>
      </div>
    )
  }

  // Mission readiness derived from blocked/review load
  const missionGo = blocked_tasks === 0
  const tabs = [
    { key: 'overview' as const, label: 'Overview', count: null },
    { key: 'trainees' as const, label: 'Crew', count: member_progress.length },
    { key: 'reviews' as const, label: 'Reviews', count: pending_reviews.length },
    { key: 'activity' as const, label: 'Log', count: recent_activity.length },
    { key: 'dora' as const, label: 'DORA', count: null },
  ]

  const readouts: Readout[] = [
    { label: 'Tasks · Total', value: total_tasks, color: 'text-text-primary' },
    { label: 'Completed', value: completed_tasks, color: 'text-success' },
    { label: 'In Progress', value: in_progress_tasks, color: 'text-info' },
    { label: 'Pending Review', value: pending_review_tasks, color: 'text-warning' },
    { label: 'Blocked', value: blocked_tasks, color: 'text-error' },
    { label: 'Completion', value: completion_rate, suffix: '%', color: 'text-info' },
    { label: 'Code Health', value: codeHealth ?? '—', suffix: codeHealth !== null ? '%' : '', link: '/code-health',
      color: codeHealth !== null && codeHealth >= 70 ? 'text-success' : codeHealth !== null && codeHealth >= 50 ? 'text-warning' : 'text-text-primary' },
  ]

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="min-h-[calc(100vh-4rem)] p-4 sm:p-6 max-w-full overflow-x-hidden">
      <ScrollProgress />

      {/* ── Mission header ─────────────────────────────────────────────── */}
      <motion.div variants={item} className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className={cn('tile', missionGo ? 'tile-go' : 'tile-hold')}>
              {missionGo ? 'All Systems GO' : 'Hold · Blocked'}
            </span>
            <span className="designator opacity-50">FLIGHT · CTO CONSOLE</span>
          </div>
          <h1 className="text-display-md md:text-display-lg text-text-primary">Mission Control</h1>
          <p className="text-body-sm text-text-secondary mt-1 font-code">
            {total_members} crew · {total_trainees} trainee{total_trainees !== 1 ? 's' : ''} · {first_prs_merged} PRs merged
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-bg-secondary rounded-btn border border-border p-0.5 gap-0.5 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'relative px-3 py-1.5 text-caption font-display uppercase tracking-wide rounded-[2px] transition-colors',
                  activeTab === tab.key ? 'text-[hsl(var(--accent-foreground))]' : 'text-text-muted hover:text-text-primary'
                )}
                style={{ letterSpacing: '0.06em' }}
              >
                {activeTab === tab.key && (
                  <motion.div layoutId="activeTab" className="absolute inset-0 bg-accent-from rounded-[2px]" />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  {tab.label}
                  {tab.count !== null && tab.count > 0 && (
                    <span className={cn('font-code text-[11px]', activeTab === tab.key ? 'text-[hsl(var(--accent-foreground))] opacity-80' : 'text-text-muted/70')}>
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
          {/* ── Row 1: Hero + Telemetry ─────────────────────────────────── */}
          <motion.div variants={item} className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-5 mb-4 sm:mb-5">
            {/* Hero cell */}
            <div className="xl:col-span-5 bento-hero">
              <div className="bento-hero-border" />
              <div className="bento-rail mb-4">
                <span className={cn(
                  'w-2 h-2 rounded-full shrink-0',
                  missionGo ? 'bg-go-lit motion-safe:animate-pulse-glow' : 'bg-abort-lit motion-safe:animate-pulse-glow'
                )} />
                <span className="bento-rail-label">Mission Status</span>
                <span className="bento-rail-designator">FLIGHT · CTO CONSOLE</span>
              </div>
              <div className="space-y-3">
                <div className={cn(
                  'text-4xl sm:text-5xl font-display font-extrabold tracking-tight leading-none',
                  missionGo ? 'text-go' : 'text-abort'
                )}>
                  {missionGo ? 'GO' : 'HOLD'}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-seam bg-bg-secondary/80 p-3">
                    <div className="text-2xl font-code font-semibold text-text-primary">{total_members}</div>
                    <div className="text-[11px] font-display uppercase tracking-wider text-text-muted/70 mt-0.5">Crew</div>
                  </div>
                  <div className="rounded-lg border border-seam bg-bg-secondary/80 p-3">
                    <div className="text-2xl font-code font-semibold text-text-primary">{first_prs_merged}</div>
                    <div className="text-[11px] font-display uppercase tracking-wider text-text-muted/70 mt-0.5">PRs Merged</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Telemetry strip */}
            <div className="xl:col-span-7 bento-telemetry">
              <div className="bento-rail px-5 pt-4 pb-1">
                <span className="bento-rail-label">Telemetry Bank</span>
                <span className="bento-rail-designator">7 READOUTS</span>
              </div>
              <div className="bento-telemetry-track p-4">
                {readouts.map((r) => (
                  <Link key={r.label} to={r.link || '#'} className={cn('bento-telemetry-tick group/cell', !r.link && 'pointer-events-none')}>
                    <div className={cn('font-code tabular-nums text-2xl font-semibold leading-none tracking-tight', r.color ?? 'text-ink')}>
                      {r.link && <ArrowUpRight size={12} weight="bold" className="inline-block mr-1 text-ink-muted/40" />}
                      {typeof r.value === 'number' ? r.value.toLocaleString() : r.value}{r.suffix ?? ''}
                    </div>
                    <div className="text-[11px] font-display uppercase tracking-wider text-text-muted/60 mt-2">{r.label}</div>
                  </Link>
                ))}
              </div>
            </div>
          </motion.div>

          {/* ── Row 2: Distribution + Trend ─────────────────────────────── */}
          <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 mb-4 sm:mb-5">
            {/* Task distribution — matrix cell */}
            <div className="lg:col-span-4 bento-matrix">
              <div className="bento-rail px-5 pt-4 pb-1">
                <span className="bento-rail-label">Signal Matrix</span>
                <span className="bento-rail-designator">FIDO</span>
              </div>
              <div className="p-5">
                {total_tasks === 0 ? (
                  <div className="text-center py-6 text-text-muted text-body-sm">No tasks on station.</div>
                ) : (
                  <div className="flex items-center gap-5">
                    <div className="w-32 h-32 shrink-0 relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={taskDistribution} cx="50%" cy="50%" innerRadius={32} outerRadius={56} paddingAngle={2} dataKey="value" stroke="none">
                            {taskDistribution.map((d) => <Cell key={d.name} fill={d.color} />)}
                          </Pie>
                          <Tooltip contentStyle={TOOLTIP} formatter={(value) => [value]} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-2">
                      {taskDistribution.map((d) => (
                        <div key={d.name} className="flex items-center justify-between text-caption">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: d.color }} />
                            <span className="text-text-secondary">{d.name}</span>
                          </div>
                          <span className="font-code tabular-nums text-text-primary">{d.value}</span>
                        </div>
                      ))}
                      <div className="pt-2 mt-2 border-t border-border flex items-center justify-between text-caption">
                        <span className="text-text-muted">Total</span>
                        <span className="font-code tabular-nums text-text-primary font-semibold">{total_tasks}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Activity trend */}
            <div className="lg:col-span-8 bento-cell">
              <div className="bento-rail px-5 pt-4 pb-1">
                <span className="bento-rail-label">Velocity Trend</span>
                <span className="bento-rail-designator">TRAJ · 7-DAY</span>
              </div>
              <div className="p-5">
                {activityTrendData.length === 0 ? (
                  <div className="text-center py-8 text-text-muted text-body-sm">No trajectory yet.</div>
                ) : (
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={activityTrendData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={SIG.go} stopOpacity={0.28} />
                            <stop offset="95%" stopColor={SIG.go} stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorSubmitted" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={SIG.amber} stopOpacity={0.22} />
                            <stop offset="95%" stopColor={SIG.amber} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={SIG.grid} vertical={false} />
                        <XAxis dataKey="date" tick={{ fill: SIG.axis, fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} dy={6} />
                        <YAxis tick={{ fill: SIG.axis, fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} dx={-6} />
                        <Tooltip contentStyle={TOOLTIP} cursor={{ stroke: SIG.grid, strokeDasharray: '2 2' }} />
                        <Area type="monotone" dataKey="completed" stroke={SIG.go} strokeWidth={2} fill="url(#colorCompleted)" />
                        <Area type="monotone" dataKey="submitted" stroke={SIG.amber} strokeWidth={2} fill="url(#colorSubmitted)" />
                        <Line type="monotone" dataKey="velocity" stroke={SIG.blue} strokeWidth={2} dot={false} strokeDasharray="4 2" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* ── Row 3: Event Stream + Queue Radar + Actions ────────────── */}
          <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 mb-4 sm:mb-5">
            {/* Event stream */}
            <div className="lg:col-span-5 bento-stream">
              <div className="bento-rail px-5 pt-4 pb-1">
                <span className="bento-rail-label">Event Stream</span>
                <span className="bento-rail-designator">{recent_activity.length} EVENTS</span>
              </div>
              <div className="relative px-5 py-4">
                <div className="bento-stream-line" />
                {recent_activity.length === 0 ? (
                  <div className="text-center py-6 text-text-muted text-body-sm">No events logged.</div>
                ) : (
                  <div className="space-y-4">
                    {recent_activity.slice(0, 7).map((a, i) => (
                      <motion.div key={`${a.task_id}-${i}`} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                        className="relative flex gap-4 pl-10 hover:bg-bg-tertiary/40 rounded-lg p-2 -mx-2 transition-colors">
                        <div className={cn('absolute left-[11px] w-4 h-4 rounded-sm border-2 flex items-center justify-center bg-bg-secondary',
                          a.state === 'completed' ? 'border-success' :
                          a.state === 'in_progress' ? 'border-info' :
                          a.state === 'submitted' || a.state === 'under_review' ? 'border-warning' :
                          a.state === 'needs_changes' ? 'border-error' : 'border-border')}>
                          <div className={cn('w-1.5 h-1.5 rounded-[1px]',
                            a.state === 'completed' ? 'bg-success' :
                            a.state === 'in_progress' ? 'bg-info' :
                            a.state === 'submitted' || a.state === 'under_review' ? 'bg-warning' :
                            a.state === 'needs_changes' ? 'bg-error' : 'bg-text-disabled')} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-body-sm text-text-primary font-medium truncate">{a.title}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <StatusBadge state={a.state} />
                            {a.module && <span className="text-caption text-text-muted font-code">{a.module}</span>}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Queue radar */}
            <div className="lg:col-span-4 bento-queue">
              <div className="bento-rail px-5 pt-4 pb-1">
                <span className="bento-rail-label">Queue Radar</span>
                <span className="bento-rail-designator">{pending_reviews.length ? `${pending_reviews.length} HOLDING` : 'CLEAR'}</span>
              </div>
              <div className="px-5 py-3 space-y-2">
                {pending_reviews.length === 0 ? (
                  <div className="text-center py-6 text-text-muted text-body-sm">Review queue clear. Good velocity.</div>
                ) : (
                  pending_reviews.slice(0, 6).map((pr, i) => {
                    const priority = pr.state === 'needs_changes' ? 'bg-error' : pr.state === 'submitted' || pr.state === 'under_review' ? 'bg-warning' : 'bg-info'
                    return (
                      <motion.div key={pr.task_id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                        onClick={() => navigate('/reviews')}
                        className="bento-queue-item">
                        <div className={cn('bento-queue-item-priority', priority)} />
                        <div className="flex-1 min-w-0">
                          <div className="text-body-xs text-text-primary font-medium truncate">{pr.title}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <StatusBadge state={pr.state} />
                            {pr.module && <Link to={`/module/${encodeURIComponent(pr.module)}`} className="text-caption text-info hover:text-info-lit font-code transition-colors">{pr.module}</Link>}
                            {pr.assigned_to && <span className="text-caption text-text-muted">by {pr.assigned_to.slice(0, 8)}</span>}
                          </div>
                        </div>
                      </motion.div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Actions console */}
            <div className="lg:col-span-3 bento-actions">
              <div className="bento-rail px-5 pt-4 pb-1">
                <span className="bento-rail-label">Actions</span>
                <span className="bento-rail-designator">CAPCOM</span>
              </div>
              <div className="px-5 py-3 space-y-2">
                {actions.length === 0 ? (
                  <div className="text-center py-6 text-text-muted text-body-sm">All stations nominal.</div>
                ) : (
                  actions.slice(0, 5).map((action, i) => {
                    return (
                      <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                        className="bento-action-row" style={{ borderLeftColor: action.severity === 'warning' ? 'rgb(var(--error-lit))' : action.severity === 'info' ? 'rgb(var(--info-lit))' : 'rgb(var(--text-muted))' }}>
                        <div className="flex-1 min-w-0">
                          <div className="text-body-xs text-text-primary font-medium">{action.title}</div>
                          <div className="text-caption text-text-muted mt-0.5">{action.subtitle}</div>
                        </div>
                      </motion.div>
                    )
                  })
                )}
              </div>
            </div>
          </motion.div>

          {/* ── Row 4: DORA + Crew ──────────────────────────────────────── */}
          <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
            {/* DORA telemetry */}
            <div className="lg:col-span-7 bento-dora">
              <div className="bento-rail px-5 pt-4 pb-1">
                <span className="bento-rail-label">DORA Telemetry</span>
                <span className="bento-rail-designator">DEVOPS RESEARCH & ASSESSMENT</span>
              </div>
              <div className="p-5">
                <DoraMetricsPanel />
              </div>
            </div>

            {/* Crew grid */}
            <div className="lg:col-span-5 bento-crew">
              <div className="bento-rail px-5 pt-4 pb-1">
                <span className="bento-rail-label">Crew Grid</span>
                <span className="bento-rail-designator">{member_progress.length} ON STATION</span>
              </div>
              <div className="px-5 py-3">
                {member_progress.length === 0 ? (
                  <div className="text-center py-6 text-text-muted text-body-sm">No crew found.</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {member_progress.slice(0, 6).map((member, i) => (
                      <motion.div key={member.user_id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                        className="bento-crew-card">
                        <div className="w-8 h-8 rounded-lg bg-accent-muted border border-accent/25 flex items-center justify-center text-caption font-bold text-accent-from font-display flex-shrink-0">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <Link to={`/member/${member.user_id}`} className="text-body-sm text-text-primary font-medium hover:text-accent-from transition-colors block truncate">{member.name}</Link>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-1 rounded-full bg-bg-tertiary overflow-hidden border border-border">
                              <motion.div initial={{ width: 0 }} animate={{ width: `${member.completion_rate}%` }} transition={{ duration: 0.5, delay: i * 0.03 }}
                                className={cn('h-full', member.completion_rate >= 80 ? 'bg-success' : member.completion_rate >= 50 ? 'bg-info' : 'bg-error')} />
                            </div>
                            <span className={cn('font-code text-[11px] tabular-nums', member.completion_rate >= 80 ? 'text-success' : member.completion_rate >= 50 ? 'text-info' : 'text-error')}>
                              {member.completion_rate}%
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}

      {/* ── Crew tab ───────────────────────────────────────────────────── */}
      {activeTab === 'trainees' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Panel callsign="Crew Roster" designator={`${member_progress.length} ON STATION`}>
            {member_progress.length === 0 ? (
              <div className="p-8 text-center text-text-muted text-body-sm">No crew found.</div>
            ) : (
              <div className="overflow-x-auto -m-5">
                <table className="border-collapse text-left w-full table-auto text-body-sm">
                  <thead>
                    <tr className="border-b border-border bg-panel sticky top-0 z-10 backdrop-blur-sm">
                      {['Crew', 'Total', 'Done', 'Active', 'Review', 'Rate', 'Modules'].map((h) => (
                        <th key={h} className="text-left px-5 py-3 overline text-text-muted/80 align-middle">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {member_progress.map((member, i) => (
                      <motion.tr key={member.user_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.025 }}
                        className="hover:bg-bg-tertiary/40 transition-colors">
                        <td className="px-5 py-3.5 align-middle">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-tile bg-accent-muted border border-accent/25 flex items-center justify-center text-caption font-bold text-accent-from font-display">
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <Link to={`/member/${member.user_id}`} className="text-body-sm text-text-primary font-medium hover:text-accent-from transition-colors">{member.name}</Link>
                              <span className="ml-2 text-caption text-text-muted bg-bg-tertiary px-1.5 py-0.5 rounded-tile font-code uppercase">{member.role}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 readout text-text-primary align-middle">{member.total}</td>
                        <td className="px-5 py-3.5 readout text-success align-middle">{member.completed}</td>
                        <td className="px-5 py-3.5 readout text-info align-middle">{member.in_progress}</td>
                        <td className="px-5 py-3.5 readout text-warning align-middle">{member.pending_review}</td>
                        <td className="px-5 py-3.5 align-middle">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 rounded-tile bg-bg-tertiary overflow-hidden border border-border">
                              <motion.div initial={{ width: 0 }} animate={{ width: `${member.completion_rate}%` }} transition={{ duration: 0.6, delay: i * 0.03 }}
                                className={cn('h-full', member.completion_rate >= 80 ? 'bg-success' : member.completion_rate >= 50 ? 'bg-info' : 'bg-error')} />
                            </div>
                            <span className={cn('readout text-caption', member.completion_rate >= 80 ? 'text-success' : member.completion_rate >= 50 ? 'text-info' : 'text-error')}>
                              {member.completion_rate}%
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 readout text-text-primary align-middle">{member.modules_completed ?? 0}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </motion.div>
      )}

      {/* ── Reviews tab ────────────────────────────────────────────────── */}
      {activeTab === 'reviews' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Panel callsign="Pending Reviews" designator={pending_reviews.length ? `${pending_reviews.length} HOLDING` : 'CLEAR'}
            action={<button onClick={() => navigate('/reviews')} className="text-caption text-text-muted/50 hover:text-text-secondary transition-colors font-semibold flex items-center gap-1">Queue <ArrowRight size={12} weight="bold" /></button>}>
            {pending_reviews.length === 0 ? (
              <div className="text-center py-8 text-text-muted text-body-sm">Review queue clear. Good velocity.</div>
            ) : (
              <div className="space-y-2">
                {pending_reviews.map((pr, i) => (
                  <motion.div key={pr.task_id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                    onClick={() => navigate('/reviews')}
                    className="flex items-start gap-3 p-2.5 rounded-tile bg-bg-tertiary/60 border border-border cursor-pointer hover:border-warning/40 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="text-body-xs text-text-primary font-medium truncate">{pr.title}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <StatusBadge state={pr.state} />
                        {pr.module && <Link to={`/module/${encodeURIComponent(pr.module)}`} className="text-caption text-info hover:text-info-lit font-code transition-colors">{pr.module}</Link>}
                        {pr.assigned_to && <span className="text-caption text-text-muted">by {pr.assigned_to.slice(0, 8)}</span>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {pr.pr_url && (
                        <a href={pr.pr_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-caption text-info hover:text-info-lit hover:underline">View PR →</a>
                      )}
                      <span className="text-caption text-text-muted readout shrink-0">{new Date(pr.created_at).toLocaleDateString()}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </Panel>
        </motion.div>
      )}

      {/* ── DORA tab ──────────────────────────────────────────────────── */}
      {activeTab === 'dora' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Panel callsign="DORA Metrics" designator="DEVOPS RESEARCH & ASSESSMENT">
            <DoraMetricsPanel />
          </Panel>
        </motion.div>
      )}

      {/* ── Log tab ───────────────────────────────────────────────────── */}
      {activeTab === 'activity' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Panel callsign="Event Log" designator={`${recent_activity.length} EVENTS`}>
            <div className="relative -m-5">
              <div className="absolute left-9 top-0 bottom-0 w-px bg-border" />
              <div className="divide-y divide-border">
                {recent_activity.length === 0 ? (
                  <div className="p-8 text-center text-text-muted text-body-sm">No events logged.</div>
                ) : (
                  recent_activity.map((a, i) => (
                    <motion.div key={`${a.task_id}-${i}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.025 }}
                      className="relative flex gap-4 pl-14 pr-5 py-3.5 hover:bg-bg-tertiary/40 transition-colors">
                      <div className={cn('absolute left-7 w-4 h-4 rounded-tile border-2 flex items-center justify-center bg-bg-secondary',
                        a.state === 'completed' ? 'border-success' :
                        a.state === 'in_progress' ? 'border-info' :
                        a.state === 'submitted' || a.state === 'under_review' ? 'border-warning' :
                        a.state === 'needs_changes' ? 'border-error' : 'border-border')}>
                        <div className={cn('w-1.5 h-1.5 rounded-[1px]',
                          a.state === 'completed' ? 'bg-success' :
                          a.state === 'in_progress' ? 'bg-info' :
                          a.state === 'submitted' || a.state === 'under_review' ? 'bg-warning' :
                          a.state === 'needs_changes' ? 'bg-error' : 'bg-text-disabled')} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-body-sm text-text-primary font-medium truncate">{a.title}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <StatusBadge state={a.state} />
                          {a.module && <span className="text-caption text-text-muted">Module: {a.module}</span>}
                          {a.assigned_to && <span className="text-caption text-text-muted">Crew: {a.assigned_to}</span>}
                        </div>
                      </div>
                      <span className="text-caption text-text-muted readout shrink-0">{new Date(a.updated_at).toLocaleDateString()}</span>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </Panel>
        </motion.div>
      )}
    </motion.div>
  )
}
