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

const PRIORITY_COLORS: Record<string, string> = {
  low:    'border-green-500/30 text-green-400',
  medium: 'border-[#FF8C00]/30 text-[#FF8C00]',
  high:   'border-red-500/30 text-red-400',
  urgent: 'border-red-500 text-red-400',
}

const PRIORITY_DOTS: Record<string, string> = {
  low: 'bg-green-500', medium: 'bg-[#FF8C00]', high: 'bg-red-400', urgent: 'bg-red-500',
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] uppercase tracking-widest text-[#FDFBF8]/30 font-semibold mb-1.5 block">{children}</label>
}

function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn('w-full bg-[#0D0906] border border-[#FDFBF8]/8 rounded-lg px-3 py-2 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/25 outline-none focus:border-[#FF8C00]/40 transition-colors', className)}
      {...props}
    />
  )
}

function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn('w-full bg-[#0D0906] border border-[#FDFBF8]/8 rounded-lg px-3 py-2 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/25 outline-none focus:border-[#FF8C00]/40 resize-none transition-colors', className)}
      {...props}
    />
  )
}

const BOARD_COLUMNS = [
  { state: 'pending',        label: 'Pending',   dot: 'bg-[#FDFBF8]/20' },
  { state: 'assigned',       label: 'Assigned',  dot: 'bg-blue-400' },
  { state: 'in_progress',    label: 'In Prog.',  dot: 'bg-[#FF8C00]' },
  { state: 'submitted',      label: 'Submitted', dot: 'bg-purple-400' },
  { state: 'under_review',   label: 'Review',    dot: 'bg-yellow-400' },
  { state: 'needs_changes',  label: 'Changes',   dot: 'bg-red-400' },
  { state: 'product_review', label: 'Product',   dot: 'bg-pink-400' },
  { state: 'approved',       label: 'Approved',  dot: 'bg-green-400' },
  { state: 'completed',      label: 'Done',      dot: 'bg-green-500' },
]

