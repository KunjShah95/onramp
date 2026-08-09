import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  GitPullRequest,
  Clock,
  CheckCircle,
  Eye,
  ArrowRight,
  UserCircle,
  ChatCircleDots,
  Code,
  WarningCircle,
} from '@phosphor-icons/react'
import { ReviewQueueSkeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/empty-state'
import { useAuth } from '../context/AuthContext'
import { listTeams, listTasks } from '../lib/api'
import type { WorkflowTask, TeamsResponse } from '../lib/api'

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  submitted: { label: 'Pending', color: 'text-amber-400', bg: 'bg-amber-500/10' },
  under_review: { label: 'In Review', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  product_review: { label: 'In Review', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  approved: { label: 'Approved', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  completed: { label: 'Approved', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  needs_changes: { label: 'Changes Requested', color: 'text-red-400', bg: 'bg-red-500/10' },
  pending: { label: 'Pending', color: 'text-amber-400', bg: 'bg-amber-500/10' },
  in_progress: { label: 'In Progress', color: 'text-blue-400', bg: 'bg-blue-500/10' },
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string; border: string }> = {
  high: { label: 'High', color: 'text-red-400', border: 'border-l-red-500/50' },
  medium: { label: 'Medium', color: 'text-amber-400', border: 'border-l-amber-500/50' },
  low: { label: 'Low', color: 'text-text-tertiary', border: 'border-l-text-tertiary/30' },
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 80, damping: 18 } },
}

function tabForState(state: string): string {
  if (state === 'submitted' || state === 'under_review' || state === 'product_review' || state === 'pending') return 'pending'
  if (state === 'in_progress') return 'in-progress'
  if (state === 'approved' || state === 'completed') return 'approved'
  if (state === 'needs_changes') return 'changes'
  return 'pending'
}

export default function ReviewQueuePage() {
  const [teamId, setTeamId] = useState('')
  const [tasks, setTasks] = useState<WorkflowTask[]>([])
  const [filter, setFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const { activeTeamId } = useAuth()

  useEffect(() => {
    let cancelled = false
    listTeams('current-user')
      .then((data: TeamsResponse) => {
        if (cancelled) return
        const tid = activeTeamId || data.teams?.[0]?.team_id || ''
        if (tid) setTeamId(tid)
        else { setLoading(false); setError('Join a team to view the review queue.') }
      })
      .catch(() => {
        if (cancelled) return
        setLoading(false); setError('Failed to load teams.')
      })
    return () => { cancelled = true }
  }, [activeTeamId])

  async function fetchTasks() {
    if (!teamId) return
    setLoading(true); setError('')
    try {
      const res = await listTasks({ team_id: teamId })
      setTasks(res.tasks ?? [])
    } catch (err: any) {
      setError(err.message || 'Failed to load tasks.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTasks()
  }, [teamId])

  const reviewItems = tasks.map((t) => {
    const status = tabForState(t.state)
    return { task: t, status }
  })
  const filtered = filter === 'all' ? reviewItems : reviewItems.filter((r) => r.status === filter)

  const counts = {
    pending: reviewItems.filter((r) => r.status === 'pending').length,
    'in-progress': reviewItems.filter((r) => r.status === 'in-progress').length,
    approved: reviewItems.filter((r) => r.status === 'approved').length,
    changes: reviewItems.filter((r) => r.status === 'changes').length,
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-5xl mx-auto space-y-6 relative"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-start justify-between gap-6 relative">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="tile tile-go">
              <GitPullRequest size={11} weight="fill" className="mr-1.5" />
              Review Queue
            </span>
            <span className="designator opacity-50">PR GATE</span>
          </div>
          <h1 className="text-display-md md:text-display-lg text-text-primary">Review Queue</h1>
          <p className="text-body-sm text-text-secondary mt-1 font-code">
            Review pending pull requests and provide feedback.
          </p>
        </div>
        {teamId && (
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="bg-bg-secondary border border-border text-text-primary text-caption rounded-lg px-3 py-2"
          >
            <option value={teamId}>{teamId}</option>
          </select>
        )}
      </motion.div>

      {error && (
        <motion.div variants={itemVariants} className="px-4 py-3 rounded-lg bg-error-muted border border-error/20 text-error text-body-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={fetchTasks} disabled={loading} className="text-caption underline ml-4 text-error/70 hover:text-error disabled:opacity-50">Retry</button>
        </motion.div>
      )}

      {/* Filter Tabs */}
      <motion.div variants={itemVariants} className="flex items-center gap-1 p-1 rounded-xl bg-bg-tertiary/30 w-fit flex-wrap">
        {[
          { key: 'all', label: 'All' },
          { key: 'pending', label: 'Pending' },
          { key: 'in-progress', label: 'In Review' },
          { key: 'approved', label: 'Approved' },
          { key: 'changes', label: 'Changes' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-caption font-medium transition-all ${
              filter === f.key
                ? 'bg-bg-primary text-text-primary shadow-sm'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            {f.label}
          </button>
        ))}
      </motion.div>

      {/* Queue */}
      {loading ? (
        <motion.div variants={itemVariants}><ReviewQueueSkeleton /></motion.div>
      ) : filtered.length === 0 ? (
        <motion.div variants={itemVariants}>
          <EmptyState
            icon={<GitPullRequest className="w-10 h-10 text-text-tertiary/30" weight="duotone" />}
            title="Queue is clear"
            description="No pull requests match this filter."
          />
        </motion.div>
      ) : (
        <motion.div variants={itemVariants} className="space-y-2">
          {filtered.map(({ task, status }, i) => {
            // STATUS_CONFIG is keyed by task state (e.g. needs_changes, in_progress),
            // NOT by tab keys (changes, in-progress). Look up by the task's own state
            // first, fall back to the tab key, then a neutral default so a new/unknown
            // state can never crash the queue.
            const statusStyle =
              STATUS_CONFIG[task.state] ??
              STATUS_CONFIG[status] ?? {
                label: task.state,
                color: 'text-text-tertiary',
                bg: 'bg-bg-tertiary/50',
              }
            const priorityStyle = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.low
            return (
              <motion.div
                key={task.task_id}
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: i * 0.04, type: 'spring', stiffness: 80, damping: 18 }}
                className={`card p-4 border-l-2 ${priorityStyle.border} hover:border-l-go transition-all cursor-pointer group`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-1.5">
                      <h3 className="text-body font-medium text-text-primary group-hover:text-go transition-colors">
                        {task.title}
                      </h3>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${statusStyle.bg} ${statusStyle.color}`}>
                        {statusStyle.label}
                      </span>
                      <span className="text-caption text-text-tertiary/60">{priorityStyle.label}</span>
                    </div>
                    <div className="flex items-center gap-3 text-caption text-text-tertiary flex-wrap">
                      {task.assigned_to && (
                        <span className="flex items-center gap-1.5">
                          <UserCircle className="w-3.5 h-3.5" weight="fill" />
                          {task.assigned_to}
                        </span>
                      )}
                      {task.module && (
                        <span className="flex items-center gap-1">
                          <Code className="w-3 h-3" />
                          {task.module}
                        </span>
                      )}
                      {task.ai_review && (
                        <span className="flex items-center gap-1">
                          <ChatCircleDots className="w-3 h-3" />
                          AI score {task.ai_review.score}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(task.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {status === 'pending' && (
                      <button className="w-8 h-8 rounded-lg bg-go/10 flex items-center justify-center text-go hover:bg-go/20 transition-all group/btn hover:scale-110">
                        <Eye className="w-4 h-4" />
                      </button>
                    )}
                    <button className="w-8 h-8 rounded-lg bg-bg-tertiary/50 flex items-center justify-center text-text-tertiary hover:text-text-primary transition-all opacity-0 group-hover:opacity-100 hover:scale-110">
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      )}

      {/* Quick Stats */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Pending', value: counts.pending, icon: Clock, color: 'text-amber-400' },
          { label: 'In Review', value: counts['in-progress'], icon: Eye, color: 'text-blue-400' },
          { label: 'Approved', value: counts.approved, icon: CheckCircle, color: 'text-emerald-400' },
          { label: 'Changes', value: counts.changes, icon: WarningCircle, color: 'text-red-400' },
        ].map((stat, idx) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.06, type: 'spring', stiffness: 100, damping: 16 }}
            className="card p-3 flex items-center gap-3 group"
          >
            <div className="transition-transform group-hover:scale-110">
              <stat.icon className={`w-4 h-4 ${stat.color}`} weight="fill" />
            </div>
            <div>
              <p className="text-body font-medium text-text-primary">{stat.value}</p>
              <p className="text-caption text-text-tertiary">{stat.label}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  )
}
