import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../lib/utils'
import {
  createTask, listTasks, assignTask, startTask, submitTask, reviewTask,
  approveTask, completeTask, cancelTask, deleteTask, getTeamProgress,
  listTeams, getTeamModulePermissions,
  type WorkflowTask, type TeamProgress,
} from '../lib/api'
import { PageHeader } from '../components/ui/page-header'
import { StatCard } from '../components/ui/stat-card'
import { EmptyState } from '../components/ui/empty-state'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import StatusBadge from '../components/ui/status-badge'
import PageTransition from '../components/ui/page-transition'
import Pagination from '../components/ui/Pagination'
import { useToast } from '../context/ToastContext'
import { TasksPageSkeleton } from '../components/ui/Skeleton'
import {
  Plus, X, Trash, MagnifyingGlass, Check, ArrowRight,
  ListBullets, SquaresFour, Star,
  Lock, ListChecks, UserCircle
} from '@phosphor-icons/react'

const PRIORITY_DOTS: Record<string, string> = {
  low: 'bg-green-500', medium: 'bg-accent-primary', high: 'bg-red-400', urgent: 'bg-red-500',
}

const BOARD_COLUMNS = [
  { state: 'pending',        label: 'Pending',   dot: 'bg-text-tertiary/50' },
  { state: 'assigned',       label: 'Assigned',  dot: 'bg-blue-400' },
  { state: 'in_progress',    label: 'In Prog.',  dot: 'bg-accent-primary' },
  { state: 'submitted',      label: 'Submitted', dot: 'bg-purple-400' },
  { state: 'under_review',   label: 'Review',    dot: 'bg-yellow-400' },
  { state: 'needs_changes',  label: 'Changes',   dot: 'bg-red-400' },
  { state: 'product_review', label: 'Product',   dot: 'bg-pink-400' },
  { state: 'approved',       label: 'Approved',  dot: 'bg-green-400' },
  { state: 'completed',      label: 'Done',      dot: 'bg-green-500' },
]

const containerVariants = {
  hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 },
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] uppercase tracking-widest text-text-tertiary font-semibold mb-1.5 block">{children}</label>
}

function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input className={cn('w-full bg-bg-primary border border-border rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary/30 outline-none focus:border-accent-primary/40 transition-colors', className)} {...props} />
  )
}

function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={cn('w-full bg-bg-primary border border-border rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary/30 outline-none focus:border-accent-primary/40 resize-none transition-colors', className)} {...props} />
  )
}

