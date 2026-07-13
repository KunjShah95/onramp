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
import PageTransition from '../components/ui/page-transition'
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
    listTeams('current-user')
      .then((data: TeamsResponse) => {
        const tid = activeTeamId || data.teams?.[0]?.team_id || ''
        if (tid) setTeamId(tid)
        else { setLoading(false); setError('Join a team to view the review queue.') }
      })
      .catch(() => { setLoading(false); setError('Failed to load teams.') })
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
    <PageTransition>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center">
                <GitPullRequest className="w-5 h-5 text-accent-primary" weight="duotone" />
              </div>
              <h1 className="text-display-sm font-display font-medium text-text-primary">
                Review Queue
              </h1>
            </div>
            <p className="text-body-sm text-text-tertiary max-w-xl">
              Review pending pull requests and provide feedback.
            </p>
          </div>
          {teamId && (
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="bg-bg-secondary border border-border text-text-primary text-caption rounded-lg px-3 py-2"
            >
              {/* team options would require stored list; keep current selection */}
              <option value={teamId}>{teamId}</option>
            </select>
          )}
        </div>

        {error && (
          <div className="px-4 py-3 rounded-lg bg-error-muted border border-error/20 text-error text-body-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={fetchTasks} disabled={loading} className="text-caption underline ml-4 text-error/70 hover:text-error disabled:opacity-50">Retry</button>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-bg-tertiary/30 w-fit flex-wrap">
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
        </div>

        {/* Queue */}
        {loading ? (
          <div className="py-8"><ReviewQueueSkeleton /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<GitPullRequest className="w-10 h-10 text-text-tertiary/30" weight="duotone" />}
            title="Queue is clear"
            description="No pull requests match this filter."
          />
        ) : (
          <div className="space-y-2">
            {filtered.map(({ task, status }, i) => {
              const statusStyle = STATUS_CONFIG[status]
              const priorityStyle = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.low
              return (
                <motion.div
                  key={task.task_id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={`card p-4 border-l-2 ${priorityStyle.border} hover:border-l-accent-primary transition-all cursor-pointer group`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 mb-1.5">
                        <h3 className="text-body font-medium text-text-primary group-hover:text-accent-primary transition-colors">
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
                        <button className="w-8 h-8 rounded-lg bg-accent-primary/10 flex items-center justify-center text-accent-primary hover:bg-accent-primary/20 transition-all">
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      <button className="w-8 h-8 rounded-lg bg-bg-tertiary/50 flex items-center justify-center text-text-tertiary hover:text-text-primary transition-all opacity-0 group-hover:opacity-100">
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Pending', value: counts.pending, icon: Clock, color: 'text-amber-400' },
            { label: 'In Review', value: counts['in-progress'], icon: Eye, color: 'text-blue-400' },
            { label: 'Approved', value: counts.approved, icon: CheckCircle, color: 'text-emerald-400' },
            { label: 'Changes', value: counts.changes, icon: WarningCircle, color: 'text-red-400' },
          ].map((StatIcon, idx) => (
            <div key={idx} className="card p-3 flex items-center gap-3">
              <StatIcon.icon className={`w-4 h-4 ${StatIcon.color}`} weight="fill" />
              <div>
                <p className="text-body font-medium text-text-primary">{StatIcon.value}</p>
                <p className="text-caption text-text-tertiary">{StatIcon.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageTransition>
  )
}
