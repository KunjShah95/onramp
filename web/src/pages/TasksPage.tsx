import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../lib/utils'
import {
  createTask, listTasks, assignTask, startTask, submitTask, reviewTask,
  approveTask, completeTask, cancelTask, deleteTask, transitionTask, getTeamProgress,
  listTeams, getTeamModulePermissions, getTeamMembers,
  getTeamTimeStats, logActualHours, importIssueToTask, peerReviewTask, claimPeerReview,
  getQuizGateStatus, searchIssues,
  listTaskTemplates, createTaskTemplate, deleteTaskTemplate,
  bulkAssignTemplates, autoAssignStarterTasks,
  exportTasksCsv, exportTimeStatsCsv,
  type WorkflowTask, type TeamProgress, type TeamTimeStats, type QuizGateStatus,
  type TaskTemplate, type BulkAssignResult, type StarterAssignmentResult,
} from '../lib/api'
import { PageHeader } from '../components/ui/page-header'
import { StatCard } from '../components/ui/stat-card'
import { EmptyState } from '../components/ui/empty-state'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import StatusBadge from '../components/ui/status-badge'
import Pagination from '../components/ui/Pagination'
import KanbanBoard, { type KanbanColumn, type KanbanTask } from '../components/ui/kanban-board'
import { useToast } from '../context/ToastContext'
import { TasksPageSkeleton } from '../components/ui/Skeleton'
import {
  Plus, X, Trash, MagnifyingGlass, Check, ArrowRight,
  ListBullets, SquaresFour, Star,
  Lock, ListChecks, UserCircle, Clock, GithubLogo, UsersThree, GraduationCap,
  Copy, Lightning, DownloadSimple
} from '@phosphor-icons/react'

const PRIORITY_DOTS: Record<string, string> = {
  low: 'bg-green-500', medium: 'bg-go', high: 'bg-red-400', urgent: 'bg-red-500',
}

const BOARD_COLUMNS: KanbanColumn[] = [
  { state: 'pending',        label: 'Pending',   dot: 'bg-text-tertiary/50', designator: 'STANDBY' },
  { state: 'assigned',       label: 'Assigned',  dot: 'bg-info',             designator: 'READY' },
  { state: 'in_progress',    label: 'In Prog.',  dot: 'bg-go',   designator: 'ACTIVE' },
  { state: 'submitted',      label: 'Submitted', dot: 'bg-caution',          designator: 'IN QUEUE' },
  { state: 'under_review',   label: 'Review',    dot: 'bg-caution',          designator: 'PEER' },
  { state: 'needs_changes',  label: 'Changes',   dot: 'bg-abort',            designator: 'REWORK' },
  { state: 'product_review', label: 'Product',   dot: 'bg-caution',          designator: 'SIGNOFF' },
  { state: 'approved',       label: 'Approved',  dot: 'bg-go',               designator: 'GO' },
  { state: 'completed',      label: 'Done',      dot: 'bg-go',               designator: 'LANDED' },
]

const containerVariants = {
  hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 }, visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 80, damping: 18 } },
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] uppercase tracking-widest text-text-tertiary font-semibold mb-1.5 block">{children}</label>
}

function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input className={cn('w-full bg-bg-primary border border-border rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary/30 outline-none focus:border-go/40 transition-colors', className)} {...props} />
  )
}

function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={cn('w-full bg-bg-primary border border-border rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary/30 outline-none focus:border-go/40 resize-none transition-colors', className)} {...props} />
  )
}

type TeamMember = { user_id: string; name: string; role: string }

/** Deterministic order: seniors first, then by name. */
const TECH_ROLES_ORDER = ['admin', 'ceo', 'cto', 'senior_dev', 'senior', 'developer', 'tester', 'junior_dev', 'member', 'hr']

function sortMembers(members: TeamMember[]): TeamMember[] {
  const roleIdx = (r: string) => { const i = TECH_ROLES_ORDER.indexOf(r); return i === -1 ? TECH_ROLES_ORDER.length : i }
  return [...members].sort((a, b) => roleIdx(a.role) - roleIdx(b.role) || (a.name || a.user_id).localeCompare(b.name || b.user_id))
}

function MemberSelect({ members, value, onChange, placeholder = 'Select member…', className }: {
  members: TeamMember[]; value: string; onChange: (v: string) => void; placeholder?: string; className?: string
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className={cn('w-full bg-bg-primary border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-go/40 transition-colors', className)}>
      <option value="">{placeholder}</option>
      {sortMembers(members).map((m) => (
        <option key={m.user_id} value={m.user_id}>{m.name || m.user_id} ({m.role})</option>
      ))}
    </select>
  )
}

