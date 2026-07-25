import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { NavLink } from 'react-router-dom'
import {
  Code, Compass, ChatCircleDots, GitPullRequest, Heartbeat,
  Key, Eye, ListChecks, ShieldCheck, Clock,
  GitFork, Users, ArrowRight,
} from '@phosphor-icons/react'
import PageTransition from '../components/ui/page-transition'
import CardSpotlight from '../components/ui/card-spotlight'
import { EmptyState } from '../components/ui/empty-state'
import { cn } from '../lib/utils'
import { fetchSeedRoleData } from '../lib/api'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 80, damping: 18 } },
}

const statCardVariants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: (i: number) => ({ opacity: 1, scale: 1, transition: { delay: i * 0.08, type: 'spring', stiffness: 100, damping: 16 } }),
}

interface Stat {
  label: string
  value: string
  icon: any
  color: string
}

interface QuickLink {
  to: string
  title: string
  description: string
  icon: any
}

interface ActivityEvent {
  id: number
  type: string
  title: string
  module: string
  timestamp: string
  state: 'completed' | 'in_progress' | 'submitted'
}

const quickLinks: QuickLink[] = [
  { to: '/explore', title: 'Explore Architecture', description: 'Visualize and explore codebase architecture', icon: Compass },
  { to: '/ask', title: 'Ask Codebase', description: 'Ask questions about your codebase', icon: ChatCircleDots },
  { to: '/pr-describe', title: 'Describe PR', description: 'Generate PR descriptions automatically', icon: GitPullRequest },
  { to: '/code-health', title: 'Code Health', description: 'Monitor code quality metrics', icon: Heartbeat },
  { to: '/api-keys', title: 'API Keys', description: 'Manage your API keys and tokens', icon: Key },
  { to: '/reviews', title: 'Review Queue', description: 'Review pending pull requests', icon: Eye },
  { to: '/tasks', title: 'Tasks', description: 'View and manage your tasks', icon: ListChecks },
  { to: '/admin', title: 'Admin Panel', description: 'System administration and settings', icon: ShieldCheck },
]

const stateColor: Record<string, string> = {
  completed: 'bg-success',
  in_progress: 'bg-accent-from',
  submitted: 'bg-warning',
}

