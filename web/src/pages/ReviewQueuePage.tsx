import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../lib/utils'
import {
  listTasks, reviewTask, approveTask, listTeams,
  type WorkflowTask,
} from '../lib/api'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import StatusBadge from '../components/ui/status-badge'
import PageTransition from '../components/ui/page-transition'
import { useToast } from '../context/ToastContext'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
}

function hoursSince(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / 3_600_000
}

function slaStatus(hours: number): { label: string; color: string; dot: string } {
  if (hours < 4) return { label: 'On track', color: 'text-green-400', dot: 'bg-green-500' }
  if (hours < 24) return { label: 'Reviewing', color: 'text-yellow-400', dot: 'bg-yellow-400' }
  return { label: 'Overdue!', color: 'text-red-400', dot: 'bg-red-500' }
}

export default function ReviewQueuePage() {
  const toast = useToast()
  const [teams, setTeams] = useState<any[]>([])
  const [selectedTeam, setSelectedTeam] = useState('')
  const [tasks, setTasks] = useState<WorkflowTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [filterModule, setFilterModule] = useState('')
  const [filterAssignee, setFilterAssignee] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [sortBy, setSortBy] = useState<'oldest' | 'newest' | 'priority'>('oldest')

  // Detail modal
  const [selectedTask, setSelectedTask] = useState<WorkflowTask | null>(null)
  const [reviewFeedback, setReviewFeedback] = useState('')

  const fetchTeams = useCallback(async () => {
    try {
      const data = await listTeams('current-user')
      setTeams(data.teams || [])
      if (data.teams?.length > 0 && !selectedTeam) setSelectedTeam(data.teams[0].team_id)
    } catch { /* ignore */ }
  }, [])

  const fetchTasks = useCallback(async () => {
    if (!selectedTeam) return
    setLoading(true); setError('')
    try {
      const { tasks = [] } = await listTasks({ team_id: selectedTeam }) as { tasks: WorkflowTask[] }
      // Only show review-eligible states
      setTasks(tasks.filter(t =>
        ['submitted', 'under_review', 'needs_changes', 'product_review', 'approved'].includes(t.state)
      ))
    } catch (e: any) { setError(e.message || 'Failed to load') }
    setLoading(false)
  }, [selectedTeam])

  useEffect(() => { fetchTeams() }, [])
  useEffect(() => { fetchTasks() }, [fetchTasks])

  // Derived analytics
  const analytics = useMemo(() => {
    const total = tasks.length
    const overdue = tasks.filter(t => hoursSince(t.updated_at) > 24 && t.state !== 'completed').length
    const avgReviewHrs = tasks.length > 0
      ? (tasks.reduce((sum, t) => sum + hoursSince(t.created_at), 0) / tasks.length).toFixed(1)
      : '0'
    const byModule = tasks.reduce<Record<string, number>>((acc, t) => {
      if (t.module) { acc[t.module] = (acc[t.module] || 0) + 1 }
      return acc
    }, {})
    const topModule = Object.entries(byModule).sort((a, b) => b[1] - a[1])[0]
    const byPriority = { high: tasks.filter(t => t.priority === 'high').length, medium: tasks.filter(t => t.priority === 'medium').length, low: tasks.filter(t => t.priority === 'low').length }
    return { total, overdue, avgReviewHrs, topModule: topModule?.[0] || '—', byPriority }
  }, [tasks])

  const filteredTasks = useMemo(() => {
    let result = [...tasks]
    if (filterModule) result = result.filter(t => t.module === filterModule)
    if (filterAssignee) result = result.filter(t => t.assigned_to === filterAssignee)
    if (filterPriority) result = result.filter(t => t.priority === filterPriority)
    result.sort((a, b) => {
      if (sortBy === 'oldest') return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
      if (sortBy === 'newest') return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      const pri: Record<string, number> = { high: 0, medium: 1, low: 2 }
      return (pri[a.priority] ?? 1) - (pri[b.priority] ?? 1)
    })
    return result
  }, [tasks, filterModule, filterAssignee, filterPriority, sortBy])

  const uniqueModules = useMemo(() => [...new Set(tasks.map(t => t.module).filter((t): t is string => !!t))], [tasks])
  const uniqueAssignees = useMemo(() => [...new Set(tasks.map(t => t.assigned_to).filter((t): t is string => !!t))], [tasks])

  async function handleReview(taskId: string, approve: boolean) {
    try {
      await reviewTask(taskId, { approve, feedback: reviewFeedback.trim() ? { message: reviewFeedback.trim() } : undefined })
      setReviewFeedback(''); setSelectedTask(null); await fetchTasks()
      toast.success(approve ? 'Approved' : 'Changes requested')
    } catch (e: any) { toast.error('Review failed', e.message) }
  }

  async function handleApprove(taskId: string) {
    try {
      await approveTask(taskId, reviewFeedback.trim() ? { message: reviewFeedback.trim() } : undefined)
      setReviewFeedback(''); setSelectedTask(null); await fetchTasks()
      toast.success('Approved')
    } catch (e: any) { toast.error('Approve failed', e.message) }
  }

  return (
    <PageTransition>
      <div className="w-full min-h-[calc(100vh-4rem)] p-4 sm:p-6 font-body text-[#FDFBF8] max-w-full overflow-x-hidden">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <GradientHeading as="h1">Review Queue</GradientHeading>
            <p className="text-[#FDFBF8]/40 text-sm mt-1">Review, approve, and manage submissions from your team</p>
          </div>
          <select value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}
            className="bg-[#120D0A] border border-[#FDFBF8]/8 text-[#FDFBF8]/70 text-sm rounded-lg px-3 py-2 outline-none focus:border-[#FF8C00]/40">
            {teams.map((t: any) => <option key={t.team_id} value={t.team_id}>{t.name}</option>)}
          </select>
        </div>

        {/* Analytics bar */}
        <motion.div variants={containerVariants} initial="hidden" animate="visible"
          className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Pending Reviews', value: analytics.total, color: 'text-yellow-400', sub: 'Awaiting action' },
            { label: 'Overdue (>24h)', value: analytics.overdue, color: 'text-red-400', sub: 'SLA breached' },
            { label: 'Avg Review Time', value: `${analytics.avgReviewHrs}h`, color: 'text-[#4DA8DA]', sub: 'Mean turnaround' },
            { label: 'Top Module', value: analytics.topModule, color: 'text-[#FF8C00]', sub: 'Most submissions' },
            { label: 'High Priority', value: analytics.byPriority.high, color: 'text-red-400', sub: 'Needs immediate attention' },
          ].map((s) => (
            <motion.div key={s.label} variants={itemVariants}>
              <CardSpotlight className="p-4" color="rgba(255,140,0,0.03)">
                <div className={cn('font-display text-2xl font-bold tracking-tight', s.color)}>{s.value}</div>
                <div className="text-[10px] text-[#FDFBF8]/35 uppercase tracking-wider mt-1">{s.label}</div>
                <div className="text-[10px] text-[#FDFBF8]/20 mt-0.5">{s.sub}</div>
              </CardSpotlight>
            </motion.div>
          ))}
        </motion.div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/8 border border-red-500/20 text-red-400 text-sm">{error}</div>
        )}

        {/* Filters */}
        <CardSpotlight className="p-4 mb-5" color="rgba(255,140,0,0.02)">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#FDFBF8]/30 uppercase tracking-wider font-semibold">Module</span>
              <select value={filterModule} onChange={(e) => setFilterModule(e.target.value)}
                className="bg-[#0D0906] border border-[#FDFBF8]/8 rounded-lg px-2.5 py-1.5 text-xs text-[#FDFBF8] outline-none focus:border-[#FF8C00]/40">
                <option value="">All</option>
                {uniqueModules.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#FDFBF8]/30 uppercase tracking-wider font-semibold">Assignee</span>
              <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)}
                className="bg-[#0D0906] border border-[#FDFBF8]/8 rounded-lg px-2.5 py-1.5 text-xs text-[#FDFBF8] outline-none focus:border-[#FF8C00]/40">
                <option value="">All</option>
                {uniqueAssignees.map(a => <option key={a} value={a}>{a.slice(0, 12)}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#FDFBF8]/30 uppercase tracking-wider font-semibold">Priority</span>
              <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}
                className="bg-[#0D0906] border border-[#FDFBF8]/8 rounded-lg px-2.5 py-1.5 text-xs text-[#FDFBF8] outline-none focus:border-[#FF8C00]/40">
                <option value="">All</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#FDFBF8]/30 uppercase tracking-wider font-semibold">Sort</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-[#0D0906] border border-[#FDFBF8]/8 rounded-lg px-2.5 py-1.5 text-xs text-[#FDFBF8] outline-none focus:border-[#FF8C00]/40">
                <option value="oldest">Oldest First (SLA)</option>
                <option value="newest">Newest First</option>
                <option value="priority">Priority</option>
              </select>
            </div>
            <span className="text-[10px] text-[#FDFBF8]/25 ml-auto">{filteredTasks.length} item{filteredTasks.length !== 1 ? 's' : ''}</span>
          </div>
        </CardSpotlight>

        {/* Review list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-[#0D0906] border border-[#FDFBF8]/5 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredTasks.length === 0 ? (
          <CardSpotlight className="py-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-[#FDFBF8]/40 text-sm">All caught up! No pending reviews.</p>
            <p className="text-[#FDFBF8]/20 text-xs mt-1">New submissions will appear here automatically</p>
          </CardSpotlight>
        ) : (
          <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-2">
            {filteredTasks.map((task) => {
              const hrs = hoursSince(task.updated_at)
              const sla = slaStatus(hrs)
              return (
                <motion.div key={task.task_id} variants={itemVariants}>
                  <div onClick={() => setSelectedTask(task)} className="cursor-pointer">
                    <CardSpotlight
                      className={cn(
                        'p-4 transition-all hover:border-[#FDFBF8]/12',
                        task.state === 'approved' && 'border-green-500/20',
                        hrs > 24 && 'border-red-500/15',
                      )}
                    >
                      <div className="flex items-start gap-4">
                      {/* SLA indicator */}
                      <div className="flex flex-col items-center gap-1 min-w-[48px] pt-0.5">
                        <span className={cn('w-2.5 h-2.5 rounded-full', sla.dot)} />
                        <span className={cn('text-[9px] font-mono font-bold', sla.color)}>
                          {hrs > 24 ? `${Math.floor(hrs / 24)}d` : `${Math.floor(hrs)}h`}
                        </span>
                        <span className={cn('text-[8px] uppercase tracking-wider', sla.color)}>{sla.label}</span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <StatusBadge state={task.state} />
                          <span className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize',
                            task.priority === 'high' ? 'border-red-500/30 text-red-400' :
                            task.priority === 'medium' ? 'border-[#FF8C00]/30 text-[#FF8C00]' :
                            'border-green-500/30 text-green-400'
                          )}>{task.priority}</span>
                        </div>
                        <h3 className="text-sm font-medium text-[#FDFBF8] truncate">{task.title}</h3>
                        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-[#FDFBF8]/40">
                          {task.module && <span className="font-mono">Module: {task.module}</span>}
                          {task.assigned_to && <span>by {task.assigned_to.slice(0, 10)}</span>}
                          {task.pr_url && (
                            <a href={task.pr_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                              className="text-[#4DA8DA] hover:underline">View PR →</a>
                          )}
                        </div>
                      </div>

                      {/* Quick actions */}
                      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => { setSelectedTask(task); handleReview(task.task_id, true) }}
                          className="px-2.5 py-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 text-[10px] font-bold transition-colors"
                          title="Approve">
                          ✓
                        </button>
                        <button
                          onClick={() => { setSelectedTask(task); setReviewFeedback(''); handleApprove(task.task_id) }}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 text-[10px] font-bold transition-colors"
                          title="Full Approve">
                          ✓✓
                        </button>
                      </div>
                    </div>
                  </CardSpotlight>
                  </div>
                </motion.div>
              )
            })}
          </motion.div>
        )}

        {/* Detail modal */}
        {selectedTask && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setSelectedTask(null)}>
            <div className="bg-[#120D0A] border border-[#FDFBF8]/10 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto mx-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-5 border-b border-[#FDFBF8]/5">
                <div className="flex items-center gap-2">
                  <StatusBadge state={selectedTask.state} />
                  <span className={cn('text-[10px] px-2 py-0.5 rounded border font-medium capitalize',
                    selectedTask.priority === 'high' ? 'border-red-500/30 text-red-400' :
                    selectedTask.priority === 'medium' ? 'border-[#FF8C00]/30 text-[#FF8C00]' :
                    'border-green-500/30 text-green-400')}>{selectedTask.priority}</span>
                </div>
                <button onClick={() => setSelectedTask(null)} className="text-[#FDFBF8]/30 hover:text-[#FDFBF8]">✕</button>
              </div>
              <div className="p-5 space-y-4">
                <h2 className="font-display text-base font-bold text-[#FDFBF8]">{selectedTask.title}</h2>
                {selectedTask.description && (
                  <p className="text-sm text-[#FDFBF8]/50 leading-relaxed">{selectedTask.description}</p>
                )}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {selectedTask.module && (
                    <div className="bg-[#0D0906] rounded-lg p-3 border border-[#FDFBF8]/5">
                      <div className="text-[10px] text-[#FDFBF8]/30 uppercase tracking-widest mb-1">Module</div>
                      <div className="text-[#FF8C00] font-mono">{selectedTask.module}</div>
                    </div>
                  )}
                  {selectedTask.assigned_to && (
                    <div className="bg-[#0D0906] rounded-lg p-3 border border-[#FDFBF8]/5">
                      <div className="text-[10px] text-[#FDFBF8]/30 uppercase tracking-widest mb-1">Assignee</div>
                      <div className="text-[#FDFBF8]/80">{selectedTask.assigned_to}</div>
                    </div>
                  )}
                  {selectedTask.pr_url && (
                    <div className="bg-[#0D0906] rounded-lg p-3 border border-[#FDFBF8]/5 col-span-2">
                      <div className="text-[10px] text-[#FDFBF8]/30 uppercase tracking-widest mb-1">PR URL</div>
                      <a href={selectedTask.pr_url} target="_blank" rel="noreferrer"
                        className="text-[#4DA8DA] font-mono text-[11px] break-all hover:underline">{selectedTask.pr_url}</a>
                    </div>
                  )}
                </div>

                {/* Review actions */}
                <div className="border-t border-[#FDFBF8]/5 pt-4 space-y-3">
                  <textarea value={reviewFeedback} onChange={(e) => setReviewFeedback(e.target.value)}
                    placeholder="Add review feedback…" rows={3}
                    className="w-full bg-[#0D0906] border border-[#FDFBF8]/8 rounded-lg px-3 py-2 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/25 outline-none focus:border-[#FF8C00]/40 resize-none" />
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => handleReview(selectedTask.task_id, false)}
                      className="bg-red-500/80 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                      Request Changes
                    </button>
                    <button onClick={() => handleReview(selectedTask.task_id, true)}
                      className="bg-yellow-500 hover:bg-yellow-600 text-[#3D1C00] px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                      Route to Product
                    </button>
                    <button onClick={() => handleApprove(selectedTask.task_id)}
                      className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                      ✓ Approve
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  )
}
