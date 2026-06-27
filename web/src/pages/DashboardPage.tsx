import { useState, useEffect, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { cn } from '../lib/utils'
import { fetchCTODashboard, fetchHealthScore, fetchRepos, type CTODashboardResponse } from '../lib/api'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import StatusBadge from '../components/ui/status-badge'
import { StatsGridSkeleton, SkeletonHeading, SkeletonText, SkeletonBase, SkeletonCard } from '../components/ui/Skeleton'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
} from 'recharts'

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
}

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [dashboard, setDashboard] = useState<CTODashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'trainees' | 'reviews' | 'activity'>('overview')
  const [codeHealth, setCodeHealth] = useState<number | null>(null)

  useEffect(() => {
    fetchCTODashboard()
      .then(setDashboard)
      .catch((err) => setError(err.message || 'Failed to load dashboard'))
      .finally(() => setLoading(false))

    // Fetch code health score
    fetchRepos().then(r => {
      if (r.repos?.length > 0) {
        fetchHealthScore(r.repos[0].owner, r.repos[0].name, {})
          .then(d => setCodeHealth(d.overall_score))
          .catch(() => {})
      }
    }).catch(() => {})
  }, [])

  if (loading) {
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
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-red-400/80 font-mono text-sm mb-1">{error || 'Failed to load dashboard metrics.'}</p>
          <p className="text-[#FDFBF8]/20 text-xs font-mono mb-5">Check that the backend is running.</p>
          <button onClick={() => window.location.reload()} className="bg-[#FFB347] hover:bg-[#FF8C00] text-[#3D1C00] px-5 py-2.5 rounded-xl text-sm font-bold transition-all hover:shadow-[0_0_30px_-8px_#FF8C00]">
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
    { name: 'Completed', value: completed_tasks, color: '#22c55e' },
    { name: 'In Progress', value: in_progress_tasks, color: '#FF8C00' },
    { name: 'Pending Review', value: pending_review_tasks, color: '#eab308' },
    { name: 'Blocked', value: blocked_tasks, color: '#ef4444' },
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
    return Object.values(grouped).reverse()
  }, [recent_activity])

  const tabs = [
    { key: 'overview' as const, label: 'Overview', count: null },
    { key: 'trainees' as const, label: 'Trainees', count: member_progress.length },
    { key: 'reviews' as const, label: 'Reviews', count: pending_reviews.length },
    { key: 'activity' as const, label: 'Activity', count: recent_activity.length },
  ]

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="min-h-[calc(100vh-4rem)] p-4 sm:p-6 max-w-full overflow-x-hidden">
      <motion.div variants={item} className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <GradientHeading as="h1">Senior Dashboard</GradientHeading>
          <p className="text-[#FDFBF8]/40 text-sm mt-1">
            {total_members} member{total_members !== 1 ? 's' : ''} · {total_trainees} trainee{total_trainees !== 1 ? 's' : ''} · {first_prs_merged} PRs merged
          </p>
        </div>
        <div className="flex bg-[#1A110D] rounded-xl border border-[#FDFBF8]/5 p-1 gap-0.5 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'relative px-4 py-2 text-xs font-medium rounded-lg transition-all',
                activeTab === tab.key
                  ? 'text-[#FF8C00]'
                  : 'text-[#FDFBF8]/40 hover:text-[#FDFBF8]/70'
              )}
            >
              {activeTab === tab.key && (
                <motion.div layoutId="activeTab" className="absolute inset-0 bg-[#FF8C00]/10 rounded-lg border border-[#FF8C00]/20" />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                {tab.label}
                {tab.count !== null && tab.count > 0 && (
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full',
                    activeTab === tab.key ? 'bg-[#FF8C00]/20 text-[#FF8C00]' : 'bg-[#FDFBF8]/5 text-[#FDFBF8]/30'
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
          <motion.div variants={item} className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-8">
            {[
              { label: 'Total Tasks', value: total_tasks, color: 'text-[#FDFBF8]', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
              { label: 'Completed', value: completed_tasks, color: 'text-green-400', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
              { label: 'In Progress', value: in_progress_tasks, color: 'text-[#FF8C00]', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
              { label: 'Pending Review', value: pending_review_tasks, color: 'text-yellow-400', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
              { label: 'Blocked', value: blocked_tasks, color: 'text-red-400', icon: 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z' },
              { label: 'Completion', value: `${completion_rate}%`, color: 'text-[#4DA8DA]', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
              { label: 'Code Health', value: codeHealth !== null ? `${codeHealth}%` : '—', color: codeHealth !== null && codeHealth >= 70 ? 'text-green-400' : codeHealth !== null && codeHealth >= 50 ? 'text-[#FF8C00]' : 'text-[#FDFBF8]', icon: 'M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15' },
            ].map((m) => {
              const isCodeHealth = m.label === 'Code Health'
              const card = (
                <CardSpotlight className="p-4" color="rgba(255,140,0,0.05)">
                  <div className="flex items-start justify-between mb-2">
                    <svg className="w-4 h-4 text-[#FDFBF8]/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={m.icon} />
                    </svg>
                  </div>
                  <div className={cn('font-display text-2xl font-bold tracking-tight', m.color)}>{m.value}</div>
                  <div className="text-[10px] text-[#FDFBF8]/35 uppercase tracking-wider mt-1">{m.label}</div>
                </CardSpotlight>
              )
              return isCodeHealth ? <Link key={m.label} to="/code-health" className="block cursor-pointer hover:opacity-80 transition-opacity">{card}</Link> : <div key={m.label}>{card}</div>
            })}
          </motion.div>

          <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">
            {/* ── Task Distribution (Donut Chart) ── */}
            <CardSpotlight className="lg:col-span-2 p-5" color="rgba(255,140,0,0.05)">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-[#4DA8DA]/10 border border-[#4DA8DA]/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-[#4DA8DA]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
                  </svg>
                </div>
                <h2 className="font-display text-sm font-bold text-[#FDFBF8]">Task Distribution</h2>
              </div>
              {total_tasks === 0 ? (
                <div className="text-center py-8 text-[#FDFBF8]/20 text-sm italic">No tasks yet.</div>
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
                            background: '#1A110D',
                            border: '1px solid rgba(253,251,248,0.1)',
                            borderRadius: '8px',
                            fontSize: '12px',
                            color: '#FDFBF8',
                          }}
                          formatter={(value) => [value]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2">
                    {taskDistribution.map((d) => (
                      <div key={d.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                          <span className="text-[#FDFBF8]/60">{d.name}</span>
                        </div>
                        <span className="text-[#FDFBF8] font-mono tabular-nums">{d.value}</span>
                      </div>
                    ))}
                    <div className="pt-2 mt-2 border-t border-[#FDFBF8]/5 flex items-center justify-between text-xs">
                      <span className="text-[#FDFBF8]/40">Total</span>
                      <span className="text-[#FDFBF8] font-mono font-bold tabular-nums">{total_tasks}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardSpotlight>

            {/* ── Activity Trend (Area Chart) ── */}
            <CardSpotlight className="lg:col-span-3 p-5" color="rgba(255,140,0,0.05)">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                </div>
                <h2 className="font-display text-sm font-bold text-[#FDFBF8]">Activity Trend</h2>
              </div>
              {activityTrendData.length === 0 ? (
                <div className="text-center py-8 text-[#FDFBF8]/20 text-sm italic">No activity yet.</div>
              ) : (
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={activityTrendData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorSubmitted" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#eab308" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(253,251,248,0.06)" />
                      <XAxis dataKey="date" tick={{ fill: 'rgba(253,251,248,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'rgba(253,251,248,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          background: '#1A110D',
                          border: '1px solid rgba(253,251,248,0.1)',
                          borderRadius: '8px',
                          fontSize: '12px',
                          color: '#FDFBF8',
                        }}
                      />
                      <Area type="monotone" dataKey="completed" stroke="#22c55e" fill="url(#colorCompleted)" strokeWidth={2} dot={false} />
                      <Area type="monotone" dataKey="submitted" stroke="#eab308" fill="url(#colorSubmitted)" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardSpotlight>
          </motion.div>

          <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">
            {/* ── Member Completion (Bar Chart) ── */}
            <CardSpotlight className="lg:col-span-3 p-5" color="rgba(255,140,0,0.05)">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#FF8C00]/10 border border-[#FF8C00]/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-[#FF8C00]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                    </svg>
                  </div>
                  <h2 className="font-display text-sm font-bold text-[#FDFBF8]">Member Completion Rates</h2>
                </div>
                <button onClick={() => setActiveTab('trainees')} className="text-[10px] text-[#FF8C00]/70 hover:text-[#FF8C00] transition-colors font-medium">
                  View all →
                </button>
              </div>
              {memberBarData.length === 0 ? (
                <div className="text-center py-8 text-[#FDFBF8]/20 text-sm italic">No members yet.</div>
              ) : (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={memberBarData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(253,251,248,0.06)" horizontal={false} />
                      <XAxis type="number" tick={{ fill: 'rgba(253,251,248,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, (dataMax: number) => Math.max(Math.ceil(dataMax * 1.2), 10)]} />
                      <YAxis type="category" dataKey="name" tick={{ fill: 'rgba(253,251,248,0.5)', fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
                      <Tooltip
                        contentStyle={{
                          background: '#1A110D',
                          border: '1px solid rgba(253,251,248,0.1)',
                          borderRadius: '8px',
                          fontSize: '12px',
                          color: '#FDFBF8',
                        }}
                        formatter={(value, name) => {
                          const labels: Record<string, string> = { completed: 'Completed', inProgress: 'In Progress', pending: 'Pending Review', completionRate: 'Rate' }
                          return [`${value}`, labels[String(name)] || String(name)]
                        }}
                      />
                      <Bar dataKey="completed" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="inProgress" stackId="a" fill="#FF8C00" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="pending" stackId="a" fill="#eab308" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardSpotlight>

            <CardSpotlight className="lg:col-span-2 p-5" color="rgba(255,140,0,0.05)">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-8 h-8 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <h2 className="font-display text-sm font-bold text-[#FDFBF8]">Requires Attention</h2>
              </div>
              {actions.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-10 h-10 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-[#FDFBF8]/20 text-sm italic">Everything is up to date</p>
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
                        'flex items-start gap-3 p-3.5 rounded-xl border text-sm transition-all',
                        action.severity === 'warning'
                          ? 'bg-red-500/5 border-red-500/15 hover:bg-red-500/8'
                          : action.severity === 'info'
                          ? 'bg-[#FF8C00]/5 border-[#FF8C00]/15 hover:bg-[#FF8C00]/8'
                          : 'bg-[#FDFBF8]/3 border-[#FDFBF8]/10 hover:bg-[#FDFBF8]/5'
                      )}
                    >
                      <div className={cn(
                        'w-2 h-2 rounded-full mt-1.5 shrink-0',
                        action.severity === 'warning' ? 'bg-red-400' :
                        action.severity === 'info' ? 'bg-[#FF8C00]' :
                        'bg-[#FDFBF8]/30'
                      )} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[#FDFBF8] text-xs font-medium">{action.title}</div>
                        <div className="text-[#FDFBF8]/35 text-[11px] mt-0.5">{action.subtitle}</div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardSpotlight>
          </motion.div>

          <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CardSpotlight className="p-5" color="rgba(255,140,0,0.03)">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#4DA8DA]/10 border border-[#4DA8DA]/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-[#4DA8DA]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
                    </svg>
                  </div>
                  <h2 className="font-display text-sm font-bold text-[#FDFBF8]">Recent Activity</h2>
                </div>
                <button onClick={() => setActiveTab('activity')} className="text-[10px] text-[#FF8C00]/70 hover:text-[#FF8C00] transition-colors font-medium">
                  View all →
                </button>
              </div>
              {recent_activity.length === 0 ? (
                <div className="text-center py-6 text-[#FDFBF8]/20 text-sm italic">No activity yet.</div>
              ) : (
                <div className="space-y-2">
                  {recent_activity.slice(0, 6).map((a, i) => (
                    <motion.div
                      key={`${a.task_id}-${i}`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="flex items-start gap-3 text-sm p-2.5 rounded-xl hover:bg-[#FDFBF8]/[0.02] transition-colors"
                    >
                      <div className={cn(
                        'w-2 h-2 rounded-full mt-1.5 shrink-0',
                        a.state === 'completed' ? 'bg-green-500' :
                        a.state === 'in_progress' ? 'bg-[#FF8C00]' :
                        a.state === 'submitted' || a.state === 'under_review' ? 'bg-yellow-400' :
                        a.state === 'needs_changes' ? 'bg-red-400' :
                        'bg-[#FDFBF8]/20'
                      )} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-[#FDFBF8] truncate font-medium">{a.title}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <StatusBadge state={a.state} />
                          {a.module && <span className="text-[10px] text-[#FDFBF8]/25 font-mono">{a.module}</span>}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardSpotlight>

            <CardSpotlight className="p-5" color="rgba(255,140,0,0.03)">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                  </div>
                  <h2 className="font-display text-sm font-bold text-[#FDFBF8]">
                    Pending Reviews
                    {pending_reviews.length > 0 && (
                      <span className="ml-2 text-[10px] text-yellow-400/60 font-mono">({pending_reviews.length})</span>
                    )}
                  </h2>
                </div>
                <button onClick={() => navigate('/reviews')} className="text-[10px] text-[#FF8C00]/70 hover:text-[#FF8C00] transition-colors font-medium">
                  Review Queue →
                </button>
              </div>
              {pending_reviews.length === 0 ? (
                <div className="text-center py-6 text-[#FDFBF8]/20 text-sm italic">No pending reviews. Great velocity!</div>
              ) : (
                <div className="space-y-2">
                  {pending_reviews.slice(0, 5).map((pr, i) => (
                    <motion.div
                      key={pr.task_id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      onClick={() => navigate('/reviews')}
                      className="flex items-start gap-3 p-3 rounded-xl bg-[#0D0906] border border-[#FDFBF8]/5 cursor-pointer hover:border-yellow-500/20 transition-all"
                    >
                      <div className="w-2 h-2 rounded-full bg-yellow-400 mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-[#FDFBF8] font-medium truncate">{pr.title}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <StatusBadge state={pr.state} />
                          {pr.module && <Link to={`/module/${encodeURIComponent(pr.module)}`} className="text-[10px] text-[#FF8C00]/70 hover:text-[#FF8C00] font-mono transition-colors">{pr.module}</Link>}
                          {pr.assigned_to && <span className="text-[10px] text-[#FDFBF8]/25">by {pr.assigned_to.slice(0, 8)}</span>}
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

      {activeTab === 'trainees' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <CardSpotlight className="p-0 overflow-hidden" color="rgba(255,140,0,0.03)">
            <div className="px-6 py-4 border-b border-[#FDFBF8]/5">
              <h2 className="font-display text-sm font-bold text-[#FDFBF8]">All Team Members</h2>
            </div>
            {member_progress.length === 0 ? (
              <div className="p-8 text-center text-[#FDFBF8]/20 text-sm italic">No team members found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#FDFBF8]/5">
                      {['Member', 'Total', 'Done', 'In Prog.', 'Review', 'Rate', 'Modules'].map((h) => (
                        <th key={h} className="text-left px-6 py-3.5 text-[10px] uppercase tracking-wider text-[#FDFBF8]/30 font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#FDFBF8]/5">
                    {member_progress.map((member, i) => (
                      <motion.tr
                        key={member.user_id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.03 }}
                        className="hover:bg-[#FDFBF8]/[0.02] transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#FF8C00]/15 to-[#FFB347]/10 border border-[#FF8C00]/20 flex items-center justify-center text-[11px] font-bold text-[#FF8C00]">
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <Link to={`/member/${member.user_id}`} className="text-sm text-[#FDFBF8] font-medium hover:text-[#FF8C00] transition-colors">{member.name}</Link>
                              <span className="text-[10px] text-[#FDFBF8]/25 bg-[#FDFBF8]/5 px-1.5 py-0.5 rounded ml-2">{member.role}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono tabular-nums text-[#FDFBF8]">{member.total}</td>
                        <td className="px-6 py-4 font-mono tabular-nums text-green-400">{member.completed}</td>
                        <td className="px-6 py-4 font-mono tabular-nums text-[#FF8C00]">{member.in_progress}</td>
                        <td className="px-6 py-4 font-mono tabular-nums text-yellow-400">{member.pending_review}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-[#0D0906] overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${member.completion_rate}%` }}
                                transition={{ duration: 0.6, delay: i * 0.03 }}
                                className={cn(
                                  'h-full rounded-full',
                                  member.completion_rate >= 80 ? 'bg-green-500' :
                                  member.completion_rate >= 50 ? 'bg-[#FF8C00]' :
                                  'bg-red-400'
                                )}
                              />
                            </div>
                            <span className={cn(
                              'text-[11px] font-mono tabular-nums',
                              member.completion_rate >= 80 ? 'text-green-400' :
                              member.completion_rate >= 50 ? 'text-[#FF8C00]' :
                              'text-red-400'
                            )}>
                              {member.completion_rate}%
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {member.modules_unlocked.length > 0 ? (
                              member.modules_unlocked.map((mod, mi) => (
                                <Link key={mi} to={`/module/${encodeURIComponent(mod)}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-green-500/10 text-green-400 text-[10px] font-mono border border-green-500/15 hover:bg-green-500/20 transition-colors">
                                  <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                  </svg>
                                  {mod}
                                </Link>
                              ))
                            ) : (
                              <span className="text-[#FDFBF8]/15 text-[10px] italic">—</span>
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

      {activeTab === 'reviews' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <CardSpotlight className="p-0 overflow-hidden" color="rgba(255,140,0,0.03)">
            <div className="px-6 py-4 border-b border-[#FDFBF8]/5 flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-[#FDFBF8]">
                Pending Reviews
                <span className="ml-2 text-[10px] text-[#FDFBF8]/25 font-mono">{pending_reviews.length} items</span>
              </h2>
              <button onClick={() => navigate('/tasks')} className="bg-[#FF8C00] hover:bg-[#FFB347] text-[#3D1C00] px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all hover:shadow-[0_0_20px_-6px_#FF8C00]">
                Go to Tasks
              </button>
            </div>
            {pending_reviews.length === 0 ? (
              <div className="p-8 text-center text-[#FDFBF8]/20 text-sm italic">No pending reviews.</div>
            ) : (
              <div className="divide-y divide-[#FDFBF8]/5">
                {pending_reviews.map((pr, i) => (
                  <motion.div
                    key={pr.task_id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => navigate('/tasks')}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-[#FDFBF8]/[0.02] cursor-pointer transition-colors"
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-[#FDFBF8] font-medium truncate">{pr.title}</div>
                      <div className="flex items-center gap-3 mt-1">
                        <StatusBadge state={pr.state} />
                        {pr.module && <span className="text-[10px] text-[#FDFBF8]/25 font-mono">{pr.module}</span>}
                        {pr.assigned_to && <span className="text-[10px] text-[#FDFBF8]/25">by {pr.assigned_to}</span>}
                        {pr.pr_url && (
                          <a href={pr.pr_url} target="_blank" rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[10px] text-[#4DA8DA] hover:underline"
                          >View PR →</a>
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] text-[#FDFBF8]/25 font-mono shrink-0">
                      {new Date(pr.created_at).toLocaleDateString()}
                    </span>
                  </motion.div>
                ))}
              </div>
            )}
          </CardSpotlight>
        </motion.div>
      )}

      {activeTab === 'activity' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <CardSpotlight className="p-0 overflow-hidden" color="rgba(255,140,0,0.03)">
            <div className="px-6 py-4 border-b border-[#FDFBF8]/5">
              <h2 className="font-display text-sm font-bold text-[#FDFBF8]">
                Recent Activity
                <span className="ml-2 text-[10px] text-[#FDFBF8]/25 font-mono">{recent_activity.length} events</span>
              </h2>
            </div>
            <div className="relative">
              <div className="absolute left-9 top-0 bottom-0 w-px bg-[#FDFBF8]/5" />
              <div className="divide-y divide-[#FDFBF8]/5">
                {recent_activity.length === 0 ? (
                  <div className="p-8 text-center text-[#FDFBF8]/20 text-sm italic">No activity yet.</div>
                ) : (
                  recent_activity.map((a, i) => (
                    <motion.div
                      key={`${a.task_id}-${i}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="relative flex gap-4 pl-14 pr-6 py-4 hover:bg-[#FDFBF8]/[0.02] transition-colors"
                    >
                      <div className={cn(
                        'absolute left-7 w-4 h-4 rounded-full border-2 flex items-center justify-center',
                        a.state === 'completed' ? 'border-green-500 bg-green-500/10' :
                        a.state === 'in_progress' ? 'border-[#FF8C00] bg-[#FF8C00]/10' :
                        a.state === 'submitted' || a.state === 'under_review' ? 'border-yellow-500 bg-yellow-500/10' :
                        a.state === 'needs_changes' ? 'border-red-500 bg-red-500/10' :
                        'border-[#FDFBF8]/20 bg-[#FDFBF8]/5'
                      )}>
                        <div className={cn(
                          'w-1.5 h-1.5 rounded-full',
                          a.state === 'completed' ? 'bg-green-500' :
                          a.state === 'in_progress' ? 'bg-[#FF8C00]' :
                          a.state === 'submitted' || a.state === 'under_review' ? 'bg-yellow-500' :
                          a.state === 'needs_changes' ? 'bg-red-500' :
                          'bg-[#FDFBF8]/30'
                        )} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-[#FDFBF8] font-medium truncate">{a.title}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <StatusBadge state={a.state} />
                          {a.module && <span className="text-[10px] text-[#FDFBF8]/25">Module: {a.module}</span>}
                          {a.assigned_to && <span className="text-[10px] text-[#FDFBF8]/25">Assignee: {a.assigned_to}</span>}
                        </div>
                      </div>
                      <span className="text-[11px] text-[#FDFBF8]/25 font-mono shrink-0">
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