export default function DevSpacePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [seedData, setSeedData] = useState<any>(null)

  useEffect(() => {
    let cancelled = false
    fetchSeedRoleData()
      .then((res) => { if (!cancelled) { setSeedData(res.data); setLoading(false) } })
      .catch((err) => { if (!cancelled) { setError(err.message); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  const d = seedData
  const stats: Stat[] = [
    { label: 'Repos Analyzed', value: d ? `${d.stats?.repos_analyzed ?? d.stats?.total_users ?? 0}` : '0', icon: GitFork, color: 'text-info' },
    { label: 'Active Teams', value: d ? `${d.stats?.active_teams ?? 0}` : '0', icon: Users, color: 'text-success' },
    { label: 'Total Users', value: d ? `${d.stats?.total_users ?? 0}` : '0', icon: Users, color: 'text-accent-from' },
    { label: 'API Calls (24h)', value: d ? `${(d.stats?.api_calls_24h ?? 0).toLocaleString()}` : '0', icon: Code, color: 'text-warning' },
  ]

  const activity: ActivityEvent[] = d?.recent_activity?.map((a: any, i: number) => ({
    id: i,
    type: a.type ?? 'task',
    title: a.title,
    module: a.module ?? 'core',
    timestamp: a.timestamp ?? a.updated_at ?? '',
    state: a.state ?? a.status ?? 'completed',
  })) ?? []

  return (
    <PageTransition>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-6xl mx-auto space-y-8 relative"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="flex items-center gap-3 relative">
          <svg className="absolute -top-8 -left-8 w-48 h-48 opacity-[0.03] pointer-events-none" viewBox="0 0 200 200" fill="none">
            <circle cx="100" cy="100" r="90" stroke="currentColor" strokeWidth="0.4" />
            <circle cx="100" cy="100" r="65" stroke="currentColor" strokeWidth="0.3" strokeDasharray="4 6" />
            <circle cx="100" cy="100" r="40" stroke="currentColor" strokeWidth="0.4" />
          </svg>
          <div className="w-10 h-10 rounded-xl bg-info-muted border border-info/20 flex items-center justify-center">
            <Code className="w-5 h-5 text-info" weight="duotone" />
          </div>
          <div>
            <h1 className="text-display-sm font-display font-medium text-text-primary">Developer Space</h1>
            <p className="text-body-sm text-text-tertiary">Full-access developer portal and tools.</p>
          </div>
        </motion.div>

        {error && (
          <div className="px-4 py-3 rounded-lg bg-error-muted border border-error/20 text-error text-body-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 rounded-xl bg-bg-secondary border border-border animate-pulse" />
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-32 rounded-xl bg-bg-secondary border border-border animate-pulse" />
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {stats.map((stat, i) => (
                <motion.div key={stat.label} custom={i} variants={statCardVariants} initial="hidden" animate="visible">
                  <CardSpotlight className="p-4 group">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110', stat.color.replace('text', 'bg'), '/10')}>
                        <stat.icon className={cn('w-4 h-4', stat.color)} weight="fill" />
                      </div>
                      <span className="text-caption text-text-tertiary">{stat.label}</span>
                    </div>
                    <p className="text-display-xs font-display font-medium text-text-primary">{stat.value}</p>
                  </CardSpotlight>
                </motion.div>
              ))}
            </div>

            {/* Quick-access card grid */}
            <motion.div variants={itemVariants}>
              <h2 className="text-body-sm font-display font-bold text-text-primary mb-4">Quick Access</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {quickLinks.map((link, i) => (
                  <motion.div
                    key={link.to}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, type: 'spring', stiffness: 80, damping: 18 }}
                  >
                    <NavLink to={link.to}>
                      <CardSpotlight className="p-4 h-full group cursor-pointer">
                        <div className="flex flex-col h-full">
                          <div className="w-9 h-9 rounded-lg bg-accent-muted border border-accent/15 flex items-center justify-center mb-3 group-hover:bg-accent-muted/70 group-hover:scale-110 transition-all">
                            <link.icon className="w-4 h-4 text-accent-from" weight="fill" />
                          </div>
                          <h3 className="text-body-sm font-medium text-text-primary mb-1 group-hover:text-accent-from transition-colors">{link.title}</h3>
                          <p className="text-caption text-text-tertiary flex-1">{link.description}</p>
                          <div className="mt-3 flex items-center gap-1 text-caption text-accent-from/60 group-hover:text-accent-from transition-all group-hover:translate-x-1">
                            Open <ArrowRight size={12} weight="bold" />
                          </div>
                        </div>
                      </CardSpotlight>
                    </NavLink>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Recent Activity */}
            <motion.div variants={itemVariants}>
              <h2 className="text-body-sm font-display font-bold text-text-primary mb-4">Recent Activity</h2>
              <CardSpotlight className="p-5">
                {activity.length === 0 ? (
                  <EmptyState
                    icon={<Clock className="w-8 h-8 text-text-tertiary/30" weight="duotone" />}
                    title="No recent activity"
                    description="Activity from your workspace will appear here."
                  />
                ) : (
                  <div className="space-y-1">
                    {activity.map((event) => (
                      <motion.div
                        key={event.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-bg-tertiary/20 transition-colors"
                      >
                        <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', stateColor[event.state])} />
                        <div className="flex-1 min-w-0">
                          <p className="text-body-xs text-text-primary font-medium truncate">{event.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-caption text-text-tertiary/60 font-code">{event.module}</span>
                            <span className="text-caption text-text-tertiary/40">·</span>
                            <span className="text-caption text-text-tertiary/40">{event.timestamp}</span>
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
      </motion.div>
    </PageTransition>
  )
}


