/*
 * ─── DIRECTION CONTRACT · ONRAMP MISSION CONTROL ────────────────────────────
 * THESIS: A senior's day is review work. The page opens on the queue, merges
 *   the two panels that rendered the same member_progress data twice, caps the
 *   roster, and seals the two surfaces a senior touches weekly (repo assignment,
 *   module access) instead of parking a 6-field form above the fold.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useMemo } from 'react'

import {
  Eye, Heartbeat, Users, CheckCircle, GitBranch, ArrowRight, Warning,
  Lock, Spinner, Compass,
} from '@phosphor-icons/react'
import ConsolePanel from '../components/ui/console-panel'
import { EmptyState, EmptyRow } from '../components/ui/empty-state'
import { InlineLoading } from '../components/ui/Skeleton'
import { PageHeader } from '../components/ui/page-header'
import { MetricStrip, MetricCell } from '../components/ui/metric-strip'
import { NextUp, ShowMore, Disclosure, FilterChips, TaskRow } from '../components/ui/progressive'
import { cn } from '../lib/utils'
import {
  fetchCTODashboard, fetchReposByTeam, getTeamMembers,
  createTask, listTasks, approveTask, mergePR,
} from '../lib/api'
import type { RepoItem, WorkflowTask } from '../lib/api'
import ApiCostTracking from '../components/dashboard/ApiCostTracking'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'


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
  // A failed fetch used to be swallowed, so a dead API looked exactly like an
  // empty queue — the worst possible lie on the panel that matters most.
  const [loadError, setLoadError] = useState('')

  async function loadPRs(): Promise<void> {
    setLoading(true)
    setLoadError('')
    try {
      const [submittedResult, underReviewResult] = await Promise.all([
        listTasks({ team_id: teamId, state: 'submitted' }),
        listTasks({ team_id: teamId, state: 'under_review' }),
      ])
      const submitted = (submittedResult.tasks ?? []).filter((t: WorkflowTask) => t.pr_url)
      const underReview = (underReviewResult.tasks ?? []).filter((t: WorkflowTask) => t.pr_url)
      const seen = new Set<string>()
      const merged: WorkflowTask[] = []
      for (const t of [...submitted, ...underReview]) {
        if (!seen.has(t.task_id)) { seen.add(t.task_id); merged.push(t) }
      }
      setPRs(merged)
    } catch (err: unknown) {
      // Keep the last known-good queue; individual actions surface their errors.
      setLoadError(err instanceof Error ? err.message : 'Could not load the review queue.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPRs()
  }, [teamId])

  async function handleApprove(task: WorkflowTask) {
    setActionId(task.task_id)
    try {
      await approveTask(task.task_id)
      toast.success('PR approved', `"${task.title}" approved — ready to merge.`)
      await loadPRs()
    } catch (err: unknown) {
      toast.error('Approve failed', err instanceof Error ? err.message : 'Unknown error')
      await loadPRs()
    } finally {
      setActionId(null)
    }
  }

  async function handleMerge(task: WorkflowTask) {
    setActionId(task.task_id + ':merge')
    try {
      await mergePR(task.task_id, { merge_method: 'squash' })
      toast.success('PR merged!', `"${task.title}" merged and task completed.`)
      await loadPRs()
    } catch (err: unknown) {
      toast.error('Merge failed', err instanceof Error ? err.message : 'Unknown error')
      await loadPRs()
    } finally {
      setActionId(null)
    }
  }

  return (
    <ConsolePanel
      rail="PR Review Queue"
      designator="senior · merge"
      status={loadError ? 'abort' : prs.length > 0 ? 'caution' : 'go'}
      live={prs.length > 0}
      action={
        <button
          onClick={() => void loadPRs()}
          disabled={loading}
          className="text-caption text-ink-tertiary/60 hover:text-go transition-colors font-semibold disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      }
    >
      {loading ? (
        <InlineLoading label="Loading PRs…" />
      ) : loadError && prs.length === 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-tile bg-abort/[0.06] border border-abort/25 px-3 py-2.5">
          <p className="text-caption text-abort font-code">{loadError}</p>
          <button onClick={() => void loadPRs()} className="btn-secondary shrink-0 !px-3 !py-1.5 text-caption">
            Retry
          </button>
        </div>
      ) : prs.length === 0 ? (
        <EmptyRow label="No PRs awaiting review." />
      ) : (
        <>
          {loadError && (
            <p className="mb-3 rounded-tile bg-caution/[0.06] border border-caution/25 px-3 py-2 text-caption text-caution font-code">
              Showing the last known queue — refresh failed: {loadError}
            </p>
          )}
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
                      {actionId === task.task_id + ':merge'
                        ? <Spinner size={11} className="animate-spin" />
                        : <GitBranch size={11} weight="bold" />}
                      {actionId === task.task_id + ':merge' ? 'Merging…' : 'Merge PR'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </ConsolePanel>
  )
}

// ── Assign Repository Panel ─────────────────────────────────────────────────

interface TeamMemberRaw { user_id: string; name: string; role: string }

function AssignRepoForm({ teamId }: { teamId: string }) {
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
    <div className="space-y-4">
        {/* Every control is explicitly labelled. These were bare <label>
            elements with no htmlFor, so the form announced as four anonymous
            comboboxes to a screen-reader user. */}
        <div className="space-y-1.5">
          <label htmlFor="assign-dev" className="text-caption text-ink-tertiary/70 font-medium uppercase tracking-widest">Developer</label>
          <select
            id="assign-dev"
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

        {/* Repo source toggle — a two-way choice, not a free-text field */}
        <div className="flex items-center gap-2" role="group" aria-label="Repository source">
          <button
            onClick={() => setUseManual(false)}
            aria-pressed={!useManual}
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
            aria-pressed={useManual}
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

        {/* Repo selector or URL input — only the visible branch is mounted,
            so the form is one question deep instead of two at once. */}
        {!useManual ? (
          <div className="space-y-1.5">
            <label htmlFor="assign-repo" className="text-caption text-ink-tertiary/70 font-medium uppercase tracking-widest">Repository</label>
            <select
              id="assign-repo"
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
              <p className="text-caption text-ink-tertiary/60">
                No registered repos found. Switch to &quot;Any GitHub URL&quot; to assign directly.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <label htmlFor="assign-repo-url" className="text-caption text-ink-tertiary/70 font-medium uppercase tracking-widest">GitHub URL</label>
            <input
              id="assign-repo-url"
              type="url"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              className="w-full bg-base border border-seam text-ink text-body-sm rounded-[3px] px-3 py-2 focus:outline-none focus:border-go/60 focus:ring-1 focus:ring-go/30 transition-colors placeholder:text-ink-muted/50"
            />
          </div>
        )}

        {/* Task title */}
        <div className="space-y-1.5">
          <label htmlFor="assign-title" className="text-caption text-ink-tertiary/70 font-medium uppercase tracking-widest">Task title</label>
          <input
            id="assign-title"
            type="text"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            placeholder="e.g. Work on facebook/react repository"
            className="w-full bg-base border border-seam text-ink text-body-sm rounded-[3px] px-3 py-2 focus:outline-none focus:border-go/60 focus:ring-1 focus:ring-go/30 transition-colors placeholder:text-ink-muted/50"
          />
        </div>

        {/* Description (optional) */}
        <div className="space-y-1.5">
          <label htmlFor="assign-notes" className="text-caption text-ink-tertiary/70 font-medium uppercase tracking-widest">Notes <span className="text-ink-tertiary/50 normal-case">(optional)</span></label>
          <textarea
            id="assign-notes"
            value={taskDesc}
            onChange={(e) => setTaskDesc(e.target.value)}
            rows={2}
            placeholder="What should they focus on? Any specific files or issues?"
            className="w-full bg-base border border-seam text-ink text-body-sm rounded-[3px] px-3 py-2 focus:outline-none focus:border-go/60 focus:ring-1 focus:ring-go/30 transition-colors placeholder:text-ink-muted/50 resize-none"
          />
        </div>

        {/* Feedback */}
        {successMsg && (
          <div className="flash-ok flex items-center gap-2 px-3 py-2 rounded-[3px] bg-go/10 border border-go/20 text-go text-body-sm">
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
            <><Spinner size={14} className="animate-spin" /> Assigning…</>
          ) : (
            <>
              <GitBranch size={14} weight="bold" />
              Assign Repository
              <ArrowRight size={14} weight="bold" />
            </>
          )}
        </button>

        {/* Recent assignments — capped; this is a receipt, not a ledger */}
        {recentAssignments.length > 0 && (
          <div className="pt-2 border-t border-seam space-y-2">
            <p className="text-caption text-ink-tertiary/60 font-medium uppercase tracking-widest">Recent assignments</p>
            <ShowMore items={recentAssignments} limit={3} noun="assignment">
              {(items) => (
                <div className="space-y-2">
                  {items.map((t) => (
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
            </ShowMore>
          </div>
        )}
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

type RosterBand = 'all' | 'needs_help' | 'on_track' | 'complete'

const bandOf = (completion: number): Exclude<RosterBand, 'all'> =>
  completion < 60 ? 'needs_help' : completion < 100 ? 'on_track' : 'complete'

const BAND_LABEL: Record<RosterBand, string> = {
  all: 'All',
  needs_help: 'Needs help',
  on_track: 'On track',
  complete: 'Complete',
}

export default function SeniorSpacePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dashboard, setDashboard] = useState<any>(null)
  const [band, setBand] = useState<RosterBand>('all')
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

  // One roster, derived once. This used to be rendered twice — once as "Code
  // Health" and again as "Team Progress" — with the same member_progress rows.
  const teamMembers: TeamMember[] = d?.member_progress?.map((m: any) => ({
    name: m.name,
    role: m.role ?? 'Developer',
    completion: m.completion_rate ?? 0,
  })) ?? []

  const bandCounts = useMemo(() => {
    const counts: Record<RosterBand, number> = { all: teamMembers.length, needs_help: 0, on_track: 0, complete: 0 }
    for (const m of teamMembers) counts[bandOf(m.completion)] += 1
    return counts
  }, [teamMembers])

  const roster = useMemo(
    () => (band === 'all' ? teamMembers : teamMembers.filter((m) => bandOf(m.completion) === band)),
    [teamMembers, band],
  )

  const stuckCount = bandCounts.needs_help
  const metrics = [
    { label: 'Pending reviews', value: reviews.length, color: 'text-caution' },
    { label: 'Code health', value: `${d?.completion_rate ?? 0}%`, color: 'text-go' },
    { label: 'Active members', value: d?.total_members ?? 0, color: 'text-mission' },
    { label: 'Open tasks', value: d?.in_progress_tasks ?? 0, color: 'text-go' },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-8 relative">
      {/* Header */}
      <div>
        <PageHeader
          eyebrow="Folio 05 · Senior"
          title="Senior Developer Space"
          subtitle="Code quality, mentorship, and team oversight."
        />
      </div>

      {error && (
        <div className="px-4 py-3 rounded-card bg-abort/10 border border-abort/20 text-abort text-body-sm">{error}</div>
      )}

      {loading ? (
        <div className="space-y-6" role="status" aria-label="Loading senior space">
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
          {/* ── One verdict, one move ────────────────────────────────── */}
          <NextUp
            tone={reviews.length > 0 ? 'caution' : stuckCount > 0 ? 'mission' : 'go'}
            eyebrow="Your next move"
            headline={
              reviews.length > 0
                ? `${reviews.length} review${reviews.length === 1 ? '' : 's'} waiting on you`
                : stuckCount > 0
                  ? `${stuckCount} team member${stuckCount === 1 ? '' : 's'} below 60% completion`
                  : 'Queue is clear and the team is on track'
            }
            detail={
              reviews.length > 0
                ? 'Approve or merge to unblock someone — it is the highest-leverage thing on this page.'
                : stuckCount > 0
                  ? 'Filter the roster to "Needs help" to see exactly who is behind.'
                  : 'Assign a repository or adjust module access when the week calls for it.'
            }
            primary={
              reviews.length > 0
                ? { id: 'queue', label: 'Open the PR queue', detail: 'Oldest submitted first', icon: GitBranch, count: reviews.length, tone: 'caution', onClick: () => document.getElementById('senior-pr-queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
                : stuckCount > 0
                  ? { id: 'roster', label: 'Show who needs help', detail: `${stuckCount} below 60%`, icon: Users, tone: 'mission', onClick: () => setBand('needs_help') }
                  : { id: 'assign', label: 'Assign a repository', detail: 'Give someone real work', icon: CheckCircle, tone: 'go', onClick: () => document.getElementById('senior-assign')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
            }
            secondary={[
              { id: 'health', label: 'Code health', detail: 'Repo-level quality metrics', to: '/code-health', icon: Heartbeat, tone: 'mission' },
              { id: 'work-graph', label: 'Work graph', detail: 'Who is blocked on whom', to: '/work-graph', icon: Users, tone: 'ink' },
              { id: 'modules', label: 'Module access', detail: 'What this team can reach', icon: Lock, tone: 'ink' },
              { id: 'ramp', label: 'Ramp visibility', detail: 'New-hire throughput and its price', to: '/ramp', icon: Compass, tone: 'ink' },
            ]}
          />

          {/* Metrics — one ruled strip */}
          <div>
            <MetricStrip className="grid-cols-2 lg:grid-cols-4">
              {metrics.map((m) => (
                <MetricCell key={m.label} label={m.label} value={m.value} accent={m.color} />
              ))}
            </MetricStrip>
          </div>

          {/* Review Queue + Team Roster */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <ConsolePanel
                rail="Review Queue"
                designator={`${reviews.length} pending`}
                status={reviews.length ? 'caution' : 'go'}
              >
                {reviews.length === 0 ? (
                  <EmptyState icon={<Eye className="w-8 h-8 text-ink-tertiary/30" weight="duotone" />} title="No pending reviews" description="All caught up on reviews." compact />
                ) : (
                  /* The queue is the page's primary work: show it in full rather
                     than capping it behind a "show more". */
                  <div className="space-y-2">
                    {reviews.map((review) => {
                      const cfg = statusConfig[review.status]
                      return (
                        <div key={review.id} className="rounded-tile p-3 border border-seam transition-colors hover:border-caution/30" style={{ background: 'color-mix(in srgb, var(--caution) 4%, transparent)' }}>
                          <div className="flex items-start gap-3">
                            <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', cfg.color.replace('text', 'bg'))} />
                            <div className="flex-1 min-w-0">
                              <p className="text-body-xs text-ink font-medium truncate">{review.title}</p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', cfg.bg, cfg.color)}>{cfg.label}</span>
                                <span className="text-caption text-ink-tertiary/50 font-code">{review.module}</span>
                                <span className="text-caption text-ink-tertiary/40">by {review.author}</span>
                                <span className="text-caption text-ink-tertiary/40">· {review.timestamp}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </ConsolePanel>
            </div>

            <div>
              <ConsolePanel rail="Team Roster" designator={`${teamMembers.length} MEMBERS`} status={stuckCount ? 'caution' : 'go'}>
                {teamMembers.length === 0 ? (
                  <EmptyState icon={<Users className="w-8 h-8 text-ink-tertiary/30" weight="duotone" />} title="No team data" description="Member progress data will appear here." compact />
                ) : (
                  <>
                    {/* Band filters first, then a capped roster. */}
                    <FilterChips
                      label="Band"
                      value={band}
                      onChange={(v) => setBand(v as RosterBand)}
                      options={(Object.keys(BAND_LABEL) as RosterBand[]).map((k) => ({
                        value: k,
                        label: BAND_LABEL[k],
                        count: bandCounts[k],
                      }))}
                      summary={`${roster.length} of ${teamMembers.length}`}
                    />
                    <div className="mt-3.5">
                      <ShowMore
                        items={roster}
                        limit={5}
                        noun="member"
                        resetKey={band}
                        emptyState={<EmptyRow label="Nobody in this band." />}
                      >
                        {(members) => (
                          <div className="divide-y divide-seam">
                            {members.map((m) => {
                              const needsHelp = bandOf(m.completion) === 'needs_help'
                              return (
                                <div key={m.name} className="py-2.5">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-body-xs font-medium text-ink truncate">{m.name}</span>
                                    <span className={cn(
                                      'text-caption font-code tabular-nums shrink-0',
                                      m.completion >= 80 ? 'text-go' : m.completion >= 60 ? 'text-go' : 'text-abort',
                                    )}>
                                      {m.completion}%
                                    </span>
                                  </div>
                                  <div className="h-1.5 rounded-tile bg-well overflow-hidden mt-1.5">
                                    <div
                                      className={cn(
                                        'h-full rounded-tile transition-[width] duration-500',
                                        m.completion >= 80 ? 'bg-success' : m.completion >= 60 ? 'bg-go' : 'bg-error',
                                      )}
                                      style={{ width: `${m.completion}%` }}
                                    />
                                  </div>
                                  <div className="mt-1 flex items-center gap-2 text-caption text-ink-tertiary/50">
                                    <span>{m.role}</span>
                                    {needsHelp && (
                                      <span className="text-abort">· needs help</span>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </ShowMore>
                    </div>
                  </>
                )}
              </ConsolePanel>
            </div>
          </div>

          {/* PR Review & Merge — the actionable queue, anchored for the rail */}
          {activeTeamId && (
            <div id="senior-pr-queue">
              <PRReviewPanel teamId={activeTeamId} />
            </div>
          )}

          {/* ── Sealed surfaces: touched weekly, not hourly ─────────── */}
          <div id="senior-assign">
            <Disclosure
              label="Assign a repository"
              designator="senior · assign"
              tone="go"
              icon={GitBranch}
              hint="Pick a developer and a repo — opens a task for them"
            >
              {activeTeamId ? (
                <AssignRepoForm teamId={activeTeamId} />
              ) : (
                <p className="text-body-sm text-ink-tertiary/60">No active team — join a team to assign repos.</p>
              )}
            </Disclosure>
          </div>

          <Disclosure
            label="Module access"
            designator="RBAC"
            tone="idle"
            icon={Lock}
            hint={`${defaultModules.length} modules · static grant list`}
          >
            <div className="space-y-2">
              {defaultModules.map((mod) => (
                <TaskRow
                  key={mod.module}
                  leading={
                    <span className="w-6 h-6 rounded-tile bg-go/10 flex items-center justify-center">
                      <CheckCircle className="w-3.5 h-3.5 text-go" weight="fill" />
                    </span>
                  }
                  title={mod.module}
                  meta={mod.permission}
                  trailing={<span className="text-caption font-medium text-go">Granted</span>}
                />
              ))}
            </div>
          </Disclosure>

          <Disclosure
            label="API cost tracking"
            designator="PER KEY · BUDGET"
            tone="idle"
            hint="Credential spend against budget"
          >
            <ApiCostTracking />
          </Disclosure>
        </>
      )}
    </div>
  )
}
