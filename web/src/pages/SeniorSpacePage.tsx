import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Eye, Heartbeat, Users, CheckCircle, GitBranch, ArrowRight, Warning,
} from '@phosphor-icons/react'
import ConsolePanel from '../components/ui/console-panel'
import { EmptyState } from '../components/ui/empty-state'
import { PageHeader } from '../components/ui/page-header'
import { MetricStrip, MetricCell } from '../components/ui/metric-strip'
import { cn } from '../lib/utils'
import {
  fetchCTODashboard, fetchReposByTeam, getTeamMembers,
  createTask, listTasks, approveTask, mergePR,
} from '../lib/api'
import type { RepoItem, WorkflowTask } from '../lib/api'
import ApiCostTracking from '../components/dashboard/ApiCostTracking'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 90, damping: 18 } },
}

interface ReviewItem {
  id: string
  title: string
  author: string
  module: string
  status: 'submitted' | 'under_review' | 'needs_changes'
  timestamp: string
}

interface TeamMember {
  name: string
  role: string
  completion: number
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  submitted: { label: 'Submitted', color: 'text-caution', bg: 'bg-caution/10' },
  under_review: { label: 'Under review', color: 'text-mission', bg: 'bg-mission/10' },
  needs_changes: { label: 'Needs changes', color: 'text-abort', bg: 'bg-abort/10' },
}

const defaultModules = [
  { module: 'Architecture Explorer', permission: 'Read / Write' },
  { module: 'Learning Paths', permission: 'Read / Write' },
  { module: 'Code Health', permission: 'Read Only' },
  { module: 'Task Workflows', permission: 'Full Access' },
]

// ── PR Review & Merge Panel ──────────────────────────────────────────────────

