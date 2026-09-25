import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

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


export default function MemberDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
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

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!activeTeamId) { setLoading(false); setError('Join a team to view member progress.'); return }
      setLoading(true); setError('')
      try {
        const res = await fetchTeamAnalytics()
        if (!cancelled) setMembers(res.members ?? [])
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load members.')
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [activeTeamId])

  const selectedMember = userId ? members.find((member) => member.user_id === userId) : null
  const visibleMembers = userId ? (selectedMember ? [selectedMember] : []) : members

  return (
    <div className="relative min-h-[calc(100vh-4rem)]">
      <div className="max-w-5xl mx-auto">
        {/* Back */}
        <div className="mb-6">
          <button
            type="button"
            onClick={() => navigate('/team')}
            className="flex items-center gap-1.5 text-caption text-ink-muted/40 hover:text-ink transition-colors group"
          >
            <ArrowLeft size={12} className="group-hover:-translate-x-0.5 transition-transform" />
            Back to Team
          </button>
        </div>

        {/* Header */}
        <div className="mb-8">
          <PageHeader
            eyebrow="Folio · People"
            title={selectedMember?.name || (userId ? 'Team Member' : 'Team Members')}
            subtitle={selectedMember
              ? `${selectedMember.role} · onboarding progress and contribution stats`
              : 'Per-member onboarding progress and contribution stats'}
          />
        </div>

        
          {error && (
            <div className="overflow-hidden mb-6">
              <div className="flex items-center justify-between p-3 rounded-xl bg-abort/5 border border-abort/15">
                <span className="text-body-xs text-abort">{error}</span>
                <button onClick={fetchMembers} disabled={loading}
                  className="text-caption text-abort/60 hover:text-abort underline">Retry</button>
              </div>
            </div>
          )}
        

        {loading ? (
          <div className="py-8"><MemberListSkeleton /></div>
        ) : visibleMembers.length === 0 ? (
          <div>
            <CardSpotlight className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-card bg-well border border-seam flex items-center justify-center mx-auto mb-4">
                <User size={26} className="text-ink-muted/20" />
              </div>
              <p className="text-body-sm text-ink-muted/40 font-medium mb-1">{userId ? 'Member not found' : 'No members yet'}</p>
              <p className="text-caption text-ink-muted/20">{userId ? 'This member may have left the team or the link is invalid.' : 'Invite teammates to see their progress here.'}</p>
            </CardSpotlight>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleMembers.map((m) => {
              const initials = (m.name || '?').slice(0, 2).toUpperCase()
              // Backend completion_rate is already a percentage (0–100) — do NOT multiply.
              const rate = Math.round(m.completion_rate ?? 0)
              const rateColor = rate >= 70 ? 'text-go' : rate >= 40 ? 'text-caution' : 'text-abort'
              return (
                <div key={m.user_id}>
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
                            <div className={cn('h-full rounded-full', rate >= 70 ? 'bg-go' : rate >= 40 ? 'bg-caution' : 'bg-abort')} style={{ width: `${rate}%` }} />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {[
                            { label: 'Done', value: m.completed_tasks, icon: CheckCircle, color: 'text-go' },
                            { label: 'In Progress', value: m.in_progress_tasks, icon: GitPullRequest, color: 'text-mission' },
                            { label: 'Pending', value: m.pending_review, icon: Bug, color: 'text-caution' },
                            { label: 'Total', value: m.total_tasks, icon: Code, color: 'text-mission' },
                          ].map((stat) => (
                            <div key={stat.label} className="p-2.5 rounded-xl bg-well/30 border border-[rgb(var(--border-rgb)/0.4)] text-center">
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
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
