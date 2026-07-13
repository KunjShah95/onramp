import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  GraduationCap,
  CheckCircle,
  ArrowRight,
  Lightning,
  BookOpenText,
  GitPullRequest,
  Trophy,
  Target,
} from '@phosphor-icons/react'
import PageTransition from '../components/ui/page-transition'
import CardSpotlight from '../components/ui/card-spotlight'
import { EmptyState } from '../components/ui/empty-state'
import { TraineeDashboardSkeleton } from '../components/ui/Skeleton'
import GamificationPanel from '../components/gamification/GamificationPanel'
import { useAuth } from '../context/AuthContext'
import { fetchTraineeDashboard } from '../lib/api'
import type { TraineeDashboardResponse, TraineeTask } from '../lib/api'

const STATE_COLORS: Record<string, string> = {
  completed: 'text-emerald-400 bg-emerald-500/10',
  approved: 'text-emerald-400 bg-emerald-500/10',
  in_progress: 'text-amber-400 bg-amber-500/10',
  submitted: 'text-blue-400 bg-blue-500/10',
  under_review: 'text-blue-400 bg-blue-500/10',
  pending: 'text-text-tertiary bg-bg-tertiary/30',
  assigned: 'text-purple-400 bg-purple-500/10',
  needs_changes: 'text-red-400 bg-red-500/10',
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const d = Math.floor(diff / 86400000)
  if (d < 1) return 'today'
  if (d === 1) return 'yesterday'
  return `${d}d ago`
}

export default function TraineeDashboard() {
  const [data, setData] = useState<TraineeDashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedModule, setSelectedModule] = useState<string | null>(null)

  const { activeTeamId } = useAuth()

  async function fetchDashboard() {
    if (!activeTeamId) {
      setLoading(false)
      setError('Join a team to view your onboarding progress.')
      return
    }
    setLoading(true); setError('')
    try {
      const res = await fetchTraineeDashboard(activeTeamId)
      setData(res)
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboard()
    const interval = setInterval(fetchDashboard, 15000)
    return () => clearInterval(interval)
  }, [activeTeamId])

  if (loading) return <PageTransition><TraineeDashboardSkeleton /></PageTransition>

  if (error || !data) {
    return (
      <PageTransition>
        <div className="max-w-5xl mx-auto">
          <div className="flex items-start gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center">
                  <GraduationCap className="w-5 h-5 text-accent-primary" weight="duotone" />
                </div>
                <h1 className="text-display-sm font-display font-medium text-text-primary">Trainee Dashboard</h1>
              </div>
              {error ? (
                <div className="px-4 py-3 rounded-lg bg-error-muted border border-error/20 text-error text-body-sm flex items-center justify-between">
                  <span>{error}</span>
                  <button onClick={fetchDashboard} disabled={loading} className="text-caption underline ml-4 text-error/70 hover:text-error disabled:opacity-50">Retry</button>
                </div>
              ) : (
                <CardSpotlight className="border border-accent-primary/10">
                  <EmptyState icon={<GraduationCap className="w-10 h-10 text-text-tertiary/30" weight="duotone" />} title="No data yet" description="Your onboarding progress will appear here." />
                </CardSpotlight>
              )}
            </div>
            <div className="w-80 shrink-0 hidden lg:block">
              <GamificationPanel />
            </div>
          </div>
        </div>
      </PageTransition>
    )
  }

  const { progress, modules, recent_tasks } = data
  const completionPct = Math.round((progress.completion_rate ?? 0) * 100)

  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto flex items-start gap-6">
        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-8">
          {/* Header */}
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-accent-primary" weight="duotone" />
              </div>
              <div>
                <h1 className="text-display-sm font-display font-medium text-text-primary">
                  {data.user_name ? `${data.user_name}'s Progress` : 'Trainee Dashboard'}
                </h1>
                <p className="text-body-sm text-text-tertiary">
                  Track your learning journey and skill development.
                </p>
              </div>
            </div>
            <button onClick={fetchDashboard} disabled={loading} className="text-caption text-accent-primary/70 hover:text-accent-primary transition-colors shrink-0">Refresh</button>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Completion', value: `${completionPct}%`, icon: Lightning, color: 'text-amber-400', subtitle: `${progress.completed}/${progress.total} tasks` },
              { label: 'Modules Unlocked', value: progress.modules_unlocked?.length ?? 0, icon: BookOpenText, color: 'text-blue-400', subtitle: 'via grants' },
              { label: 'In Progress', value: progress.in_progress, icon: Target, color: 'text-purple-400', subtitle: 'active tasks' },
              { label: 'Pending Review', value: progress.pending_review, icon: Trophy, color: 'text-emerald-400', subtitle: 'awaiting feedback' },
            ].map((metric, i) => (
              <motion.div key={metric.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                <CardSpotlight className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <metric.icon className={`w-4 h-4 ${metric.color}`} weight="duotone" />
                    <span className="text-caption text-text-tertiary">{metric.label}</span>
                  </div>
                  <p className="text-display-2xs font-display font-medium text-text-primary">{metric.value}</p>
                  <p className="text-caption text-text-tertiary/60">{metric.subtitle}</p>
                </CardSpotlight>
              </motion.div>
            ))}
          </div>

          {/* Learning Path */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-body font-medium text-text-primary">Unlocked Modules</h2>
              <span className="text-caption text-text-tertiary">{modules.length} granted</span>
            </div>
            {modules.length === 0 ? (
              <CardSpotlight className="border border-accent-primary/10">
                <EmptyState icon={<BookOpenText className="w-10 h-10 text-text-tertiary/30" weight="duotone" />} title="No modules unlocked yet" description="Modules unlock as you complete onboarding tasks." />
              </CardSpotlight>
            ) : (
              <div className="space-y-2">
                {modules.map((mod, i) => (
                  <motion.div
                    key={`${mod.module}-${i}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className={`card p-4 cursor-pointer transition-all ${selectedModule === mod.module ? 'border-accent-primary/40' : 'hover:border-accent-primary/20'}`}
                    onClick={() => setSelectedModule(selectedModule === mod.module ? null : mod.module)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-emerald-500/10 text-emerald-400">
                        <CheckCircle className="w-4.5 h-4.5" weight="fill" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-body-sm font-medium text-text-primary font-code">{mod.module}</p>
                        <p className="text-caption text-text-tertiary/60">Granted {new Date(mod.granted_at).toLocaleDateString()} · {mod.source}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-text-tertiary shrink-0" />
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Tasks */}
          <div>
            <h2 className="text-body font-medium text-text-primary mb-4">Recent Tasks</h2>
            {recent_tasks.length === 0 ? (
              <CardSpotlight className="border border-accent-primary/10">
                <EmptyState icon={<GitPullRequest className="w-10 h-10 text-text-tertiary/30" weight="duotone" />} title="No tasks yet" description="Tasks from your learning path will appear here." />
              </CardSpotlight>
            ) : (
              <div className="space-y-2">
                {recent_tasks.map((task: TraineeTask, i) => (
                  <motion.div
                    key={task.task_id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="card p-4 flex items-center gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm font-medium text-text-primary">{task.title}</p>
                      <p className="text-caption text-text-tertiary/60">{task.module} · updated {relativeTime(task.updated_at)}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${STATE_COLORS[task.state] ?? 'text-text-tertiary bg-bg-tertiary/30'}`}>
                      {task.state.replace('_', ' ')}
                    </span>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar — Gamification */}
        <div className="w-80 shrink-0 hidden lg:block">
          <div className="sticky top-24">
            <GamificationPanel />
          </div>
        </div>
      </div>
    </PageTransition>
  )
}