function PRReviewPanel({ teamId }: { teamId: string }) {
  const toast = useToast()
  const [prs, setPRs] = useState<WorkflowTask[]>([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)

  function loadPRs() {
    setLoading(true)
    listTasks({ team_id: teamId, state: 'submitted' })
      .then((r) => {
        const submitted = (r.tasks ?? []).filter((t: WorkflowTask) => t.pr_url)
        // also load under_review
        return listTasks({ team_id: teamId, state: 'under_review' }).then((r2) => {
          const underReview = (r2.tasks ?? []).filter((t: WorkflowTask) => t.pr_url)
          const seen = new Set<string>()
          const merged: WorkflowTask[] = []
          for (const t of [...submitted, ...underReview]) {
            if (!seen.has(t.task_id)) { seen.add(t.task_id); merged.push(t) }
          }
          setPRs(merged)
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listTasks({ team_id: teamId, state: 'submitted' })
      .then((r) => {
        if (cancelled) return
        const submitted = (r.tasks ?? []).filter((t: WorkflowTask) => t.pr_url)
        return listTasks({ team_id: teamId, state: 'under_review' }).then((r2) => {
          if (cancelled) return
          const underReview = (r2.tasks ?? []).filter((t: WorkflowTask) => t.pr_url)
          const seen = new Set<string>()
          const merged: WorkflowTask[] = []
          for (const t of [...submitted, ...underReview]) {
            if (!seen.has(t.task_id)) { seen.add(t.task_id); merged.push(t) }
          }
          setPRs(merged)
        })
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [teamId])

  async function handleApprove(task: WorkflowTask) {
    setActionId(task.task_id)
    try {
      await approveTask(task.task_id)
      toast.success('PR approved', `"${task.title}" approved — ready to merge.`)
      loadPRs()
    } catch (err: unknown) {
      toast.error('Approve failed', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setActionId(null)
    }
  }

  async function handleMerge(task: WorkflowTask) {
    setActionId(task.task_id + ':merge')
    try {
      await mergePR(task.task_id, { merge_method: 'squash' })
      toast.success('PR merged!', `"${task.title}" merged and task completed.`)
      loadPRs()
    } catch (err: unknown) {
      toast.error('Merge failed', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setActionId(null)
    }
  }

  return (
    <ConsolePanel
      rail="PR Review Queue"
      designator="senior · merge"
      status={prs.length > 0 ? 'caution' : 'go'}
      live={prs.length > 0}
    >
      {loading ? (
        <p className="text-caption text-ink-tertiary/50 animate-pulse">Loading PRs…</p>
      ) : prs.length === 0 ? (
        <p className="text-caption text-ink-tertiary/50">No PRs awaiting review.</p>
      ) : (
        <div className="space-y-3">
          {prs.map((task) => {
            const busy = actionId === task.task_id || actionId === task.task_id + ':merge'
            const isApproved = task.state === 'approved'
            return (
              <div key={task.task_id} className="p-3 rounded-[3px] bg-well/30 border border-seam space-y-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm font-medium text-ink truncate">{task.title}</p>
                    {task.pr_url && (
                      <a
                        href={task.pr_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-caption text-go/80 hover:text-go font-code truncate block"
                      >
                        {task.pr_url.replace('https://github.com/', '')}
                      </a>
                    )}
                  </div>
                  <span className={cn(
                    'shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium',
                    task.state === 'submitted' ? 'bg-caution/10 text-caution' : 'bg-mission/10 text-mission',
                  )}>
                    {task.state?.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {!isApproved && (
                    <button
                      disabled={busy}
                      onClick={() => handleApprove(task)}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-caption font-semibold rounded-[3px] bg-go/10 border border-go/30 text-go hover:bg-go/20 disabled:opacity-50 transition-colors"
                    >
                      <CheckCircle size={11} weight="fill" />
                      {actionId === task.task_id ? 'Approving…' : 'Approve'}
                    </button>
                  )}
                  <button
                    disabled={busy}
                    onClick={() => handleMerge(task)}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-caption font-semibold rounded-[3px] bg-go text-white hover:bg-go-lit disabled:opacity-50 transition-colors"
                  >
                    <GitBranch size={11} weight="bold" />
                    {actionId === task.task_id + ':merge' ? 'Merging…' : 'Merge PR'}
                  </button>
                  <button
                    onClick={loadPRs}
                    className="ml-auto text-caption text-ink-tertiary/50 hover:text-ink-secondary transition-colors"
                  >
                    Refresh
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </ConsolePanel>
  )
}

// ── Assign Repository Panel ─────────────────────────────────────────────────

interface TeamMemberRaw { user_id: string; name: string; role: string }

function AssignRepoPanel({ teamId }: { teamId: string }) {
  const toast = useToast()
  const [members, setMembers] = useState<TeamMemberRaw[]>([])
  const [repos, setRepos] = useState<RepoItem[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedRepoId, setSelectedRepoId] = useState('')
  const [manualUrl, setManualUrl] = useState('')
  const [useManual, setUseManual] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDesc, setTaskDesc] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [recentAssignments, setRecentAssignments] = useState<WorkflowTask[]>([])

  useEffect(() => {
    getTeamMembers(teamId)
      .then((list) => setMembers(list))
      .catch(() => { /* members load is best-effort */ })
    fetchReposByTeam(teamId)
      .then((r) => setRepos(r.repos ?? []))
      .catch(() => { /* repos load is best-effort */ })
    listTasks({ team_id: teamId })
      .then((r) => setRecentAssignments(
        (r.tasks ?? []).filter((t: WorkflowTask) => t.repo_url).slice(0, 5)
      ))
      .catch(() => { /* recent tasks load is best-effort */ })
  }, [teamId])

  // Auto-fill title when selection changes
  useEffect(() => {
    if (!useManual && selectedRepoId) {
      const repo = repos.find((r) => r.id === selectedRepoId)
      if (repo) setTaskTitle(`Work on ${repo.owner}/${repo.name}`)
    } else if (useManual && manualUrl) {
      const m = manualUrl.match(/github\.com\/([^/]+)\/([^/]+)/)
      if (m) setTaskTitle(`Work on ${m[1]}/${m[2].replace('.git', '')}`)
    }
  }, [selectedRepoId, manualUrl, useManual, repos])

  // Juniors/devs only — seniors assign, not self-assign
  const assignableMembers = members.filter((m) =>
    ['junior_dev', 'developer', 'member', 'tester'].includes(m.role)
  )

  function resolveRepoUrl(): string {
    if (useManual) return manualUrl.trim()
    const repo = repos.find((r) => r.id === selectedRepoId)
    if (!repo) return ''
    return repo.url ||
      `https://github.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`
  }

  async function handleAssign() {
    if (!selectedUserId) { toast.error('Select a developer', 'Choose who to assign the repo to.'); return }
    const repoUrl = resolveRepoUrl()
    if (!repoUrl) { toast.error('Repo required', 'Pick a registered repo or enter a URL.'); return }
    if (!taskTitle.trim()) { toast.error('Title required', 'Add a task title.'); return }

    setAssigning(true); setErrorMsg(''); setSuccessMsg('')
    try {
      await createTask({
        team_id: teamId,
        title: taskTitle.trim(),
        description: taskDesc.trim() || undefined,
        repo_url: repoUrl,
        assigned_to: selectedUserId,
        priority: 'medium',
        module: 'Repository Assignment',
      })
      const assignee = members.find((m) => m.user_id === selectedUserId)
      setSuccessMsg(`Assigned to ${assignee?.name ?? 'developer'}`)
      toast.success('Repository assigned', `${taskTitle} → ${assignee?.name ?? 'developer'}`)
      setSelectedUserId(''); setSelectedRepoId(''); setManualUrl('')
      setTaskTitle(''); setTaskDesc('')
      // Refresh list
      listTasks({ team_id: teamId })
        .then((r) => setRecentAssignments(
          (r.tasks ?? []).filter((t: WorkflowTask) => t.repo_url).slice(0, 5)
        ))
        .catch(() => {})
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Assignment failed'
      setErrorMsg(msg)
      toast.error('Assignment failed', msg)
    } finally {
      setAssigning(false)
    }
  }

  return (
    <ConsolePanel rail="Assign Repository" designator="senior · assign" status="go">
      <div className="space-y-4">
        {/* Developer picker */}
        <div className="space-y-1.5">
          <label className="text-caption text-ink-tertiary/70 font-medium uppercase tracking-widest">Developer</label>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="w-full bg-base border border-seam text-ink text-body-sm rounded-[3px] px-3 py-2 focus:outline-none focus:border-go/60 focus:ring-1 focus:ring-go/30 transition-colors"
          >
            <option value="">Select developer…</option>
            {assignableMembers.length === 0 && members.length > 0 && (
              <option disabled>No junior/developer members found</option>
            )}
            {assignableMembers.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.name} ({m.role.replace('_', ' ')})
              </option>
            ))}
          </select>
        </div>

        {/* Repo source toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setUseManual(false)}
            className={cn(
              'px-3 py-1 text-caption rounded-[3px] border transition-colors',
              !useManual
                ? 'bg-go/10 border-go/40 text-go font-medium'
                : 'bg-base border-seam text-ink-secondary hover:border-go/30',
            )}
          >
            Registered repos
          </button>
          <button
            onClick={() => setUseManual(true)}
            className={cn(
              'px-3 py-1 text-caption rounded-[3px] border transition-colors',
              useManual
                ? 'bg-go/10 border-go/40 text-go font-medium'
                : 'bg-base border-seam text-ink-secondary hover:border-go/30',
            )}
          >
            Any GitHub URL
          </button>
        </div>

        {/* Repo selector or URL input */}
        {!useManual ? (
          <div className="space-y-1.5">
            <label className="text-caption text-ink-tertiary/70 font-medium uppercase tracking-widest">Repository</label>
            <select
              value={selectedRepoId}
              onChange={(e) => setSelectedRepoId(e.target.value)}
              className="w-full bg-base border border-seam text-ink text-body-sm rounded-[3px] px-3 py-2 focus:outline-none focus:border-go/60 focus:ring-1 focus:ring-go/30 transition-colors"
            >
              <option value="">Select repository…</option>
              {repos.length === 0 && (
                <option disabled>No repos registered for this team</option>
              )}
              {repos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.owner}/{r.name}
                </option>
              ))}
            </select>
            {repos.length === 0 && (
              <p className="text-caption text-ink-tertiary/50">
                No registered repos found. Switch to "Any GitHub URL" to assign directly.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <label className="text-caption text-ink-tertiary/70 font-medium uppercase tracking-widest">GitHub URL</label>
            <input
              type="url"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              className="w-full bg-base border border-seam text-ink text-body-sm rounded-[3px] px-3 py-2 focus:outline-none focus:border-go/60 focus:ring-1 focus:ring-go/30 transition-colors placeholder:text-ink-muted/40"
            />
          </div>
        )}

        {/* Task title */}
        <div className="space-y-1.5">
          <label className="text-caption text-ink-tertiary/70 font-medium uppercase tracking-widest">Task title</label>
          <input
            type="text"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            placeholder="e.g. Work on facebook/react repository"
            className="w-full bg-base border border-seam text-ink text-body-sm rounded-[3px] px-3 py-2 focus:outline-none focus:border-go/60 focus:ring-1 focus:ring-go/30 transition-colors placeholder:text-ink-muted/40"
          />
        </div>

        {/* Description (optional) */}
        <div className="space-y-1.5">
          <label className="text-caption text-ink-tertiary/70 font-medium uppercase tracking-widest">Notes <span className="text-ink-tertiary/40 normal-case">(optional)</span></label>
          <textarea
            value={taskDesc}
            onChange={(e) => setTaskDesc(e.target.value)}
            rows={2}
            placeholder="What should they focus on? Any specific files or issues?"
            className="w-full bg-base border border-seam text-ink text-body-sm rounded-[3px] px-3 py-2 focus:outline-none focus:border-go/60 focus:ring-1 focus:ring-go/30 transition-colors placeholder:text-ink-muted/40 resize-none"
          />
        </div>

        {/* Feedback */}
        {successMsg && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-[3px] bg-go/10 border border-go/20 text-go text-body-sm">
            <CheckCircle size={14} weight="fill" />
            {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-[3px] bg-abort/10 border border-abort/20 text-abort text-body-sm">
            <Warning size={14} weight="fill" />
            {errorMsg}
          </div>
        )}

        {/* Assign button */}
        <button
          onClick={handleAssign}
          disabled={assigning}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-go text-white text-body-sm font-semibold rounded-[3px] hover:bg-go-lit disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {assigning ? (
            <>Assigning…</>
          ) : (
            <>
              <GitBranch size={14} weight="bold" />
              Assign Repository
              <ArrowRight size={14} weight="bold" />
            </>
          )}
        </button>

        {/* Recent assignments */}
        {recentAssignments.length > 0 && (
          <div className="pt-2 border-t border-seam space-y-2">
            <p className="text-caption text-ink-tertiary/60 font-medium uppercase tracking-widest">Recent assignments</p>
            {recentAssignments.map((t) => (
              <div key={t.task_id} className="flex items-center justify-between p-2.5 rounded-[3px] bg-well/20 border border-seam">
                <div className="min-w-0 flex-1">
                  <p className="text-body-xs text-ink font-medium truncate">{t.title}</p>
                  <p className="text-caption text-ink-tertiary/50 truncate">{t.repo_url}</p>
                </div>
                <span className={cn(
                  'ml-3 shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium',
                  t.state === 'completed' ? 'bg-go/10 text-go' :
                  t.state === 'in_progress' ? 'bg-mission/10 text-mission' :
                  'bg-caution/10 text-caution'
                )}>
                  {t.state?.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </ConsolePanel>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function SeniorSpacePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dashboard, setDashboard] = useState<any>(null)
  const { activeTeamId } = useAuth()

  useEffect(() => {
    let cancelled = false
    fetchCTODashboard()
      .then((res) => { if (!cancelled) { setDashboard(res); setLoading(false) } })
      .catch((err) => { if (!cancelled) { setError(err.message); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  const d = dashboard
  // Map user UUID → display name so review rows show names, not ids.
  const memberNames = useMemo(() => {
    const map: Record<string, string> = {}
    for (const m of d?.member_progress ?? []) {
      if (m.user_id && m.name) map[m.user_id] = m.name
    }
    return map
  }, [d?.member_progress])
  const resolveName = (uid?: string | null) =>
    (uid && memberNames[uid]) || 'Unknown'

  const reviews: ReviewItem[] = d?.pending_reviews?.map((r: any) => ({
    id: r.task_id,
    title: r.title,
    author: resolveName(r.assigned_to),
    module: r.module,
    status: r.state === 'submitted' ? 'submitted' : r.state === 'under_review' ? 'under_review' : 'needs_changes',
    timestamp: r.created_at,
  })) ?? []

  const teamMembers: TeamMember[] = d?.member_progress?.map((m: any) => ({
    name: m.name,
    role: m.role ?? 'Developer',
    completion: m.completion_rate ?? 0,
  })) ?? []

  const metrics = [
    { label: 'Pending reviews', value: reviews.length, color: 'text-caution' },
    { label: 'Code health', value: `${d?.completion_rate ?? 0}%`, color: 'text-go' },
    { label: 'Active members', value: d?.total_members ?? 0, color: 'text-mission' },
    { label: 'Open tasks', value: d?.in_progress_tasks ?? 0, color: 'text-go' },
  ]

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-6xl mx-auto space-y-8 relative"
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <PageHeader
          eyebrow="Folio 05 · Senior"
          title="Senior Developer Space"
          subtitle="Code quality, mentorship, and team oversight."
        />
      </motion.div>

      {error && (
        <div className="px-4 py-3 rounded-card bg-abort/10 border border-abort/20 text-abort text-body-sm">{error}</div>
      )}

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 rounded-card bg-panel border border-seam animate-skeleton" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-64 rounded-card bg-panel border border-seam animate-skeleton" />
            <div className="h-64 rounded-card bg-panel border border-seam animate-skeleton" />
          </div>
        </div>
      ) : (
        <>
          {/* Metrics — one ruled strip */}
          <motion.div variants={itemVariants}>
            <MetricStrip className="grid-cols-2 lg:grid-cols-4">
              {metrics.map((m) => (
                <MetricCell key={m.label} label={m.label} value={m.value} accent={m.color} />
              ))}
            </MetricStrip>
          </motion.div>

          {/* Review Queue + Code Health */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div variants={itemVariants}>
              <ConsolePanel rail="Review Queue" designator={`${reviews.length} pending`} status="caution">
                {reviews.length === 0 ? (
                  <EmptyState icon={<Eye className="w-8 h-8 text-ink-tertiary/30" weight="duotone" />} title="No pending reviews" description="All caught up on reviews." />
                ) : (
                  <div className="space-y-2">
                    {reviews.map((review, i) => {
                      const cfg = statusConfig[review.status]
                      return (
                        <motion.div
                          key={review.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.06 }}
                          className="flex items-start gap-3 p-3 rounded-card bg-well/20 border border-seam hover:border-caution/30 transition-colors cursor-pointer"
                        >
                          <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', cfg.color.replace('text', 'bg'))} />
                          <div className="flex-1 min-w-0">
                            <p className="text-body-xs text-ink font-medium truncate">{review.title}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', cfg.bg, cfg.color)}>{cfg.label}</span>
                              <span className="text-caption text-ink-tertiary/50 font-code">{review.module}</span>
                              <span className="text-caption text-ink-tertiary/40">by {review.author}</span>
                              <span className="text-caption text-ink-tertiary/40">· {review.timestamp}</span>
                            </div>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                )}
              </ConsolePanel>
            </motion.div>

            <motion.div variants={itemVariants}>
              <ConsolePanel rail="Code Health" designator={`${d?.completion_rate ?? 0}%`} status="go">
                {teamMembers.length === 0 ? (
                  <EmptyState icon={<Heartbeat className="w-8 h-8 text-ink-tertiary/30" weight="duotone" />} title="No team data" description="Member progress data will appear here." />
                ) : (
                  <div className="space-y-3">
                    {teamMembers.map((m, i) => (
                      <motion.div
                        key={m.name}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.06 }}
                        className="p-3 rounded-card bg-well/20 border border-seam"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-body-xs font-medium text-ink">{m.name}</span>
                          <span className={cn('text-caption font-code tabular-nums', m.completion >= 80 ? 'text-go' : m.completion >= 60 ? 'text-go' : 'text-abort')}>
                            {m.completion}%
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-well overflow-hidden mb-1.5">
                          <div
                            className={cn('h-full rounded-full transition-all duration-700', m.completion >= 80 ? 'bg-success' : m.completion >= 60 ? 'bg-go' : 'bg-error')}
                            style={{ width: `${m.completion}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-caption text-ink-tertiary/50">
                          <span>{m.role}</span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </ConsolePanel>
            </motion.div>
          </div>

          {/* Module Access + Team Progress */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div variants={itemVariants}>
              <ConsolePanel rail="Module Access">
                <div className="space-y-2">
                  {defaultModules.map((mod) => (
                    <div key={mod.module} className="flex items-center justify-between p-2.5 rounded-card bg-well/20 border border-seam">
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded bg-go/10 flex items-center justify-center">
                          <CheckCircle className="w-3.5 h-3.5 text-go" weight="fill" />
                        </div>
                        <div>
                          <p className="text-body-xs text-ink font-medium">{mod.module}</p>
                          <p className="text-caption text-ink-tertiary/60">{mod.permission}</p>
                        </div>
                      </div>
                      <span className="text-caption font-medium text-go">Granted</span>
                    </div>
                  ))}
                </div>
              </ConsolePanel>
            </motion.div>

            <motion.div variants={itemVariants}>
              <ConsolePanel rail="Team Progress">
                {teamMembers.length === 0 ? (
                  <EmptyState icon={<Users className="w-8 h-8 text-ink-tertiary/30" weight="duotone" />} title="No team members" description="Team progress data will appear here." />
                ) : (
                  <div className="space-y-3">
                    {teamMembers.map((member, i) => (
                      <motion.div
                        key={member.name}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex items-center gap-3 p-2.5 rounded-card hover:bg-well/20 transition-colors"
                      >
                        <div className="w-8 h-8 rounded-card bg-go/10 border border-go/20 flex items-center justify-center text-caption font-bold text-go shrink-0">
                          {member.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-body-xs text-ink font-medium">{member.name}</span>
                            <span className={cn('text-caption font-code tabular-nums', member.completion >= 80 ? 'text-go' : member.completion >= 60 ? 'text-go' : 'text-abort')}>
                              {member.completion}%
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-caption text-ink-tertiary/60">{member.role}</span>
                          </div>
                          <div className="h-1 rounded-full bg-well overflow-hidden mt-1.5">
                            <div
                              className={cn('h-full rounded-full transition-all duration-700', member.completion >= 80 ? 'bg-success' : member.completion >= 60 ? 'bg-go' : 'bg-error')}
                              style={{ width: `${member.completion}%` }}
                            />
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </ConsolePanel>
            </motion.div>
          </div>

          {/* API Cost Tracking */}
          <motion.div variants={itemVariants}>
            <ConsolePanel rail="API Cost Tracking" designator="Per key · budget">
              <ApiCostTracking />
            </ConsolePanel>
          </motion.div>

          {/* PR Review & Merge */}
          {activeTeamId && (
            <motion.div variants={itemVariants}>
              <PRReviewPanel teamId={activeTeamId} />
            </motion.div>
          )}

          {/* Assign Repository */}
          {activeTeamId && (
            <motion.div variants={itemVariants}>
              <AssignRepoPanel teamId={activeTeamId} />
            </motion.div>
          )}
          {!activeTeamId && (
            <motion.div variants={itemVariants}>
              <ConsolePanel rail="Assign Repository" designator="senior · assign" status="standby">
                <p className="text-body-sm text-ink-tertiary/60">No active team — join a team to assign repos.</p>
              </ConsolePanel>
            </motion.div>
          )}
        </>
      )}
    </motion.div>
  )
}
