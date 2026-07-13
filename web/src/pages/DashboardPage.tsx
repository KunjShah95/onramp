import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { cn } from '../lib/utils'
import { fetchCTODashboard, fetchHealthScore, fetchRepos } from '../lib/api'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import StatusBadge from '../components/ui/status-badge'
import { StatsGridSkeleton, SkeletonHeading, SkeletonText, SkeletonBase, SkeletonCard } from '../components/ui/Skeleton'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area, Line,
} from 'recharts'
import {
  ListChecks, CheckCircle, Clock, Eye, WarningCircle, Speedometer,
  ChartPie, ChartLine, ChartBar as ChartBarIcon, Lock,
  ArrowRight, Pulse,
} from '@phosphor-icons/react'

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
}

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'overview' | 'trainees' | 'reviews' | 'activity'>('overview')

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

  if (isLoading) {
    return (
      <div className="animate-in w-full min-h-[calc(100vh-4rem)] p-4 sm:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <SkeletonHeading />
            <SkeletonText className="w-48" />
          </div>
          <SkeletonBase className="h-9 w-48 rounded-xl" />
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
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <CardSpotlight className="max-w-md mx-auto p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-error-muted border border-error/20 flex items-center justify-center mx-auto mb-5">
            <WarningCircle size={28} className="text-error" />
          </div>
          <p className="text-error/80 text-body-sm font-code mb-1">{(error as Error)?.message || 'Failed to load dashboard metrics.'}</p>
          <p className="text-text-disabled/60 text-caption font-code mb-5">Check that the backend is running.</p>
          <button onClick={() => window.location.reload()} className="bg-accent-from hover:brightness-110 text-[#09090B] px-5 py-2.5 rounded-btn text-body-sm font-semibold transition-all shadow-glow">
            Retry
          </button>
        </CardSpotlight>
      </div>
    )
  }

  const {
    total_tasks, completed_tasks, in_progress_tasks, pending_review_tasks, blocked_tasks,
    completion_rate, total_members, total_trainees, first_prs_merged,
    member_progress = [], pending_reviews = [], recent_activity = [], actions = [],
  } = dashboard

  // ── Derived chart data ────────────────────────────────────────

  const taskDistribution = useMemo(() => [
    { name: 'Completed', value: completed_tasks, color: '#10B981' },
    { name: 'In Progress', value: in_progress_tasks, color: '#F59E0B' },
    { name: 'Pending Review', value: pending_review_tasks, color: '#EAB308' },
    { name: 'Blocked', value: blocked_tasks, color: '#EF4444' },
  ].filter(d => d.value > 0), [completed_tasks, in_progress_tasks, pending_review_tasks, blocked_tasks])

  const memberBarData = useMemo(() =>
    member_progress.map(m => ({
      name: m.name.length > 10 ? m.name.slice(0, 10) + '…' : m.name,
      completed: m.completed,
      inProgress: m.in_progress,
      pending: m.pending_review,
      completionRate: m.completion_rate,
    })).reverse(),
    [member_progress]
  )

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

  const tabs = [
    { key: 'overview' as const, label: 'Overview', count: null },
    { key: 'trainees' as const, label: 'Trainees', count: member_progress.length },
    { key: 'reviews' as const, label: 'Reviews', count: pending_reviews.length },
    { key: 'activity' as const, label: 'Activity', count: recent_activity.length },
  ]

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="min-h-[calc(100vh-4rem)] p-4 sm:p-6 max-w-full overflow-x-hidden">
      {/* Header */}
      <motion.div variants={item} className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <GradientHeading as="h1">Dashboard</GradientHeading>
          <p className="text-body-sm text-text-muted mt-1">
            {total_members} member{total_members !== 1 ? 's' : ''} · {total_trainees} trainee{total_trainees !== 1 ? 's' : ''} · {first_prs_merged} PRs merged
          </p>
        </div>
        <div className="flex bg-bg-secondary rounded-btn border border-border p-0.5 gap-0.5 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'relative px-4 py-2 text-caption font-medium rounded-btn transition-all',
                activeTab === tab.key
                  ? 'text-accent-from'
                  : 'text-text-muted/60 hover:text-text-primary'
              )}
            >
              {activeTab === tab.key && (
                <motion.div layoutId="activeTab" className="absolute inset-0 bg-accent-muted rounded-btn border border-accent/20" />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                {tab.label}
                {tab.count !== null && tab.count > 0 && (
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full',
                    activeTab === tab.key ? 'bg-accent-muted text-accent-from' : 'bg-bg-tertiary text-text-muted/50'
                  )}>
                    {tab.count}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      </motion.div>

      {activeTab === 'overview' && (
        <>
          {/* Metric Cards */}
          <motion.div variants={item} className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-8">
            {[
              { label: 'Total Tasks', value: total_tasks, color: 'text-text-primary', icon: ListChecks },
              { label: 'Completed', value: completed_tasks, color: 'text-success', icon: CheckCircle },
              { label: 'In Progress', value: in_progress_tasks, color: 'text-accent-from', icon: Clock },
              { label: 'Pending Review', value: pending_review_tasks, color: 'text-warning', icon: Eye },
              { label: 'Blocked', value: blocked_tasks, color: 'text-error', icon: WarningCircle },
              { label: 'Completion', value: completion_rate, color: 'text-info', icon: Speedometer },
              { label: 'Code Health', value: codeHealth !== null ? `${codeHealth}%` : '—', color: codeHealth !== null && codeHealth >= 70 ? 'text-success' : codeHealth !== null && codeHealth >= 50 ? 'text-accent-from' : 'text-text-primary', icon: Pulse },
            ].map((m) => {
              const isCodeHealth = m.label === 'Code Health'
              const isGauge = m.label === 'Completion'
              const Icon = m.icon

              const card = isGauge ? (
                <CardSpotlight className="p-4 flex flex-col items-center justify-center">
                  <div className="relative w-16 h-16 mb-1">
                    <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                      <circle cx="18" cy="18" r="15.5" fill="none" stroke="#3B82F6" strokeWidth="3"
                        strokeDasharray={`${(m.value as number) * 0.97} 97`}
                        strokeLinecap="round"
                        className="transition-all duration-1000 ease-out"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center font-display text-lg font-bold text-info">
                      {m.value}%
                    </span>
                  </div>
                  <div className="text-overline text-text-muted/50">{m.label}</div>
                </CardSpotlight>
              ) : (
                <CardSpotlight className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <Icon size={16} className="text-text-muted/30" />
                  </div>
                  <div className={cn('font-display text-display-sm font-bold tracking-tight', m.color)}>{m.value}</div>
                  <div className="text-overline text-text-muted/50 mt-1">{m.label}</div>
                </CardSpotlight>
              )
              return isCodeHealth
                ? <Link key={m.label} to="/code-health" className="block cursor-pointer hover:opacity-80 transition-opacity">{card}</Link>
                : <div key={m.label}>{card}</div>
            })}
          </motion.div>

          {/* Charts Row 1 */}
          <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-8">
            {/* Task Distribution */}
            <CardSpotlight className="lg:col-span-2 p-5">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-info-muted border border-info/20 flex items-center justify-center">
                  <ChartPie size={16} className="text-info" />
                </div>
                <h2 className="font-display text-body-sm font-bold">Task Distribution</h2>
              </div>
              {total_tasks === 0 ? (
                <div className="text-center py-8 text-text-disabled/60 text-body-sm italic">No tasks yet.</div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="w-36 h-36 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={taskDistribution}
                          cx="50%" cy="50%"
                          innerRadius={38}
                          outerRadius={62}
                          paddingAngle={3}
                          dataKey="value"
                          stroke="none"
                        >
                          {taskDistribution.map((d) => (
                            <Cell key={d.name} fill={d.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: '#1D1D26',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: '8px',
                            fontSize: '12px',
                            color: '#F1F1F3',
                          }}
                          formatter={(value) => [value]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2">
                    {taskDistribution.map((d) => (
                      <div key={d.name} className="flex items-center justify-between text-caption">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                          <span className="text-text-muted">{d.name}</span>
                        </div>
                        <span className="text-text-primary font-code tabular-nums">{d.value}</span>
                      </div>
                    ))}
                    <div className="pt-2 mt-2 border-t border-border flex items-center justify-between text-caption">
                      <span className="text-text-muted/50">Total</span>
                      <span className="text-text-primary font-code font-bold tabular-nums">{total_tasks}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardSpotlight>

            {/* Activity Trend */}
            <CardSpotlight className="lg:col-span-3 p-5">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-success-muted border border-success/20 flex items-center justify-center">
                  <ChartLine size={16} className="text-success" />
                </div>
                <h2 className="font-display text-body-sm font-bold">Activity Trend</h2>
              </div>
              {activityTrendData.length === 0 ? (
                <div className="text-center py-8 text-text-disabled/60 text-body-sm italic">No activity yet.</div>
              ) : (
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={activityTrendData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorSubmitted" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#EAB308" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#EAB308" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="date" tick={{ fill: 'rgba(144,144,158,0.4)', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'rgba(144,144,158,0.4)', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          background: '#1D1D26',
                          border: '1px solid rgba(255,255,255,0.06)',
                          borderRadius: '8px',
                          fontSize: '12px',
                          color: '#F1F1F3',
                        }}
                      />
                      <Area type="monotone" dataKey="completed" stroke="#10B981" fill="url(#colorCompleted)" strokeWidth={2} dot={false} />
                      <Area type="monotone" dataKey="submitted" stroke="#EAB308" fill="url(#colorSubmitted)" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="velocity" stroke="#3B82F6" strokeWidth={2} dot={false} strokeDasharray="4 3" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardSpotlight>
          </motion.div>

          {/* Charts Row 2 */}
          <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-8">
            {/* Member Completion */}
            <CardSpotlight className="lg:col-span-3 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-accent-muted border border-accent/20 flex items-center justify-center">
                    <ChartBarIcon size={16} className="text-accent-from" />
                  </div>
                  <h2 className="font-display text-body-sm font-bold">Member Completion Rates</h2>
                </div>
                <button onClick={() => setActiveTab('trainees')} className="text-caption text-accent-from/70 hover:text-accent-from transition-colors font-medium">
                  View all <ArrowRight size={12} className="inline" weight="bold" />
                </button>
              </div>
              {memberBarData.length === 0 ? (
                <div className="text-center py-8 text-text-disabled/60 text-body-sm italic">No members yet.</div>
              ) : (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={memberBarData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                      <XAxis type="number" tick={{ fill: 'rgba(144,144,158,0.4)', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, (dataMax: number) => Math.max(Math.ceil(dataMax * 1.2), 10)]} />
                      <YAxis type="category" dataKey="name" tick={{ fill: 'rgba(241,241,243,0.5)', fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
                      <Tooltip
                        contentStyle={{
                          background: '#1D1D26',
                          border: '1px solid rgba(255,255,255,0.06)',
                          borderRadius: '8px',
                          fontSize: '12px',
                          color: '#F1F1F3',
                        }}
                        formatter={(value, name) => {
                          const labels: Record<string, string> = { completed: 'Completed', inProgress: 'In Progress', pending: 'Pending Review', completionRate: 'Rate' }
                          return [`${value}`, labels[String(name)] || String(name)]
                        }}
                      />
                      <Bar dataKey="completed" stackId="a" fill="#10B981" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="inProgress" stackId="a" fill="#F59E0B" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="pending" stackId="a" fill="#EAB308" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardSpotlight>

            {/* Requires Attention */}
            <CardSpotlight className="lg:col-span-2 p-5">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-8 h-8 rounded-lg bg-warning-muted border border-warning/20 flex items-center justify-center">
                  <WarningCircle size={16} className="text-warning" />
                </div>
                <h2 className="font-display text-body-sm font-bold">Requires Attention</h2>
              </div>
              {actions.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-10 h-10 rounded-2xl bg-success-muted border border-success/20 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle size={20} className="text-success" weight="fill" />
                  </div>
                  <p className="text-text-disabled/60 text-body-sm italic">Everything is up to date</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {actions.slice(0, 6).map((action, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className={cn(
                        'flex items-start gap-3 p-3 rounded-card border text-body-sm transition-all',
                        action.severity === 'warning'
                          ? 'bg-error-muted/30 border-error/15 hover:bg-error-muted/50'
                          : action.severity === 'info'
                          ? 'bg-accent-muted/30 border-accent/15 hover:bg-accent-muted/50'
                          : 'bg-bg-tertiary/30 border-border hover:bg-bg-tertiary/50'
                      )}
                    >
                      <div className={cn(
                        'w-2 h-2 rounded-full mt-1.5 shrink-0',
                        action.severity === 'warning' ? 'bg-error' :
                        action.severity === 'info' ? 'bg-accent-from' :
                        'bg-text-muted/30'
                      )} />
                      <div className="flex-1 min-w-0">
                        <div className="text-body-xs text-text-primary font-medium">{action.title}</div>
                        <div className="text-caption text-text-muted/50 mt-0.5">{action.subtitle}</div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardSpotlight>
          </motion.div>

          {/* Bottom Row */}
          <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Recent Activity */}
            <CardSpotlight className="p-5">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-info-muted border border-info/20 flex items-center justify-center">
                    <Pulse size={16} className="text-info" />
                  </div>
                  <h2 className="font-display text-body-sm font-bold">Recent Activity</h2>
                </div>
                <button onClick={() => setActiveTab('activity')} className="text-caption text-accent-from/70 hover:text-accent-from transition-colors font-medium">
                  View all <ArrowRight size={12} className="inline" weight="bold" />
                </button>
              </div>
              {recent_activity.length === 0 ? (
                <div className="text-center py-6 text-text-disabled/60 text-body-sm italic">No activity yet.</div>
              ) : (
                <div className="space-y-1">
                  {recent_activity.slice(0, 6).map((a, i) => (
                    <motion.div
                      key={`${a.task_id}-${i}`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="flex items-start gap-3 text-body-sm p-2.5 rounded-card hover:bg-bg-tertiary/30 transition-colors"
                    >
                      <div className={cn(
                        'w-2 h-2 rounded-full mt-1.5 shrink-0',
                        a.state === 'completed' ? 'bg-success' :
                        a.state === 'in_progress' ? 'bg-accent-from' :
                        a.state === 'submitted' || a.state === 'under_review' ? 'bg-warning' :
                        a.state === 'needs_changes' ? 'bg-error' :
                        'bg-text-disabled/30'
                      )} />
                      <div className="flex-1 min-w-0">
                        <div className="text-body-xs text-text-primary truncate font-medium">{a.title}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <StatusBadge state={a.state} />
                          {a.module && <span className="text-caption text-text-muted/40 font-code">{a.module}</span>}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardSpotlight>

            {/* Pending Reviews */}
            <CardSpotlight className="p-5">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-warning-muted border border-warning/20 flex items-center justify-center">
                    <Eye size={16} className="text-warning" />
                  </div>
                  <h2 className="font-display text-body-sm font-bold">
                    Pending Reviews
                    {pending_reviews.length > 0 && (
                      <span className="ml-2 text-caption text-warning/60 font-code">({pending_reviews.length})</span>
                    )}
                  </h2>
                </div>
                <button onClick={() => navigate('/reviews')} className="text-caption text-accent-from/70 hover:text-accent-from transition-colors font-medium">
                  Review Queue <ArrowRight size={12} className="inline" weight="bold" />
                </button>
              </div>
              {pending_reviews.length === 0 ? (
                <div className="text-center py-6 text-text-disabled/60 text-body-sm italic">No pending reviews. Great velocity!</div>
              ) : (
                <div className="space-y-2">
                  {pending_reviews.slice(0, 5).map((pr, i) => (
                    <motion.div
                      key={pr.task_id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      onClick={() => navigate('/reviews')}
                      className="flex items-start gap-3 p-3 rounded-card bg-bg-tertiary/40 border border-border cursor-pointer hover:border-warning/30 transition-all"
                    >
                      <div className="w-2 h-2 rounded-full bg-warning mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-body-xs text-text-primary font-medium truncate">{pr.title}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <StatusBadge state={pr.state} />
                          {pr.module && <Link to={`/module/${encodeURIComponent(pr.module)}`} className="text-caption text-accent-from/70 hover:text-accent-from font-code transition-colors">{pr.module}</Link>}
                          {pr.assigned_to && <span className="text-caption text-text-muted/40">by {pr.assigned_to.slice(0, 8)}</span>}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardSpotlight>
          </motion.div>
        </>
      )}

      {/* ── Trainees Tab ── */}
      {activeTab === 'trainees' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <CardSpotlight className="p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="font-display text-body-sm font-bold">All Team Members</h2>
            </div>
            {member_progress.length === 0 ? (
              <div className="p-8 text-center text-text-disabled/60 text-body-sm italic">No team members found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-body-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {['Member', 'Total', 'Done', 'In Prog.', 'Review', 'Rate', 'Modules'].map((h) => (
                        <th key={h} className="text-left px-6 py-3.5 text-overline text-text-muted/50 font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {member_progress.map((member, i) => (
                      <motion.tr
                        key={member.user_id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.03 }}
                        className="hover:bg-bg-tertiary/20 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-gradient-accent/20 border border-accent/20 flex items-center justify-center text-caption font-bold text-accent-from">
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <Link to={`/member/${member.user_id}`} className="text-body-sm text-text-primary font-medium hover:text-accent-from transition-colors">{member.name}</Link>
                              <span className="ml-2 text-caption text-text-muted/40 bg-bg-tertiary px-1.5 py-0.5 rounded">{member.role}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-code tabular-nums text-text-primary">{member.total}</td>
                        <td className="px-6 py-4 font-code tabular-nums text-success">{member.completed}</td>
                        <td className="px-6 py-4 font-code tabular-nums text-accent-from">{member.in_progress}</td>
                        <td className="px-6 py-4 font-code tabular-nums text-warning">{member.pending_review}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${member.completion_rate}%` }}
                                transition={{ duration: 0.6, delay: i * 0.03 }}
                                className={cn(
                                  'h-full rounded-full',
                                  member.completion_rate >= 80 ? 'bg-success' :
                                  member.completion_rate >= 50 ? 'bg-accent-from' :
                                  'bg-error'
                                )}
                              />
                            </div>
                            <span className={cn(
                              'text-caption font-code tabular-nums',
                              member.completion_rate >= 80 ? 'text-success' :
                              member.completion_rate >= 50 ? 'text-accent-from' :
                              'text-error'
                            )}>
                              {member.completion_rate}%
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {member.modules_unlocked.length > 0 ? (
                              member.modules_unlocked.map((mod, mi) => (
                                <Link key={mi} to={`/module/${encodeURIComponent(mod)}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-success-muted text-success text-caption font-code border border-success/15 hover:bg-success-muted/70 transition-colors">
                                  <Lock size={10} weight="fill" />
                                  {mod}
                                </Link>
                              ))
                            ) : (
                              <span className="text-text-disabled/40 text-caption italic">—</span>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardSpotlight>
        </motion.div>
      )}

      {/* ── Reviews Tab ── */}
      {activeTab === 'reviews' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <CardSpotlight className="p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-display text-body-sm font-bold">
                Pending Reviews
                <span className="ml-2 text-caption text-text-muted/40 font-code">{pending_reviews.length} items</span>
              </h2>
              <button onClick={() => navigate('/tasks')} className="bg-accent-from hover:brightness-110 text-[#09090B] px-3 py-1.5 rounded-btn text-[11px] font-semibold transition-all shadow-glow">
                Go to Tasks
              </button>
            </div>
            {pending_reviews.length === 0 ? (
              <div className="p-8 text-center text-text-disabled/60 text-body-sm italic">No pending reviews.</div>
            ) : (
              <div className="divide-y divide-border">
                {pending_reviews.map((pr, i) => (
                  <motion.div
                    key={pr.task_id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => navigate('/tasks')}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-bg-tertiary/20 cursor-pointer transition-colors"
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-warning shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-body-sm text-text-primary font-medium truncate">{pr.title}</div>
                      <div className="flex items-center gap-3 mt-1">
                        <StatusBadge state={pr.state} />
                        {pr.module && <span className="text-caption text-text-muted/40 font-code">{pr.module}</span>}
                        {pr.assigned_to && <span className="text-caption text-text-muted/40">by {pr.assigned_to}</span>}
                        {pr.pr_url && (
                          <a href={pr.pr_url} target="_blank" rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-caption text-info hover:underline"
                          >View PR →</a>
                        )}
                      </div>
                    </div>
                    <span className="text-caption text-text-muted/40 font-code shrink-0">
                      {new Date(pr.created_at).toLocaleDateString()}
                    </span>
                  </motion.div>
                ))}
              </div>
            )}
          </CardSpotlight>
        </motion.div>
      )}

      {/* ── Activity Tab ── */}
      {activeTab === 'activity' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <CardSpotlight className="p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="font-display text-body-sm font-bold">
                Recent Activity
                <span className="ml-2 text-caption text-text-muted/40 font-code">{recent_activity.length} events</span>
              </h2>
            </div>
            <div className="relative">
              <div className="absolute left-9 top-0 bottom-0 w-px bg-border" />
              <div className="divide-y divide-border">
                {recent_activity.length === 0 ? (
                  <div className="p-8 text-center text-text-disabled/60 text-body-sm italic">No activity yet.</div>
                ) : (
                  recent_activity.map((a, i) => (
                    <motion.div
                      key={`${a.task_id}-${i}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="relative flex gap-4 pl-14 pr-6 py-4 hover:bg-bg-tertiary/20 transition-colors"
                    >
                      <div className={cn(
                        'absolute left-7 w-4 h-4 rounded-full border-2 flex items-center justify-center',
                        a.state === 'completed' ? 'border-success bg-success-muted' :
                        a.state === 'in_progress' ? 'border-accent-from bg-accent-muted' :
                        a.state === 'submitted' || a.state === 'under_review' ? 'border-warning bg-warning-muted' :
                        a.state === 'needs_changes' ? 'border-error bg-error-muted' :
                        'border-border bg-bg-tertiary'
                      )}>
                        <div className={cn(
                          'w-1.5 h-1.5 rounded-full',
                          a.state === 'completed' ? 'bg-success' :
                          a.state === 'in_progress' ? 'bg-accent-from' :
                          a.state === 'submitted' || a.state === 'under_review' ? 'bg-warning' :
                          a.state === 'needs_changes' ? 'bg-error' :
                          'bg-text-disabled/40'
                        )} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-body-sm text-text-primary font-medium truncate">{a.title}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <StatusBadge state={a.state} />
                          {a.module && <span className="text-caption text-text-muted/40">Module: {a.module}</span>}
                          {a.assigned_to && <span className="text-caption text-text-muted/40">Assignee: {a.assigned_to}</span>}
                        </div>
                      </div>
                      <span className="text-caption text-text-muted/40 font-code shrink-0">
                        {new Date(a.updated_at).toLocaleDateString()}
                      </span>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </CardSpotlight>
        </motion.div>
      )}
    </motion.div>
  )
}