export default function TasksPage() {
  const [tasks, setTasks] = useState<WorkflowTask[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [selectedTeam, setSelectedTeam] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [view, setView] = useState<'board' | 'list'>('board')
  const [progress, setProgress] = useState<TeamProgress | null>(null)
  const [showCreate, setShowCreate] = useState(false)

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
      setTasks(tasks)
    } catch (e: any) { setError(e.message || 'Failed to load tasks') }
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
      for (const perm of permissions) {
        if (!map[perm.user_id]) map[perm.user_id] = new Set()
        map[perm.user_id].add(perm.module)
      }
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
        team_id: selectedTeam, title: formTitle.trim(),
        description: formDesc.trim() || undefined,
        module: formModule.trim() || undefined,
        priority: formPriority as any,
        assigned_to: formAssignee.trim() || undefined,
        repo_url: formRepoUrl.trim() || undefined,
        branch: formBranch.trim() || undefined,
        unlock_modules: formUnlockModules.trim() ? formUnlockModules.split(',').map((s) => s.trim()) : undefined,
        estimated_hours: formEstHours ? parseFloat(formEstHours) : undefined,
      })
      setShowCreate(false); resetForm()
      await fetchTasks(); await fetchProgress()
    } catch (e: any) { setError(e.message || 'Failed to create task') }
    setCreating(false)
  }

  function resetForm() {
    setFormTitle(''); setFormDesc(''); setFormModule(''); setFormPriority('medium')
    setFormAssignee(''); setFormRepoUrl(''); setFormBranch(''); setFormUnlockModules(''); setFormEstHours('')
  }

  async function handleAssign(taskId: string, id: string) { try { await assignTask(taskId, id); await fetchTasks() } catch (e: any) { setError(e.message) } }
  async function handleStart(taskId: string) { try { await startTask(taskId); await fetchTasks() } catch (e: any) { setError(e.message) } }
  async function handleSubmit(taskId: string, url: string) {
    if (!url.trim()) return
    try { await submitTask(taskId, url.trim()); setPrUrlInput(''); await fetchTasks() } catch (e: any) { setError(e.message) }
  }
  async function handleReview(taskId: string, approve: boolean) {
    try {
      await reviewTask(taskId, { approve, feedback: reviewFeedback.trim() ? { message: reviewFeedback.trim() } : undefined })
      setReviewFeedback(''); setSelectedTask(null); await fetchTasks(); await fetchProgress()
    } catch (e: any) { setError(e.message) }
  }
  async function handleApprove(taskId: string) {
    try {
      await approveTask(taskId, reviewFeedback.trim() ? { message: reviewFeedback.trim() } : undefined)
      setReviewFeedback(''); setSelectedTask(null); await fetchTasks(); await fetchProgress()
    } catch (e: any) { setError(e.message) }
  }
  async function handleComplete(taskId: string) { try { await completeTask(taskId); await fetchTasks(); await fetchProgress() } catch (e: any) { setError(e.message) } }
  async function handleCancel(taskId: string) { try { await cancelTask(taskId); setSelectedTask(null); await fetchTasks(); await fetchProgress() } catch (e: any) { setError(e.message) } }

  const filteredTasks = tasks.filter((t) => {
    if (!filter) return true
    const q = filter.toLowerCase()
    return t.title.toLowerCase().includes(q) || t.state.toLowerCase().includes(q) ||
      (t.assigned_to && t.assigned_to.toLowerCase().includes(q)) ||
      (t.module && t.module.toLowerCase().includes(q))
  })

  return (
    <PageTransition>
      <div className="w-full min-h-[calc(100vh-4rem)] p-6 font-body text-[#FDFBF8]">
        <PageHeader
          title="Tasks"
          subtitle="Senior → Trainee workflow — assign, work, review, approve, unlock"
          actions={
            <>
              <select
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
                className="bg-[#120D0A] border border-[#FDFBF8]/8 text-[#FDFBF8]/70 text-sm rounded-lg px-3 py-1.5 outline-none focus:border-[#FF8C00]/40 transition-colors"
              >
                <option value="">Select team…</option>
                {teams.map((t: any) => (
                  <option key={t.team_id || t.id} value={t.team_id || t.id}>{t.name}</option>
                ))}
              </select>

              <div className="flex bg-[#120D0A] border border-[#FDFBF8]/8 rounded-lg overflow-hidden p-0.5 gap-0.5">
                {(['board', 'list'] as const).map((v) => (
                  <button key={v} onClick={() => setView(v)}
                    className={cn('px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 capitalize',
                      view === v ? 'bg-[#2A1D16] text-[#FF8C00] shadow-sm' : 'text-[#FDFBF8]/35 hover:text-[#FDFBF8]/60'
                    )}>{v}</button>
                ))}
              </div>

              <button onClick={() => setShowCreate(!showCreate)}
                className="flex items-center gap-1.5 bg-[#FFB347] hover:bg-[#FF8C00] text-[#3D1C00] px-4 py-1.5 rounded-lg text-sm font-bold transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                New Task
              </button>
            </>
          }
        />

        {progress && (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6"
          >
            <motion.div variants={itemVariants}>
              <CardSpotlight>
                <StatCard label="Total" value={progress.total} />
              </CardSpotlight>
            </motion.div>
            <motion.div variants={itemVariants}>
              <CardSpotlight>
                <StatCard label="Completed" value={progress.completed} color="text-green-400" accentColor="#22c55e" />
              </CardSpotlight>
            </motion.div>
            <motion.div variants={itemVariants}>
              <CardSpotlight>
                <StatCard label="In Progress" value={progress.in_progress} color="text-[#FF8C00]" accentColor="#FF8C00" />
              </CardSpotlight>
            </motion.div>
            <motion.div variants={itemVariants}>
              <CardSpotlight>
                <StatCard label="Pending Rev." value={progress.pending_review} color="text-yellow-400" accentColor="#eab308" />
              </CardSpotlight>
            </motion.div>
            <motion.div variants={itemVariants}>
              <CardSpotlight>
                <StatCard label="Blocked" value={progress.blocked} color="text-red-400" accentColor="#ef4444" />
              </CardSpotlight>
            </motion.div>
          </motion.div>
        )}

        {error && (
          <div className="mb-5 px-4 py-3 rounded-lg bg-red-500/8 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {showCreate && (
          <CardSpotlight className="mb-6">
            <div className="p-6 relative">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#FF8C00]/40 to-transparent" />
              <GradientHeading as="h3" className="mb-4">Create New Task</GradientHeading>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="md:col-span-2">
                  <FieldLabel>Title *</FieldLabel>
                  <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="e.g., Implement user authentication module" />
                </div>
                <div>
                  <FieldLabel>Priority</FieldLabel>
                  <select value={formPriority} onChange={(e) => setFormPriority(e.target.value)}
                    className="w-full bg-[#0D0906] border border-[#FDFBF8]/8 rounded-lg px-3 py-2 text-sm text-[#FDFBF8] outline-none focus:border-[#FF8C00]/40">
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
                <button onClick={() => { setShowCreate(false); resetForm() }}
                  className="px-4 py-2 text-sm text-[#FDFBF8]/40 hover:text-[#FDFBF8]/70 transition-colors">
                  Cancel
                </button>
                <button onClick={handleCreateTask} disabled={creating || !formTitle.trim()}
                  className="bg-[#FFB347] hover:bg-[#FF8C00] text-[#3D1C00] px-6 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-40">
                  {creating ? 'Creating…' : 'Create Task'}
                </button>
              </div>
            </div>
          </CardSpotlight>
        )}

        <div className="relative mb-5">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#FDFBF8]/25 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input value={filter} onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by title, state, or assignee…"
            className="w-full bg-[#120D0A] border border-[#FDFBF8]/8 text-[#FDFBF8] text-sm rounded-lg pl-10 pr-4 py-2.5 outline-none focus:border-[#FF8C00]/40 placeholder:text-[#FDFBF8]/25 transition-colors"
          />
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="relative w-8 h-8">
              <div className="absolute inset-0 rounded-full border-2 border-[#FF8C00]/10" />
              <svg className="w-8 h-8 animate-spin text-[#FF8C00] relative" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
            <span className="text-[10px] uppercase tracking-widest text-[#FDFBF8]/20 font-semibold">Loading tasks…</span>
          </div>
        )}

        {!loading && view === 'board' && (
          <div className="overflow-x-auto pb-4">
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="flex gap-3 min-w-max"
            >
              {BOARD_COLUMNS.map((col) => {
                const colTasks = filteredTasks.filter((t) => t.state === col.state)
                return (
                  <motion.div key={col.state} className="w-60 shrink-0" variants={itemVariants}>
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <span className={cn('w-1.5 h-1.5 rounded-full', col.dot)} />
                      <h3 className="text-xs font-semibold text-[#FDFBF8]/45 uppercase tracking-wider flex-1">{col.label}</h3>
                      <span className="text-[10px] text-[#FDFBF8]/20 font-mono tabular-nums">{colTasks.length}</span>
                    </div>
                    <motion.div
                      variants={containerVariants}
                      initial="hidden"
                      animate="visible"
                      className="space-y-2 min-h-[120px]"
                    >
                      {colTasks.length > 0 ? colTasks.map((task) => (
                        <motion.div key={task.task_id} variants={itemVariants}>
                          <CardSpotlight>
                            <div onClick={() => setSelectedTask(task)} className="p-3.5 cursor-pointer">
                              <div className="flex items-center gap-2 mb-2.5">
                                <StatusBadge state={task.state} className="flex-1" />
                                <span className="flex items-center gap-1">
                                  <span className={cn('w-1.5 h-1.5 rounded-full', PRIORITY_DOTS[task.priority] ?? PRIORITY_DOTS.medium)} />
                                </span>
                              </div>
                              <h4 className="text-sm font-display font-medium text-[#FDFBF8]/80 group-hover:text-[#FDFBF8] transition-colors mb-2 line-clamp-2 leading-snug">
                                {task.title}
                              </h4>
                              <div className="flex items-center gap-2 flex-wrap">
                                {task.module && (
                                  <span className="text-[10px] text-[#FF8C00]/60 font-mono bg-[#FF8C00]/5 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                                    {task.assigned_to && moduleAccessMap[task.assigned_to]?.has(task.module) ? (
                                      <svg className="w-2.5 h-2.5 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                        <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                      </svg>
                                    ) : null}
                                    {task.module}
                                  </span>
                                )}
                                {task.estimated_hours && (
                                  <span className="text-[10px] text-[#FDFBF8]/20 font-mono">~{task.estimated_hours}h</span>
                                )}
                              </div>
                            </div>
                          </CardSpotlight>
                        </motion.div>
                      )) : (
                        <motion.div variants={itemVariants}>
                          <div className="border border-dashed border-[#FDFBF8]/5 rounded-xl py-8 text-center">
                            <p className="text-[10px] text-[#FDFBF8]/15">Empty</p>
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
                  icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
                />
              ) : (
                <>
                  <div className="grid grid-cols-[120px_1fr_100px_80px_64px] gap-4 px-5 py-2.5 border-b border-[#FDFBF8]/5">
                    {['Status', 'Task', 'Assignee', 'Priority', 'Est.'].map((h) => (
                      <span key={h} className="text-[10px] uppercase tracking-widest text-[#FDFBF8]/25 font-semibold">{h}</span>
                    ))}
                  </div>
                  <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className="divide-y divide-[#FDFBF8]/4"
                  >
                    {filteredTasks.map((task) => (
                      <motion.div key={task.task_id} variants={itemVariants}>
                        <div onClick={() => setSelectedTask(task)}
                          className="grid grid-cols-[120px_1fr_100px_80px_64px] gap-4 items-center px-5 py-3.5 hover:bg-[#FDFBF8]/[0.015] cursor-pointer transition-colors group">
                          <StatusBadge state={task.state} />
                          <div className="min-w-0">
                            <div className="text-sm text-[#FDFBF8]/80 group-hover:text-[#FDFBF8] truncate font-medium transition-colors">{task.title}</div>
                            {task.module && <div className="text-[10px] text-[#FF8C00]/50 font-mono mt-0.5">{task.module}</div>}
                          </div>
                          <div className="text-xs text-[#FDFBF8]/35 truncate">{task.assigned_to || '—'}</div>
                          <div className="flex items-center gap-1.5">
                            <span className={cn('w-1.5 h-1.5 rounded-full', PRIORITY_DOTS[task.priority] ?? PRIORITY_DOTS.medium)} />
                            <span className={cn('text-[10px] font-medium capitalize', PRIORITY_COLORS[task.priority]?.split(' ')[1] ?? 'text-[#FDFBF8]/40')}>
                              {task.priority}
                            </span>
                          </div>
                          <span className="text-[11px] text-[#FDFBF8]/25 font-mono">
                            {task.estimated_hours ? `~${task.estimated_hours}h` : '—'}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                </>
              )}
            </div>
          </CardSpotlight>
        )}

        {selectedTask && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setSelectedTask(null)}>
            <div className="bg-[#120D0A] border border-[#FDFBF8]/10 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto mx-4 shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}>
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#FF8C00]/30 to-transparent rounded-t-2xl" />

              <div className="flex items-center justify-between p-6 border-b border-[#FDFBF8]/5">
                <div className="flex items-center gap-2">
                  <StatusBadge state={selectedTask.state} />
                  <span className={cn('text-[10px] px-2 py-0.5 rounded border font-medium capitalize', PRIORITY_COLORS[selectedTask.priority] ?? PRIORITY_COLORS.medium)}>
                    {selectedTask.priority}
                  </span>
                </div>
                <button onClick={() => setSelectedTask(null)} className="text-[#FDFBF8]/30 hover:text-[#FDFBF8] transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-6 space-y-5">
                <div>
                  <h2 className="font-display text-lg font-bold text-[#FDFBF8] mb-1.5">{selectedTask.title}</h2>
                  {selectedTask.description && (
                    <p className="text-sm text-[#FDFBF8]/50 leading-relaxed">{selectedTask.description}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  {selectedTask.module && (
                    <div className="bg-[#0D0906] rounded-lg p-3 border border-[#FDFBF8]/5">
                      <div className="text-[10px] text-[#FDFBF8]/30 uppercase tracking-widest mb-1">Module</div>
                      <div className="text-[#FF8C00] font-mono">{selectedTask.module}</div>
                    </div>
                  )}
                  {selectedTask.assigned_to && (
                    <div className="bg-[#0D0906] rounded-lg p-3 border border-[#FDFBF8]/5">
                      <div className="text-[10px] text-[#FDFBF8]/30 uppercase tracking-widest mb-1">Assigned To</div>
                      <div className="text-[#FDFBF8]/80">{selectedTask.assigned_to}</div>
                    </div>
                  )}
                  {selectedTask.estimated_hours && (
                    <div className="bg-[#0D0906] rounded-lg p-3 border border-[#FDFBF8]/5">
                      <div className="text-[10px] text-[#FDFBF8]/30 uppercase tracking-widest mb-1">Est. Time</div>
                      <div className="text-[#FDFBF8]/80">{selectedTask.estimated_hours}h</div>
                    </div>
                  )}
                  {selectedTask.repo_url && (
                    <div className="bg-[#0D0906] rounded-lg p-3 border border-[#FDFBF8]/5 md:col-span-2">
                      <div className="text-[10px] text-[#FDFBF8]/30 uppercase tracking-widest mb-1">Repository</div>
                      <div className="text-[#4DA8DA] font-mono text-[11px] break-all">{selectedTask.repo_url}</div>
                    </div>
                  )}
                  {selectedTask.pr_url && (
                    <div className="bg-[#0D0906] rounded-lg p-3 border border-[#FDFBF8]/5 md:col-span-2">
                      <div className="text-[10px] text-[#FDFBF8]/30 uppercase tracking-widest mb-1">PR URL</div>
                      <a href={selectedTask.pr_url} target="_blank" rel="noreferrer"
                        className="text-[#4DA8DA] font-mono text-[11px] break-all hover:underline">{selectedTask.pr_url}</a>
                    </div>
                  )}
                  {selectedTask.unlock_modules && selectedTask.unlock_modules.length > 0 && (
                    <div className="bg-[#0D0906] rounded-lg p-3 border border-[#FDFBF8]/5 md:col-span-3">
                      <div className="text-[10px] text-[#FDFBF8]/30 uppercase tracking-widest mb-2">Unlocks Modules</div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedTask.unlock_modules.map((m, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-md bg-green-500/10 text-green-400 text-[10px] font-mono border border-green-500/15">{m}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedTask.assigned_to && moduleAccessMap[selectedTask.assigned_to] && (
                    <div className="bg-[#0D0906] rounded-lg p-3 border border-[#FDFBF8]/5 md:col-span-3">
                      <div className="text-[10px] text-[#FDFBF8]/30 uppercase tracking-widest mb-2">Module Access</div>
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from(moduleAccessMap[selectedTask.assigned_to]).map((m, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-md bg-green-500/10 text-green-400 text-[10px] font-mono border border-green-500/20 inline-flex items-center gap-1">
                            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>{m}
                          </span>
                        ))}
                        {moduleAccessMap[selectedTask.assigned_to].size === 0 && (
                          <span className="text-[10px] text-[#FDFBF8]/25 italic">No modules unlocked yet</span>
                        )}
                      </div>
                    </div>
                  )}
                  {selectedTask.review_feedback && (
                    <div className="bg-[#0D0906] rounded-lg p-3 border border-[#FDFBF8]/5 md:col-span-3">
                      <div className="text-[10px] text-[#FDFBF8]/30 uppercase tracking-widest mb-2">Review Feedback</div>
                      <div className="text-xs text-[#FDFBF8]/60 leading-relaxed">
                        {typeof selectedTask.review_feedback === 'string' ? selectedTask.review_feedback : JSON.stringify(selectedTask.review_feedback, null, 2)}
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-[#FDFBF8]/5 pt-4 space-y-3">
                  {selectedTask.state === 'pending' && (
                    <div className="flex gap-2">
                      <Input value={prUrlInput} onChange={(e) => setPrUrlInput(e.target.value)} placeholder="Enter user ID to assign…" className="flex-1" />
                      <button onClick={() => handleAssign(selectedTask.task_id, prUrlInput)} disabled={!prUrlInput.trim()}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40">Assign</button>
                      <button onClick={() => handleCancel(selectedTask.task_id)} className="text-red-400/50 hover:text-red-400 text-sm px-3 transition-colors">Cancel</button>
                    </div>
                  )}
                  {selectedTask.state === 'assigned' && (
                    <div className="flex gap-2">
                      <button onClick={() => handleStart(selectedTask.task_id)}
                        className="bg-[#FF8C00] hover:bg-[#FFB347] text-[#3D1C00] px-6 py-2 rounded-lg text-sm font-bold transition-colors">Start Working</button>
                      <button onClick={() => handleCancel(selectedTask.task_id)} className="text-red-400/50 hover:text-red-400 text-sm px-3 transition-colors">Cancel</button>
                    </div>
                  )}
                  {selectedTask.state === 'in_progress' && (
                    <div className="flex gap-2">
                      <Input value={prUrlInput} onChange={(e) => setPrUrlInput(e.target.value)} placeholder="Paste PR URL…" className="flex-1" />
                      <button onClick={() => handleSubmit(selectedTask.task_id, prUrlInput)} disabled={!prUrlInput.trim()}
                        className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40">Submit for Review</button>
                    </div>
                  )}
                  {(selectedTask.state === 'submitted' || selectedTask.state === 'under_review') && (
                    <div className="space-y-3">
                      <Textarea value={reviewFeedback} onChange={(e) => setReviewFeedback(e.target.value)} placeholder="Add review feedback…" rows={3} />
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => handleReview(selectedTask.task_id, false)}
                          className="bg-red-500/80 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">Request Changes</button>
                        <button onClick={() => handleReview(selectedTask.task_id, true)}
                          className="bg-yellow-500 hover:bg-yellow-600 text-[#3D1C00] px-4 py-2 rounded-lg text-sm font-medium transition-colors">Route to Product</button>
                        <button onClick={() => handleApprove(selectedTask.task_id)}
                          className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">Approve</button>
                        <button onClick={() => handleCancel(selectedTask.task_id)} className="text-red-400/50 hover:text-red-400 text-sm px-3 transition-colors">Cancel</button>
                      </div>
                    </div>
                  )}
                  {selectedTask.state === 'needs_changes' && (
                    <div className="flex gap-2">
                      <button onClick={() => handleStart(selectedTask.task_id)}
                        className="bg-[#FF8C00] hover:bg-[#FFB347] text-[#3D1C00] px-6 py-2 rounded-lg text-sm font-bold transition-colors">Resume Working</button>
                      <button onClick={() => handleCancel(selectedTask.task_id)} className="text-red-400/50 hover:text-red-400 text-sm px-3 transition-colors">Cancel</button>
                    </div>
                  )}
                  {selectedTask.state === 'product_review' && (
                    <div className="space-y-3">
                      <Textarea value={reviewFeedback} onChange={(e) => setReviewFeedback(e.target.value)} placeholder="Product sign-off notes…" rows={2} />
                      <div className="flex gap-2">
                        <button onClick={() => handleReview(selectedTask.task_id, false)}
                          className="bg-red-500/80 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">Request Changes</button>
                        <button onClick={() => handleApprove(selectedTask.task_id)}
                          className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">Approve & Sign Off</button>
                      </div>
                    </div>
                  )}
                  {selectedTask.state === 'approved' && (
                    <div className="flex gap-2">
                      <button onClick={() => handleComplete(selectedTask.task_id)}
                        className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-lg text-sm font-bold transition-colors">
                        ✓ Mark Completed & Unlock Modules
                      </button>
                      <button onClick={() => handleCancel(selectedTask.task_id)} className="text-red-400/50 hover:text-red-400 text-sm px-3 transition-colors">Cancel</button>
                    </div>
                  )}
                  {selectedTask.state === 'completed' && selectedTask.unlock_modules && selectedTask.unlock_modules.length > 0 && (
                    <div className="bg-green-500/5 border border-green-500/15 rounded-xl p-4">
                      <div className="text-green-400 text-sm font-semibold mb-2">✓ Modules Unlocked</div>
                      <div className="flex flex-wrap gap-2">
                        {selectedTask.unlock_modules.map((m, i) => (
                          <span key={i} className="px-2.5 py-1 rounded-md bg-green-500/10 text-green-400 text-xs font-mono border border-green-500/20">{m}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {(selectedTask.state === 'completed' || selectedTask.state === 'cancelled') && (
                    <button onClick={() => {
                      if (confirm('Delete this task permanently?')) {
                        deleteTask(selectedTask.task_id).then(() => { setSelectedTask(null); fetchTasks() })
                      }
                    }} className="text-red-400/40 hover:text-red-400 text-xs transition-colors flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
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
