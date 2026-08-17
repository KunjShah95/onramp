/*
 * ─── DIRECTION CONTRACT · ONRAMP MISSION CONTROL · FIRST PRINCIPLES ─────────
 * THESIS: Dev Space is a developer-console seat — telemetry, quick links to
 *   tools, recent activity. Seated panels, mono readouts, no neon.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { NavLink } from 'react-router-dom'
import {
  Compass, ChatCircleDots, GitPullRequest, Heartbeat,
  Key, Eye, ListChecks, ShieldCheck, Clock,
  GitFork, Users, ArrowRight,
} from '@phosphor-icons/react'
import PageTransition from '../components/ui/page-transition'
import ConsolePanel from '../components/ui/console-panel'
import ReadoutBank, { type Readout } from '../components/ui/readout-bank'
import StatusTile from '../components/ui/status-tile'
import { PageHeader } from '../components/ui/page-header'
import { EmptyState } from '../components/ui/empty-state'
import { fetchSeedRoleData } from '../lib/api'

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 90, damping: 18 } },
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

const stateTone: Record<string, 'go' | 'standby' | 'caution'> = {
  completed: 'go',
  in_progress: 'standby',
  submitted: 'caution',
}
const stateLabel: Record<string, string> = {
  completed: 'Done',
  in_progress: 'In progress',
  submitted: 'Submitted',
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
  const repos = d?.stats?.repos_analyzed ?? d?.stats?.total_users ?? 0
  const teams = d?.stats?.active_teams ?? 0
  const users = d?.stats?.total_users ?? 0
  const calls = d?.stats?.api_calls_24h ?? 0

  const readouts: Readout[] = [
    { label: 'Repos Analyzed', value: repos, color: 'text-mission' },
    { label: 'Active Teams', value: teams, color: 'text-go' },
    { label: 'Total Users', value: users, color: 'text-mission' },
    { label: 'API Calls · 24h', value: calls, color: 'text-caution' },
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
        variants={container}
        initial="hidden"
        animate="show"
        className="min-h-[calc(100vh-4rem)] p-4 sm:p-6 max-w-6xl mx-auto space-y-6"
      >
      {/* Header */}
      <motion.div variants={item}>
        <PageHeader
          eyebrow="Folio 02 · Developer"
          title="Developer Space"
          subtitle="Full-access developer portal and tools."
        />
      </motion.div>

        {error && (
          <motion.div variants={item}>
            <ConsolePanel rail="Signal Lost" designator="DEV" status="abort">
              <div className="flex items-center justify-between gap-4">
                <p className="text-abort text-body-sm font-code">{error}</p>
              </div>
            </ConsolePanel>
          </motion.div>
        )}

        {loading ? (
          <div className="space-y-5">
            <div className="h-24 rounded-card bg-panel border border-seam animate-skeleton" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-28 rounded-card bg-panel border border-seam animate-skeleton" />
              ))}
            </div>
            <div className="h-64 rounded-card bg-panel border border-seam animate-skeleton" />
          </div>
        ) : (
          <>
            {/* Telemetry */}
            <motion.div variants={item}>
              <ReadoutBank callsign="Developer" items={readouts} columns={4} />
            </motion.div>

            {/* Quick access */}
            <motion.div variants={item}>
              <ConsolePanel rail="Quick Access" designator={`${quickLinks.length} TOOLS`} status="go">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {quickLinks.map((link, i) => (
                    <motion.div
                      key={link.to}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03, type: 'spring', stiffness: 90, damping: 18 }}
                    >
                      <NavLink to={link.to} className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-go rounded-tile">
                        <div className="h-full p-3 rounded-tile bg-well border border-seam hover:border-seam-strong transition-colors group">
                          <div className="flex items-center gap-2.5 mb-1.5">
                            <span className="w-7 h-7 rounded-tile bg-go/10 border border-go/25 flex items-center justify-center text-go shrink-0">
                              <link.icon size={14} weight="fill" />
                            </span>
                            <span className="font-code text-caption text-ink-secondary truncate">{link.title}</span>
                          </div>
                          <p className="text-caption text-ink-muted line-clamp-2 mb-2 min-h-[2.4em]">
                            {link.description}
                          </p>
                          <div className="flex items-center gap-1 text-caption text-ink-muted/60 group-hover:text-go transition-colors">
                            <span>Open</span>
                            <ArrowRight size={11} weight="bold" />
                          </div>
                        </div>
                      </NavLink>
                    </motion.div>
                  ))}
                </div>
              </ConsolePanel>
            </motion.div>

            {/* Recent Activity */}
            <motion.div variants={item}>
              <ConsolePanel
                rail="Recent Activity"
                designator={`${activity.length} EVENTS`}
                status={activity.length ? 'standby' : 'idle'}
                live={activity.length > 0}
              >
                {activity.length === 0 ? (
                  <EmptyState
                    icon={<Clock className="w-8 h-8 text-ink-disabled" weight="duotone" />}
                    title="No recent activity"
                    description="Activity from your workspace will appear here."
                  />
                ) : (
                  <div className="divide-y divide-seam">
                    {activity.map((event) => {
                      const tone = stateTone[event.state] ?? 'standby'
                      return (
                        <motion.div
                          key={event.id}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex items-center gap-3 py-2.5 px-1 hover:bg-well/40 transition-colors rounded-tile"
                        >
                          <StatusTile status={tone} label={stateLabel[event.state] ?? event.state} />
                          <div className="flex-1 min-w-0">
                            <p className="text-body-sm text-ink truncate">{event.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-caption text-ink-muted font-code">{event.module}</span>
                              {event.timestamp && (
                                <>
                                  <span className="text-caption text-ink-disabled">·</span>
                                  <span className="text-caption text-ink-muted font-code">{event.timestamp}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                )}
              </ConsolePanel>
            </motion.div>

            {/* Inline icon legend — used by stats (kept consistent with the kit) */}
            <div className="hidden">
              <GitFork />
              <Users />
            </div>
          </>
        )}
      </motion.div>
    </PageTransition>
  )
}
