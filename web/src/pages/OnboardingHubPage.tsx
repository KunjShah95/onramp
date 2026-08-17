import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Compass, BookOpenText, BugBeetle,
  CheckCircle, Circle, ArrowRight, Clock, Code,
} from '@phosphor-icons/react'
import ConsolePanel from '../components/ui/console-panel'
import { EmptyState } from '../components/ui/empty-state'
import { PageHeader } from '../components/ui/page-header'
import { useAuth } from '../context/AuthContext'
import { cn } from '../lib/utils'
import { fetchSeedRoleData } from '../lib/api'

interface ChecklistItem {
  label: string
  done: boolean
}

export default function OnboardingHubPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [seedData, setSeedData] = useState<any>(null)
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])

  useEffect(() => {
    let cancelled = false
    fetchSeedRoleData()
      .then((res) => {
        if (cancelled) return
        const d = res.data
        setSeedData(d)
        if (d?.checklist) {
          setChecklist(d.checklist.map((c: any) => ({ label: c.label, done: c.done })))
        }
        setLoading(false)
      })
      .catch((err) => {
        if (!cancelled) { setError(err.message); setLoading(false) }
      })
    return () => { cancelled = true }
  }, [])

  const completedCount = checklist.filter((c) => c.done).length
  const totalCount = checklist.length

  const quickActions = [
    { to: '/explore', label: 'Explore Repo', icon: Compass, desc: 'Browse the codebase architecture' },
    { to: '/learn', label: 'Start Learning', icon: BookOpenText, desc: 'Follow guided learning paths' },
    { to: '/first-issue', label: 'Find Issues', icon: BugBeetle, desc: 'Pick your first contribution' },
    { to: '/ask', label: 'Ask Questions', icon: Code, desc: 'Get answers about the codebase' },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-8 relative">
      <PageHeader
        eyebrow="Onboarding · Crew Orientation"
        title="Your Onboarding Hub"
        subtitle={`Welcome${user?.displayName ? `, ${user.displayName}` : ''}. Let's get you up to speed.`}
        pills={[
          { label: 'Checklist', value: `${completedCount}/${totalCount}` },
          { label: 'Tasks', value: `${seedData?.completed_tasks ?? 0}/${seedData?.total_tasks ?? 0}` },
        ]}
      />

      {error && (
        <div className="px-4 py-3 rounded-card border border-abort/20 bg-abort/5 text-abort text-body-sm">{error}</div>
      )}

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 h-72 rounded-card border border-seam bg-panel animate-pulse" />
            <div className="h-72 rounded-card border border-seam bg-panel animate-pulse" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 rounded-card border border-seam bg-panel animate-pulse" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Getting Started + Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Checklist */}
            <div className="lg:col-span-2">
              <ConsolePanel rail="Getting Started" designator={`${completedCount}/${totalCount} DONE`}>
                <div className="mb-5">
                  <div className="h-1.5 rounded-sm bg-well overflow-hidden">
                    <div
                      className="h-full bg-go transition-all duration-700"
                      style={{ width: `${(completedCount / Math.max(totalCount, 1)) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  {checklist.map((item) => (
                    <div
                      key={item.label}
                      onClick={() => {
                        if (!item.done) {
                          setChecklist((prev) =>
                            prev.map((c) => (c.label === item.label ? { ...c, done: true } : c))
                          )
                        }
                      }}
                      className={cn(
                        'flex items-center gap-3 p-2.5 rounded-tile transition-colors cursor-pointer',
                        item.done ? 'opacity-60' : 'hover:bg-well/50'
                      )}
                    >
                      {item.done ? (
                        <CheckCircle className="w-5 h-5 text-go shrink-0" weight="fill" />
                      ) : (
                        <Circle className="w-5 h-5 text-ink-muted/40 shrink-0" />
                      )}
                      <span className={cn('text-body-sm', item.done ? 'text-ink-tertiary line-through' : 'text-ink')}>
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </ConsolePanel>
            </div>

            {/* Quick Actions */}
            <div>
              <ConsolePanel rail="Quick Actions" status="standby" className="h-full">
                <div className="space-y-3">
                  {quickActions.map((action) => (
                    <NavLink key={action.to} to={action.to} className="block">
                      <div className="flex items-start gap-3 p-3 rounded-tile bg-well border border-seam hover:border-seam-strong hover:bg-panel transition-colors group cursor-pointer">
                        <div className="w-8 h-8 rounded-tile bg-panel-raised border border-seam flex items-center justify-center shrink-0 text-ink-tertiary">
                          <action.icon className="w-4 h-4" weight="fill" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-body-xs font-medium text-ink">{action.label}</p>
                          <p className="text-caption text-ink-muted">{action.desc}</p>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-ink-muted/40 group-hover:text-ink mt-1 transition-colors" weight="bold" />
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
                <EmptyState icon={<BookOpenText className="w-8 h-8 text-ink-tertiary/30" weight="duotone" />} title="No modules" description="Learning modules will appear once assigned." />
              ) : (
                <div className="space-y-4">
                  {seedData.learning_modules.map((mod: any) => (
                    <div key={mod.name}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-body-xs text-ink font-medium">{mod.name}</span>
                        <span className="text-caption font-code tabular-nums text-ink-muted">{mod.progress}%</span>
                      </div>
                      <div className="h-1.5 rounded-sm bg-well overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-sm transition-all duration-700',
                            mod.progress >= 100 ? 'bg-go' : mod.progress > 0 ? 'bg-mission' : 'bg-well'
                          )}
                          style={{ width: `${mod.progress}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
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
                <EmptyState icon={<Clock className="w-8 h-8 text-ink-tertiary/30" weight="duotone" />} title="No activity yet" description="Your onboarding activity will show here." />
              ) : (
                <div className="relative">
                  <div className="absolute left-3.5 top-0 bottom-0 w-px bg-seam" />
                  <div className="space-y-0">
                    {seedData.recent_activity.map((event: any, i: number) => (
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
            </ConsolePanel>
          </div>
        </>
      )}
    </div>
  )
}
