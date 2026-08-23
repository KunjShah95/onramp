/*
 * ─── DIRECTION CONTRACT · ONRAMP MISSION CONTROL ────────────────────────────
 * THESIS: The trainee console runs a procedural checklist toward orbit — the
 *   same mission the CTO watches, seen from the trainee's seat. Not a gamified
 *   card wall; an instrument panel with a flight plan.
 * OWN-WORLD: Daylit ops room, seated panels, signal-only colour, mono telemetry.
 *   Progress reads as a mission timeline (unlocked modules = cleared stages).
 * ───────────────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { GraduationCap, ArrowRight, BookOpenText, GitPullRequest, Check, GitBranch, X, Robot } from '@phosphor-icons/react'
import ConsolePanel from '../components/ui/console-panel'
import ReadoutBank, { type Readout } from '../components/ui/readout-bank'
import MissionTimeline, { type Stage } from '../components/ui/mission-timeline'
import StatusBadge from '../components/ui/status-badge'
import { EmptyState } from '../components/ui/empty-state'
import { PageHeader } from '../components/ui/page-header'
import { TraineeDashboardSkeleton } from '../components/ui/Skeleton'
import GamificationPanel from '../components/gamification/GamificationPanel'
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

interface RaisePRState {
  taskId: string
  taskTitle: string
  repoUrl: string
}

export default function TraineeDashboard() {
  const [data, setData] = useState<TraineeDashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedModule, setSelectedModule] = useState<string | null>(null)
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

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  async function fetchDashboard() {
    if (!activeTeamId) {
      if (mountedRef.current) { setLoading(false); setError('Join a team to view your onboarding progress.') }
      return
    }
    if (mountedRef.current) { setLoading(true); setError('') }
    try {
      const res = await fetchTraineeDashboard(activeTeamId)
      if (mountedRef.current) setData(res)
    } catch (err: any) {
      if (mountedRef.current) setError(err.message || 'Failed to load dashboard.')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboard()
    const interval = setInterval(fetchDashboard, 15000)
    return () => clearInterval(interval)
  }, [activeTeamId])

  if (loading) return <TraineeDashboardSkeleton />

  // ── Header (shared across error / empty / loaded states) ──
  const header = (
    <PageHeader
      eyebrow="Folio 06 · Trainee"
      title={data?.user_name ? `${data.user_name}'s Ascent` : 'Trainee Console'}
      subtitle="Your personal onboarding checklist and progress."
      actions={
        <button onClick={fetchDashboard} disabled={loading} className="btn-secondary">
          Refresh
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
                <p className="text-abort text-body-sm font-code">{error}</p>
                <button onClick={fetchDashboard} disabled={loading} className="btn-secondary !px-3 !py-1.5 text-caption shrink-0">Reacquire</button>
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

  const { progress, modules, recent_tasks } = data
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

  return (
    <div className="min-h-[calc(100vh-4rem)] max-w-6xl mx-auto flex items-start gap-6">
      <div className="flex-1 min-w-0 space-y-6">
        {header}

        {/* Telemetry */}
        <ReadoutBank callsign="Trainee" items={readouts} columns={4} />

        {/* Flight plan */}
        <ConsolePanel rail="Flight Plan" designator={`${modules.length} STAGES CLEARED`} status="go" live>
          <div className="pt-2 pb-1">
            <MissionTimeline stages={stages} />
          </div>
        </ConsolePanel>

        {/* Unlocked Modules */}
        <ConsolePanel
          rail="Unlocked Modules"
          designator={`${modules.length} GRANTED`}
          status={modules.length ? 'go' : 'idle'}
        >
          {modules.length === 0 ? (
            <EmptyState icon={<BookOpenText className="w-10 h-10 text-ink-tertiary/30" weight="fill" />} title="No modules unlocked yet" description="Modules unlock as you complete onboarding tasks." />
          ) : (
            <div className="space-y-1.5">
              {modules.map((mod, i) => (
                <div
                  key={`${mod.module}-${i}`}
                  onClick={() => setSelectedModule(selectedModule === mod.module ? null : mod.module)}
                  className={cn(
                    'flex items-center gap-3 p-2.5 rounded-tile bg-well border transition-colors cursor-pointer',
                    selectedModule === mod.module ? 'border-go/40' : 'border-seam hover:border-seam-strong',
                  )}
                >
                  <span className="w-7 h-7 rounded-tile bg-go/10 border border-go/25 flex items-center justify-center shrink-0 text-go">
                    <Check size={13} weight="bold" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm font-medium text-ink font-code truncate">{mod.module}</p>
                    <p className="text-caption text-ink-muted">Granted {new Date(mod.granted_at).toLocaleDateString()} · {mod.source}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-ink-muted shrink-0" />
                </div>
              ))}
            </div>
          )}
        </ConsolePanel>

        {/* Assigned Repo Tasks */}
        {recent_tasks.some((t: TraineeTask) => (t as any).repo_url) && (
          <ConsolePanel rail="Assigned Repositories" designator="WORK ON IT" status="go" live>
            <div className="space-y-2">
              {recent_tasks
                .filter((t: TraineeTask) => (t as any).repo_url)
                .map((task: TraineeTask) => {
                  const repoUrl: string = (task as any).repo_url ?? ''
                  const prUrl: string = (task as any).pr_url ?? ''
                  const isSafeHttpUrl = (u: string) => {
                    try { const p = new URL(u); return p.protocol === 'https:' || p.protocol === 'http:' } catch { return false }
                  }
                  const canRaisePR = ['in_progress', 'assigned'].includes(task.state) && !prUrl
                  const alreadySubmitted = ['submitted', 'under_review', 'approved', 'completed'].includes(task.state)
                  return (
                    <div key={task.task_id} className="p-3 rounded-tile bg-well border border-seam space-y-2">
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
                        <StatusBadge state={task.state} />
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
          </ConsolePanel>
        )}

        {/* Recent Tasks */}
        <ConsolePanel rail="Recent Tasks" designator="EVENT LOG" status="standby" live>
          {recent_tasks.length === 0 ? (
            <EmptyState icon={<GitPullRequest className="w-10 h-10 text-ink-tertiary/30" weight="fill" />} title="No tasks yet" description="Tasks from your learning path will appear here." />
          ) : (
            <div className="space-y-0.5">
              {recent_tasks.map((task: TraineeTask) => (
                <div key={task.task_id} className="flex items-center gap-3 p-2 rounded-tile hover:bg-well/60 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm font-medium text-ink truncate">{task.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusBadge state={task.state} />
                      <span className="text-caption text-ink-muted font-code">{task.module} · {relativeTime(task.updated_at)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ConsolePanel>
      </div>

      {/* Raise PR modal */}
      {raisingPR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-base border border-seam rounded-[3px] shadow-2xl">
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
