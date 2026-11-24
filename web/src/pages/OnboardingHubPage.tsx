/*
 * ─── DIRECTION CONTRACT · ONRAMP MISSION CONTROL ────────────────────────────
 * THESIS: Orientation is a to-do list wearing a dashboard costume. The list is
 *   inverted — what is LEFT leads, what is done is sealed behind a count — and
 *   the page opens on the single next step with the actions that satisfy it.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Compass, BookOpenText, BugBeetle,
  CheckCircle, Circle, ArrowRight, Clock, Code, Check,
} from '@phosphor-icons/react'
import ConsolePanel from '../components/ui/console-panel'
import { SkeletonBase } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/empty-state'
import { PageHeader } from '../components/ui/page-header'
import { NextUp, ShowMore, Disclosure } from '../components/ui/progressive'
import { useAuth } from '../context/AuthContext'
import { cn } from '../lib/utils'
import { fetchSeedRoleData } from '../lib/api'

interface ChecklistItem {
  label: string
  done: boolean
}

export default function OnboardingHubPage() {
  const { user, activeTeamId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [seedData, setSeedData] = useState<any>(null)
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])

  useEffect(() => {
    let cancelled = false
    fetchSeedRoleData(activeTeamId || undefined)
      .then((res) => {
        if (cancelled) return
        const d = res.data
        setSeedData(d)
        if (d?.checklist) {
          const key = `onramp:onboarding-checklist:${user?.id || 'user'}:${activeTeamId || 'none'}`
          let savedDone: string[] = []
          try { savedDone = JSON.parse(localStorage.getItem(key) || '[]') } catch { /* ignore invalid local state */ }
          const done = new Set<string>(savedDone)
          setChecklist(d.checklist.map((c: any) => ({ label: c.label, done: c.done || done.has(c.label) })))
        }
        setLoading(false)
      })
      .catch((err) => {
        if (!cancelled) { setError(err.message); setLoading(false) }
      })
    return () => { cancelled = true }
  }, [activeTeamId, user?.id])

  const completedCount = checklist.filter((c) => c.done).length
  const totalCount = checklist.length
  const pct = Math.round((completedCount / Math.max(totalCount, 1)) * 100)

  // Reduce the list before showing it: remaining work leads, done work is
  // provenance. A brand-new user sees five open steps, not nine struck-through
  // ones and two open.
  const remaining = useMemo(() => checklist.filter((c) => !c.done), [checklist])
  const finished = useMemo(() => checklist.filter((c) => c.done), [checklist])

  const quickActions = [
    { to: '/explore', label: 'Explore Repo', icon: Compass, desc: 'Browse the codebase architecture' },
    { to: '/learn', label: 'Start Learning', icon: BookOpenText, desc: 'Follow guided learning paths' },
    { to: '/first-issue', label: 'Find Issues', icon: BugBeetle, desc: 'Pick your first contribution' },
    { to: '/ask', label: 'Ask Questions', icon: Code, desc: 'Get answers about the codebase' },
  ]

  // Map the open step to the action that closes it. An unmapped step still
  // shows, it just does not pretend to have a button.
  const ACTION_FOR: Record<string, (typeof quickActions)[number]> = {
    'explore the repository': quickActions[0],
    'complete a learning path': quickActions[1],
    'find your first issue': quickActions[2],
    'ask a question': quickActions[3],
  }
  const nextStep = remaining[0]
  const nextAction = nextStep ? ACTION_FOR[nextStep.label.toLowerCase()] : undefined

  function markDone(label: string) {
    setChecklist((prev) => {
      const next = prev.map((c) => (c.label === label ? { ...c, done: true } : c))
      const key = `onramp:onboarding-checklist:${user?.id || 'user'}:${activeTeamId || 'none'}`
      localStorage.setItem(key, JSON.stringify(next.filter((c) => c.done).map((c) => c.label)))
      return next
    })
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 relative">
      <PageHeader
        eyebrow="Onboarding · Crew Orientation"
        title="Your Onboarding Hub"
        subtitle={`Welcome${user?.displayName ? `, ${user.displayName}` : ''}. Let's get you up to speed.`}
        pills={[
          { label: 'Checklist', value: `${completedCount}/${totalCount}` },
          { label: 'Tasks', value: `${seedData?.completed_tasks ?? 0}/${seedData?.total_tasks ?? 0}` },
          { label: 'Data', value: 'Demo' },
        ]}
      />

      {error && (
        <div className="px-4 py-3 rounded-card border border-abort/20 bg-abort/5 text-abort text-body-sm">{error}</div>
      )}

      {loading ? (
        <div className="space-y-6" role="status" aria-label="Loading onboarding hub">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <SkeletonBase className="lg:col-span-2 h-72 rounded-card border border-seam" />
            <SkeletonBase className="h-72 rounded-card border border-seam" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <SkeletonBase key={i} className="h-28 rounded-card border border-seam" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* ── One step, then the shelf ─────────────────────────────── */}
          <NextUp
            tone={remaining.length === 0 ? 'go' : remaining.length <= 2 ? 'mission' : 'go'}
            eyebrow="Next step"
            headline={
              remaining.length === 0
                ? 'Orientation complete'
                : `${remaining.length} step${remaining.length === 1 ? '' : 's'} left to get you productive`
            }
            detail={
              remaining.length === 0
                ? `${totalCount} of ${totalCount} done. Your progress lives on the trainee console.`
                : nextStep
                  ? `Start with: ${nextStep.label}`
                  : 'Work through the list on the left.'
            }
            primary={
              remaining.length === 0
                ? { id: 'progress', label: 'Open my progress', detail: 'See the full flight plan', to: '/my-progress', icon: Check }
                : nextAction
                  ? { id: nextAction.to, label: nextAction.label, detail: nextAction.desc, to: nextAction.to, icon: nextAction.icon, tone: 'mission' }
                  : undefined
            }
            secondary={
              remaining.length === 0
                ? quickActions.slice(0, 3).map((a) => ({ id: a.to, label: a.label, detail: a.desc, to: a.to, icon: a.icon, tone: 'ink' as const }))
                : remaining.slice(1, 5).map((c) => ({
                    id: c.label,
                    label: c.label,
                    detail: 'Mark it off from the checklist',
                    icon: Circle,
                    tone: 'ink' as const,
                    onClick: () => markDone(c.label),
                  }))
            }
          />

          {/* Getting Started + Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Checklist — remaining first, completed sealed */}
            <div className="lg:col-span-2">
              <ConsolePanel
                rail="Getting Started"
                designator={`${completedCount}/${totalCount} DONE`}
                status={remaining.length === 0 ? 'go' : 'standby'}
              >
                <div className="mb-5">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 rounded-tile bg-well overflow-hidden">
                      <div
                        className="h-full bg-go transition-[width] duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="font-code text-caption tabular-nums text-ink-muted shrink-0">{pct}%</span>
                  </div>
                </div>

                {checklist.length === 0 ? (
                  <EmptyState
                    icon={<BookOpenText className="w-8 h-8 text-ink-tertiary/30" weight="duotone" />}
                    title="No checklist yet"
                    description="Your orientation steps will appear once you join a team."
                    compact
                  />
                ) : (
                  <>
                    {/* Open work leads. Ticking one settles it out of the
                        list and into the sealed "completed" drawer below. */}
                    <div className="space-y-1">
                      {remaining.map((item) => (
                        <button
                          key={item.label}
                          onClick={() => markDone(item.label)}
                          className="group flex w-full items-center gap-3 p-2.5 rounded-tile text-left transition-colors hover:bg-well/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-go"
                        >
                          <Circle className="w-5 h-5 text-ink-muted/50 shrink-0 group-hover:text-go transition-colors" />
                          <span className="text-body-sm text-ink flex-1 min-w-0 truncate">{item.label}</span>
                          <span className="text-caption text-ink-disabled opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            Mark done
                          </span>
                        </button>
                      ))}
                      {remaining.length === 0 && (
                        <p className="text-body-sm text-go py-2">Every step is checked off. Nice.</p>
                      )}
                    </div>

                    {finished.length > 0 && (
                      <div className="mt-4">
                        <Disclosure
                          label="Completed"
                          designator={`${finished.length} DONE`}
                          tone="go"
                          hint={finished.map((f) => f.label).join(' · ')}
                        >
                          <div className="space-y-1">
                            {finished.map((item) => (
                              <div key={item.label} className="flex items-center gap-3 p-2 rounded-tile opacity-60">
                                <CheckCircle className="w-5 h-5 text-go shrink-0" weight="fill" />
                                <span className="text-body-sm text-ink-tertiary line-through truncate">{item.label}</span>
                              </div>
                            ))}
                          </div>
                        </Disclosure>
                      </div>
                    )}
                  </>
                )}
              </ConsolePanel>
            </div>

            {/* Quick Actions */}
            <div>
              <ConsolePanel rail="Quick Actions" status="standby" className="h-full">
                <div className="space-y-3">
                  {quickActions.map((action) => (
                    <NavLink key={action.to} to={action.to} className="block group">
                      <div className="flex items-start gap-3 p-3 rounded-tile bg-well border border-seam hover:border-seam-strong hover:bg-panel transition-colors cursor-pointer">
                        <div className="w-8 h-8 rounded-tile bg-panel-raised border border-seam flex items-center justify-center shrink-0 text-ink-tertiary group-hover:text-go transition-colors">
                          <action.icon className="w-4 h-4" weight="fill" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-body-xs font-medium text-ink">{action.label}</p>
                          <p className="text-caption text-ink-muted">{action.desc}</p>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-ink-muted/40 group-hover:text-go mt-1 transition-colors" weight="bold" />
                      </div>
                    </NavLink>
                  ))}
                </div>
              </ConsolePanel>
            </div>
          </div>

          {/* Learning Progress + Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Learning Progress */}
            <ConsolePanel rail="Learning Progress" status="standby">
              {!seedData?.learning_modules?.length ? (
                <EmptyState icon={<BookOpenText className="w-8 h-8 text-ink-tertiary/30" weight="duotone" />} title="No modules" description="Learning modules will appear once assigned." compact />
              ) : (
                <ShowMore items={seedData.learning_modules} limit={4} noun="module" resetKey={activeTeamId ?? 'none'}>
                  {(modules) => (
                    <div className="space-y-4">
                      {modules.map((mod: any) => (
                        <div key={mod.name}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-body-xs text-ink font-medium truncate">{mod.name}</span>
                            <span className="text-caption font-code tabular-nums text-ink-muted shrink-0">{mod.progress}%</span>
                          </div>
                          <div className="h-1.5 rounded-tile bg-well overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-tile transition-[width] duration-500',
                                mod.progress >= 100 ? 'bg-go' : mod.progress > 0 ? 'bg-mission' : 'bg-well'
                              )}
                              style={{ width: `${mod.progress}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ShowMore>
              )}
              <div className="mt-4 pt-3 border-t border-seam flex items-center justify-between text-caption text-ink-tertiary">
                <span>Tasks completed</span>
                <span className="font-code text-ink font-medium">
                  {seedData?.completed_tasks ?? 0}/{seedData?.total_tasks ?? 0}
                </span>
              </div>
            </ConsolePanel>

            {/* Recent Activity */}
            <ConsolePanel rail="Recent Activity" status="go">
              {!seedData?.recent_activity?.length ? (
                <EmptyState icon={<Clock className="w-8 h-8 text-ink-tertiary/30" weight="duotone" />} title="No activity yet" description="Your onboarding activity will show here." compact />
              ) : (
                <ShowMore items={seedData.recent_activity} limit={5} noun="event" resetKey={activeTeamId ?? 'none'}>
                  {(events) => (
                    <div className="relative">
                      <div className="absolute left-3.5 top-0 bottom-0 w-px bg-seam" />
                      <div className="space-y-0">
                        {events.map((event: any, i: number) => (
                          <div key={i} className="relative flex gap-4 pl-10 py-3">
                            <div className="absolute left-2.5 w-[7px] h-[7px] rounded-[2px] bg-go border-2 border-panel mt-1.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-body-xs text-ink">{event.title}</p>
                              <p className="text-caption text-ink-muted mt-0.5">{event.time}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </ShowMore>
              )}
            </ConsolePanel>
          </div>
        </>
      )}
    </div>
  )
}
