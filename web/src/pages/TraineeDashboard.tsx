/*
 * ─── DIRECTION CONTRACT · ONRAMP MISSION CONTROL ────────────────────────────
 * THESIS: The trainee console runs a procedural checklist toward orbit — the
 *   same mission the CTO watches, seen from the trainee's seat. Not a gamified
 *   card wall; an instrument panel with a flight plan.
 * OWN-WORLD: Daylit ops room, seated panels, signal-only colour, mono telemetry.
 *   Progress reads as a mission timeline (unlocked modules = cleared stages).
 * DISCLOSURE: a trainee never wants "here are 14 tasks" — they want "do this
 *   one next". The page opens on the single next step, the repo work is ranked
 *   by whether a PR can be raised right now, and both long lists are capped.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { GraduationCap, BookOpenText, GitPullRequest, Check, GitBranch, X, Robot, ListChecks, ChatCircleDots } from '@phosphor-icons/react'
import ConsolePanel from '../components/ui/console-panel'
import ReadoutBank, { type Readout } from '../components/ui/readout-bank'
import MissionTimeline, { type Stage } from '../components/ui/mission-timeline'

import { EmptyState } from '../components/ui/empty-state'
import { PageHeader } from '../components/ui/page-header'
import { TraineeDashboardSkeleton } from '../components/ui/Skeleton'
import GamificationPanel from '../components/gamification/GamificationPanel'
import { NextUp, ShowMore, Disclosure } from '../components/ui/progressive'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { fetchTraineeDashboard, raisePR } from '../lib/api'
import { cn } from '../lib/utils'
import type { TraineeDashboardResponse, TraineeTask } from '../lib/api'

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const d = Math.floor(diff / 86400000)
  if (d < 1) return 'today'
  if (d === 1) return 'yesterday'
  return `${d}d ago`
}

const statusLabel = (state: string) => {
  const labels: Record<string, string> = {
    pending: 'Pending',
    cancelled: 'Cancelled',
    assigned: 'Assigned',
    in_progress: 'In progress',
    submitted: 'Submitted',
    under_review: 'Under review',
    needs_changes: 'Changes requested',
    product_review: 'Product review',
    approved: 'Approved',
    completed: 'Done',
  }
  return labels[state] || state
}

interface RaisePRState {
  taskId: string
  taskTitle: string
  repoUrl: string
}

export default function TraineeDashboard() {
  const [data, setData] = useState<TraineeDashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [raisingPR, setRaisingPR] = useState<RaisePRState | null>(null)
  const [prBranch, setPrBranch] = useState('')
  const [prBase, setPrBase] = useState('main')
  const [prTitle, setPrTitle] = useState('')
  const [prBody, setPrBody] = useState('')
  const [prSubmitting, setPrSubmitting] = useState(false)

  const { activeTeamId } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const mountedRef = useRef(true)
  const pollInFlightRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  async function fetchDashboard(background = false) {
    if (background && pollInFlightRef.current) return
    if (!activeTeamId) {
      if (mountedRef.current) { setLoading(false); setRefreshing(false); setError('Join a team to view your onboarding progress.') }
      return
    }
    if (background) pollInFlightRef.current = true
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (background) pollInFlightRef.current = false
      if (mountedRef.current) {
        if (!background) setLoading(false)
        setRefreshing(false)
        setError('You appear to be offline. Check your connection and retry.')
      }
      return
    }
    if (mountedRef.current) {
      if (background) setRefreshing(true)
      else { setLoading(true); setError('') }
    }
    try {
      const res = await fetchTraineeDashboard(activeTeamId)
      if (mountedRef.current) { setData(res); setError('') }
    } catch (err: any) {
      if (mountedRef.current && !background) setError(err.message || 'Failed to load dashboard.')
    } finally {
      if (background) pollInFlightRef.current = false
      if (mountedRef.current) { setLoading(false); setRefreshing(false) }
    }
  }

  useEffect(() => {
    void fetchDashboard(false)

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') void fetchDashboard(true)
    }
    const interval = setInterval(refreshIfVisible, 30_000)
    document.addEventListener('visibilitychange', refreshIfVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshIfVisible)
    }
  }, [activeTeamId])

  // ── Derived above the early returns on purpose ─────────────────────────
  // These are pure derivations of `data`, so they are computed unconditionally
  // rather than after the `if (loading)` / `if (!data)` bailouts — a hook below
  // an early return is a rules-of-hooks violation that only shows up once the
  // query resolves. Empty inputs during load are harmless.
  const modules = useMemo(() => data?.modules ?? [], [data])
  const recentTasks = useMemo(() => data?.recent_tasks ?? [], [data])

  // Rank the repo work by what a trainee can act on right now.
  const repoTasks = useMemo(
    () => recentTasks.filter((t: TraineeTask) => Boolean((t as any).repo_url)),
    [recentTasks],
  )
  const prReady = useMemo(
    () => repoTasks.filter((t) => ['in_progress', 'assigned'].includes(t.state) && !(t as any).pr_url),
    [repoTasks],
  )
  const prOpen = useMemo(
    () => repoTasks.filter((t) => Boolean((t as any).pr_url)),
    [repoTasks],
  )
  const nextTask = prReady[0] ?? repoTasks[0] ?? null

  if (loading) return <TraineeDashboardSkeleton />

  // ── Header (shared across error / empty / loaded states) ──
  const header = (
    <PageHeader
      eyebrow="Folio 06 · Trainee"
      title={data?.user_name ? `${data.user_name}'s Ascent` : 'Trainee Console'}
      subtitle="Your personal onboarding checklist and progress."
      actions={
        <button onClick={() => fetchDashboard(false)} disabled={loading || refreshing} className="btn-secondary" aria-busy={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      }
    />
  )

  if (error || !data) {
    return (
      <div className="min-h-[calc(100vh-4rem)] max-w-6xl mx-auto flex items-start gap-6">
        <div className="flex-1 space-y-6">
          {header}
          {error ? (
            <ConsolePanel rail="Signal lost" designator="Crew" status="abort">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-abort text-body-sm font-code" role="alert">{error}</p>
                  {error.startsWith('Join a team') && (
                    <button onClick={() => navigate('/team')} className="mt-2 text-caption text-go hover:underline font-medium">
                      Go to Team →
                    </button>
                  )}
                </div>
                <button onClick={() => fetchDashboard(false)} disabled={loading} className="btn-secondary !px-3 !py-1.5 text-caption shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-go/50">Reacquire</button>
              </div>
            </ConsolePanel>
          ) : (
            <ConsolePanel rail="No data yet" designator="Crew" status="idle">
              <EmptyState icon={<GraduationCap className="w-10 h-10 text-ink-tertiary/30" weight="fill" />} title="No data yet" description="Your onboarding progress will appear here." />
            </ConsolePanel>
          )}
        </div>
        <div className="w-80 shrink-0 hidden lg:block">
          <GamificationPanel />
        </div>
      </div>
    )
  }

  const { progress, recent_tasks } = data
  // Backend completion_rate is already a percentage (0–100) — do NOT multiply.
  const completionPct = Math.round(progress.completion_rate ?? 0)

  const readouts: Readout[] = [
    { label: 'Completion', value: completionPct, suffix: '%', color: completionPct >= 80 ? 'text-go' : completionPct >= 50 ? 'text-mission' : 'text-ink' },
    { label: 'Modules Unlocked', value: progress.modules_unlocked?.length ?? 0, color: 'text-go' },
    { label: 'In Progress', value: progress.in_progress, color: 'text-mission' },
    { label: 'Pending Review', value: progress.pending_review, color: 'text-caution' },
  ]

  // ── Flight plan: cleared modules → completed stages, then the live leg + orbit ──
  const stages: Stage[] = [
    { id: 'launch', label: 'Launch', designator: 'T-0', state: 'complete' },
    ...modules.map((m, i) => ({
      id: `${m.module}-${i}`,
      label: m.module,
      designator: `M${i + 1}`,
      state: 'complete' as const,
    })),
    {
      id: 'current',
      label: progress.in_progress > 0 ? 'In Progress' : 'Next Module',
      designator: 'NOW',
      state: (progress.in_progress > 0 ? 'active' : 'upcoming') as Stage['state'],
    },
    { id: 'orbit', label: 'Orbit', designator: 'GOAL', state: 'upcoming' },
  ]

  // ── Rank the repo work by what a trainee can act on right now ──────────
  // (repoTasks / prReady / prOpen / nextTask are derived above the early
  // returns — see the note there.)

  const verdict = prReady.length > 0
    ? { tone: 'caution' as const, headline: `Raise a PR on ${prReady[0].title}`, detail: 'The work is done enough to show. A senior cannot review what is not on a branch.' }
    : progress.pending_review > 0
      ? { tone: 'mission' as const, headline: `${progress.pending_review} submission${progress.pending_review === 1 ? '' : 's'} with a senior`, detail: 'Nothing to do but keep going — the ball is in their court.' }
      : progress.in_progress > 0
        ? { tone: 'go' as const, headline: `${progress.in_progress} task${progress.in_progress === 1 ? '' : 's'} in progress`, detail: 'Pick the oldest one and close it out.' }
        : { tone: 'go' as const, headline: 'Start your next module', detail: 'Nothing is open. Take the next piece of the learning path.' }

  return (
    <div className="min-h-[calc(100vh-4rem)] max-w-6xl mx-auto flex items-start gap-6">
      <div className="flex-1 min-w-0 space-y-6">
        {header}

        {/* ── One next step, then everything else ────────────────────── */}
        <NextUp
          tone={verdict.tone}
          eyebrow="Your next step"
          headline={verdict.headline}
          detail={verdict.detail}
          primary={
            prReady.length > 0
              ? {
                  id: 'raise-pr',
                  label: 'Raise the pull request',
                  detail: prReady[0].title,
                  icon: GitPullRequest,
                  tone: 'caution',
                  count: prReady.length,
                  onClick: () => {
                    const repoUrl: string = (prReady[0] as any).repo_url ?? ''
                    setRaisingPR({ taskId: prReady[0].task_id, taskTitle: prReady[0].title, repoUrl })
                    setPrBranch(''); setPrBase('main')
                    setPrTitle(`feat: ${prReady[0].title}`); setPrBody('')
                  },
                }
              : progress.in_progress > 0
                ? { id: 'tasks', label: 'Open my tasks', detail: 'Continue the in-flight work', icon: ListChecks, to: '/tasks' }
                : { id: 'learn', label: 'Continue the learning path', detail: 'Next module in the sequence', icon: BookOpenText, to: '/learn' }
          }
          secondary={[
            ...(nextTask && (nextTask as any).repo_url
              ? [{
                  id: 'agent',
                  label: 'Open in the autonomous agent',
                  detail: 'Hand the ticket to a bot',
                  icon: Robot,
                  tone: 'mission' as const,
                  onClick: () => navigate(`/autonomous?repo=${encodeURIComponent((nextTask as any).repo_url)}&task_id=${encodeURIComponent(nextTask.task_id)}`),
                }]
              : []),
            ...(prOpen.length
              ? [{
                  id: 'view-pr',
                  label: 'View your open PR',
                  detail: prOpen[0].title,
                  icon: GitPullRequest,
                  tone: 'go' as const,
                  onClick: () => window.open((prOpen[0] as any).pr_url, '_blank', 'noopener,noreferrer'),
                }]
              : []),
            { id: 'hub', label: 'Onboarding checklist', detail: `${progress.modules_unlocked?.length ?? 0} modules unlocked`, icon: BookOpenText, to: '/onboarding-hub', tone: 'ink' },
            { id: 'ask', label: 'Ask the codebase', detail: 'Get unblocked without a human', icon: ChatCircleDots, to: '/ask', tone: 'ink' },
          ]}
        />

        {/* Telemetry */}
        <ReadoutBank callsign="Trainee" items={readouts} columns={4} />

        {/* Flight plan */}
        <ConsolePanel rail="Flight Plan" designator={`${modules.length} STAGES CLEARED`} status="go" live>
          <div className="pt-2 pb-1">
            <MissionTimeline stages={stages} />
          </div>
        </ConsolePanel>

        {/* Unlocked Modules — a grant history, so it is capped behind a count */}
        <ConsolePanel
          rail="Unlocked Modules"
          designator={`${modules.length} GRANTED`}
          status={modules.length ? 'go' : 'idle'}
        >
          {modules.length === 0 ? (
            <EmptyState icon={<BookOpenText className="w-10 h-10 text-ink-tertiary/30" weight="fill" />} title="No modules unlocked yet" description="Modules unlock as you complete onboarding tasks." />
          ) : (
            <ShowMore items={modules} limit={4} noun="module" resetKey={activeTeamId ?? 'none'}>
              {(visible) => (
                <div className="space-y-1.5">
                  {visible.map((mod, i) => (
                    <div
                      key={`${mod.module}-${i}`}
                      className="flex items-center gap-3 p-2.5 rounded-tile bg-well border border-seam"
                    >
                      <span className="w-7 h-7 rounded-tile bg-go/10 border border-go/25 flex items-center justify-center shrink-0 text-go">
                        <Check size={13} weight="bold" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-body-sm font-medium text-ink font-code truncate">{mod.module}</p>
                        <p className="text-caption text-ink-muted">Granted {new Date(mod.granted_at).toLocaleDateString()} · {mod.source}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ShowMore>
          )}
        </ConsolePanel>

        {/* Assigned Repo Tasks — actionables first, then the rest */}
        {repoTasks.length > 0 && (
          <ConsolePanel rail="Assigned Repositories" designator="WORK ON IT" status="go" live>
            <ShowMore items={[...prReady, ...repoTasks.filter((t) => !prReady.includes(t))]} limit={3} noun="repository" resetKey={activeTeamId ?? 'none'}>
              {(tasks) => (
                <div className="space-y-2">
                  {tasks.map((task: TraineeTask) => {
                    const repoUrl: string = (task as any).repo_url ?? ''
                    const prUrl: string = (task as any).pr_url ?? ''
                    const isSafeHttpUrl = (u: string) => {
                      try { const p = new URL(u); return p.protocol === 'https:' || p.protocol === 'http:' } catch { return false }
                    }
                    const canRaisePR = ['in_progress', 'assigned'].includes(task.state) && !prUrl
                    const alreadySubmitted = ['submitted', 'under_review', 'approved', 'completed'].includes(task.state)
                    return (
                      <div key={task.task_id} className={cn('p-3 rounded-tile border space-y-2', canRaisePR ? 'bg-caution/[0.05] border-caution/25' : 'bg-well border-seam')}>
                        <div className="flex items-start gap-3">
                          <GitBranch size={14} className="text-go shrink-0 mt-0.5" weight="bold" />
                          <div className="flex-1 min-w-0">
                            <p className="text-body-sm font-medium text-ink truncate">{task.title}</p>
                            {isSafeHttpUrl(repoUrl) ? (
                              <a href={repoUrl} target="_blank" rel="noreferrer" className="text-caption text-go/80 hover:text-go font-code truncate block">
                                {repoUrl.replace('https://github.com/', '')}
                              </a>
                            ) : (
                              <span className="text-caption text-ink-muted font-code truncate block">{repoUrl.replace('https://github.com/', '')}</span>
                            )}
                          </div>
                          <span className="font-code text-caption text-ink-muted shrink-0">{statusLabel(task.state)}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => navigate(`/autonomous?repo=${encodeURIComponent(repoUrl)}&task_id=${encodeURIComponent(task.task_id)}`)}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-caption font-medium rounded-[3px] bg-base border border-seam text-ink-secondary hover:border-go/40 hover:text-go transition-colors"
                          >
                            <Robot size={11} weight="bold" />
                            Open in Agent
                          </button>
                          {canRaisePR && (
                            <button
                              onClick={() => {
                                setRaisingPR({ taskId: task.task_id, taskTitle: task.title, repoUrl })
                                setPrBranch('')
                                setPrBase('main')
                                setPrTitle(`feat: ${task.title}`)
                                setPrBody('')
                              }}
                              className="flex items-center gap-1.5 px-2.5 py-1 text-caption font-medium rounded-[3px] bg-go text-white hover:bg-go-lit transition-colors"
                            >
                              <GitPullRequest size={11} weight="bold" />
                              Raise PR
                            </button>
                          )}
                          {prUrl && isSafeHttpUrl(prUrl) && (
                            <a
                              href={prUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1.5 px-2.5 py-1 text-caption font-medium rounded-[3px] bg-mission/10 border border-mission/20 text-mission hover:bg-mission/20 transition-colors"
                            >
                              <GitPullRequest size={11} weight="bold" />
                              View PR
                            </a>
                          )}
                          {alreadySubmitted && !prUrl && (
                            <span className="text-caption text-ink-muted font-code">Submitted for review</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </ShowMore>
          </ConsolePanel>
        )}

        {/* Recent Tasks — capped; the log is context, not the workspace */}
        <ConsolePanel rail="Recent Tasks" designator="EVENT LOG" status="standby" live>
          {recent_tasks.length === 0 ? (
            <EmptyState icon={<GitPullRequest className="w-10 h-10 text-ink-tertiary/30" weight="fill" />} title="No tasks yet" description="Tasks from your learning path will appear here." />
          ) : (
            <ShowMore items={recent_tasks} limit={5} noun="task" resetKey={activeTeamId ?? 'none'}>
              {(tasks) => (
                <div className="space-y-0.5">
                  {tasks.map((task: TraineeTask) => (
                    <div key={task.task_id} className="flex items-center gap-3 p-2 rounded-tile hover:bg-well/60 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-body-sm font-medium text-ink truncate">{task.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="font-code text-caption text-ink-muted">{statusLabel(task.state)}</span>
                          <span className="text-caption text-ink-muted font-code">{task.module} · {relativeTime(task.updated_at)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ShowMore>
          )}
        </ConsolePanel>

        {/* Gamification is a nice-to-have; it no longer costs a permanent
            sidebar slot on a page that now has a real focus rail. */}
        <Disclosure
          label="Streak & achievements"
          designator="GAMIFICATION"
          tone="idle"
          hint="XP, level, badges"
        >
          <div className="lg:hidden">
            <GamificationPanel />
          </div>
          <p className="text-caption text-ink-muted lg:hidden">
            On a wide screen this panel is pinned in the right-hand rail instead.
          </p>
        </Disclosure>
      </div>

      {/* Raise PR modal */}
      {raisingPR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Raise pull request">
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto bg-base border border-seam rounded-[3px] shadow-2xl my-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-seam">
              <div>
                <p className="text-body-sm font-semibold text-ink">Raise Pull Request</p>
                <p className="text-caption text-ink-tertiary/60 truncate">{raisingPR.repoUrl.replace('https://github.com/', '')}</p>
              </div>
              <button onClick={() => setRaisingPR(null)} className="text-ink-tertiary hover:text-ink">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="space-y-1">
                <label className="text-caption text-ink-tertiary/70 font-medium uppercase tracking-widest">Your branch</label>
                <input
                  value={prBranch}
                  onChange={(e) => setPrBranch(e.target.value)}
                  placeholder="feat/my-feature or fork-owner:branch"
                  className="w-full bg-panel border border-seam text-ink text-body-sm rounded-[3px] px-3 py-2 focus:outline-none focus:border-go/60 font-code placeholder:text-ink-muted/40"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <label className="text-caption text-ink-tertiary/70 font-medium uppercase tracking-widest">Base branch</label>
                  <input
                    value={prBase}
                    onChange={(e) => setPrBase(e.target.value)}
                    className="w-full bg-panel border border-seam text-ink text-body-sm rounded-[3px] px-3 py-2 focus:outline-none focus:border-go/60 font-code"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-caption text-ink-tertiary/70 font-medium uppercase tracking-widest">PR title</label>
                <input
                  value={prTitle}
                  onChange={(e) => setPrTitle(e.target.value)}
                  className="w-full bg-panel border border-seam text-ink text-body-sm rounded-[3px] px-3 py-2 focus:outline-none focus:border-go/60 placeholder:text-ink-muted/40"
                />
              </div>
              <div className="space-y-1">
                <label className="text-caption text-ink-tertiary/70 font-medium uppercase tracking-widest">Description <span className="normal-case text-ink-tertiary/40">(optional)</span></label>
                <textarea
                  value={prBody}
                  onChange={(e) => setPrBody(e.target.value)}
                  rows={3}
                  placeholder="What does this PR do? Link issues, describe changes…"
                  className="w-full bg-panel border border-seam text-ink text-body-sm rounded-[3px] px-3 py-2 focus:outline-none focus:border-go/60 resize-none placeholder:text-ink-muted/40"
                />
              </div>
              <button
                disabled={!prBranch.trim() || !prTitle.trim() || prSubmitting}
                onClick={async () => {
                  setPrSubmitting(true)
                  try {
                    await raisePR(raisingPR.taskId, {
                      head: prBranch.trim(),
                      base: prBase.trim() || 'main',
                      title: prTitle.trim(),
                      body: prBody.trim(),
                    })
                    toast.success('PR raised!', `"${prTitle}" submitted for senior review.`)
                    setRaisingPR(null)
                    fetchDashboard()
                  } catch (err: unknown) {
                    toast.error('PR failed', err instanceof Error ? err.message : 'Could not raise PR')
                  } finally {
                    setPrSubmitting(false)
                  }
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-go text-white text-body-sm font-semibold rounded-[3px] hover:bg-go-lit disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <GitPullRequest size={14} weight="bold" />
                {prSubmitting ? 'Creating PR…' : 'Create Pull Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gamification sidebar */}
      <div className="w-80 shrink-0 hidden lg:block">
        <div className="sticky top-24">
          <GamificationPanel />
        </div>
      </div>
    </div>
  )
}
