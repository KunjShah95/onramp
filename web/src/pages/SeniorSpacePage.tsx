import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Eye, Heartbeat, Users, CheckCircle,
} from '@phosphor-icons/react'
import ConsolePanel from '../components/ui/console-panel'
import { EmptyState } from '../components/ui/empty-state'
import { PageHeader } from '../components/ui/page-header'
import { MetricStrip, MetricCell } from '../components/ui/metric-strip'
import { cn } from '../lib/utils'
import { fetchCTODashboard } from '../lib/api'
import ApiCostTracking from '../components/dashboard/ApiCostTracking'

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

export default function SeniorSpacePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dashboard, setDashboard] = useState<any>(null)

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
      className="max-w-6xl mx-auto px-4 sm:px-6 space-y-8 relative"
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
        </>
      )}
    </motion.div>
  )
}
