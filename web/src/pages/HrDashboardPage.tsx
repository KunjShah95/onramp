import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { cn } from '../lib/utils'
import {
  fetchHrCohort, listTeams,
  fetchCohortComparison, fetchMentorMatch, fetchReviewAnalytics,
} from '../lib/api'
import type {
  HrAttritionRisk, HrCompletionMember, HrRampTime, HrEngagement,
  CohortComparisonEntry, MentorMatchResponse, ReviewAnalytics,
} from '../lib/api'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import {
  Brain, Clock, CheckCircle, ChartBar, TrendUp, Users, WarningCircle,
  Fire, Hash, GitMerge, Handshake, Gauge, CaretDown,
} from '@phosphor-icons/react'
import {
  ResponsiveContainer, Tooltip, Cell,
  PieChart, Pie,
} from 'recharts'

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
}

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
}

function TeamSelector({
  teams,
  selected,
  onChange,
}: {
  teams: { id: string; name: string; team_id?: string }[]
  selected: string
  onChange: (id: string) => void
}) {
  if (teams.length <= 1) return null
  return (
    <div className="flex items-center gap-2 bg-bg-secondary rounded-btn border border-border p-1">
      <Hash size={14} className="text-text-muted/40 ml-2" weight="bold" />
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-body-sm text-text-primary font-medium px-1 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-accent/30 cursor-pointer appearance-none"
      >
        {teams.map((t) => (
          <option key={t.team_id || t.id} value={t.team_id || t.id} className="bg-bg-secondary">
            {t.name}
          </option>
        ))}
      </select>
    </div>
  )
}

