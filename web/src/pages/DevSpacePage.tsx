/*
 * ─── DIRECTION CONTRACT · ONRAMP MISSION CONTROL · FIRST PRINCIPLES ─────────
 * THESIS: Dev Space is a developer-console seat — telemetry, quick links to
 *   tools, recent activity. Seated panels, mono readouts, no neon.
 * DISCLOSURE: the page opens on one recommended move (NextUp), then the everyday
 *   tools. Admin-only links live behind a counted category so a developer's
 *   default view is not carrying a door they cannot open. Long lists are capped.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useMemo, useState } from 'react'

import { Link } from 'react-router-dom'
import {
  Compass, ChatCircleDots, GitPullRequest, Heartbeat,
  Eye, ListChecks, ShieldCheck, Clock, Robot, CaretRight,
} from '@phosphor-icons/react'
import PageTransition from '../components/ui/page-transition'
import ConsolePanel from '../components/ui/console-panel'
import ReadoutBank, { type Readout } from '../components/ui/readout-bank'
import StatusTile from '../components/ui/status-tile'
import { PageHeader } from '../components/ui/page-header'
import { EmptyState } from '../components/ui/empty-state'
import { NextUp, FilterChips, ShowMore, TaskRow } from '../components/ui/progressive'
import { fetchSeedRoleData } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { cn } from '../lib/utils'


interface QuickLink {
  to: string
  title: string
  description: string
  icon: any
  /** Category bucket — lets a developer filter the shelf before reading it. */
  group: 'Codebase' | 'Delivery' | 'Workspace' | 'Admin'
}

interface ActivityEvent {
  id: number
  type: string
  title: string
  module: string
  timestamp: string
  state: 'completed' | 'in_progress' | 'submitted'
}

const quickLinks: QuickLink[] = [
  { to: '/explore', title: 'Explore Architecture', description: 'Visualize and explore codebase architecture', icon: Compass, group: 'Codebase' },
  { to: '/ask', title: 'Ask Codebase', description: 'Ask questions about your codebase', icon: ChatCircleDots, group: 'Codebase' },
  { to: '/autonomous', title: 'Autonomous Agent', description: 'Hand a ticket to the coding agent', icon: Robot, group: 'Codebase' },
  { to: '/pr-describe', title: 'Describe PR', description: 'Generate PR descriptions automatically', icon: GitPullRequest, group: 'Delivery' },
  { to: '/code-health', title: 'Code Health', description: 'Monitor code quality metrics', icon: Heartbeat, group: 'Delivery' },
  { to: '/reviews', title: 'Review Queue', description: 'Review pending pull requests', icon: Eye, group: 'Delivery' },
  { to: '/tasks', title: 'Tasks', description: 'View and manage your tasks', icon: ListChecks, group: 'Workspace' },
  { to: '/admin', title: 'Admin Panel', description: 'System administration and settings', icon: ShieldCheck, group: 'Admin' },
]

const GROUP_ORDER = ['Codebase', 'Delivery', 'Workspace', 'Admin'] as const

const stateTone: Record<string, 'go' | 'standby' | 'caution'> = {
  completed: 'go',
  in_progress: 'standby',
  submitted: 'caution',
}
const stateLabel: Record<string, string> = {
  completed: 'Done',
  in_progress: 'In progress',
  submitted: 'Submitted',
}

