import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  CalendarBlank,
  GitPullRequest,
  CheckCircle,
  Star,
  ChartBar,
  ArrowLeft,
  ShieldCheck,
  Code,
  Bug,
} from '@phosphor-icons/react'
import PageTransition from '../components/ui/page-transition'
import CardSpotlight from '../components/ui/card-spotlight'
import { MemberListSkeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/empty-state'
import { useAuth } from '../context/AuthContext'
import { fetchTeamAnalytics } from '../lib/api'
import type { TeamMemberProgress } from '../lib/api'

export default function MemberDetailPage() {
  const [members, setMembers] = useState<TeamMemberProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const { activeTeamId } = useAuth()

  async function fetchMembers() {
    if (!activeTeamId) {
      setLoading(false)
      setError('Join a team to view member progress.')
      return
    }
    setLoading(true); setError('')
    try {
      const res = await fetchTeamAnalytics()
      setMembers(res.members ?? [])
    } catch (err: any) {
      setError(err.message || 'Failed to load members.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMembers()
  }, [activeTeamId])

  return (
    <PageTransition>
      <div className="max-w-4xl mx-auto space-y-8">
        <button className="flex items-center gap-1.5 text-caption text-text-tertiary hover:text-text-primary transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Team
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center">
            <Star className="w-5 h-5 text-accent-primary" weight="duotone" />
          </div>
          <div>
            <h1 className="text-display-sm font-display font-medium text-text-primary">
              Team Members
            </h1>
            <p className="text-body-sm text-text-tertiary">
              Per-member onboarding progress and contribution stats.
            </p>
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-lg bg-error-muted border border-error/20 text-error text-body-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={fetchMembers} disabled={loading} className="text-caption underline ml-4 text-error/70 hover:text-error disabled:opacity-50">Retry</button>
          </div>
        )}

        {loading ? (
          <div className="py-8"><MemberListSkeleton /></div>
        ) : members.length === 0 ? (
          <CardSpotlight className="border border-accent-primary/10">
            <EmptyState icon={<Star className="w-10 h-10 text-text-tertiary/30" weight="duotone" />} title="No members yet" description="Invite teammates to see their progress here." />
          </CardSpotlight>
        ) : (
          <div className="space-y-3">
            {members.map((m, i) => {
              const initials = (m.name || m.user_id || '?').slice(0, 2).toUpperCase()
              return (
                <motion.div
                  key={m.user_id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <CardSpotlight className="p-5">
                    <div className="flex items-start gap-5">
                      <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center shrink-0">
                        <span className="text-body font-semibold font-display text-blue-400">{initials}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="text-display-xs font-display font-medium text-text-primary mb-1">
                          {m.name || m.user_id}
                        </h2>
                        <p className="text-body-sm text-text-secondary mb-0.5 capitalize">{m.role}</p>
                        <div className="flex items-center gap-3 text-caption text-text-tertiary">
                          <span className="flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            {m.modules_unlocked.length} modules unlocked
                          </span>
                          <span className="flex items-center gap-1.5">
                            <CalendarBlank className="w-3.5 h-3.5" />
                            {Math.round((m.completion_rate ?? 0) * 100)}% complete
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                      {[
                        { label: 'Tasks Done', value: m.completed_tasks, icon: CheckCircle, color: 'text-emerald-400' },
                        { label: 'In Progress', value: m.in_progress_tasks, icon: GitPullRequest, color: 'text-blue-400' },
                        { label: 'Pending Review', value: m.pending_review, icon: Bug, color: 'text-amber-400' },
                        { label: 'Total Tasks', value: m.total_tasks, icon: Code, color: 'text-purple-400' },
                      ].map((stat) => (
                        <div key={stat.label} className="card p-3 text-center">
                          <stat.icon className={`w-4 h-4 ${stat.color} mx-auto mb-1.5`} weight="duotone" />
                          <p className="text-body font-medium text-text-primary">{stat.value}</p>
                          <p className="text-caption text-text-tertiary">{stat.label}</p>
                        </div>
                      ))}
                    </div>

                    {m.modules_unlocked.length > 0 && (
                      <div className="flex items-center gap-2 mt-4 flex-wrap">
                        <ChartBar className="w-3.5 h-3.5 text-text-tertiary" />
                        {m.modules_unlocked.map((mod) => (
                          <span key={mod} className="px-2 py-0.5 rounded text-[10px] bg-bg-tertiary/30 text-text-tertiary font-code">{mod}</span>
                        ))}
                      </div>
                    )}
                  </CardSpotlight>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </PageTransition>
  )
}