function RampTimeCard({ rampTime }: { rampTime: HrRampTime | undefined }) {
  if (!rampTime) return null
  const topSlowest = [...(rampTime.members || [])]
    .filter((m) => m.ramp_days !== null)
    .sort((a, b) => (b.ramp_days || 0) - (a.ramp_days || 0))
    .slice(0, 5)

  return (
    <CardSpotlight className="p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg bg-accent-muted border border-accent/20 flex items-center justify-center">
          <Clock size={16} className="text-accent-from" />
        </div>
        <h2 className="font-display text-body-sm font-bold">Ramp Time</h2>
      </div>
      <div className="flex items-baseline gap-2 mb-4">
        <span className="font-display text-display-sm font-bold text-accent-from tabular-nums">
          {rampTime.team_average_days ?? '—'}
        </span>
        <span className="text-caption text-text-muted/50">days avg</span>
      </div>
      <p className="text-caption text-text-muted/40 mb-3">Slowest members (days to 1st PR)</p>
      <div className="space-y-2">
        {topSlowest.length === 0 && (
          <p className="text-caption text-text-disabled/50 italic">No completions yet.</p>
        )}
        {topSlowest.map((m, i) => (
          <div key={m.user_id} className="flex items-center gap-2">
            <span className="w-4 text-caption text-text-muted/30 tabular-nums">{i + 1}.</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-body-xs text-text-primary truncate">{m.name}</span>
                <span className={cn(
                  'text-caption font-code tabular-nums',
                  (m.ramp_days || 0) > 10 ? 'text-error' : 'text-text-muted'
                )}>
                  {m.ramp_days}d
                </span>
              </div>
              <div className="h-1 rounded-full bg-bg-tertiary overflow-hidden mt-1">
                <div
                  className={cn(
                    'h-full rounded-full',
                    (m.ramp_days || 0) > 10 ? 'bg-error' : 'bg-accent-from'
                  )}
                  style={{ width: `${Math.min(((m.ramp_days || 0) / 20) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </CardSpotlight>
  )
}

function CompletionRatesCard({
  members,
}: {
  members: HrCompletionMember[] | undefined
}) {
  if (!members) return null
  const avgPct = members.length > 0
    ? Math.round(members.reduce((s, m) => s + m.completion_pct, 0) / members.length)
    : 0

  return (
    <CardSpotlight className="p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg bg-success-muted border border-success/20 flex items-center justify-center">
          <ChartBar size={16} className="text-success" />
        </div>
        <h2 className="font-display text-body-sm font-bold">Onboarding Completion</h2>
      </div>
      <div className="flex items-baseline gap-2 mb-4">
        <span className="font-display text-display-sm font-bold text-success tabular-nums">{avgPct}%</span>
        <span className="text-caption text-text-muted/50">team avg</span>
      </div>
      <div className="space-y-2.5">
        {members.length === 0 && (
          <p className="text-caption text-text-disabled/50 italic">No team members yet.</p>
        )}
        {members.map((m) => (
          <div key={m.user_id}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-body-xs text-text-primary truncate">{m.name}</span>
              <span className="text-caption font-code tabular-nums text-text-muted/60">
                {m.completed}/{m.assigned}
              </span>
            </div>
            <div className="h-2 rounded-full bg-bg-tertiary overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${m.completion_pct}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className={cn(
                  'h-full rounded-full',
                  m.completion_pct >= 80 ? 'bg-success' :
                  m.completion_pct >= 50 ? 'bg-accent-from' :
                  m.completion_pct >= 25 ? 'bg-warning' :
                  'bg-error'
                )}
              />
            </div>
          </div>
        ))}
      </div>
    </CardSpotlight>
  )
}

function CohortFunnelCard({ members }: { members: HrCompletionMember[] | undefined }) {
  if (!members || members.length === 0) return null
  const totalAssigned = members.reduce((s, m) => s + m.assigned, 0)
  const totalCompleted = members.reduce((s, m) => s + m.completed, 0)
  const inProgress = totalAssigned - totalCompleted
  const funnelData = [
    { name: 'Joined', value: members.length, color: '#1A5FA8' },
    { name: 'Assigned', value: totalAssigned, color: '#2472C4' },
    { name: 'In Progress', value: inProgress, color: '#B5710A' },
    { name: 'Completed', value: totalCompleted, color: '#0E7A3C' },
  ]

  return (
    <CardSpotlight className="p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg bg-info-muted border border-info/20 flex items-center justify-center">
          <TrendUp size={16} className="text-info" />
        </div>
        <h2 className="font-display text-body-sm font-bold">Cohort Funnel</h2>
      </div>
      <div className="flex items-center gap-4">
        <div className="w-36 h-36 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={funnelData}
                cx="50%" cy="50%"
                innerRadius={38}
                outerRadius={62}
                paddingAngle={3}
                dataKey="value"
                stroke="none"
              >
                {funnelData.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: '#1D1D26',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#F1F1F3',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-2">
          {funnelData.map((d) => {
            const pct = totalAssigned > 0
              ? Math.round((d.value / funnelData[1].value) * 100)
              : 0
            return d.value === 0 ? null : (
              <div key={d.name} className="flex items-center justify-between text-caption">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-text-muted">{d.name}</span>
                </div>
                <span className="font-code tabular-nums text-text-primary">
                  {d.value}
                  <span className="text-text-muted/30 ml-1">({pct}%)</span>
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </CardSpotlight>
  )
}

function EngagementCard({ engagement }: { engagement: HrEngagement | undefined }) {
  if (!engagement) return null
  const memberCount = engagement.members.length

  return (
    <CardSpotlight className="p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg bg-warning-muted border border-warning/20 flex items-center justify-center">
          <Fire size={16} className="text-warning" />
        </div>
        <h2 className="font-display text-body-sm font-bold">Engagement</h2>
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="font-display text-display-sm font-bold text-warning tabular-nums">{engagement.active_streaks}</span>
        <span className="text-caption text-text-muted/50">/ {memberCount} active streaks</span>
      </div>
      <div className="mt-4 space-y-2">
        {engagement.members.length === 0 && (
          <p className="text-caption text-text-disabled/50 italic">No streak data.</p>
        )}
        {engagement.members.slice(0, 6).map((m) => (
          <div key={m.user_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-bg-tertiary/20 transition-colors">
            <div className={cn(
              'w-6 h-6 rounded-lg flex items-center justify-center',
              m.current_streak > 0 ? 'bg-warning-muted border border-warning/20' : 'bg-bg-tertiary border border-border'
            )}>
              <Fire size={12} className={m.current_streak > 0 ? 'text-warning' : 'text-text-disabled/30'} weight="fill" />
            </div>
            <span className="flex-1 text-body-xs text-text-primary truncate">{m.name}</span>
            <span className={cn(
              'text-caption font-code tabular-nums',
              m.current_streak > 0 ? 'text-warning' : 'text-text-disabled/40'
            )}>
              {m.current_streak}d
            </span>
            {m.longest_streak > m.current_streak && (
              <span className="text-caption text-text-muted/30">best: {m.longest_streak}d</span>
            )}
          </div>
        ))}
      </div>
    </CardSpotlight>
  )
}

function ReviewAnalyticsCard({ analytics }: { analytics: ReviewAnalytics | undefined }) {
  if (!analytics) return null
  return (
    <CardSpotlight className="p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg bg-info-muted border border-info/20 flex items-center justify-center">
          <Gauge size={16} className="text-info" />
        </div>
        <h2 className="font-display text-body-sm font-bold">Review Analytics</h2>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        {[
          { label: 'Rework rate', value: `${analytics.rework_rate_pct}%`, color: analytics.rework_rate_pct > 30 ? 'text-error' : analytics.rework_rate_pct > 15 ? 'text-warning' : 'text-success' },
          { label: 'Tasks reworked', value: String(analytics.reworked_task_count), color: 'text-text-primary' },
          { label: 'Avg turnaround', value: analytics.avg_review_turnaround_hours != null ? `${analytics.avg_review_turnaround_hours}h` : '—', color: 'text-text-primary' },
          { label: 'Pending review', value: String(analytics.pending_review_count), color: analytics.pending_review_count > 0 ? 'text-warning' : 'text-success' },
        ].map((s) => (
          <div key={s.label} className="bg-bg-tertiary/40 rounded-card p-2.5 border border-border">
            <div className="text-caption text-text-muted/50 mb-0.5">{s.label}</div>
            <div className={cn('font-display text-body-sm font-bold tabular-nums', s.color)}>{s.value}</div>
          </div>
        ))}
      </div>
      {analytics.top_reviewers.length > 0 && (
        <div>
          <div className="text-caption text-text-muted/40 mb-2">Top reviewers</div>
          <div className="space-y-1.5">
            {analytics.top_reviewers.slice(0, 5).map((r, i) => (
              <div key={r.user_id} className="flex items-center gap-2">
                <span className="w-4 text-caption text-text-muted/30 tabular-nums">{i + 1}.</span>
                <span className="flex-1 text-body-xs text-text-primary truncate">{r.name || r.user_id}</span>
                <span className="text-caption font-code tabular-nums text-info">{r.reviews}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </CardSpotlight>
  )
}

function CohortComparisonCard({ cohorts }: { cohorts: CohortComparisonEntry[] | undefined }) {
  if (!cohorts || cohorts.length === 0) return null
  const sorted = [...cohorts].sort((a, b) => (a.avg_ramp_days ?? 999) - (b.avg_ramp_days ?? 999))
  const best = sorted[0]

  return (
    <CardSpotlight className="p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg bg-accent-muted border border-accent/20 flex items-center justify-center">
          <GitMerge size={16} className="text-accent-from" />
        </div>
        <h2 className="font-display text-body-sm font-bold">Cohort Comparison</h2>
      </div>
      <p className="text-caption text-text-muted/40 mb-4">
        Fastest cohort: <span className="text-success font-medium">{best.label}</span> at {best.avg_ramp_days ?? '—'} days avg ramp
      </p>
      <div className="space-y-3">
        {cohorts.slice(0, 6).map((c) => (
          <div key={c.cohort}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-body-xs text-text-primary font-medium truncate">
                {c.label} <span className="text-text-muted/40">({c.member_count})</span>
              </span>
              <span className="text-caption font-code tabular-nums text-text-muted/70">
                {c.avg_ramp_days != null ? `${c.avg_ramp_days}d` : '—'}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(((c.avg_ramp_days ?? 999) / 30) * 100, 100)}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className={cn('h-full rounded-full', c.avg_ramp_days != null && c.avg_ramp_days <= 7 ? 'bg-success' : c.avg_ramp_days != null && c.avg_ramp_days <= 14 ? 'bg-accent-from' : 'bg-warning')}
              />
            </div>
            <div className="flex gap-3 mt-1 text-caption text-text-muted/40">
              <span>{c.avg_days_to_first_pr != null ? `1st PR ${c.avg_days_to_first_pr}d` : 'no 1st PR'}</span>
              <span>completion {c.avg_completion_pct ?? 0}%</span>
              <span className={c.blocker_count > 0 ? 'text-warning' : ''}>⛔ {c.blocker_count}</span>
            </div>
          </div>
        ))}
      </div>
    </CardSpotlight>
  )
}

function MentorMatchCard({
  match,
  members,
  selectedId,
  onSelect,
}: {
  match: MentorMatchResponse | undefined
  members: Array<{ user_id: string; name: string }>
  selectedId: string
  onSelect: (id: string) => void
}) {
  // Keep the card rendered whenever there are members to choose from, so the
  // selector stays usable even for devs with no matches yet.
  if (members.length === 0) return null
  return (
    <CardSpotlight className="p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg bg-warning-muted border border-warning/20 flex items-center justify-center">
          <Handshake size={16} className="text-warning" />
        </div>
        <h2 className="font-display text-body-sm font-bold">Mentor Matches</h2>
      </div>

      <label htmlFor="mentor-dev-select" className="block text-caption text-text-muted/50 mb-1.5">New dev</label>
      <div className="relative mb-3">
        <select
          id="mentor-dev-select"
          aria-label="Select new dev"
          value={selectedId}
          onChange={(e) => onSelect(e.target.value)}
          className="w-full appearance-none bg-bg-tertiary/60 border border-border rounded-card px-3 py-2 text-body-xs text-text-primary font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent/30 transition-all"
        >
          {members.map((member) => (
            <option key={member.user_id} value={member.user_id} className="bg-bg-secondary">
              {member.name}
            </option>
          ))}
        </select>
        <CaretDown size={12} weight="bold" className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted/40 pointer-events-none" />
      </div>

      {!match || match.matches.length === 0 ? (
        <div className="text-center py-6">
          <div className="w-9 h-9 rounded-xl bg-bg-tertiary/50 border border-border flex items-center justify-center mx-auto mb-2">
            <Handshake size={16} className="text-text-muted/30" />
          </div>
          <p className="text-caption text-text-disabled/60 italic">
            No mentor matches for this dev yet — assign them tasks to build their language profile.
          </p>
        </div>
      ) : (
        <>
          <p className="text-caption text-text-muted/40 mb-3 truncate">
            New dev languages: <span className="text-accent-from font-code">{match.new_dev_languages.join(', ') || '—'}</span>
          </p>
          <div className="space-y-2">
            {match.matches.slice(0, 4).map((m) => (
              <div key={m.user_id} className="flex items-center gap-3 p-2.5 rounded-card bg-bg-tertiary/40 border border-border">
                <div className="w-8 h-8 rounded-lg bg-accent-muted border border-accent/20 flex items-center justify-center text-caption font-bold text-accent-from shrink-0">
                  {m.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-body-xs font-medium text-text-primary truncate">{m.name}</span>
                    <span className="text-caption font-code tabular-nums text-accent-from">{m.score}</span>
                  </div>
                  <div className="text-caption text-text-muted/50 truncate">
                    {m.shared_languages.length > 0 ? `Shared: ${m.shared_languages.join(', ')}` : 'No shared languages'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </CardSpotlight>
  )
}

function AttritionRiskCard({ risk }: { risk: HrAttritionRisk | undefined }) {
  if (!risk) return null

  if (risk.at_risk_count === 0) {
    return (
      <CardSpotlight className="p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-success-muted border border-success/20 flex items-center justify-center">
            <CheckCircle size={16} className="text-success" />
          </div>
          <h2 className="font-display text-body-sm font-bold">Attrition Risk</h2>
        </div>
        <div className="text-center py-6">
          <div className="w-10 h-10 rounded-2xl bg-success-muted border border-success/20 flex items-center justify-center mx-auto mb-3">
            <CheckCircle size={20} className="text-success" weight="fill" />
          </div>
          <p className="text-text-disabled/60 text-body-sm italic">No members at risk. Team is healthy!</p>
        </div>
      </CardSpotlight>
    )
  }

  return (
    <CardSpotlight className="p-5">
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-8 h-8 rounded-lg bg-error-muted border border-error/20 flex items-center justify-center">
          <WarningCircle size={16} className="text-error" />
        </div>
        <h2 className="font-display text-body-sm font-bold">Attrition Risk</h2>
      </div>
      <div className="flex items-baseline gap-2 mb-4">
        <span className="font-display text-display-sm font-bold text-error tabular-nums">{risk.at_risk_count}</span>
        <span className="text-caption text-text-muted/50">member(s) flagged</span>
      </div>
      <div className="space-y-2">
        {risk.at_risk.map((m, i) => (
          <motion.div
            key={m.user_id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="p-3 rounded-card bg-error-muted/20 border border-error/15"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-5 h-5 rounded-md bg-error-muted border border-error/20 flex items-center justify-center text-caption font-bold text-error">
                {m.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-body-xs font-medium text-text-primary">{m.name}</span>
            </div>
            <ul className="space-y-0.5">
              {m.reasons.map((reason, ri) => (
                <li key={ri} className="flex items-start gap-1.5 text-caption text-text-muted/70">
                  <span className="text-error mt-0.5">•</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>
    </CardSpotlight>
  )
}

export default function HrDashboardPage() {
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [selectedDevId, setSelectedDevId] = useState<string>('')

  // Fetch teams list for the selector
  const { data: teamsList } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      // Use the API to get teams
      const storedUser = localStorage.getItem('user')
      if (!storedUser) return []
      try {
        const user = JSON.parse(storedUser)
        const result = await listTeams(user.uid || user.id || '')
        return (result as any).teams || result || []
      } catch {
        return []
      }
    },
    staleTime: 60_000,
  })

  const teams = useMemo(() => {
    const raw = (teamsList as any)?.teams || teamsList || []
    return Array.isArray(raw)
      ? raw.map((t: any) => ({ ...t, id: t.team_id || t.id }))
      : []
  }, [teamsList])

  // Auto-select first team
  const teamId = selectedTeamId || (teams[0]?.team_id || teams[0]?.id || '')

  const { data: cohort, isLoading: cohortLoading, error: cohortError } = useQuery({
    queryKey: ['hrCohort', teamId],
    queryFn: () => fetchHrCohort(teamId),
    enabled: !!teamId,
    staleTime: 30_000,
  })

  const { data: cohortsData } = useQuery({
    queryKey: ['hrCohortComparison', teamId],
    queryFn: () => fetchCohortComparison(teamId),
    enabled: !!teamId,
    staleTime: 60_000,
  })

  const { data: reviewData } = useQuery({
    queryKey: ['hrReviewAnalytics', teamId],
    queryFn: () => fetchReviewAnalytics(teamId),
    enabled: !!teamId,
    staleTime: 60_000,
  })

  // Mentor match — the user picks which new dev to view matches for via the
  // dropdown on the card. Defaults to the first member in the cohort.
  const devMembers = useMemo(() => {
    const rows = cohort?.ramp_time?.members || []
    return rows.map((m) => ({ user_id: m.user_id, name: m.name }))
  }, [cohort])

  // Fall back to the first member when the team changes and the old selection
  // is no longer a member (avoids firing a stale dev id on the new team).
  const activeDevId =
    devMembers.some((m) => m.user_id === selectedDevId)
      ? selectedDevId
      : devMembers[0]?.user_id || ''

  const { data: mentorData } = useQuery({
    queryKey: ['hrMentorMatch', teamId, activeDevId],
    queryFn: () => fetchMentorMatch(teamId, activeDevId),
    enabled: !!teamId && !!activeDevId,
    staleTime: 120_000,
  })

  if (cohortLoading) {
    return (
      <div className="animate-in w-full min-h-[calc(100vh-4rem)] p-4 sm:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-40 bg-bg-secondary rounded-lg animate-pulse" />
            <div className="h-4 w-56 bg-bg-secondary rounded animate-pulse" />
          </div>
          <div className="h-9 w-40 bg-bg-secondary rounded-xl animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-bg-secondary border border-border animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="h-64 rounded-xl bg-bg-secondary border border-border animate-pulse" />
          <div className="h-64 rounded-xl bg-bg-secondary border border-border animate-pulse" />
          <div className="h-64 rounded-xl bg-bg-secondary border border-border animate-pulse" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="h-72 rounded-xl bg-bg-secondary border border-border animate-pulse" />
          <div className="h-72 rounded-xl bg-bg-secondary border border-border animate-pulse" />
        </div>
      </div>
    )
  }

  if (cohortError || !cohort) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <CardSpotlight className="max-w-md mx-auto p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-error-muted border border-error/20 flex items-center justify-center mx-auto mb-5">
            <WarningCircle size={28} className="text-error" />
          </div>
          <p className="text-error/80 text-body-sm font-code mb-1">Failed to load HR metrics.</p>
          <p className="text-text-disabled/60 text-caption font-code mb-5">Check that the backend is running and team has members.</p>
          <button onClick={() => window.location.reload()} className="bg-accent-from hover:brightness-110 text-[hsl(var(--accent-foreground))] px-5 py-2.5 rounded-btn text-body-sm font-semibold transition-all shadow-glow">
            Retry
          </button>
        </CardSpotlight>
      </div>
    )
  }

  const { ramp_time, onboarding_completion, engagement, attrition_risk, member_count } = cohort

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="min-h-[calc(100vh-4rem)] p-4 sm:p-6 max-w-full overflow-x-hidden relative">
      {/* Header */}
      <motion.div variants={item} className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-muted border border-accent/20 flex items-center justify-center">
              <Brain size={20} className="text-accent-from" weight="duotone" />
            </div>
            <div>
              <GradientHeading as="h1">HR Dashboard</GradientHeading>
              <p className="text-body-sm text-text-muted mt-0.5">
                {member_count} member{member_count !== 1 ? 's' : ''} in cohort
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <TeamSelector
            teams={teams}
            selected={teamId}
            onChange={setSelectedTeamId}
          />
        </div>
      </motion.div>

      {/* Metric Cards Row */}
      <motion.div variants={item} className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          {
            label: 'Cohort Size',
            value: member_count,
            icon: Users,
            color: 'text-accent-from',
            bg: 'bg-accent-muted border border-accent/20',
          },
          {
            label: 'Avg Ramp',
            value: ramp_time?.team_average_days != null ? `${ramp_time.team_average_days}d` : '—',
            icon: Clock,
            color: ramp_time?.team_average_days != null && ramp_time.team_average_days > 10 ? 'text-error' : 'text-accent-from',
            bg: 'bg-info-muted border border-info/20',
          },
          {
            label: 'Active Streaks',
            value: engagement?.active_streaks ?? 0,
            icon: Fire,
            color: 'text-warning',
            bg: 'bg-warning-muted border border-warning/20',
          },
          {
            label: 'At Risk',
            value: attrition_risk?.at_risk_count ?? 0,
            icon: WarningCircle,
            color: (attrition_risk?.at_risk_count ?? 0) > 0 ? 'text-error' : 'text-success',
            bg: (attrition_risk?.at_risk_count ?? 0) > 0 ? 'bg-error-muted border border-error/20' : 'bg-success-muted border border-success/20',
          },
        ].map((m) => (
          <CardSpotlight key={m.label} className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', m.bg)}>
                <m.icon size={16} className={m.color} weight="fill" />
              </div>
            </div>
            <div className={cn('font-display text-display-sm font-bold tracking-tight', m.color)}>{m.value}</div>
            <div className="text-overline text-text-muted/50 mt-1">{m.label}</div>
          </CardSpotlight>
        ))}
      </motion.div>

      {/* Charts Row 1 */}
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
        <RampTimeCard rampTime={ramp_time} />
        <CohortFunnelCard members={onboarding_completion?.members} />
        <EngagementCard engagement={engagement} />
      </motion.div>

      {/* Charts Row 2 */}
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-2 gap-5">            <CompletionRatesCard members={onboarding_completion?.members} />
            <AttritionRiskCard risk={attrition_risk} />
      </motion.div>

      {/* Wave-2 Panels: Review analytics, cohort comparison, mentor matches */}
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-8">
        <ReviewAnalyticsCard analytics={reviewData} />
        <CohortComparisonCard cohorts={cohortsData?.cohorts} />
        <MentorMatchCard
          match={mentorData}
          members={devMembers}
          selectedId={activeDevId}
          onSelect={setSelectedDevId}
        />
      </motion.div>
    </motion.div>
  )
}