export default function DevSpacePage() {
  const { activeTeamId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [seedData, setSeedData] = useState<any>(null)
  const [toolGroup, setToolGroup] = useState<string>('all')

  useEffect(() => {
    let cancelled = false
    fetchSeedRoleData(activeTeamId || undefined)
      .then((res) => { if (!cancelled) { setSeedData(res.data); setLoading(false) } })
      .catch((err) => { if (!cancelled) { setError(err.message); setLoading(false) } })
    return () => { cancelled = true }
  }, [activeTeamId])

  const d = seedData
  const repos = d?.stats?.repos_analyzed ?? d?.stats?.total_users ?? 0
  const teams = d?.stats?.active_teams ?? 0
  const users = d?.stats?.total_users ?? 0
  const calls = d?.stats?.api_calls_24h ?? 0

  const readouts: Readout[] = [
    { label: 'Repos Analyzed', value: repos, color: 'text-mission' },
    { label: 'Active Teams', value: teams, color: 'text-go' },
    { label: 'Total Users', value: users, color: 'text-mission' },
    { label: 'API Calls · 24h', value: calls, color: 'text-caution' },
  ]

  const activity: ActivityEvent[] = useMemo(() => d?.recent_activity?.map((a: any, i: number) => ({
    id: i,
    type: a.type ?? 'task',
    title: a.title,
    module: a.module ?? 'core',
    timestamp: a.timestamp ?? a.updated_at ?? '',
    state: a.state ?? a.status ?? 'completed',
  })) ?? [], [d])

  // ── Reduce the shelf before reading it ──────────────────────────────
  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = { all: quickLinks.length }
    for (const link of quickLinks) counts[link.group] = (counts[link.group] ?? 0) + 1
    return counts
  }, [])

  const visibleTools = useMemo(
    () => (toolGroup === 'all' ? quickLinks : quickLinks.filter((l) => l.group === toolGroup)),
    [toolGroup],
  )

  // Sorted by state so a submitted PR (waiting on someone) is never buried
  // under a wall of finished work.
  const rankedActivity = useMemo(() => {
    const weight: Record<string, number> = { submitted: 0, in_progress: 1, completed: 2 }
    return [...activity].sort(
      (a, b) => (weight[a.state] ?? 3) - (weight[b.state] ?? 3) || a.id - b.id,
    )
  }, [activity])

  const pendingCount = activity.filter((e) => e.state === 'submitted').length
  const activeCount = activity.filter((e) => e.state === 'in_progress').length

  return (
    <PageTransition>
      <div className="min-h-[calc(100vh-4rem)] max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <PageHeader
            eyebrow="Folio 02 · Developer"
            title="Developer Space"
            subtitle="Full-access developer portal and tools."
            pills={[{ label: 'Data', value: 'Demo' }]}
          />
        </div>

        {error && (
          <div>
            <ConsolePanel rail="Signal Lost" designator="DEV" status="abort">
              <div className="flex items-center justify-between gap-4">
                <p className="text-abort text-body-sm font-code">{error}</p>
              </div>
            </ConsolePanel>
          </div>
        )}

        {loading ? (
          <div className="space-y-5" role="status" aria-label="Loading developer space">
            <div className="h-24 rounded-card bg-panel border border-seam animate-skeleton" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-28 rounded-card bg-panel border border-seam animate-skeleton" />
              ))}
            </div>
            <div className="h-64 rounded-card bg-panel border border-seam animate-skeleton" />
          </div>
        ) : (
          <>
            {/* ── One verdict, one move ────────────────────────────────── */}
            <NextUp
              tone={pendingCount > 0 ? 'caution' : 'go'}
              eyebrow="Your next move"
              headline={
                pendingCount > 0
                  ? `${pendingCount} pull request${pendingCount === 1 ? '' : 's'} waiting on review`
                  : activeCount > 0
                    ? `${activeCount} task${activeCount === 1 ? '' : 's'} in flight`
                    : 'Nothing is blocked on you'
              }
              detail={
                pendingCount > 0
                  ? 'Reviews are the shortest path to unblocking a teammate.'
                  : activeCount > 0
                    ? 'Finish the open leg, then raise the PR to close the loop.'
                    : 'Pick a tool from the shelf below, or ask the codebase a question.'
              }
              primary={
                pendingCount > 0
                  ? { id: 'reviews', label: 'Open review queue', detail: 'Clear the oldest first', to: '/reviews', count: pendingCount, icon: Eye, tone: 'caution' }
                  : activeCount > 0
                    ? { id: 'tasks', label: 'Go to my tasks', detail: 'Pick up the in-flight work', to: '/tasks', count: activeCount, icon: ListChecks, tone: 'mission' }
                    : { id: 'ask', label: 'Ask the codebase', detail: 'Unblock yourself first', to: '/ask', icon: ChatCircleDots }
              }
              secondary={[
                { id: 'explore', label: 'Explore architecture', detail: 'Read the graph before you edit', to: '/explore', icon: Compass, tone: 'mission' },
                { id: 'autonomous', label: 'Open the autonomous agent', detail: 'Delegate a ticket', to: '/autonomous', icon: Robot, tone: 'mission' },
                { id: 'describe', label: 'Describe a PR', detail: 'Draft the description from the diff', to: '/pr-describe', icon: GitPullRequest, tone: 'go' },
                { id: 'health', label: 'Check code health', detail: 'Quality metrics for the repo', to: '/code-health', icon: Heartbeat, tone: 'go' },
                { id: 'tasks', label: 'Manage tasks', detail: 'Everything assigned to you', to: '/tasks', icon: ListChecks, tone: 'ink' },
              ]}
            />

            {/* Telemetry */}
            <div>
              <ReadoutBank callsign="Developer" items={readouts} columns={4} />
            </div>

            {/* Quick access — filtered, then capped */}
            <div>
              <ConsolePanel
                rail="Tool Shelf"
                designator={`${visibleTools.length} TOOLS`}
                status="go"
                action={
                  visibleTools.length > 0 ? (
                    <Link
                      to="/tasks"
                      className="text-caption text-ink-muted/60 hover:text-go transition-colors font-semibold inline-flex items-center gap-1"
                    >
                      Shelf <CaretRight size={12} weight="bold" />
                    </Link>
                  ) : undefined
                }
              >
                <FilterChips
                  label="Filter"
                  value={toolGroup}
                  onChange={setToolGroup}
                  options={[
                    { value: 'all', label: 'All', count: groupCounts.all },
                    ...GROUP_ORDER
                      .filter((g) => groupCounts[g])
                      .map((g) => ({ value: g, label: g, count: groupCounts[g] })),
                  ]}
                  summary={`${visibleTools.length} of ${quickLinks.length}`}
                />

                <div className="mt-4">
                  <ShowMore
                    items={visibleTools}
                    limit={4}
                    noun="tool"
                    resetKey={toolGroup}
                    emptyState={
                      <EmptyState
                        icon={<Compass className="w-8 h-8 text-ink-disabled" weight="duotone" />}
                        title="No tools in this category"
                        description="Pick another filter to see the rest of the shelf."
                      />
                    }
                  >
                    {(tools) => (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {tools.map((link) => (
                          <Link
                            key={link.to}
                            to={link.to}
                            className="group block rounded-tile bg-well border border-seam p-3 transition-[border-color,background-color,transform] duration-150 ease-out hover:-translate-y-px hover:border-seam-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-go"
                          >
                            <div className="flex items-center gap-2.5 mb-1.5">
                              <span className="w-7 h-7 rounded-tile bg-go/10 border border-go/25 flex items-center justify-center text-go shrink-0">
                                <link.icon size={14} weight="fill" />
                              </span>
                              <span className="font-code text-caption text-ink-secondary truncate">{link.title}</span>
                            </div>
                            <p className="text-caption text-ink-muted line-clamp-2 mb-2 min-h-[2.4em]">
                              {link.description}
                            </p>
                            <div className="flex items-center gap-1 text-caption text-ink-muted/60 group-hover:text-go transition-colors">
                              <span>Open</span>
                              <CaretRight size={11} weight="bold" />
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </ShowMore>
                </div>
              </ConsolePanel>
            </div>

            {/* Recent Activity — sorted by what needs a person, then capped */}
            <div>
              <ConsolePanel
                rail="Recent Activity"
                designator={`${activity.length} EVENTS`}
                status={activity.length ? 'standby' : 'idle'}
                live={activity.length > 0}
              >
                {activity.length === 0 ? (
                  <EmptyState
                    icon={<Clock className="w-8 h-8 text-ink-disabled" weight="duotone" />}
                    title="No recent activity"
                    description="Activity from your workspace will appear here."
                  />
                ) : (
                  <ShowMore items={rankedActivity} limit={5} noun="event" resetKey={activeTeamId ?? 'none'}>
                    {(events) => (
                      <div className="divide-y divide-seam">
                        {events.map((event) => {
                          const tone = stateTone[event.state] ?? 'standby'
                          return (
                            <TaskRow
                              key={event.id}
                              leading={<StatusTile status={tone} label={stateLabel[event.state] ?? event.state} />}
                              title={event.title}
                              meta={
                                <span className="flex items-center gap-2">
                                  <span className="font-code">{event.module}</span>
                                  {event.timestamp && (
                                    <>
                                      <span className="text-ink-disabled">·</span>
                                      <span className="font-code">{event.timestamp}</span>
                                    </>
                                  )}
                                </span>
                              }
                              className={cn(
                                'rounded-tile',
                                event.state === 'submitted' && 'bg-caution/[0.05]',
                              )}
                            />
                          )
                        })}
                      </div>
                    )}
                  </ShowMore>
                )}
              </ConsolePanel>
            </div>
          </>
        )}
      </div>
    </PageTransition>
  )
}
