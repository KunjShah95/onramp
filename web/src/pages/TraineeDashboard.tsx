/*
 * ─── DIRECTION CONTRACT · ONRAMP MISSION CONTROL ────────────────────────────
 * THESIS: The trainee console runs a procedural checklist toward orbit — the
 *   same mission the CTO watches, seen from the trainee's seat. Not a gamified
 *   card wall; an instrument panel with a flight plan.
 * OWN-WORLD: Daylit ops room, seated panels, signal-only colour, mono telemetry.
 *   Progress reads as a mission timeline (unlocked modules = cleared stages).
 * ───────────────────────────────────────────────────────────────────────────
 */
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { GraduationCap, ArrowRight, BookOpenText, GitPullRequest, Check } from '@phosphor-icons/react'
import ConsolePanel from '../components/ui/console-panel'
import ReadoutBank, { type Readout } from '../components/ui/readout-bank'
import MissionTimeline, { type Stage } from '../components/ui/mission-timeline'
import StatusBadge from '../components/ui/status-badge'
import { EmptyState } from '../components/ui/empty-state'
import { TraineeDashboardSkeleton } from '../components/ui/Skeleton'
import GamificationPanel from '../components/gamification/GamificationPanel'
import { useAuth } from '../context/AuthContext'
import { fetchTraineeDashboard } from '../lib/api'
import { cn } from '../lib/utils'
import type { TraineeDashboardResponse, TraineeTask } from '../lib/api'

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const d = Math.floor(diff / 86400000)
  if (d < 1) return 'today'
  if (d === 1) return 'yesterday'
  return `${d}d ago`
}

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const item = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 90, damping: 18 } },
}

