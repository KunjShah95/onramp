import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
import { useAuth } from '../context/AuthContext'
import { listTeams, listTasks } from '../lib/api'
import type { WorkflowTask, TeamsResponse } from '../lib/api'
import { cn } from '../lib/utils'
import ConsolePanel from '../components/ui/console-panel'

const STATUS_CONFIG: Record<string, { label: string; tone: 'go' | 'mission' | 'caution' | 'abort' | 'idle' }> = {
  submitted: { label: 'Pending', tone: 'caution' },
  under_review: { label: 'In Review', tone: 'mission' },
  product_review: { label: 'In Review', tone: 'mission' },
  approved: { label: 'Approved', tone: 'go' },
  completed: { label: 'Approved', tone: 'go' },
  needs_changes: { label: 'Changes Requested', tone: 'abort' },
  pending: { label: 'Pending', tone: 'caution' },
  in_progress: { label: 'In Progress', tone: 'mission' },
}

const TONE_CLASS = {
  go: 'bg-go/10 text-go border-go/30',
  mission: 'bg-mission/10 text-mission border-mission/30',
  caution: 'bg-caution/10 text-caution border-caution/30',
  abort: 'bg-abort/10 text-abort border-abort/30',
  idle: 'bg-base text-ink-tertiary border-seam',
} as const

const PRIORITY_BAR = {
  high: 'bg-abort',
  medium: 'bg-caution',
  low: 'bg-ink-disabled',
} as const

const fade = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
}

