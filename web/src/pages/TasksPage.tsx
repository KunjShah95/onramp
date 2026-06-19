import { useState, useEffect, useCallback } from 'react'
import { cn } from '../lib/utils'
import {
  createTask,
  listTasks,
  assignTask,
  startTask,
  submitTask,
  reviewTask,
  approveTask,
  completeTask,
  cancelTask,
  deleteTask,
  getTeamProgress,
  listTeams,
  getTeamModulePermissions,
  type WorkflowTask,
  type TeamProgress,
} from '../lib/api'

const STATE_LABELS: Record<string, string> = {
  pending: 'Pending',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  submitted: 'Submitted',
  under_review: 'Under Review',
  needs_changes: 'Needs Changes',
  product_review: 'Product Review',
  approved: 'Approved',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const STATE_COLORS: Record<string, string> = {
  pending: 'text-[#FDFBF8]/50 bg-[#FDFBF8]/5',
  assigned: 'text-blue-400 bg-blue-500/10',
  in_progress: 'text-[#FF8C00] bg-[#FF8C00]/10',
  submitted: 'text-purple-400 bg-purple-500/10',
  under_review: 'text-yellow-400 bg-yellow-500/10',
  needs_changes: 'text-red-400 bg-red-500/10',
  product_review: 'text-pink-400 bg-pink-500/10',
  approved: 'text-green-400 bg-green-500/10',
  completed: 'text-green-400 bg-green-500/10',
  cancelled: 'text-[#FDFBF8]/30 bg-[#FDFBF8]/5',
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'border-green-500/30 text-green-400',
  medium: 'border-[#FF8C00]/30 text-[#FF8C00]',
  high: 'border-red-500/30 text-red-400',
  urgent: 'border-red-500 text-red-400',
}

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

  // Create form state
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

  // Module access map: userId → Set of module names they have access to
  const [moduleAccessMap, setModuleAccessMap] = useState<Record<string, Set<string>>>({})

  // Detail view
  const [selectedTask, setSelectedTask] = useState<WorkflowTask | null>(null)
  const [prUrlInput, setPrUrlInput] = useState('')
  const [reviewFeedback, setReviewFeedback] = useState('')

  const fetchTeams = useCallback(async () => {
    try {
      const data = await listTeams('current-user')
      setTeams(data.teams || [])
      if (data.teams?.length > 0 && !selectedTeam) {
        setSelectedTeam(data.teams[0].team_id)
      }
    } catch { /* ignore */ }
  }, [])

  const fetchTasks = useCallback(async () => {
    if (!selectedTeam) return
    setLoading(true)
    setError('')
    try {
      const { tasks = [] } = await listTasks({ team_id: selectedTeam }) as { tasks: WorkflowTask[] }
      setTasks(tasks)
    } catch (e: any) {
      setError(e.message || 'Failed to load tasks')
    }
    setLoading(false)
  }, [selectedTeam])

  const fetchProgress = useCallback(async () => {
    if (!selectedTeam) return
    try {
      const p = await getTeamProgress(selectedTeam)
      setProgress(p)
    } catch { /* ignore */ }
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
    setCreating(true)
    setError('')
    try {
      await createTask({
        team_id: selectedTeam,
        title: formTitle.trim(),
        description: formDesc.trim() || undefined,
        module: formModule.trim() || undefined,
        priority: formPriority as any,
        assigned_to: formAssignee.trim() || undefined,
        repo_url: formRepoUrl.trim() || undefined,
        branch: formBranch.trim() || undefined,
        unlock_modules: formUnlockModules.trim()
          ? formUnlockModules.split(',').map((s) => s.trim())
          : undefined,
        estimated_hours: formEstHours ? parseFloat(formEstHours) : undefined,
      })
      setShowCreate(false)
      resetForm()
      await fetchTasks()
      await fetchProgress()
    } catch (e: any) {
      setError(e.message || 'Failed to create task')
    }
    setCreating(false)
  }

  function resetForm() {
    setFormTitle('')
    setFormDesc('')
    setFormModule('')
    setFormPriority('medium')
    setFormAssignee('')
    setFormRepoUrl('')
    setFormBranch('')
    setFormUnlockModules('')
    setFormEstHours('')
  }

  async function handleAssign(taskId: string, assigneeId: string) {
    try {
      await assignTask(taskId, assigneeId)
      await fetchTasks()
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function handleStart(taskId: string) {
    try {
      await startTask(taskId)
      await fetchTasks()
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function handleSubmit(taskId: string, url: string) {
    if (!url.trim()) return
    try {
      await submitTask(taskId, url.trim())
      setPrUrlInput('')
      await fetchTasks()
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function handleReview(taskId: string, approve: boolean) {
    try {
      await reviewTask(taskId, {
        approve,
        feedback: reviewFeedback.trim() ? { message: reviewFeedback.trim() } : undefined,
      })
      setReviewFeedback('')
      setSelectedTask(null)
      await fetchTasks()
      await fetchProgress()
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function handleApprove(taskId: string) {
    try {
      await approveTask(taskId, reviewFeedback.trim()
        ? { message: reviewFeedback.trim() }
        : undefined)
      setReviewFeedback('')
      setSelectedTask(null)
      await fetchTasks()
      await fetchProgress()
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function handleComplete(taskId: string) {
    try {
      await completeTask(taskId)
      await fetchTasks()
      await fetchProgress()
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function handleCancel(taskId: string) {
    try {
      await cancelTask(taskId)
      setSelectedTask(null)
      await fetchTasks()
      await fetchProgress()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const filteredTasks = tasks.filter((t) => {
    if (!filter) return true
    const q = filter.toLowerCase()
    return (
      t.title.toLowerCase().includes(q) ||
      t.state.toLowerCase().includes(q) ||
      (t.assigned_to && t.assigned_to.toLowerCase().includes(q)) ||
      (t.module && t.module.toLowerCase().includes(q))
    )
  })

  const boardColumns = [
    { state: 'pending', label: 'Pending' },
    { state: 'assigned', label: 'Assigned' },
    { state: 'in_progress', label: 'In Progress' },
    { state: 'submitted', label: 'Submitted' },
    { state: 'under_review', label: 'Review' },
    { state: 'needs_changes', label: 'Changes' },
    { state: 'product_review', label: 'Product' },
    { state: 'approved', label: 'Approved' },
    { state: 'completed', label: 'Done' },
  ]

  return (
    <div className="animate-in w-full h-full min-h-[calc(100vh-4rem)] p-6 font-mono text-[#FDFBF8]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold mb-1">Tasks</h1>
          <p className="text-[#FDFBF8]/50 text-sm">
            Senior → Trainee workflow — assign, work, review, approve, unlock
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Team selector */}
          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            className="bg-[#1A110D] border border-[#FDFBF8]/10 text-[#FDFBF8] text-sm rounded-lg px-3 py-2 outline-none focus:border-[#FF8C00]/50"
          >
            <option value="">Select team...</option>
            {teams.map((t: any) => (
              <option key={t.team_id || t.id} value={t.team_id || t.id}>
                {t.name}
              </option>
            ))}
          </select>

          {/* View toggle */}
          <div className="flex bg-[#1A110D] border border-[#FDFBF8]/10 rounded-lg overflow-hidden">
            <button
              onClick={() => setView('board')}
              className={cn(
                'px-3 py-2 text-xs font-medium transition-colors',
                view === 'board' ? 'bg-[#FF8C00]/20 text-[#FF8C00]' : 'text-[#FDFBF8]/40 hover:text-[#FDFBF8]/70'
              )}
            >
              Board
            </button>
            <button
              onClick={() => setView('list')}
              className={cn(
                'px-3 py-2 text-xs font-medium transition-colors',
                view === 'list' ? 'bg-[#FF8C00]/20 text-[#FF8C00]' : 'text-[#FDFBF8]/40 hover:text-[#FDFBF8]/70'
              )}
            >
              List
            </button>
          </div>

          {/* Create button */}
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="bg-[#FFB347] hover:bg-[#FF8C00] text-[#3D1C00] px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
          >
            <span className="text-lg leading-none">+</span> New Task
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {progress && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Total', value: progress.total, color: 'text-[#FDFBF8]' },
            { label: 'Completed', value: progress.completed, color: 'text-green-400' },
            { label: 'In Progress', value: progress.in_progress, color: 'text-[#FF8C00]' },
            { label: 'Pending Review', value: progress.pending_review, color: 'text-yellow-400' },
            { label: 'Blocked', value: progress.blocked, color: 'text-red-400' },
          ].map((m) => (
            <div key={m.label} className="bg-[#1A110D] border border-[#FDFBF8]/5 rounded-lg p-3 text-center">
              <div className={cn('text-2xl font-bold', m.color)}>{m.value}</div>
              <div className="text-[10px] text-[#FDFBF8]/40 uppercase tracking-wider mt-1">{m.label}</div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-900/20 border border-red-500/50 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Create Task Form */}
      {showCreate && (
        <div className="bg-[#1A110D] border border-[#FF8C00]/20 rounded-xl p-6 mb-6">
          <h2 className="font-display text-base font-bold mb-4 text-[#FF8C00]">Create New Task</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="md:col-span-2">
              <label className="text-[10px] uppercase tracking-wider text-[#FDFBF8]/40 mb-1 block">Title *</label>
              <input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g., Implement user authentication module"
                className="w-full bg-[#0D0906] border border-[#FDFBF8]/10 rounded-lg px-3 py-2 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/30 outline-none focus:border-[#FF8C00]/50"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[#FDFBF8]/40 mb-1 block">Priority</label>
              <select
                value={formPriority}
                onChange={(e) => setFormPriority(e.target.value)}
                className="w-full bg-[#0D0906] border border-[#FDFBF8]/10 rounded-lg px-3 py-2 text-sm text-[#FDFBF8] outline-none focus:border-[#FF8C00]/50"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div className="mb-4">
            <label className="text-[10px] uppercase tracking-wider text-[#FDFBF8]/40 mb-1 block">Description</label>
            <textarea
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              placeholder="Describe the task in detail..."
              rows={3}
              className="w-full bg-[#0D0906] border border-[#FDFBF8]/10 rounded-lg px-3 py-2 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/30 outline-none focus:border-[#FF8C00]/50 resize-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[#FDFBF8]/40 mb-1 block">Module</label>
              <input
                value={formModule}
                onChange={(e) => setFormModule(e.target.value)}
                placeholder="e.g., auth"
                className="w-full bg-[#0D0906] border border-[#FDFBF8]/10 rounded-lg px-3 py-2 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/30 outline-none focus:border-[#FF8C00]/50"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[#FDFBF8]/40 mb-1 block">Assignee</label>
              <input
                value={formAssignee}
                onChange={(e) => setFormAssignee(e.target.value)}
                placeholder="User ID"
                className="w-full bg-[#0D0906] border border-[#FDFBF8]/10 rounded-lg px-3 py-2 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/30 outline-none focus:border-[#FF8C00]/50"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[#FDFBF8]/40 mb-1 block">Repo URL</label>
              <input
                value={formRepoUrl}
                onChange={(e) => setFormRepoUrl(e.target.value)}
                placeholder="https://github.com/..."
                className="w-full bg-[#0D0906] border border-[#FDFBF8]/10 rounded-lg px-3 py-2 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/30 outline-none focus:border-[#FF8C00]/50"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[#FDFBF8]/40 mb-1 block">Unlock Modules</label>
              <input
                value={formUnlockModules}
                onChange={(e) => setFormUnlockModules(e.target.value)}
                placeholder="auth, api, payments"
                className="w-full bg-[#0D0906] border border-[#FDFBF8]/10 rounded-lg px-3 py-2 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/30 outline-none focus:border-[#FF8C00]/50"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setShowCreate(false); resetForm() }}
              className="px-4 py-2 text-sm text-[#FDFBF8]/60 hover:text-[#FDFBF8] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateTask}
              disabled={creating || !formTitle.trim()}
              className="bg-[#FFB347] hover:bg-[#FF8C00] text-[#3D1C00] px-6 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </div>
      )}

      {/* Search filter */}
      <div className="relative mb-6">
        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
          <svg className="w-4 h-4 text-[#FDFBF8]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter tasks by title, state, or assignee..."
          className="w-full bg-[#1A110D] border border-[#FDFBF8]/10 text-[#FDFBF8] text-sm rounded-lg pl-10 pr-4 py-2.5 outline-none focus:border-[#FF8C00]/50 placeholder:text-[#FDFBF8]/30"
        />
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <svg className="w-6 h-6 animate-spin text-[#FF8C00]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      )}

      {/* Board View */}
      {!loading && view === 'board' && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {boardColumns.map((col) => {
              const colTasks = filteredTasks.filter((t) => t.state === col.state)
              return (
                <div key={col.state} className="w-64 shrink-0">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <h3 className="text-xs uppercase tracking-wider text-[#FDFBF8]/40 font-semibold">
                      {col.label}
                    </h3>
                    <span className="text-[11px] text-[#FDFBF8]/30 font-mono">{colTasks.length}</span>
                  </div>
                  <div className="space-y-2 min-h-[200px]">
                    {colTasks.map((task) => (
                      <div
                        key={task.task_id}
                        onClick={() => setSelectedTask(task)}
                        className="bg-[#1A110D] border border-[#FDFBF8]/5 rounded-lg p-3 cursor-pointer hover:border-[#FDFBF8]/15 transition-all hover:shadow-lg group"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded font-medium',
                            STATE_COLORS[task.state] || STATE_COLORS.pending
                          )}>
                            {STATE_LABELS[task.state] || task.state}
                          </span>
                          <span className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded border font-medium',
                            PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium
                          )}>
                            {task.priority}
                          </span>
                        </div>
                        <h4 className="text-sm font-medium text-[#FDFBF8] mb-1 line-clamp-2 leading-snug">
                          {task.title}
                        </h4>
                        {task.module && (
                          <span className="text-[10px] text-[#FF8C00]/60 font-mono inline-flex items-center gap-1">
                            {task.assigned_to && moduleAccessMap[task.assigned_to]?.has(task.module) ? (
                              <svg className="w-3 h-3 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                              </svg>
                            ) : task.assigned_to ? (
                              <svg className="w-3 h-3 text-[#FDFBF8]/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                              </svg>
                            ) : null}
                            {task.module}
                          </span>
                        )}
                        {task.estimated_hours && (
                          <span className="text-[10px] text-[#FDFBF8]/30 ml-2">
                            ~{task.estimated_hours}h
                          </span>
                        )}
                      </div>
                    ))}
                    {colTasks.length === 0 && (
                      <div className="text-[11px] text-[#FDFBF8]/15 text-center py-8 italic">
                        No tasks
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* List View */}
      {!loading && view === 'list' && (
        <div className="bg-[#1A110D] border border-[#FDFBF8]/5 rounded-xl overflow-hidden">
          {filteredTasks.length === 0 ? (
            <div className="text-center py-12 text-[#FDFBF8]/30 text-sm">
              {filter ? 'No tasks match your filter.' : 'No tasks yet. Create one to get started.'}
            </div>
          ) : (
            <div className="divide-y divide-[#FDFBF8]/5">
              {filteredTasks.map((task) => (
                <div
                  key={task.task_id}
                  onClick={() => setSelectedTask(task)}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#FDFBF8]/[0.02] cursor-pointer transition-colors"
                >
                  {/* State badge */}
                  <span className={cn(
                    'text-[10px] px-2 py-1 rounded font-medium w-24 text-center shrink-0',
                    STATE_COLORS[task.state] || STATE_COLORS.pending
                  )}>
                    {STATE_LABELS[task.state] || task.state}
                  </span>

                  {/* Title */}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-[#FDFBF8] truncate block">{task.title}</span>
                    {task.module && (
                      <span className="text-[11px] text-[#FDFBF8]/30 inline-flex items-center gap-1">
                        {task.assigned_to && moduleAccessMap[task.assigned_to]?.has(task.module) ? (
                          <svg className="w-2.5 h-2.5 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                        ) : task.assigned_to ? (
                          <svg className="w-2.5 h-2.5 text-[#FDFBF8]/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                        ) : null}
                        {task.module}
                      </span>
                    )}
                  </div>

                  {/* Assignee */}
                  <div className="text-xs text-[#FDFBF8]/40 w-24 truncate shrink-0">
                    {task.assigned_to || '—'}
                  </div>

                  {/* Priority */}
                  <span className={cn(
                    'text-[10px] px-2 py-0.5 rounded border font-medium shrink-0',
                    PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium
                  )}>
                    {task.priority}
                  </span>

                  {/* Time */}
                  {task.estimated_hours && (
                    <span className="text-[11px] text-[#FDFBF8]/30 font-mono shrink-0">
                      ~{task.estimated_hours}h
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Task Detail Modal */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedTask(null)}>
          <div
            className="bg-[#1A110D] border border-[#FDFBF8]/10 rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between p-6 border-b border-[#FDFBF8]/5">
              <div className="flex items-center gap-3">
                <span className={cn(
                  'text-[11px] px-2 py-1 rounded font-medium',
                  STATE_COLORS[selectedTask.state] || STATE_COLORS.pending
                )}>
                  {STATE_LABELS[selectedTask.state] || selectedTask.state}
                </span>
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded border font-medium',
                  PRIORITY_COLORS[selectedTask.priority] || PRIORITY_COLORS.medium
                )}>
                  {selectedTask.priority}
                </span>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="text-[#FDFBF8]/30 hover:text-[#FDFBF8] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal body */}
            <div className="p-6 space-y-6">
              <div>
                <h2 className="font-display text-xl font-bold text-[#FDFBF8] mb-2">{selectedTask.title}</h2>
                {selectedTask.description && (
                  <p className="text-sm text-[#FDFBF8]/60 leading-relaxed">{selectedTask.description}</p>
                )}
              </div>

              {/* Metadata grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                {selectedTask.module && (
                  <div>
                    <span className="text-[#FDFBF8]/40 block mb-1">Module</span>
                    <span className="text-[#FF8C00] font-mono">{selectedTask.module}</span>
                  </div>
                )}
                {selectedTask.assigned_to && (
                  <div>
                    <span className="text-[#FDFBF8]/40 block mb-1">Assigned To</span>
                    <span className="text-[#FDFBF8]">{selectedTask.assigned_to}</span>
                  </div>
                )}
                {selectedTask.estimated_hours && (
                  <div>
                    <span className="text-[#FDFBF8]/40 block mb-1">Est. Time</span>
                    <span className="text-[#FDFBF8]">{selectedTask.estimated_hours}h</span>
                  </div>
                )}
                {selectedTask.repo_url && (
                  <div className="md:col-span-2">
                    <span className="text-[#FDFBF8]/40 block mb-1">Repository</span>
                    <span className="text-[#4DA8DA] font-mono text-[11px] break-all">{selectedTask.repo_url}</span>
                  </div>
                )}
                {selectedTask.pr_url && (
                  <div className="md:col-span-2">
                    <span className="text-[#FDFBF8]/40 block mb-1">PR URL</span>
                    <a href={selectedTask.pr_url} target="_blank" rel="noreferrer"
                      className="text-[#4DA8DA] font-mono text-[11px] break-all hover:underline">{selectedTask.pr_url}</a>
                  </div>
                )}
                {selectedTask.unlock_modules && selectedTask.unlock_modules.length > 0 && (
                  <div className="md:col-span-2">
                    <span className="text-[#FDFBF8]/40 block mb-1">Unlocks Modules</span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedTask.unlock_modules.map((m, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-green-500/10 text-green-400 text-[10px] font-mono">
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Module Access section — shows which modules the assignee has unlocked */}
                {selectedTask.assigned_to && moduleAccessMap[selectedTask.assigned_to] && (
                  <div className="md:col-span-2">
                    <span className="text-[#FDFBF8]/40 block mb-1">Module Access</span>
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from(moduleAccessMap[selectedTask.assigned_to]).map((m, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-green-500/10 text-green-400 text-[10px] font-mono border border-green-500/20 inline-flex items-center gap-1">
                          <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                          {m}
                        </span>
                      ))}
                      {moduleAccessMap[selectedTask.assigned_to].size === 0 && (
                        <span className="text-[10px] text-[#FDFBF8]/30 italic">No modules unlocked yet</span>
                      )}
                    </div>
                  </div>
                )}
                {selectedTask.review_feedback && (
                  <div className="md:col-span-2">
                    <span className="text-[#FDFBF8]/40 block mb-1">Review Feedback</span>
                    <div className="bg-[#0D0906] border border-[#FDFBF8]/5 rounded-lg p-3 text-xs text-[#FDFBF8]/70">
                      {typeof selectedTask.review_feedback === 'string'
                        ? selectedTask.review_feedback
                        : JSON.stringify(selectedTask.review_feedback, null, 2)}
                    </div>
                  </div>
                )}
              </div>

              {/* Action buttons based on state */}
              <div className="border-t border-[#FDFBF8]/5 pt-4 space-y-3">
                {/* PENDING: assign */}
                {selectedTask.state === 'pending' && (
                  <div className="flex gap-2">
                    <input
                      value={prUrlInput}
                      onChange={(e) => setPrUrlInput(e.target.value)}
                      placeholder="Enter user ID to assign..."
                      className="flex-1 bg-[#0D0906] border border-[#FDFBF8]/10 rounded-lg px-3 py-2 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/30 outline-none focus:border-[#FF8C00]/50"
                    />
                    <button
                      onClick={() => handleAssign(selectedTask.task_id, prUrlInput)}
                      disabled={!prUrlInput.trim()}
                      className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      Assign
                    </button>
                    <button
                      onClick={() => handleCancel(selectedTask.task_id)}
                      className="text-red-400/50 hover:text-red-400 text-sm px-3 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* ASSIGNED: start */}
                {selectedTask.state === 'assigned' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleStart(selectedTask.task_id)}
                      className="bg-[#FF8C00] hover:bg-[#FFB347] text-[#3D1C00] px-6 py-2 rounded-lg text-sm font-bold transition-colors"
                    >
                      Start Working
                    </button>
                    <button
                      onClick={() => handleCancel(selectedTask.task_id)}
                      className="text-red-400/50 hover:text-red-400 text-sm px-3 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* IN_PROGRESS: submit */}
                {selectedTask.state === 'in_progress' && (
                  <div className="flex gap-2">
                    <input
                      value={prUrlInput}
                      onChange={(e) => setPrUrlInput(e.target.value)}
                      placeholder="Paste PR URL..."
                      className="flex-1 bg-[#0D0906] border border-[#FDFBF8]/10 rounded-lg px-3 py-2 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/30 outline-none focus:border-[#FF8C00]/50"
                    />
                    <button
                      onClick={() => handleSubmit(selectedTask.task_id, prUrlInput)}
                      disabled={!prUrlInput.trim()}
                      className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      Submit for Review
                    </button>
                  </div>
                )}

                {/* SUBMITTED / UNDER_REVIEW: review actions */}
                {(selectedTask.state === 'submitted' || selectedTask.state === 'under_review') && (
                  <div className="space-y-3">
                    <textarea
                      value={reviewFeedback}
                      onChange={(e) => setReviewFeedback(e.target.value)}
                      placeholder="Add review feedback..."
                      rows={3}
                      className="w-full bg-[#0D0906] border border-[#FDFBF8]/10 rounded-lg px-3 py-2 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/30 outline-none focus:border-[#FF8C00]/50 resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReview(selectedTask.task_id, false)}
                        className="bg-red-500/80 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        Request Changes
                      </button>
                      <button
                        onClick={() => handleReview(selectedTask.task_id, true)}
                        className="bg-yellow-500 hover:bg-yellow-600 text-[#3D1C00] px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        Route to Product
                      </button>
                      <button
                        onClick={() => handleApprove(selectedTask.task_id)}
                        className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleCancel(selectedTask.task_id)}
                        className="text-red-400/50 hover:text-red-400 text-sm px-3 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* NEEDS_CHANGES: go back */}
                {selectedTask.state === 'needs_changes' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleStart(selectedTask.task_id)}
                      className="bg-[#FF8C00] hover:bg-[#FFB347] text-[#3D1C00] px-6 py-2 rounded-lg text-sm font-bold transition-colors"
                    >
                      Resume Working
                    </button>
                    <button
                      onClick={() => handleCancel(selectedTask.task_id)}
                      className="text-red-400/50 hover:text-red-400 text-sm px-3 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* PRODUCT_REVIEW: approve */}
                {selectedTask.state === 'product_review' && (
                  <div className="space-y-3">
                    <textarea
                      value={reviewFeedback}
                      onChange={(e) => setReviewFeedback(e.target.value)}
                      placeholder="Product sign-off notes..."
                      rows={2}
                      className="w-full bg-[#0D0906] border border-[#FDFBF8]/10 rounded-lg px-3 py-2 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/30 outline-none focus:border-[#FF8C00]/50 resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReview(selectedTask.task_id, false)}
                        className="bg-red-500/80 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        Request Changes
                      </button>
                      <button
                        onClick={() => handleApprove(selectedTask.task_id)}
                        className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        Approve & Sign Off
                      </button>
                    </div>
                  </div>
                )}

                {/* APPROVED: complete */}
                {selectedTask.state === 'approved' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleComplete(selectedTask.task_id)}
                      className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-lg text-sm font-bold transition-colors"
                    >
                      ✓ Mark Completed & Unlock Modules
                    </button>
                    <button
                      onClick={() => handleCancel(selectedTask.task_id)}
                      className="text-red-400/50 hover:text-red-400 text-sm px-3 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* COMPLETED: show unlock summary */}
                {selectedTask.state === 'completed' && selectedTask.unlock_modules && selectedTask.unlock_modules.length > 0 && (
                  <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4">
                    <div className="text-green-400 text-sm font-semibold mb-2">✓ Modules Unlocked</div>
                    <div className="flex flex-wrap gap-2">
                      {selectedTask.unlock_modules.map((m, i) => (
                        <span key={i} className="px-2.5 py-1 rounded bg-green-500/10 text-green-400 text-xs font-mono border border-green-500/20">
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Terminal states: show delete */}
                {(selectedTask.state === 'completed' || selectedTask.state === 'cancelled') && (
                  <button
                    onClick={() => {
                      if (confirm('Delete this task permanently?')) {
                        deleteTask(selectedTask.task_id).then(() => {
                          setSelectedTask(null)
                          fetchTasks()
                        })
                      }
                    }}
                    className="text-red-400/50 hover:text-red-400 text-xs transition-colors flex items-center gap-1"
                  >
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
  )
}