export default function TraineeDashboard() {
  const [data, setData] = useState<TraineeDashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedModule, setSelectedModule] = useState<string | null>(null)

  const { activeTeamId } = useAuth()

  async function fetchDashboard() {
    if (!activeTeamId) {
      setLoading(false)
      setError('Join a team to view your onboarding progress.')
      return
    }
    setLoading(true); setError('')
    try {
      const res = await fetchTraineeDashboard(activeTeamId)
      setData(res)
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard.')
    } finally {
      setLoading(false)
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
    <motion.div variants={item} className="flex items-end justify-between gap-4">
      <div>
        <div className="flex items-center gap-2.5 mb-1.5">
          <span className="tile tile-go">Trainee Console</span>
          <span className="designator opacity-50">CREW · ONBOARDING</span>
        </div>
        <h1 className="text-display-md md:text-display-lg text-text-primary flex items-center gap-3">
          <GraduationCap size={30} weight="fill" className="text-go shrink-0" />
          {data?.user_name ? `${data.user_name}'s Ascent` : 'Trainee Console'}
        </h1>
        <p className="text-body-sm text-text-secondary mt-1 font-code">
          Run the checklist. Clear the modules. Reach orbit.
        </p>
      </div>
      <button
        onClick={fetchDashboard}
        disabled={loading}
        className="btn-glass hidden sm:inline-flex disabled:opacity-50"
      >
        Refresh
      </button>
    </motion.div>
  )

  if (error || !data) {
    return (
      <motion.div variants={container} initial="hidden" animate="visible" className="min-h-[calc(100vh-4rem)] p-4 sm:p-6 max-w-6xl mx-auto">
        <div className="flex items-start gap-6">
          <div className="flex-1 space-y-6">
            {header}
            {error ? (
              <motion.div variants={item}>
                <ConsolePanel rail="SIGNAL LOST" designator="CREW" status="abort">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-error text-body-sm font-code">{error}</p>
                    <button onClick={fetchDashboard} disabled={loading} className="btn-glass !px-3 !py-1.5 text-caption shrink-0">Reacquire</button>
                  </div>
                </ConsolePanel>
              </motion.div>
            ) : (
              <motion.div variants={item}>
                <ConsolePanel rail="No Telemetry" designator="CREW" status="idle">
                  <EmptyState icon={<GraduationCap className="w-10 h-10 text-text-tertiary/30" weight="fill" />} title="No data yet" description="Your onboarding progress will appear here." />
                </ConsolePanel>
              </motion.div>
            )}
          </div>
          <div className="w-80 shrink-0 hidden lg:block">
            <GamificationPanel />
          </div>
        </div>
      </motion.div>
    )
  }

  const { progress, modules, recent_tasks } = data
  const completionPct = Math.round((progress.completion_rate ?? 0) * 100)

  const readouts: Readout[] = [
    { label: 'Completion', value: completionPct, suffix: '%', color: completionPct >= 80 ? 'text-success' : completionPct >= 50 ? 'text-info' : 'text-text-primary' },
    { label: 'Modules Unlocked', value: progress.modules_unlocked?.length ?? 0, color: 'text-success' },
    { label: 'In Progress', value: progress.in_progress, color: 'text-info' },
    { label: 'Pending Review', value: progress.pending_review, color: 'text-warning' },
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
    <motion.div variants={container} initial="hidden" animate="visible" className="min-h-[calc(100vh-4rem)] p-4 sm:p-6 max-w-6xl mx-auto flex items-start gap-6">
      <div className="flex-1 min-w-0 space-y-6">
        {header}

        {/* Telemetry */}
        <motion.div variants={item}>
          <ReadoutBank callsign="CREW TELEMETRY" items={readouts} columns={4} />
        </motion.div>

        {/* Flight plan */}
        <motion.div variants={item}>
          <ConsolePanel rail="Flight Plan" designator={`${modules.length} STAGES CLEARED`} status="go" live>
            <div className="pt-2 pb-1">
              <MissionTimeline stages={stages} />
            </div>
          </ConsolePanel>
        </motion.div>

        {/* Unlocked Modules */}
        <motion.div variants={item}>
          <ConsolePanel
            rail="Unlocked Modules"
            designator={`${modules.length} GRANTED`}
            status={modules.length ? 'go' : 'idle'}
          >
            {modules.length === 0 ? (
              <EmptyState icon={<BookOpenText className="w-10 h-10 text-text-tertiary/30" weight="fill" />} title="No modules unlocked yet" description="Modules unlock as you complete onboarding tasks." />
            ) : (
              <div className="space-y-1.5">
                {modules.map((mod, i) => (
                  <motion.div
                    key={`${mod.module}-${i}`}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.035 }}
                    onClick={() => setSelectedModule(selectedModule === mod.module ? null : mod.module)}
                    className={cn(
                      'flex items-center gap-3 p-2.5 rounded-tile bg-well border transition-colors cursor-pointer',
                      selectedModule === mod.module ? 'border-go/40' : 'border-seam hover:border-seam-strong',
                    )}
                  >
                    <span className="w-7 h-7 rounded-tile bg-success-muted border border-success/25 flex items-center justify-center shrink-0 text-success">
                      <Check size={13} weight="bold" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm font-medium text-text-primary font-code truncate">{mod.module}</p>
                      <p className="text-caption text-text-muted">Granted {new Date(mod.granted_at).toLocaleDateString()} · {mod.source}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-text-muted shrink-0" />
                  </motion.div>
                ))}
              </div>
            )}
          </ConsolePanel>
        </motion.div>

        {/* Recent Tasks */}
        <motion.div variants={item}>
          <ConsolePanel rail="Recent Tasks" designator="EVENT LOG" status="standby" live>
            {recent_tasks.length === 0 ? (
              <EmptyState icon={<GitPullRequest className="w-10 h-10 text-text-tertiary/30" weight="fill" />} title="No tasks yet" description="Tasks from your learning path will appear here." />
            ) : (
              <div className="space-y-0.5">
                {recent_tasks.map((task: TraineeTask, i) => (
                  <motion.div
                    key={task.task_id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.035 }}
                    className="flex items-center gap-3 p-2 rounded-tile hover:bg-well/60 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm font-medium text-text-primary truncate">{task.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <StatusBadge state={task.state} />
                        <span className="text-caption text-text-muted font-code">{task.module} · {relativeTime(task.updated_at)}</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </ConsolePanel>
        </motion.div>
      </div>

      {/* Gamification sidebar */}
      <motion.div variants={item} className="w-80 shrink-0 hidden lg:block">
        <div className="sticky top-24">
          <GamificationPanel />
        </div>
      </motion.div>
    </motion.div>
  )
}