export default function TasksPage() {
  const toast = useToast()
  const [tasks, setTasks] = useState<WorkflowTask[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [selectedTeam, setSelectedTeam] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [view, setView] = useState<'board' | 'list'>('board')
  const [progress, setProgress] = useState<TeamProgress | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20

  const [formTitle, setFormTitle] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formModule, setFormModule] = useState('')
  const [formPriority, setFormPriority] = useState('medium')
  const [formAssignee, setFormAssignee] = useState('')
  const [formRepoUrl, setFormRepoUrl] = useState('')
  const [formBranch, setFormBranch] = useState('')
  const [formUnlockModules, setFormUnlockModules] = useState('')
  const [formEstHours, setFormEstHours] = useState('')
  const [creating, setCreating] = useState(false)

  const [moduleAccessMap, setModuleAccessMap] = useState<Record<string, Set<string>>>({})
  const [selectedTask, setSelectedTask] = useState<WorkflowTask | null>(null)
  const [prUrlInput, setPrUrlInput] = useState('')
  const [reviewFeedback, setReviewFeedback] = useState('')

  const fetchTeams = useCallback(async () => {
    try { const data = await listTeams('current-user'); setTeams(data.teams || []); if (data.teams?.length > 0 && !selectedTeam) setSelectedTeam(data.teams[0].team_id) } catch { /* ignore */ }
  }, [])

  const fetchTasks = useCallback(async () => {
    if (!selectedTeam) return
    setLoading(true); setError('')
    try { const { tasks = [] } = await listTasks({ team_id: selectedTeam }) as { tasks: WorkflowTask[] }; setTasks(tasks) }
    catch (e: any) { setError(e.message || 'Failed to load tasks') }
    setLoading(false)
  }, [selectedTeam])

  const fetchProgress = useCallback(async () => {
    if (!selectedTeam) return
    try { setProgress(await getTeamProgress(selectedTeam)) } catch { /* ignore */ }
  }, [selectedTeam])

  const fetchModulePermissions = useCallback(async () => {
    if (!selectedTeam) return
    try {
      const { permissions = [] } = await getTeamModulePermissions(selectedTeam)
      const map: Record<string, Set<string>> = {}
      for (const perm of permissions) { if (!map[perm.user_id]) map[perm.user_id] = new Set(); map[perm.user_id].add(perm.module) }
      setModuleAccessMap(map)
    } catch { /* ignore */ }
  }, [selectedTeam])

  useEffect(() => { fetchTeams() }, [])
  useEffect(() => { fetchTasks(); fetchProgress(); fetchModulePermissions() }, [selectedTeam, fetchTasks, fetchProgress, fetchModulePermissions])

  async function handleCreateTask() {
    if (!formTitle.trim() || !selectedTeam) return
    setCreating(true); setError('')
    try {
      await createTask({
        team_id: selectedTeam, title: formTitle.trim(), description: formDesc.trim() || undefined,
        module: formModule.trim() || undefined, priority: formPriority as any,
        assigned_to: formAssignee.trim() || undefined, repo_url: formRepoUrl.trim() || undefined,
        branch: formBranch.trim() || undefined,
        unlock_modules: formUnlockModules.trim() ? formUnlockModules.split(',').map((s) => s.trim()) : undefined,
        estimated_hours: formEstHours ? parseFloat(formEstHours) : undefined,
      })
      setShowCreate(false); resetForm(); await fetchTasks(); await fetchProgress()
      toast.success('Task created', formTitle.trim())
    } catch (e: any) { setError(e.message || 'Failed to create task'); toast.error('Failed to create task') }
    setCreating(false)
  }

  function resetForm() {
    setFormTitle(''); setFormDesc(''); setFormModule(''); setFormPriority('medium')
    setFormAssignee(''); setFormRepoUrl(''); setFormBranch(''); setFormUnlockModules(''); setFormEstHours('')
  }

  async function handleAssign(taskId: string, id: string) {
    try { await assignTask(taskId, id); await fetchTasks(); toast.success('Task assigned') }
    catch (e: any) { setError(e.message); toast.error('Failed to assign task') }
  }
  async function handleStart(taskId: string) {
    try { await startTask(taskId); await fetchTasks(); toast.info('Task started') }
    catch (e: any) { setError(e.message); toast.error('Failed to start task') }
  }
  async function handleSubmit(taskId: string, url: string) {
    if (!url.trim()) return
    try { await submitTask(taskId, url.trim()); setPrUrlInput(''); await fetchTasks(); toast.success('Task submitted for review') }
    catch (e: any) { setError(e.message); toast.error('Failed to submit task') }
  }
  async function handleReview(taskId: string, approve: boolean) {
    try {
      await reviewTask(taskId, { approve, feedback: reviewFeedback.trim() ? { message: reviewFeedback.trim() } : undefined })
      setReviewFeedback(''); setSelectedTask(null); await fetchTasks(); await fetchProgress()
      toast.success('Task reviewed', approve ? 'Approved' : 'Changes requested')
    } catch (e: any) { setError(e.message); toast.error('Failed to review task') }
  }
  async function handleApprove(taskId: string) {
    try {
      await approveTask(taskId, reviewFeedback.trim() ? { message: reviewFeedback.trim() } : undefined)
      setReviewFeedback(''); setSelectedTask(null); await fetchTasks(); await fetchProgress()
      toast.success('Task approved')
    } catch (e: any) { setError(e.message); toast.error('Failed to approve task') }
  }
  async function handleComplete(taskId: string) {
    try { await completeTask(taskId); await fetchTasks(); await fetchProgress(); toast.success('Task completed') }
    catch (e: any) { setError(e.message); toast.error('Failed to complete task') }
  }
  async function handleCancel(taskId: string) {
    try { await cancelTask(taskId); setSelectedTask(null); await fetchTasks(); await fetchProgress(); toast.info('Task cancelled') }
    catch (e: any) { setError(e.message); toast.error('Failed to cancel task') }
  }
  async function handleDelete(taskId: string) {
    if (!confirm('Delete this task permanently?')) return
    try { await deleteTask(taskId); setSelectedTask(null); await fetchTasks(); toast.info('Task deleted') }
    catch { toast.error('Failed to delete task') }
  }

  const filteredTasks = tasks.filter((t) => {
    if (!filter) return true
    const q = filter.toLowerCase()
    return t.title.toLowerCase().includes(q) || t.state.toLowerCase().includes(q) ||
      (t.assigned_to && t.assigned_to.toLowerCase().includes(q)) || (t.module && t.module.toLowerCase().includes(q))
  })
  const totalPages = Math.ceil(filteredTasks.length / PAGE_SIZE)
  const paginatedTasks = filteredTasks.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Reset page when filter changes
  useEffect(() => { setPage(0) }, [filter])

  return (
    <PageTransition>
      <div className="w-full min-h-[calc(100vh-4rem)] p-4 sm:p-6 font-body text-text-primary">
        <PageHeader
          title="Tasks"
          subtitle="Senior → Trainee workflow — assign, work, review, approve, unlock"
          actions={
            <>
              <select value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}
                className="bg-bg-primary border border-border text-text-secondary text-sm rounded-xl px-3 py-1.5 outline-none focus:border-accent-primary/40 transition-colors">
                <option value="">Select team…</option>
                {teams.map((t: any) => (<option key={t.team_id || t.id} value={t.team_id || t.id}>{t.name}</option>))}
              </select>
              <div className="flex bg-bg-primary border border-border rounded-xl overflow-hidden p-0.5 gap-0.5">
                {(['board', 'list'] as const).map((v) => (
                  <button key={v} onClick={() => setView(v)}
                    className={cn('px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 capitalize',
                      view === v ? 'bg-bg-tertiary text-accent-primary shadow-sm' : 'text-text-tertiary hover:text-text-secondary')}>
                    {v === 'board' ? <SquaresFour className="w-3.5 h-3.5" weight={view === v ? 'fill' : 'regular'} /> : <ListBullets className="w-3.5 h-3.5" weight={view === v ? 'fill' : 'regular'} />}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowCreate(!showCreate)}
                className="flex items-center gap-1.5 bg-accent-primary hover:bg-accent-primary/90 text-white px-4 py-1.5 rounded-xl text-sm font-bold transition-colors">
                <Plus className="w-4 h-4" weight="bold" />
                New Task
              </button>
            </>
          }
        />

        {progress && (
          <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            {[
              { label: 'Total', value: progress.total, color: 'text-text-primary', accent: undefined },
              { label: 'Completed', value: progress.completed, color: 'text-green-400', accent: '#22c55e' },
              { label: 'In Progress', value: progress.in_progress, color: 'text-accent-primary', accent: '#F59E0B' },
              { label: 'Pending Rev.', value: progress.pending_review, color: 'text-yellow-400', accent: '#eab308' },
              { label: 'Blocked', value: progress.blocked, color: 'text-red-400', accent: '#ef4444' },
            ].map((stat) => (
              <motion.div key={stat.label} variants={itemVariants}>
                <CardSpotlight>
                  <StatCard label={stat.label} value={stat.value} color={stat.color} accentColor={stat.accent} />
                </CardSpotlight>
              </motion.div>
            ))}
          </motion.div>
        )}

        {error && <div className="mb-5 px-4 py-3 rounded-xl bg-red-500/8 border border-red-500/20 text-red-400 text-sm">{error}</div>}

        {showCreate && (
          <CardSpotlight className="mb-6">
            <div className="p-6 relative">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-primary/40 to-transparent" />
              <div className="flex items-center gap-2 mb-4">
                <Plus className="w-4 h-4 text-accent-primary" weight="bold" />
                <GradientHeading as="h3">Create New Task</GradientHeading>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="md:col-span-2">
                  <FieldLabel>Title *</FieldLabel>
                  <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="e.g., Implement user authentication module" />
                </div>
                <div>
                  <FieldLabel>Priority</FieldLabel>
                  <select value={formPriority} onChange={(e) => setFormPriority(e.target.value)}
                    className="w-full bg-bg-primary border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary/40">
                    {['low', 'medium', 'high'].map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div className="mb-4">
                <FieldLabel>Description</FieldLabel>
                <Textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Describe the task in detail…" rows={3} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
                {[
                  { label: 'Module', val: formModule, set: setFormModule, ph: 'e.g., auth' },
                  { label: 'Assignee', val: formAssignee, set: setFormAssignee, ph: 'User ID' },
                  { label: 'Repo URL', val: formRepoUrl, set: setFormRepoUrl, ph: 'https://github.com/…' },
                  { label: 'Unlock Modules', val: formUnlockModules, set: setFormUnlockModules, ph: 'auth, api, payments' },
                ].map(({ label, val, set, ph }) => (
                  <div key={label}>
                    <FieldLabel>{label}</FieldLabel>
                    <Input value={val} onChange={(e) => set(e.target.value)} placeholder={ph} />
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => { setShowCreate(false); resetForm() }} className="px-4 py-2 text-sm text-text-tertiary hover:text-text-secondary transition-colors">Cancel</button>
                <button onClick={handleCreateTask} disabled={creating || !formTitle.trim()}
                  className="bg-accent-primary hover:bg-accent-primary/90 text-white px-6 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-40">
                  {creating ? 'Creating…' : 'Create Task'}
                </button>
              </div>
            </div>
          </CardSpotlight>
        )}

        <div className="relative mb-5">
          <MagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary/50 pointer-events-none" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by title, state, or assignee…"
            className="w-full bg-bg-primary border border-border text-text-primary text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none focus:border-accent-primary/40 placeholder:text-text-tertiary/30 transition-colors" />
        </div>

        {loading && <TasksPageSkeleton />}

        {!loading && view === 'board' && (
          <div className="overflow-x-auto pb-4">
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="flex gap-3 min-w-max">
              {BOARD_COLUMNS.map((col) => {
                const colTasks = filteredTasks.filter((t) => t.state === col.state)
                return (
                  <motion.div key={col.state} className="w-60 shrink-0" variants={itemVariants}>
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <span className={cn('w-1.5 h-1.5 rounded-full', col.dot)} />
                      <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider flex-1">{col.label}</h3>
                      <span className="text-[10px] text-text-tertiary/40 font-mono tabular-nums">{colTasks.length}</span>
                    </div>
                    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-2 min-h-[120px]">
                      {colTasks.length > 0 ? colTasks.map((task) => (
                        <motion.div key={task.task_id} variants={itemVariants}>
                          <CardSpotlight>
                            <div onClick={() => setSelectedTask(task)} className="p-3.5 cursor-pointer">
                              <div className="flex items-center gap-2 mb-2.5">
                                <StatusBadge state={task.state} className="flex-1" />
                                <span className={cn('w-1.5 h-1.5 rounded-full', PRIORITY_DOTS[task.priority] ?? PRIORITY_DOTS.medium)} />
                              </div>
                              <h4 className="text-sm font-display font-medium text-text-secondary hover:text-text-primary transition-colors mb-2 line-clamp-2 leading-snug">
                                {task.title}
                              </h4>
                              <div className="flex items-center gap-2 flex-wrap">
                                {task.module && (
                                  <span className="text-[10px] text-accent-primary/60 font-mono bg-accent-primary/5 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                                    {task.assigned_to && moduleAccessMap[task.assigned_to]?.has(task.module) ? (
                                      <Lock className="w-2.5 h-2.5 text-green-400" weight="fill" />
                                    ) : null}
                                    {task.module}
                                  </span>
                                )}
                                {task.estimated_hours && <span className="text-[10px] text-text-tertiary font-mono">~{task.estimated_hours}h</span>}
                              </div>
                            </div>
                          </CardSpotlight>
                        </motion.div>
                      )) : (
                        <motion.div variants={itemVariants}>
                          <div className="border border-dashed border-border rounded-xl py-8 text-center">
                            <p className="text-[10px] text-text-tertiary/30">Empty</p>
                          </div>
                        </motion.div>
                      )}
                    </motion.div>
                  </motion.div>
                )
              })}
            </motion.div>
          </div>
        )}

        {!loading && view === 'list' && (
          <CardSpotlight>
            <div>
              {filteredTasks.length === 0 ? (
                <EmptyState
                  title={filter ? 'No tasks match your filter' : 'No tasks yet'}
                  description={filter ? undefined : 'Create a task to get started'}
                  icon={<ListChecks className="w-8 h-8" weight="thin" />}
                />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <div className="grid grid-cols-[120px_1fr_100px_80px_64px] gap-4 px-5 py-2.5 border-b border-border min-w-[500px]">
                      {['Status', 'Task', 'Assignee', 'Priority', 'Est.'].map((h) => (
                        <span key={h} className="text-[10px] uppercase tracking-widest text-text-tertiary font-semibold">{h}</span>
                      ))}
                    </div>
                    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="divide-y divide-border/60">
                      {paginatedTasks.map((task) => (
                        <motion.div key={task.task_id} variants={itemVariants}>
                          <div onClick={() => setSelectedTask(task)}
                            className="grid grid-cols-[120px_1fr_100px_80px_64px] gap-4 items-center px-5 py-3.5 hover:bg-bg-tertiary/30 cursor-pointer transition-colors group min-w-[500px]">
                            <StatusBadge state={task.state} />
                            <div className="min-w-0">
                              <div className="text-sm text-text-secondary group-hover:text-text-primary truncate font-medium transition-colors">{task.title}</div>
                              {task.module && <div className="text-[10px] text-accent-primary/50 font-mono mt-0.5">{task.module}</div>}
                            </div>
                            <div className="text-xs text-text-tertiary truncate flex items-center gap-1">
                              <UserCircle className="w-3 h-3" weight="fill" />
                              {task.assigned_to || '—'}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className={cn('w-1.5 h-1.5 rounded-full', PRIORITY_DOTS[task.priority] ?? PRIORITY_DOTS.medium)} />
                              <span className="text-[10px] font-medium capitalize text-text-tertiary">{task.priority}</span>
                            </div>
                            <span className="text-[11px] text-text-tertiary font-mono">{task.estimated_hours ? `~${task.estimated_hours}h` : '—'}</span>
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                  </div>
                  {totalPages > 1 && (
                    <div className="flex justify-end px-5 py-3 border-t border-border">
                      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
                    </div>
                  )}
                </>
              )}
            </div>
          </CardSpotlight>
        )}

        {/* Task Detail Modal */}
        {selectedTask && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setSelectedTask(null)}>
            <div className="bg-bg-primary border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto mx-4 shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}>
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-primary/30 to-transparent rounded-t-2xl" />

              <div className="flex items-center justify-between p-6 border-b border-border">
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge state={selectedTask.state} />
                  <span className="flex items-center gap-1"><span className={cn('w-1.5 h-1.5 rounded-full', PRIORITY_DOTS[selectedTask.priority] ?? PRIORITY_DOTS.medium)} /><span className="text-[10px] font-medium capitalize text-text-tertiary">{selectedTask.priority}</span></span>
                </div>
                <button onClick={() => setSelectedTask(null)} className="text-text-tertiary hover:text-text-primary transition-colors">
                  <X className="w-5 h-5" weight="bold" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                <div>
                  <h2 className="font-display text-lg font-bold text-text-primary mb-1.5">{selectedTask.title}</h2>
                  {selectedTask.description && <p className="text-sm text-text-secondary leading-relaxed">{selectedTask.description}</p>}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  {selectedTask.module && (
                    <div className="bg-bg-secondary rounded-xl p-3 border border-border">
                      <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-1">Module</div>
                      <div className="text-accent-primary font-mono">{selectedTask.module}</div>
                    </div>
                  )}
                  {selectedTask.assigned_to && (
                    <div className="bg-bg-secondary rounded-xl p-3 border border-border">
                      <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-1">Assigned To</div>
                      <div className="text-text-primary flex items-center gap-1.5">
                        <UserCircle className="w-3.5 h-3.5" weight="fill" />
                        {selectedTask.assigned_to}
                      </div>
                    </div>
                  )}
                  {selectedTask.estimated_hours && (
                    <div className="bg-bg-secondary rounded-xl p-3 border border-border">
                      <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-1">Est. Time</div>
                      <div className="text-text-primary">{selectedTask.estimated_hours}h</div>
                    </div>
                  )}
                  {selectedTask.repo_url && (
                    <div className="bg-bg-secondary rounded-xl p-3 border border-border md:col-span-2">
                      <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-1">Repository</div>
                      <div className="text-blue-400 font-mono text-[11px] break-all">{selectedTask.repo_url}</div>
                    </div>
                  )}
                  {selectedTask.pr_url && (
                    <div className="bg-bg-secondary rounded-xl p-3 border border-border md:col-span-2">
                      <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-1">PR URL</div>
                      <a href={selectedTask.pr_url} target="_blank" rel="noreferrer" className="text-blue-400 font-mono text-[11px] break-all hover:underline">{selectedTask.pr_url}</a>
                    </div>
                  )}
                  {selectedTask.unlock_modules && selectedTask.unlock_modules.length > 0 && (
                    <div className="bg-bg-secondary rounded-xl p-3 border border-border md:col-span-3">
                      <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-2">Unlocks Modules</div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedTask.unlock_modules.map((m, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-lg bg-green-500/10 text-green-400 text-[10px] font-mono border border-green-500/15">{m}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedTask.assigned_to && moduleAccessMap[selectedTask.assigned_to] && (
                    <div className="bg-bg-secondary rounded-xl p-3 border border-border md:col-span-3">
                      <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-2">Module Access</div>
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from(moduleAccessMap[selectedTask.assigned_to]).map((m, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-lg bg-green-500/10 text-green-400 text-[10px] font-mono border border-green-500/20 inline-flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" weight="fill" />{m}
                          </span>
                        ))}
                        {moduleAccessMap[selectedTask.assigned_to].size === 0 && (
                          <span className="text-[10px] text-text-tertiary italic">No modules unlocked yet</span>
                        )}
                      </div>
                    </div>
                  )}
                  {selectedTask.review_feedback && (
                    <div className="bg-bg-secondary rounded-xl p-3 border border-border md:col-span-3">
                      <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-2">Review Feedback</div>
                      <div className="text-xs text-text-secondary leading-relaxed">{typeof selectedTask.review_feedback === 'string' ? selectedTask.review_feedback : JSON.stringify(selectedTask.review_feedback)}</div>
                    </div>
                  )}
                  {selectedTask.ai_review && (
                    <div className="bg-bg-secondary rounded-xl p-4 border border-blue-500/20 md:col-span-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] text-blue-400 uppercase tracking-widest font-semibold flex items-center gap-1.5">
                          <Star className="w-3 h-3" weight="fill" /> AI Code Review
                        </div>
                        <div className={cn('text-sm font-bold font-mono px-2.5 py-1 rounded-lg',
                          selectedTask.ai_review.score >= 80 ? 'bg-green-500/15 text-green-400' :
                          selectedTask.ai_review.score >= 60 ? 'bg-accent-primary/15 text-accent-primary' : 'bg-red-500/15 text-red-400')}>
                          {selectedTask.ai_review.score}/100
                        </div>
                      </div>
                      <p className="text-xs text-text-secondary leading-relaxed">{selectedTask.ai_review.summary}</p>
                      {selectedTask.ai_review.issues.length > 0 && (
                        <div>
                          <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-1.5">Issues ({selectedTask.ai_review.issues.length})</div>
                          <div className="space-y-1.5">
                            {selectedTask.ai_review.issues.map((issue, i) => (
                              <div key={i} className={cn('text-[11px] px-2.5 py-2 rounded-lg border flex items-start gap-2',
                                issue.severity === 'error' ? 'bg-red-500/5 border-red-500/15 text-red-300' :
                                issue.severity === 'warning' ? 'bg-accent-primary/5 border-accent-primary/15 text-accent-primary' : 'bg-bg-tertiary/50 border-border text-text-tertiary')}>
                                <span className="font-mono shrink-0 text-[10px] mt-0.5">{issue.file}:{issue.line}</span>
                                <span className="flex-1">{issue.message}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedTask.ai_review.positives.length > 0 && (
                        <div>
                          <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-1.5">Positives</div>
                          <div className="space-y-1">
                            {selectedTask.ai_review.positives.map((p, i) => (
                              <div key={i} className="text-[11px] text-green-400/80 flex items-start gap-1.5">
                                <Check className="w-3 h-3 text-green-500 mt-0.5" weight="bold" />{p}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedTask.ai_review.recommendations.length > 0 && (
                        <div>
                          <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-1.5">Recommendations</div>
                          <div className="space-y-1">
                            {selectedTask.ai_review.recommendations.map((r, i) => (
                              <div key={i} className="text-[11px] text-text-secondary flex items-start gap-1.5">
                                <ArrowRight className="w-3 h-3 text-blue-400 mt-0.5" weight="bold" />{r}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="border-t border-border pt-4 space-y-3">
                  {selectedTask.state === 'pending' && (
                    <div className="flex gap-2">
                      <Input value={prUrlInput} onChange={(e) => setPrUrlInput(e.target.value)} placeholder="Enter user ID to assign…" className="flex-1" />
                      <button onClick={() => handleAssign(selectedTask.task_id, prUrlInput)} disabled={!prUrlInput.trim()}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-40">Assign</button>
                      <button onClick={() => handleCancel(selectedTask.task_id)} className="text-red-400/50 hover:text-red-400 text-sm px-3 transition-colors">Cancel</button>
                    </div>
                  )}
                  {selectedTask.state === 'assigned' && (
                    <div className="flex gap-2">
                      <button onClick={() => handleStart(selectedTask.task_id)} className="bg-accent-primary hover:bg-accent-primary/90 text-white px-6 py-2 rounded-xl text-sm font-bold transition-colors">Start Working</button>
                      <button onClick={() => handleCancel(selectedTask.task_id)} className="text-red-400/50 hover:text-red-400 text-sm px-3 transition-colors">Cancel</button>
                    </div>
                  )}
                  {selectedTask.state === 'in_progress' && (
                    <div className="flex gap-2">
                      <Input value={prUrlInput} onChange={(e) => setPrUrlInput(e.target.value)} placeholder="Paste PR URL…" className="flex-1" />
                      <button onClick={() => handleSubmit(selectedTask.task_id, prUrlInput)} disabled={!prUrlInput.trim()}
                        className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-40">Submit for Review</button>
                    </div>
                  )}
                  {(selectedTask.state === 'submitted' || selectedTask.state === 'under_review') && (
                    <div className="space-y-3">
                      <Textarea value={reviewFeedback} onChange={(e) => setReviewFeedback(e.target.value)} placeholder="Add review feedback…" rows={3} />
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => handleReview(selectedTask.task_id, false)} className="bg-red-500/80 hover:bg-red-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">Request Changes</button>
                        <button onClick={() => handleReview(selectedTask.task_id, true)} className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">Route to Product</button>
                        <button onClick={() => handleApprove(selectedTask.task_id)} className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">Approve</button>
                        <button onClick={() => handleCancel(selectedTask.task_id)} className="text-red-400/50 hover:text-red-400 text-sm px-3 transition-colors">Cancel</button>
                      </div>
                    </div>
                  )}
                  {selectedTask.state === 'needs_changes' && (
                    <div className="flex gap-2">
                      <button onClick={() => handleStart(selectedTask.task_id)} className="bg-accent-primary hover:bg-accent-primary/90 text-white px-6 py-2 rounded-xl text-sm font-bold transition-colors">Resume Working</button>
                      <button onClick={() => handleCancel(selectedTask.task_id)} className="text-red-400/50 hover:text-red-400 text-sm px-3 transition-colors">Cancel</button>
                    </div>
                  )}
                  {selectedTask.state === 'product_review' && (
                    <div className="space-y-3">
                      <Textarea value={reviewFeedback} onChange={(e) => setReviewFeedback(e.target.value)} placeholder="Product sign-off notes…" rows={2} />
                      <div className="flex gap-2">
                        <button onClick={() => handleReview(selectedTask.task_id, false)} className="bg-red-500/80 hover:bg-red-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">Request Changes</button>
                        <button onClick={() => handleApprove(selectedTask.task_id)} className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">Approve & Sign Off</button>
                      </div>
                    </div>
                  )}
                  {selectedTask.state === 'approved' && (
                    <div className="flex gap-2">
                      <button onClick={() => handleComplete(selectedTask.task_id)} className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-xl text-sm font-bold transition-colors">
                        <Check className="w-4 h-4" weight="bold" /> Mark Completed & Unlock Modules
                      </button>
                      <button onClick={() => handleCancel(selectedTask.task_id)} className="text-red-400/50 hover:text-red-400 text-sm px-3 transition-colors">Cancel</button>
                    </div>
                  )}
                  {selectedTask.state === 'completed' && selectedTask.unlock_modules && selectedTask.unlock_modules.length > 0 && (
                    <div className="bg-green-500/5 border border-green-500/15 rounded-xl p-4">
                      <div className="text-green-400 text-sm font-semibold mb-2 flex items-center gap-1.5">
                        <Check className="w-4 h-4" weight="bold" /> Modules Unlocked
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedTask.unlock_modules.map((m, i) => (
                          <span key={i} className="px-2.5 py-1 rounded-lg bg-green-500/10 text-green-400 text-xs font-mono border border-green-500/20">{m}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {(selectedTask.state === 'completed' || selectedTask.state === 'cancelled') && (
                    <button onClick={() => handleDelete(selectedTask.task_id)}
                      className="text-red-400/40 hover:text-red-400 text-xs transition-colors flex items-center gap-1.5">
                      <Trash className="w-3.5 h-3.5" />
                      Delete Task
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  )
}
