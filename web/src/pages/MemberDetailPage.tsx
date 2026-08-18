import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../lib/utils'
import { PageHeader } from '../components/ui/page-header'
import {
  CalendarBlank, GitPullRequest, CheckCircle,
  ArrowLeft, ShieldCheck, Code, Bug, User,
} from '@phosphor-icons/react'
import CardSpotlight from '../components/ui/card-spotlight'
import { MemberListSkeleton } from '../components/ui/Skeleton'
import { useAuth } from '../context/AuthContext'
import { fetchTeamAnalytics } from '../lib/api'
import type { TeamMemberProgress } from '../lib/api'

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
}
const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
}

export default function MemberDetailPage() {
  const [members, setMembers] = useState<TeamMemberProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { activeTeamId } = useAuth()

  async function fetchMembers() {
    if (!activeTeamId) { setLoading(false); setError('Join a team to view member progress.'); return }
    setLoading(true); setError('')
    try {
      const res = await fetchTeamAnalytics()
      setMembers(res.members ?? [])
    } catch (err: any) {
      setError(err.message || 'Failed to load members.')
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchMembers() }, [activeTeamId])

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="relative min-h-[calc(100vh-4rem)]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Back */}
        <motion.div variants={item} className="mb-6">
          <button className="flex items-center gap-1.5 text-caption text-ink-muted/40 hover:text-ink transition-colors group">
            <ArrowLeft size={12} className="group-hover:-translate-x-0.5 transition-transform" />
            Back to Team
          </button>
        </motion.div>

        {/* Header */}
        <motion.div variants={item} className="mb-8">
          <PageHeader
            eyebrow="Folio · People"
            title="Team Members"
            subtitle="Per-member onboarding progress and contribution stats"
          />
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-6"
            >
              <div className="flex items-center justify-between p-3 rounded-xl bg-red-500/5 border border-red-500/15">
                <span className="text-body-xs text-red-300">{error}</span>
                <button onClick={fetchMembers} disabled={loading}
                  className="text-caption text-red-400/60 hover:text-red-400 underline">Retry</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="py-8"><MemberListSkeleton /></div>
        ) : members.length === 0 ? (
          <motion.div variants={item}>
            <CardSpotlight className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-card bg-well border border-seam flex items-center justify-center mx-auto mb-4">
                <User size={26} className="text-ink-muted/20" />
              </div>
              <p className="text-body-sm text-ink-muted/40 font-medium mb-1">No members yet</p>
              <p className="text-caption text-ink-muted/20">Invite teammates to see their progress here.</p>
            </CardSpotlight>
          </motion.div>
        ) : (
          <motion.div variants={item} className="space-y-3">
            {members.map((m, i) => {
              const initials = (m.name || '?').slice(0, 2).toUpperCase()
              // Backend completion_rate is already a percentage (0–100) — do NOT multiply.
              const rate = Math.round(m.completion_rate ?? 0)
              const rateColor = rate >= 70 ? 'text-emerald-400' : rate >= 40 ? 'text-amber-400' : 'text-red-400'
              return (
                <motion.div
                  key={m.user_id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.035 }}
                >
                  <CardSpotlight className="p-5 group hover:border-seam-strong transition-all">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-5">
                      <div className="w-12 h-12 rounded-card bg-well border border-seam flex items-center justify-center shrink-0">
                        <span className="font-display text-body font-bold text-ink-tertiary">{initials}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h2 className="font-display text-body font-bold text-ink">{m.name || 'N/A'}</h2>
                            <p className="text-body-xs text-ink-muted/50 capitalize mt-0.5">{m.role}</p>
                          </div>
                          <div className={cn('font-code text-body-xs font-semibold tabular-nums', rateColor)}>{rate}%</div>
                        </div>

                        <div className="mt-3 mb-4">
                          <div className="h-1.5 rounded-full bg-well overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${rate}%` }}
                              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
                              className={cn('h-full rounded-full', rate >= 70 ? 'bg-emerald-400' : rate >= 40 ? 'bg-amber-400' : 'bg-red-400')}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {[
                            { label: 'Done', value: m.completed_tasks, icon: CheckCircle, color: 'text-emerald-400' },
                            { label: 'In Progress', value: m.in_progress_tasks, icon: GitPullRequest, color: 'text-blue-400' },
                            { label: 'Pending', value: m.pending_review, icon: Bug, color: 'text-amber-400' },
                            { label: 'Total', value: m.total_tasks, icon: Code, color: 'text-purple-400' },
                          ].map((stat) => (
                            <div key={stat.label} className="p-2.5 rounded-xl bg-well/30 border border-seam/40 text-center">
                              <stat.icon size={12} className={cn(stat.color, 'mx-auto mb-1')} weight="fill" />
                              <p className="text-body-xs font-semibold text-ink tabular-nums">{stat.value}</p>
                              <p className="text-overline text-ink-muted/30 mt-0.5">{stat.label}</p>
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center gap-3 mt-3 flex-wrap text-caption text-ink-muted/30">
                          <span className="flex items-center gap-1.5">
                            <ShieldCheck size={11} />
                            {m.modules_unlocked.length} unlocked
                          </span>
                          <span className="flex items-center gap-1.5">
                            <CalendarBlank size={11} />
                            {rate}% complete
                          </span>
                          {m.modules_unlocked.length > 0 && (
                            <span className="flex items-center gap-1.5">
                              <User size={11} />
                              {m.modules_unlocked.slice(0, 3).join(', ')}{m.modules_unlocked.length > 3 ? '...' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardSpotlight>
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