function tabForState(state: string): string {
  if (state === 'submitted' || state === 'under_review' || state === 'product_review' || state === 'pending') return 'pending'
  if (state === 'in_progress') return 'in-progress'
  if (state === 'approved' || state === 'completed') return 'approved'
  if (state === 'needs_changes') return 'changes'
  return 'pending'
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'in-progress', label: 'In Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'changes', label: 'Changes' },
] as const

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

  useEffect(() => { fetchTasks() }, [teamId])

  const reviewItems = tasks.map((t) => ({ task: t, status: tabForState(t.state) }))
  const filtered = filter === 'all' ? reviewItems : reviewItems.filter((r) => r.status === filter)

  const counts = {
    pending: reviewItems.filter((r) => r.status === 'pending').length,
    'in-progress': reviewItems.filter((r) => r.status === 'in-progress').length,
    approved: reviewItems.filter((r) => r.status === 'approved').length,
    changes: reviewItems.filter((r) => r.status === 'changes').length,
  }

  const pendingTotal = counts.pending + counts['in-progress'] + counts.changes
  const verdictTone = counts.changes > 0 ? 'hold' : counts.pending > 0 ? 'standby' : 'go'

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[hsl(var(--background))]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">

        {/* Header */}
        <motion.header initial="hidden" animate="show" variants={fade}>
          <div className="flex items-center gap-2.5 mb-2">
            <span className="designator opacity-50">PR GATE</span>
            <span className="w-1 h-1 rounded-full bg-ink-disabled" />
            <span className="designator opacity-50">FLIGHT · REVIEW</span>
          </div>
          <h1 className="font-display text-4xl md:text-5xl text-ink font-bold tracking-tight leading-[1.05]">
            Triage by state. Act by row.
          </h1>
          <p className="font-body text-[15px] text-ink-secondary mt-2 max-w-xl">
            Pending PRs in one place. Filter by state, take action on the row that needs it.
          </p>
        </motion.header>

        {/* Verdict bar */}
        <motion.div initial="hidden" animate="show" variants={fade}>
          <ConsolePanel
            rail={verdictTone === 'hold' ? 'Hold' : verdictTone === 'standby' ? 'Awaiting review' : 'Clear'}
            designator={`${pendingTotal} ACTIONABLE`}
            status={verdictTone === 'hold' ? 'caution' : verdictTone === 'standby' ? 'standby' : 'go'}
            live={verdictTone !== 'hold'}
            action={
              <button
                onClick={fetchTasks}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-[3px] border border-seam-strong bg-panel-raised px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-base transition-colors disabled:opacity-40"
              >
                Refresh
              </button>
            }
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Pending', value: counts.pending, icon: Clock, tone: 'caution' as const },
                { label: 'In Review', value: counts['in-progress'], icon: Eye, tone: 'mission' as const },
                { label: 'Approved', value: counts.approved, icon: CheckCircle, tone: 'go' as const },
                { label: 'Changes', value: counts.changes, icon: WarningCircle, tone: 'abort' as const },
              ].map((stat) => (
                <div key={stat.label} className="flex items-center gap-2.5">
                  <div className={cn('w-7 h-7 rounded-[3px] border flex items-center justify-center',
                    stat.tone === 'go' && 'bg-go/10 border-go/20',
                    stat.tone === 'mission' && 'bg-mission/10 border-mission/20',
                    stat.tone === 'caution' && 'bg-caution/10 border-caution/20',
                    stat.tone === 'abort' && 'bg-abort/10 border-abort/20',
                  )}>
                    <stat.icon size={12} weight="fill" className={cn(
                      stat.tone === 'go' && 'text-go',
                      stat.tone === 'mission' && 'text-mission',
                      stat.tone === 'caution' && 'text-caution',
                      stat.tone === 'abort' && 'text-abort',
                    )} />
                  </div>
                  <div>
                    <p className="font-mono text-lg font-semibold text-ink tabular-nums leading-none">{stat.value}</p>
                    <p className="text-[10px] text-ink-tertiary uppercase tracking-wider mt-0.5">{stat.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </ConsolePanel>
        </motion.div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <ConsolePanel pad="dense" status="abort" className="flex items-center justify-between">
                <span className="text-[13px] text-abort">{error}</span>
                <button onClick={fetchTasks} disabled={loading} className="text-[12px] text-abort/70 hover:text-abort underline">Retry</button>
              </ConsolePanel>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Filter tabs */}
        <motion.div initial="hidden" animate="show" variants={fade}>
          <ConsolePanel pad="dense">
            <div className="flex items-center gap-1 flex-wrap">
              {TABS.map((f) => {
                const active = filter === f.key
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      'px-3 py-1.5 rounded-[2px] text-[12px] font-semibold transition-colors',
                      active
                        ? 'bg-go text-white'
                        : 'text-ink-secondary hover:text-ink'
                    )}
                  >
                    {f.label}
                  </button>
                )
              })}
            </div>
          </ConsolePanel>
        </motion.div>

        {/* Queue */}
        {loading ? (
          <ReviewQueueSkeleton />
        ) : filtered.length === 0 ? (
          <motion.div initial="hidden" animate="show" variants={fade}>
            <ConsolePanel rail="Queue" designator="EMPTY" status="go" className="py-16 text-center">
              <div className="w-14 h-14 rounded-[3px] bg-base border border-seam flex items-center justify-center mx-auto mb-4">
                <GitPullRequest size={26} className="text-ink-disabled" weight="duotone" />
              </div>
              <p className="font-display text-lg text-ink font-semibold mb-1">Queue is clear</p>
              <p className="text-[13px] text-ink-tertiary max-w-sm mx-auto">
                No pull requests match this filter.
              </p>
            </ConsolePanel>
          </motion.div>
        ) : (
          <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.04 } } }} className="space-y-2">
            {filtered.map(({ task, status }) => {
              const style =
                STATUS_CONFIG[task.state] ??
                STATUS_CONFIG[status] ??
                { label: task.state, tone: 'idle' as const }
              const priorityBar = PRIORITY_BAR[(task.priority as keyof typeof PRIORITY_BAR) ?? 'low']
              return (
                <motion.div
                  key={task.task_id}
                  variants={fade}
                  className={cn(
                    'group flex items-start gap-3 rounded-[3px] bg-panel border border-seam px-4 py-3',
                    'hover:border-seam-strong transition-colors cursor-pointer'
                  )}
                >
                  {/* Priority bar */}
                  <span className={cn('w-0.5 self-stretch rounded-full shrink-0', priorityBar)} aria-hidden />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                      <h3 className="font-display text-[14px] text-ink font-semibold group-hover:text-go transition-colors truncate">
                        {task.title}
                      </h3>
                      <span className={cn('px-2 py-0.5 rounded-[2px] text-[10px] font-semibold uppercase tracking-wider border', TONE_CLASS[style.tone])}>
                        {style.label}
                      </span>
                      {task.priority && (
                        <span className="font-code text-[10px] text-ink-tertiary uppercase tracking-wider">
                          {task.priority}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-ink-tertiary flex-wrap font-code">
                      {task.assigned_to && (
                        <span className="inline-flex items-center gap-1">
                          <UserCircle size={11} weight="fill" />
                          {task.assigned_to}
                        </span>
                      )}
                      {task.module && (
                        <span className="inline-flex items-center gap-1">
                          <Code size={10} />
                          {task.module}
                        </span>
                      )}
                      {task.ai_review && (
                        <span className="inline-flex items-center gap-1">
                          <ChatCircleDots size={10} />
                          AI {task.ai_review.score}
                        </span>
                      )}
                      {task.updated_at && (
                        <span className="inline-flex items-center gap-1">
                          <Clock size={10} />
                          {new Date(task.updated_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {status === 'pending' && (
                      <button className="inline-flex items-center gap-1 rounded-[3px] bg-go text-white px-2.5 py-1 text-[11px] font-semibold hover:bg-go-lit transition-colors">
                        <Eye size={11} weight="bold" />
                        Review
                      </button>
                    )}
                    <button className="w-7 h-7 rounded-[3px] border border-seam-strong bg-base text-ink-tertiary hover:text-ink hover:border-seam-strong transition-colors opacity-0 group-hover:opacity-100" aria-label="Open">
                      <ArrowRight size={11} weight="bold" className="mx-auto" />
                    </button>
                  </div>
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </div>
    </div>
  )
}
