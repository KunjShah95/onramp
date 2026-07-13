import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  ShieldCheck, Eye, Heartbeat, Users, ListChecks,
  CheckCircle,
} from '@phosphor-icons/react'
import PageTransition from '../components/ui/page-transition'
import CardSpotlight from '../components/ui/card-spotlight'
import { EmptyState } from '../components/ui/empty-state'
import { cn } from '../lib/utils'
import { fetchCTODashboard } from '../lib/api'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
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
  submitted: { label: 'Submitted', color: 'text-warning', bg: 'bg-warning-muted' },
  under_review: { label: 'Under Review', color: 'text-info', bg: 'bg-info-muted' },
  needs_changes: { label: 'Needs Changes', color: 'text-error', bg: 'bg-error-muted' },
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
  const reviews: ReviewItem[] = d?.pending_reviews?.map((r: any) => ({
    id: r.task_id,
    title: r.title,
    author: r.assigned_to ?? 'unknown',
    module: r.module,
    status: r.state === 'submitted' ? 'submitted' : r.state === 'under_review' ? 'under_review' : 'needs_changes',
    timestamp: r.created_at,
  })) ?? []

  const teamMembers: TeamMember[] = d?.member_progress?.map((m: any) => ({
    name: m.name,
    role: m.role ?? 'Developer',
    completion: m.completion_rate ?? 0,
  })) ?? []

  const stats = [
    { label: 'Pending Reviews', value: reviews.length.toString(), icon: Eye, color: 'text-warning' },
    { label: 'Code Health', value: `${d?.completion_rate ?? 0}%`, icon: Heartbeat, color: 'text-success' },
    { label: 'Active Members', value: `${d?.total_members ?? 0}`, icon: Users, color: 'text-info' },
    { label: 'Open Tasks', value: `${d?.in_progress_tasks ?? 0}`, icon: ListChecks, color: 'text-accent-from' },
  ]

  return (
    <PageTransition>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-6xl mx-auto space-y-8"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-purple-400" weight="duotone" />
          </div>
          <div>
            <h1 className="text-display-sm font-display font-medium text-text-primary">Senior Developer Space</h1>
            <p className="text-body-sm text-text-tertiary">Code quality, mentorship, and team oversight.</p>
          </div>
        </motion.div>

        {error && (
          <div className="px-4 py-3 rounded-lg bg-error-muted border border-error/20 text-error text-body-sm">{error}</div>
        )}

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 rounded-xl bg-bg-secondary border border-border animate-pulse" />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="h-64 rounded-xl bg-bg-secondary border border-border animate-pulse" />
              <div className="h-64 rounded-xl bg-bg-secondary border border-border animate-pulse" />
            </div>
          </div>
        ) : (
          <>
            {/* Stats row */}
            <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {stats.map((stat) => (
                <CardSpotlight key={stat.label} className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', stat.color.replace('text', 'bg'), '/10')}>
                      <stat.icon className={cn('w-4 h-4', stat.color)} weight="fill" />
                    </div>
                    <span className="text-caption text-text-tertiary">{stat.label}</span>
                  </div>
                  <p className="text-display-xs font-display font-medium text-text-primary">{stat.value}</p>
                </CardSpotlight>
              ))}
            </motion.div>

            {/* Review Queue + Code Health */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Review Queue */}
              <motion.div variants={itemVariants}>
                <CardSpotlight className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-warning-muted border border-warning/20 flex items-center justify-center">
                        <Eye className="w-4 h-4 text-warning" weight="fill" />
                      </div>
                      <h2 className="font-display text-body-sm font-bold text-text-primary">Review Queue</h2>
                    </div>
                    <span className="text-caption text-warning/60 font-code">{reviews.length} pending</span>
                  </div>
                  {reviews.length === 0 ? (
                    <EmptyState icon={<Eye className="w-8 h-8 text-text-tertiary/30" weight="duotone" />} title="No pending reviews" description="All caught up on reviews." />
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
                            className="flex items-start gap-3 p-3 rounded-lg bg-bg-tertiary/20 border border-border hover:border-warning/30 transition-all cursor-pointer"
                          >
                            <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', cfg.color.replace('text', 'bg'))} />
                            <div className="flex-1 min-w-0">
                              <p className="text-body-xs text-text-primary font-medium truncate">{review.title}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', cfg.bg, cfg.color)}>{cfg.label}</span>
                                <span className="text-caption text-text-tertiary/50 font-code">{review.module}</span>
                                <span className="text-caption text-text-tertiary/40">by {review.author}</span>
                                <span className="text-caption text-text-tertiary/40">· {review.timestamp}</span>
                              </div>
                            </div>
                          </motion.div>
                        )
                      })}
                    </div>
                  )}
                </CardSpotlight>
              </motion.div>

              {/* Code Health */}
              <motion.div variants={itemVariants}>
                <CardSpotlight className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-success-muted border border-success/20 flex items-center justify-center">
                        <Heartbeat className="w-4 h-4 text-success" weight="fill" />
                      </div>
                      <h2 className="font-display text-body-sm font-bold text-text-primary">Code Health</h2>
                    </div>
                    <span className="text-caption text-success/60 font-code">{d?.completion_rate ?? 0}%</span>
                  </div>
                  {teamMembers.length === 0 ? (
                    <EmptyState icon={<Heartbeat className="w-8 h-8 text-text-tertiary/30" weight="duotone" />} title="No team data" description="Member progress data will appear here." />
                  ) : (
                    <div className="space-y-3">
                      {teamMembers.map((m, i) => (
                        <motion.div
                          key={m.name}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.06 }}
                          className="p-3 rounded-lg bg-bg-tertiary/20 border border-border"
                        >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Users className="w-3.5 h-3.5 text-text-tertiary" weight="fill" />
                            <span className="text-body-xs font-medium text-text-primary">{m.name}</span>
                          </div>
                          <span className={cn('text-caption font-code tabular-nums', m.completion >= 80 ? 'text-success' : m.completion >= 60 ? 'text-accent-from' : 'text-error')}>
                            {m.completion}%
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-bg-tertiary overflow-hidden mb-1.5">
                          <div
                            className={cn('h-full rounded-full transition-all duration-700', m.completion >= 80 ? 'bg-success' : m.completion >= 60 ? 'bg-accent-from' : 'bg-error')}
                            style={{ width: `${m.completion}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-caption text-text-tertiary/50">
                          <span>{m.role}</span>
                        </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </CardSpotlight>
              </motion.div>
            </div>

            {/* Module Access + Team Progress */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Module Access */}
              <motion.div variants={itemVariants}>
                <CardSpotlight className="p-5">
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                      <ShieldCheck className="w-4 h-4 text-blue-400" weight="fill" />
                    </div>
                    <h2 className="font-display text-body-sm font-bold text-text-primary">Module Access</h2>
                  </div>
                  <div className="space-y-2">
                    {defaultModules.map((mod) => (
                      <div key={mod.module} className="flex items-center justify-between p-2.5 rounded-lg bg-bg-tertiary/20 border border-border">
                        <div className="flex items-center gap-2.5">
                          <div className="w-6 h-6 rounded bg-success-muted flex items-center justify-center">
                            <CheckCircle className="w-3.5 h-3.5 text-success" weight="fill" />
                          </div>
                          <div>
                            <p className="text-body-xs text-text-primary font-medium">{mod.module}</p>
                            <p className="text-caption text-text-tertiary/60">{mod.permission}</p>
                          </div>
                        </div>
                        <span className="text-caption font-medium text-success">Granted</span>
                      </div>
                    ))}
                  </div>
                </CardSpotlight>
              </motion.div>

              {/* Team Progress */}
              <motion.div variants={itemVariants}>
                <CardSpotlight className="p-5">
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-accent-muted border border-accent/20 flex items-center justify-center">
                      <Users className="w-4 h-4 text-accent-from" weight="fill" />
                    </div>
                    <h2 className="font-display text-body-sm font-bold text-text-primary">Team Progress</h2>
                  </div>
                  {teamMembers.length === 0 ? (
                    <EmptyState icon={<Users className="w-8 h-8 text-text-tertiary/30" weight="duotone" />} title="No team members" description="Team progress data will appear here." />
                  ) : (
                    <div className="space-y-3">
                      {teamMembers.map((member, i) => (
                        <motion.div
                          key={member.name}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-bg-tertiary/20 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-lg bg-gradient-accent/20 border border-accent/20 flex items-center justify-center text-caption font-bold text-accent-from shrink-0">
                            {member.name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-body-xs text-text-primary font-medium">{member.name}</span>
                              <span className={cn('text-caption font-code tabular-nums', member.completion >= 80 ? 'text-success' : member.completion >= 60 ? 'text-accent-from' : 'text-error')}>
                                {member.completion}%
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-caption text-text-tertiary/60">{member.role}</span>
                            </div>
                            <div className="h-1 rounded-full bg-bg-tertiary overflow-hidden mt-1.5">
                              <div
                                className={cn('h-full rounded-full transition-all duration-700', member.completion >= 80 ? 'bg-success' : member.completion >= 60 ? 'bg-accent-from' : 'bg-error')}
                                style={{ width: `${member.completion}%` }}
                              />
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </CardSpotlight>
              </motion.div>
            </div>
          </>
        )}
      </motion.div>
    </PageTransition>
  )
}