/** Resolve a user UUID to a human-readable name for display in task lists/modals. */
function memberName(members: TeamMember[], uid: string | null | undefined): string {
  if (!uid) return '—'
  const member = members.find((m) => m.user_id === uid)
  if (member?.name) return member.name
  return uid
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

  const [members, setMembers] = useState<TeamMember[]>([])

  const [moduleAccessMap, setModuleAccessMap] = useState<Record<string, Set<string>>>({})
  const [selectedTask, setSelectedTask] = useState<WorkflowTask | null>(null)
  const [prUrlInput, setPrUrlInput] = useState('')
  const [assignUserId, setAssignUserId] = useState('')
  const [reviewFeedback, setReviewFeedback] = useState('')

  // Time tracking
  const [timeStats, setTimeStats] = useState<TeamTimeStats | null>(null)
  const [showTimeStats, setShowTimeStats] = useState(false)
  const [actualHoursInput, setActualHoursInput] = useState('')

  // GitHub issue import
  const [showImportIssue, setShowImportIssue] = useState(false)
  const [importRepoUrl, setImportRepoUrl] = useState('')
  const [importIssueNumber, setImportIssueNumber] = useState('')
  const [importing, setImporting] = useState(false)
  const [issueQuery, setIssueQuery] = useState('')
  const [issueResults, setIssueResults] = useState<{ number: number; title: string; url: string; labels: string[] }[]>([])
  const [issueSearching, setIssueSearching] = useState(false)
  const [importAssignee, setImportAssignee] = useState('')

  // Quiz gates
  const [quizGateMap, setQuizGateMap] = useState<Record<string, QuizGateStatus>>({})

  // Templates / bulk assign / starter
  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [showTemplates, setShowTemplates] = useState(false)
  const [tplName, setTplName] = useState('')
  const [tplModule, setTplModule] = useState('')
  const [tplPriority, setTplPriority] = useState('medium')
  const [tplEstHours, setTplEstHours] = useState('')
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set())
  const [bulkAssignee, setBulkAssignee] = useState('')
  const [starterRepo, setStarterRepo] = useState('')
  const [starterUserId, setStarterUserId] = useState('')
  const [busy, setBusy] = useState(false)
  const [tplCreating, setTplCreating] = useState(false)

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

  const fetchTimeStats = useCallback(async () => {
    if (!selectedTeam) return
    try { setTimeStats(await getTeamTimeStats(selectedTeam)) } catch { /* ignore */ }
  }, [selectedTeam])

  const fetchQuizGates = useCallback(async () => {
    if (!selectedTeam) return
    try {
      const { tasks = [] } = await listTasks({ team_id: selectedTeam }) as { tasks: WorkflowTask[] }
      const gates: Record<string, QuizGateStatus> = {}
      await Promise.all(tasks.filter((t) => t.quiz_required && t.state === 'assigned').map(async (t) => {
        try { gates[t.task_id] = await getQuizGateStatus(t.task_id) } catch { /* ignore */ }
      }))
      setQuizGateMap(gates)
    } catch { /* ignore */ }
  }, [selectedTeam])

  const fetchTemplates = useCallback(async () => {
    if (!selectedTeam) return
    try {
      const { templates = [] } = await listTaskTemplates(selectedTeam)
      setTemplates(templates)
    } catch { /* ignore */ }
  }, [selectedTeam])

  const fetchMembers = useCallback(async () => {
    if (!selectedTeam) { setMembers([]); return }
    try { setMembers(await getTeamMembers(selectedTeam)) } catch { setMembers([]) }
  }, [selectedTeam])

  useEffect(() => { fetchTeams() }, [])
  useEffect(() => {
    fetchTasks(); fetchProgress(); fetchModulePermissions(); fetchTimeStats(); fetchQuizGates()
  }, [selectedTeam, fetchTasks, fetchProgress, fetchModulePermissions, fetchTimeStats, fetchQuizGates])

  useEffect(() => { fetchTemplates() }, [selectedTeam, fetchTemplates])
  useEffect(() => { fetchMembers() }, [selectedTeam, fetchMembers])

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
  async function handleImportIssue() {
    const issueNumber = parseInt(importIssueNumber, 10)
    if (!selectedTeam || !importRepoUrl.trim() || !issueNumber) return
    setImporting(true); setError('')
    try {
      await importIssueToTask({
        team_id: selectedTeam,
        repo_url: importRepoUrl.trim(),
        issue_number: issueNumber,
        assigned_to: importAssignee.trim() || undefined,
      })
      setShowImportIssue(false); setImportRepoUrl(''); setImportIssueNumber(''); setImportAssignee(''); setIssueQuery(''); setIssueResults([])
      await fetchTasks(); await fetchProgress()
      toast.success('Issue imported', `Task created from issue #${issueNumber}`)
    } catch (e: any) { setError(e.message || 'Failed to import issue'); toast.error('Failed to import issue') }
    setImporting(false)
  }

  async function handleSearchIssues() {
    const repo = importRepoUrl.trim()
    const q = issueQuery.trim()
    if (!repo || !q) return
    setIssueSearching(true); setError('')
    try {
      const res = await searchIssues(repo, q, 20)
      setIssueResults(res.issues ?? [])
      if ((res.issues ?? []).length === 0) setError('No open issues match that search.')
    } catch (e: any) { setError(e.message || 'Failed to search issues'); toast.error('Failed to search issues') }
    setIssueSearching(false)
  }

  async function handleLogActualHours(taskId: string) {
    const hours = parseFloat(actualHoursInput)
    if (!hours || hours < 0) return
    try {
      await logActualHours(taskId, hours)
      setActualHoursInput(''); await fetchTasks(); await fetchTimeStats()
      toast.success('Hours logged', `${hours}h recorded`)
    } catch (e: any) { setError(e.message); toast.error('Failed to log hours') }
  }

  async function handlePeerReview(taskId: string, approve: boolean, needsProduct = false) {
    try {
      await peerReviewTask(taskId, {
        approve,
        needs_product: needsProduct,
        feedback: reviewFeedback.trim() ? { message: reviewFeedback.trim() } : undefined,
      })
      setReviewFeedback(''); setSelectedTask(null); await fetchTasks(); await fetchProgress()
      toast.success('Peer review submitted', approve ? 'Approved' : needsProduct ? 'Routed to product' : 'Changes requested')
    } catch (e: any) { setError(e.message); toast.error('Failed to peer review') }
  }

  async function handleClaimPeerReview(taskId: string) {
    try {
      await claimPeerReview(taskId)
      setSelectedTask(null); await fetchTasks()
      toast.success('Peer review claimed', 'Review the PR and submit your verdict')
    } catch (e: any) { setError(e.message); toast.error('Failed to claim peer review') }
  }

  async function handleCreateTemplate() {
    if (!tplName.trim() || !selectedTeam) return
    setTplCreating(true); setError('')
    try {
      await createTaskTemplate({
        name: tplName.trim(),
        module: tplModule.trim() || undefined,
        priority: tplPriority as any,
        estimated_hours: tplEstHours ? parseFloat(tplEstHours) : undefined,
      })
      setTplName(''); setTplModule(''); setTplPriority('medium'); setTplEstHours('')
      await fetchTemplates()
      toast.success('Template saved', 'Reusable task blueprint created')
    } catch (e: any) { setError(e.message || 'Failed to create template'); toast.error('Failed to create template') }
    setTplCreating(false)
  }

  async function handleBulkAssign() {
    if (!selectedTeam || selectedTemplates.size === 0 || !bulkAssignee.trim()) return
    setBusy(true); setError('')
    try {
      const res: BulkAssignResult = await bulkAssignTemplates({
        team_id: selectedTeam,
        assignee_id: bulkAssignee.trim(),
        template_ids: Array.from(selectedTemplates),
      })
      setSelectedTemplates(new Set()); setBulkAssignee('')
      await fetchTasks(); await fetchProgress()
      toast.success('Plan assigned', `${res.created_count} tasks created for ${bulkAssignee.trim()}`)
    } catch (e: any) { setError(e.message || 'Failed to bulk assign'); toast.error('Failed to bulk assign') }
    setBusy(false)
  }

  async function handleAutoStarter() {
    if (!selectedTeam || !starterRepo.trim() || !starterUserId.trim()) return
    setBusy(true); setError('')
    try {
      const res: StarterAssignmentResult = await autoAssignStarterTasks({
        team_id: selectedTeam,
        user_id: starterUserId.trim(),
        repo_url: starterRepo.trim(),
      })
      setStarterRepo(''); setStarterUserId('')
      await fetchTasks(); await fetchProgress()
      toast.success('Starter tasks assigned', `${res.created_count} tasks at ${res.level} difficulty`)
    } catch (e: any) { setError(e.message || 'Failed to auto-assign starter tasks'); toast.error('Failed to auto-assign') }
    setBusy(false)
  }

  async function handleExportTasks() {
    if (!selectedTeam) return
    try { await exportTasksCsv(selectedTeam); toast.success('Export ready', 'tasks.csv downloaded') }
    catch (e: any) { setError(e.message || 'Export failed'); toast.error('Export failed') }
  }

  async function handleExportTimeStats() {
    if (!selectedTeam) return
    try { await exportTimeStatsCsv(selectedTeam); toast.success('Export ready', 'time-stats.csv downloaded') }
    catch (e: any) { setError(e.message || 'Export failed'); toast.error('Export failed') }
  }

  async function handleReview(taskId: string, approve: boolean, needsProduct = false) {
    try {
      await reviewTask(taskId, { approve, needs_product: needsProduct, feedback: reviewFeedback.trim() ? { message: reviewFeedback.trim() } : undefined })
      setReviewFeedback(''); setSelectedTask(null); await fetchTasks(); await fetchProgress()
      toast.success('Task reviewed', needsProduct ? 'Routed to product' : approve ? 'Approved' : 'Changes requested')
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

  /** Kanban drag-and-drop persistence — transition the task to its new state. */
  async function handleKanbanMove(taskId: string, newState: string) {
    try {
      await transitionTask(taskId, newState)
      const task = tasks.find((t) => t.task_id === taskId)
      toast.success('Task moved', `${task?.title?.slice(0, 40) ?? 'Task'} → ${newState.replace(/_/g, ' ')}`)
      void fetchProgress()
    } catch (e: any) {
      toast.error('Move failed', e?.message || 'State transition rejected')
      throw e // let the board roll back its optimistic update
    }
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
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="w-full min-h-[calc(100vh-4rem)] p-3 sm:p-6 font-body text-text-primary relative">
        <PageHeader
          title="Tasks"
          subtitle="Senior → Trainee workflow — assign, work, review, approve, unlock"
          actions={
            <>
              <select value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}
                className="bg-bg-primary border border-border text-text-secondary text-sm rounded-xl px-3 py-1.5 outline-none focus:border-go/40 transition-colors">
                <option value="">Select team…</option>
                {teams.map((t: any) => (<option key={t.team_id || t.id} value={t.team_id || t.id}>{t.name}</option>))}
              </select>
              <div className="flex bg-bg-primary border border-border rounded-xl overflow-hidden p-0.5 gap-0.5">
                {(['board', 'list'] as const).map((v) => (
                  <button key={v} onClick={() => setView(v)}
                    className={cn('px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 capitalize',
                      view === v ? 'bg-bg-tertiary text-text-primary shadow-sm' : 'text-text-tertiary hover:text-text-secondary')}>
                    {v === 'board' ? <SquaresFour className="w-3.5 h-3.5" weight={view === v ? 'fill' : 'regular'} /> : <ListBullets className="w-3.5 h-3.5" weight={view === v ? 'fill' : 'regular'} />}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowImportIssue(!showImportIssue)}
                className="flex items-center gap-1.5 bg-bg-tertiary/60 hover:bg-bg-tertiary text-text-secondary px-4 py-1.5 rounded-xl text-sm font-medium border border-border transition-colors">
                <GithubLogo className="w-4 h-4" />
                Import Issue
              </button>
              <button onClick={() => setShowTimeStats(!showTimeStats)}
                className="flex items-center gap-1.5 bg-bg-tertiary/60 hover:bg-bg-tertiary text-text-secondary px-4 py-1.5 rounded-xl text-sm font-medium border border-border transition-colors">
                <Clock className="w-4 h-4" />
                Time Stats
              </button>
              <button onClick={() => setShowTemplates(!showTemplates)}
                className="flex items-center gap-1.5 bg-bg-tertiary/60 hover:bg-bg-tertiary text-text-secondary px-4 py-1.5 rounded-xl text-sm font-medium border border-border transition-colors">
                <Copy className="w-4 h-4" />
                Templates
              </button>
              <button onClick={handleExportTasks}
                className="flex items-center gap-1.5 bg-bg-tertiary/60 hover:bg-bg-tertiary text-text-secondary px-4 py-1.5 rounded-xl text-sm font-medium border border-border transition-colors"
                title="Download all tasks as CSV">
                <DownloadSimple className="w-4 h-4" />
                CSV
              </button>
              <button onClick={() => setShowCreate(!showCreate)}
                className="flex items-center gap-1.5 bg-go hover:bg-go/90 text-white px-4 py-1.5 rounded-xl text-sm font-bold transition-colors">
                <Plus className="w-4 h-4" weight="bold" />
                New Task
              </button>
            </>
          }
        />

        {showImportIssue && (
          <CardSpotlight className="mb-6">
            <div className="p-6 relative">
              <div className="absolute inset-x-0 top-0 h-px bg-border/60" />
              <div className="flex items-center gap-2 mb-4">
                <GithubLogo className="w-4 h-4 text-text-tertiary" weight="bold" />
                <GradientHeading as="h3">Import GitHub Issue as Task</GradientHeading>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="md:col-span-2">
                  <FieldLabel>Repo URL *</FieldLabel>
                  <Input value={importRepoUrl} onChange={(e) => setImportRepoUrl(e.target.value)} placeholder="https://github.com/owner/repo" />
                </div>
                <div>
                  <FieldLabel>Assignee (optional)</FieldLabel>
                  <MemberSelect members={members} value={importAssignee} onChange={setImportAssignee} />
                </div>
              </div>

              <div className="mb-4">
                <FieldLabel>Search issues by name</FieldLabel>
                <div className="flex gap-2">
                  <Input value={issueQuery} onChange={(e) => { setIssueQuery(e.target.value); setIssueResults([]) }} placeholder="e.g., login or auth…" onKeyDown={(e) => { if (e.key === 'Enter') handleSearchIssues() }} />
                  <button onClick={handleSearchIssues} disabled={issueSearching || !importRepoUrl.trim() || !issueQuery.trim()}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-45 whitespace-nowrap">
                    {issueSearching ? 'Searching…' : <><MagnifyingGlass className="w-4 h-4 inline mr-1 -mt-0.5" /> Search</>}
                  </button>
                </div>
              </div>

              {issueResults.length > 0 && (
                <div className="mb-4">
                  <FieldLabel>Select an issue {issueResults.length > 0 && `— ${issueResults.length} match${issueResults.length === 1 ? '' : 'es'}`}</FieldLabel>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {issueResults.map((iss) => {
                      const selected = importIssueNumber === String(iss.number)
                      return (
                        <button key={iss.number} onClick={() => { setImportIssueNumber(String(iss.number)); setImportAssignee(importAssignee) }}
                          className={`flex items-center gap-2.5 w-full text-left bg-bg-primary/60 border rounded-lg px-3 py-2 transition-colors ${selected ? 'border-go/60 bg-go/5' : 'border-border hover:border-go/30'}`}>
                          <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${selected ? 'border-go bg-go' : 'border-border'}`}>
                            {selected && <Check className="w-2.5 h-2.5 text-white" weight="bold" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs text-text-secondary truncate">{iss.title}</div>
                            <div className="text-[10px] text-text-tertiary font-mono">
                              #{iss.number}
                              {iss.labels && iss.labels.length > 0 && ` · ${iss.labels.slice(0, 3).join(', ')}`}
                            </div>
                          </div>
                          <a href={iss.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-text-tertiary/50 hover:text-go text-[10px] shrink-0">View ↗</a>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <FieldLabel>Issue Number *</FieldLabel>
                  <Input value={importIssueNumber} onChange={(e) => setImportIssueNumber(e.target.value)} placeholder="e.g., 42" type="number" />
                </div>
                <div className="md:col-span-2 self-end text-[11px] text-text-tertiary italic leading-relaxed">
                  Search above to find an issue by title and pick it — then it&apos;s ready to import.
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => { setShowImportIssue(false); setImportRepoUrl(''); setImportIssueNumber('') }} className="px-4 py-2 text-sm text-text-tertiary hover:text-text-secondary transition-colors">Cancel</button>
                <button onClick={handleImportIssue} disabled={importing || !importRepoUrl.trim() || !importIssueNumber.trim()}
                  className="bg-go hover:bg-go/90 text-white px-6 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-40">
                  {importing ? 'Importing…' : 'Import Issue'}
                </button>
              </div>
            </div>
          </CardSpotlight>
        )}

        {showTemplates && (
          <CardSpotlight className="mb-6">
            <div className="p-6 relative">
              <div className="absolute inset-x-0 top-0 h-px bg-border/60" />
              <div className="flex items-center gap-2 mb-5">
                <Copy className="w-4 h-4 text-text-tertiary" weight="bold" />
                <GradientHeading as="h3">Task Templates &amp; Plan Assignment</GradientHeading>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Create template */}
                <div className="bg-bg-secondary rounded-xl p-4 border border-border">
                  <div className="text-xs font-semibold text-text-secondary mb-3">Save a template</div>
                  <div className="space-y-3">
                    <div>
                      <FieldLabel>Template Name *</FieldLabel>
                      <Input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="e.g., Write integration tests for auth" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <FieldLabel>Module</FieldLabel>
                        <Input value={tplModule} onChange={(e) => setTplModule(e.target.value)} placeholder="auth" />
                      </div>
                      <div>
                        <FieldLabel>Est. Hours</FieldLabel>
                        <Input value={tplEstHours} onChange={(e) => setTplEstHours(e.target.value)} type="number" min="0" step="0.5" placeholder="4" />
                      </div>
                    </div>
                    <div>
                      <FieldLabel>Priority</FieldLabel>
                      <select value={tplPriority} onChange={(e) => setTplPriority(e.target.value)}
                        className="w-full bg-bg-primary border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-go/40">
                        {['low', 'medium', 'high'].map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                      </select>
                    </div>
                    <button onClick={handleCreateTemplate} disabled={tplCreating || !tplName.trim()}
                      className="w-full bg-go hover:bg-go/90 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-40">
                      {tplCreating ? 'Saving…' : 'Save Template'}
                    </button>
                  </div>
                </div>

                {/* Bulk assign from templates */}
                <div className="bg-bg-secondary rounded-xl p-4 border border-border">
                  <div className="text-xs font-semibold text-text-secondary mb-3">Bulk assign plan</div>
                  {templates.length === 0 ? (
                    <p className="text-xs text-text-tertiary italic">No templates yet — save one on the left to get started.</p>
                  ) : (
                    <>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 mb-3">
                        {templates.map((tpl) => {
                          const checked = selectedTemplates.has(tpl.template_id)
                          return (
                            <label key={tpl.template_id} className="flex items-center gap-2.5 cursor-pointer bg-bg-primary/60 border border-border rounded-lg px-3 py-2 hover:border-go/30 transition-colors">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  const next = new Set(selectedTemplates)
                                  if (checked) next.delete(tpl.template_id)
                                  else next.add(tpl.template_id)
                                  setSelectedTemplates(next)
                                }}
                                className="accent-[var(--color-accent)]"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="text-xs text-text-secondary truncate">{tpl.name}</div>
                                <div className="text-[10px] text-text-tertiary font-mono">{tpl.module || 'general'} · ~{tpl.estimated_hours ?? '—'}h</div>
                              </div>
                              <button
                                onClick={(e) => { e.preventDefault(); if (confirm('Delete this template?')) deleteTaskTemplate(tpl.template_id).then(() => { setSelectedTemplates(prev => { const n = new Set(prev); n.delete(tpl.template_id); return n }); fetchTemplates() }) }}
                                className="text-text-tertiary/40 hover:text-red-400 transition-colors"
                                title="Delete template"
                              >
                                <Trash className="w-3.5 h-3.5" />
                              </button>
                            </label>
                          )
                        })}
                      </div>
                      <div className="mb-3">
                        <FieldLabel>Assign to</FieldLabel>
                        <MemberSelect members={members} value={bulkAssignee} onChange={setBulkAssignee} />
                      </div>
                      <button onClick={handleBulkAssign} disabled={busy || selectedTemplates.size === 0 || !bulkAssignee.trim()}
                        className="w-full bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-40">
                        {busy ? 'Assigning…' : `Assign ${selectedTemplates.size || ''} template${selectedTemplates.size === 1 ? '' : 's'}`}
                      </button>
                    </>
                  )}
                </div>

                {/* Auto starter assignment */}
                <div className="bg-bg-secondary rounded-xl p-4 border border-border">
                  <div className="text-xs font-semibold text-text-secondary mb-3 flex items-center gap-1.5">
                    <Lightning className="w-3.5 h-3.5 text-text-tertiary" weight="fill" />
                    Auto-assign starter tasks
                  </div>
                  <p className="text-[11px] text-text-tertiary mb-3 leading-relaxed">
                    AI picks starter issues from the repo sized to the dev&apos;s quiz score + level.
                  </p>
                  <div className="space-y-3">
                    <div>
                      <FieldLabel>Dev *</FieldLabel>
                      <MemberSelect members={members} value={starterUserId} onChange={setStarterUserId} />
                    </div>
                    <div>
                      <FieldLabel>Repo URL *</FieldLabel>
                      <Input value={starterRepo} onChange={(e) => setStarterRepo(e.target.value)} placeholder="https://github.com/owner/repo" />
                    </div>
                    <button onClick={handleAutoStarter} disabled={busy || !starterRepo.trim() || !starterUserId.trim()}
                      className="w-full bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-40 inline-flex items-center justify-center gap-1.5">
                      <Lightning className="w-3.5 h-3.5" weight="fill" />
                      {busy ? 'Assigning…' : 'Generate Starter Tasks'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </CardSpotlight>
        )}

        {showTimeStats && timeStats && (
          <CardSpotlight className="mb-6">
            <div className="p-6 relative">
              <div className="absolute inset-x-0 top-0 h-px bg-border/60" />
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-text-tertiary" weight="bold" />
                <GradientHeading as="h3">Time Tracking — Estimated vs Actual</GradientHeading>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                {[
                  { label: 'Tasks with actuals', value: timeStats.with_actual_count },
                  { label: 'Total estimated', value: `${timeStats.total_estimated_hours}h` },
                  { label: 'Total actual', value: `${timeStats.total_actual_hours}h` },
                  { label: 'Avg variance', value: timeStats.avg_variance_hours != null ? `${timeStats.avg_variance_hours > 0 ? '+' : ''}${timeStats.avg_variance_hours}h` : '—' },
                ].map((stat) => (
                  <div key={stat.label} className="bg-bg-secondary rounded-xl p-3 border border-border">
                    <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-1">{stat.label}</div>
                    <div className="text-lg font-display font-bold text-text-primary">{stat.value}</div>
                  </div>
                ))}
              </div>
              {timeStats.tasks.filter((t) => t.actual_hours != null).length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {timeStats.tasks.filter((t) => t.actual_hours != null).map((t) => {
                    const variance = t.variance_hours ?? 0
                    const pct = t.variance_pct ?? 0
                    const over = variance > 0
                    const maxH = Math.max(t.estimated_hours ?? 0, t.actual_hours ?? 0, 1)
                    return (
                      <div key={t.task_id} className="bg-bg-secondary rounded-xl p-3 border border-border">
                        <div className="flex items-center justify-between mb-2 gap-2">
                          <span className="text-xs text-text-secondary truncate">{t.title}</span>
                          <span className={cn('text-[10px] font-mono shrink-0', over ? 'text-red-400' : 'text-green-400')}>
                            {pct > 0 ? '+' : ''}{pct}%
                          </span>
                        </div>
                        <div className="flex items-center gap-2 h-2.5">
                          <div className="flex-1 bg-bg-primary rounded-full h-full overflow-hidden flex">
                            <div className="bg-go/50 h-full" style={{ width: `${((t.estimated_hours ?? 0) / maxH) * 100}%` }} title={`Estimated ${t.estimated_hours}h`} />
                            <div className={cn('h-full', over ? 'bg-red-400/70' : 'bg-green-400/70')} style={{ width: `${((t.actual_hours ?? 0) / maxH) * 100}%` }} title={`Actual ${t.actual_hours}h`} />
                          </div>
                          <span className="text-[10px] text-text-tertiary font-mono">est {t.estimated_hours ?? '—'}h / {t.actual_hours}h</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-text-tertiary italic">No tasks have actual hours logged yet — log hours from a task detail view.</p>
              )}
              <div className="flex justify-end mt-4 pt-3 border-t border-border">
                <button onClick={handleExportTimeStats}
                  className="flex items-center gap-1.5 text-text-tertiary hover:text-text-secondary text-sm transition-colors">
                  <DownloadSimple className="w-4 h-4" />
                  Export time stats CSV
                </button>
              </div>
            </div>
          </CardSpotlight>
        )}

        {progress && (
          <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3 mb-6">
            {[
              { label: 'Total', value: progress.total, color: 'text-text-primary' },
              { label: 'Completed', value: progress.completed, color: 'text-emerald-500' },
              { label: 'In Progress', value: progress.in_progress, color: 'text-mission' },
              { label: 'Pending Rev.', value: progress.pending_review, color: 'text-caution' },
              { label: 'Blocked', value: progress.blocked, color: 'text-abort' },
            ].map((stat) => (
              <motion.div key={stat.label} variants={itemVariants}>
                <CardSpotlight>
                  <StatCard label={stat.label} value={stat.value} color={stat.color} />
                </CardSpotlight>
              </motion.div>
            ))}
          </motion.div>
        )}

        {error && <div className="mb-5 px-4 py-3 rounded-xl bg-red-500/8 border border-red-500/20 text-red-400 text-sm">{error}</div>}

        {showCreate && (
          <CardSpotlight className="mb-6">
            <div className="p-6 relative">
              <div className="absolute inset-x-0 top-0 h-px bg-border/60" />
              <div className="flex items-center gap-2 mb-4">
                <Plus className="w-4 h-4 text-text-tertiary" weight="bold" />
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
                    className="w-full bg-bg-primary border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-go/40">
                    {['low', 'medium', 'high'].map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div className="mb-4">
                <FieldLabel>Description</FieldLabel>
                <Textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Describe the task in detail…" rows={3} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
                <div>
                  <FieldLabel>Module</FieldLabel>
                  <Input value={formModule} onChange={(e) => setFormModule(e.target.value)} placeholder="e.g., auth" />
                </div>
                <div>
                  <FieldLabel>Assignee</FieldLabel>
                  <MemberSelect members={members} value={formAssignee} onChange={setFormAssignee} placeholder="Unassigned" />
                </div>
                <div>
                  <FieldLabel>Repo URL</FieldLabel>
                  <Input value={formRepoUrl} onChange={(e) => setFormRepoUrl(e.target.value)} placeholder="https://github.com/…" />
                </div>
                <div>
                  <FieldLabel>Unlock Modules</FieldLabel>
                  <Input value={formUnlockModules} onChange={(e) => setFormUnlockModules(e.target.value)} placeholder="auth, api, payments" />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => { setShowCreate(false); resetForm() }} className="px-4 py-2 text-sm text-text-tertiary hover:text-text-secondary transition-colors">Cancel</button>
                <button onClick={handleCreateTask} disabled={creating || !formTitle.trim()}
                  className="bg-go hover:bg-go/90 text-white px-6 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-40">
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
            className="w-full bg-bg-primary border border-border text-text-primary text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none focus:border-go/40 placeholder:text-text-tertiary/30 transition-colors" />
        </div>

        {loading && <TasksPageSkeleton />}

        {!loading && view === 'board' && (
          <motion.div variants={containerVariants} initial="hidden" animate="visible" className="overflow-x-auto pb-4">
            <KanbanBoard
              columns={BOARD_COLUMNS}
              tasks={filteredTasks as KanbanTask[]}
              priorityDot={PRIORITY_DOTS}
              onMoveTask={handleKanbanMove}
              onTaskClick={(task) => setSelectedTask(task as any)}
              renderCardMeta={(task) =>
                task.actual_hours != null && task.estimated_hours != null && task.actual_hours > task.estimated_hours + 0.01 ? (
                  <span className="rounded-sm border border-abort/20 bg-abort/5 px-1.5 py-0.5 font-code text-[10px] text-abort" title="Over estimated time">
                    overrun
                  </span>
                ) : null
              }
            />
          </motion.div>
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
                    <div className="grid grid-cols-[100px_1fr_80px_70px_54px] gap-2 sm:gap-4 px-3 sm:px-5 py-2.5 border-b border-border min-w-[450px] sm:min-w-[500px]">
                      {['Status', 'Task', 'Assignee', 'Priority', 'Est.'].map((h) => (
                        <span key={h} className="text-[10px] uppercase tracking-widest text-text-tertiary font-semibold">{h}</span>
                      ))}
                    </div>
                    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="divide-y divide-border/60">
                      {paginatedTasks.map((task) => (
                        <motion.div key={task.task_id} variants={itemVariants}>
                          <div onClick={() => setSelectedTask(task)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedTask(task) } }}
                            role="button"
                            tabIndex={0}
                            aria-label={`Task: ${task.title}`}
                            className="grid grid-cols-[120px_1fr_100px_80px_64px] gap-4 items-center px-5 py-3.5 hover:bg-bg-tertiary/30 cursor-pointer transition-colors group min-w-[500px] focus:outline-none focus:ring-1 focus:ring-go/40 rounded-lg">
                            <StatusBadge state={task.state} />
                            <div className="min-w-0">
                              <div className="text-xs sm:text-sm text-text-secondary group-hover:text-text-primary truncate font-medium transition-colors">{task.title}</div>
                              {task.module && <div className="text-[10px] text-go/50 font-mono mt-0.5">{task.module}</div>}
                            </div>
                            <div className="text-xs text-text-tertiary truncate flex items-center gap-1">
                              <UserCircle className="w-3 h-3" weight="fill" />
                              {memberName(members, task.assigned_to)}
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setSelectedTask(null)} role="presentation">
            <div className="bg-bg-primary border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto mx-4 shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}>
              <div className="absolute inset-x-0 top-0 h-px bg-border/60" />

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
                      <div className="text-go font-mono">{selectedTask.module}</div>
                    </div>
                  )}
                  {selectedTask.assigned_to && (
                    <div className="bg-bg-secondary rounded-xl p-3 border border-border">
                      <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-1">Assigned To</div>
                      <div className="text-text-primary flex items-center gap-1.5" title={selectedTask.assigned_to}>
                        <UserCircle className="w-3.5 h-3.5" weight="fill" />
                        {memberName(members, selectedTask.assigned_to)}
                      </div>
                    </div>
                  )}
                  {selectedTask.estimated_hours && (
                    <div className="bg-bg-secondary rounded-xl p-3 border border-border">
                      <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-1">Est. Time</div>
                      <div className="text-text-primary">{selectedTask.estimated_hours}h</div>
                    </div>
                  )}
                  {selectedTask.actual_hours != null && (
                    <div className="bg-bg-secondary rounded-xl p-3 border border-border">
                      <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-1">Actual Time</div>
                      <div className={cn('text-text-primary', selectedTask.estimated_hours != null && selectedTask.actual_hours > selectedTask.estimated_hours + 0.01 ? 'text-red-400' : 'text-green-400')}>
                        {selectedTask.actual_hours}h
                        {selectedTask.estimated_hours != null && (
                          <span className="text-[10px] text-text-tertiary ml-1.5 font-mono">
                            ({selectedTask.actual_hours - selectedTask.estimated_hours > 0 ? '+' : ''}{(selectedTask.actual_hours - selectedTask.estimated_hours).toFixed(1)}h)
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {selectedTask.depends_on && (
                    <div className="bg-bg-secondary rounded-xl p-3 border border-border">
                      <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-1 flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Dependency
                      </div>
                      <div className="text-xs text-blue-400 font-mono">Blocked until {selectedTask.depends_on} completes</div>
                    </div>
                  )}
                  {selectedTask.source_issue && (
                    <div className="bg-bg-secondary rounded-xl p-3 border border-border">
                      <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-1 flex items-center gap-1">
                        <GithubLogo className="w-3 h-3" /> Source Issue
                      </div>
                      {(typeof selectedTask.source_issue === 'object'
                        ? <a
                            href={(selectedTask.source_issue as { url?: string }).url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-go font-mono hover:underline inline-flex items-center gap-1"
                          >
                            <GithubLogo className="w-3 h-3" />#{selectedTask.source_issue.number}
                          </a>
                        : <div className="text-xs text-go font-mono">#{selectedTask.source_issue}</div>
                      )}
                    </div>
                  )}
                  {selectedTask.quiz_required && selectedTask.module && (
                    <div className="bg-bg-secondary rounded-xl p-3 border border-border">
                      <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-1 flex items-center gap-1">
                        <GraduationCap className="w-3 h-3" /> Quiz Gate
                      </div>
                      <div className={cn('text-xs flex items-center gap-1.5', quizGateMap[selectedTask.task_id]?.passed ? 'text-green-400' : 'text-yellow-400')}>
                        {quizGateMap[selectedTask.task_id]?.passed
                          ? <><Check className="w-3 h-3" weight="bold" /> Module quiz passed</>
                          : <><Lock className="w-3 h-3" weight="fill" /> Pass module quiz to start</>}
                      </div>
                    </div>
                  )}
                  {selectedTask.peer_reviewed_by && (
                    <div className="bg-bg-secondary rounded-xl p-3 border border-border">
                      <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-1 flex items-center gap-1">
                        <UsersThree className="w-3 h-3" /> Peer Reviewer
                      </div>
                      <div className="text-xs text-text-primary font-mono">{selectedTask.peer_reviewed_by}</div>
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
                  {selectedTask.pr_comments && selectedTask.pr_comments.length > 0 && (
                    <div className="bg-bg-secondary rounded-xl p-3 border border-border md:col-span-3">
                      <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <GithubLogo className="w-3 h-3" /> PR Inline Comments ({selectedTask.pr_comments.length})
                      </div>
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {selectedTask.pr_comments.map((c, i) => (
                          <div key={i} className="text-[11px] bg-bg-primary/60 border border-border rounded-lg p-2.5">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-go font-mono font-semibold">@{c.user}</span>
                              {c.path && <span className="text-text-tertiary font-mono text-[10px]">{c.path}{c.line ? `:${c.line}` : ''}</span>}
                            </div>
                            <p className="text-text-secondary leading-relaxed">{c.body}</p>
                          </div>
                        ))}
                      </div>
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
                          selectedTask.ai_review.score >= 60 ? 'bg-go/15 text-go' : 'bg-red-500/15 text-red-400')}>
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
                                issue.severity === 'warning' ? 'bg-go/5 border-go/15 text-go' : 'bg-bg-tertiary/50 border-border text-text-tertiary')}>
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
                    <div className="flex gap-2 items-center">
                      <MemberSelect members={members} value={assignUserId} onChange={setAssignUserId} placeholder="Assign to a member…" className="flex-1" />
                      <button onClick={() => handleAssign(selectedTask.task_id, assignUserId)} disabled={!assignUserId.trim()}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 whitespace-nowrap">Assign</button>
                      <button onClick={() => handleCancel(selectedTask.task_id)} className="text-red-400/50 hover:text-red-400 text-sm px-3 transition-colors">Cancel</button>
                    </div>
                  )}
                  {selectedTask.state === 'assigned' && (
                    <div className="flex gap-2">
                      <button onClick={() => handleStart(selectedTask.task_id)} className="bg-go hover:bg-go/90 text-white px-6 py-2 rounded-xl text-sm font-bold transition-colors">Start Working</button>
                      <button onClick={() => handleCancel(selectedTask.task_id)} className="text-red-400/50 hover:text-red-400 text-sm px-3 transition-colors">Cancel</button>
                    </div>
                  )}
                  {selectedTask.state === 'in_progress' && (
                    <div className="flex gap-2">
                      <Input value={prUrlInput} onChange={(e) => setPrUrlInput(e.target.value)} placeholder="Paste PR URL…" className="flex-1" />
                      <button onClick={() => handleSubmit(selectedTask.task_id, prUrlInput)} disabled={!prUrlInput.trim()}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-40">Submit for Review</button>
                    </div>
                  )}
                  {(selectedTask.state === 'submitted' || selectedTask.state === 'under_review' || selectedTask.state === 'peer_review') && (
                    <div className="space-y-3">
                      <Textarea value={reviewFeedback} onChange={(e) => setReviewFeedback(e.target.value)} placeholder="Add review feedback…" rows={3} />
                      <div className="flex gap-2 flex-wrap">
                        {selectedTask.state === 'peer_review' ? (
                          <>
                            <button onClick={() => handlePeerReview(selectedTask.task_id, false)} className="bg-red-500/80 hover:bg-red-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">Request Changes</button>
                            <button onClick={() => handlePeerReview(selectedTask.task_id, true, true)} className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">Route to Product</button>
                            <button onClick={() => handlePeerReview(selectedTask.task_id, true)} className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">Approve</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => handleReview(selectedTask.task_id, false)} className="bg-red-500/80 hover:bg-red-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">Request Changes</button>
                            <button onClick={() => handleReview(selectedTask.task_id, true, true)} className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">Route to Product</button>
                            <button onClick={() => handleApprove(selectedTask.task_id)} className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">Approve</button>
                            <button onClick={() => handleClaimPeerReview(selectedTask.task_id)} className="bg-blue-500/80 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors inline-flex items-center gap-1.5">
                              <UsersThree className="w-3.5 h-3.5" /> Peer Review
                            </button>
                          </>
                        )}
                        <button onClick={() => handleCancel(selectedTask.task_id)} className="text-red-400/50 hover:text-red-400 text-sm px-3 transition-colors">Cancel</button>
                      </div>
                    </div>
                  )}
                  {selectedTask.state === 'needs_changes' && (
                    <div className="flex gap-2">
                      <button onClick={() => handleStart(selectedTask.task_id)} className="bg-go hover:bg-go/90 text-white px-6 py-2 rounded-xl text-sm font-bold transition-colors">Resume Working</button>
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
                  {(selectedTask.state === 'completed' || selectedTask.state === 'in_progress' || selectedTask.state === 'needs_changes') && (
                    <div className="flex gap-2">
                      <Input value={actualHoursInput} onChange={(e) => setActualHoursInput(e.target.value)} placeholder="Hours spent…" type="number" min="0" step="0.5" className="w-32" />
                      <button onClick={() => handleLogActualHours(selectedTask.task_id)} disabled={!actualHoursInput}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 inline-flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" /> Log Hours
                      </button>
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
    </motion.div>
  )
}
