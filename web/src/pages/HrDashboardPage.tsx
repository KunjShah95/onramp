/*
 * ─── DIRECTION CONTRACT · ONRAMP MISSION CONTROL ────────────────────────────
 * THESIS: The HR seat works the personnel console — cohort readiness, ramp,
 *   engagement, attrition risk — the same mission read from the people position.
 * OWN-WORLD: Daylit ops room, seated panels, signal-only colour, mono telemetry.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { cn } from '../lib/utils'
import { useAuth } from '../context/AuthContext'
import {
  fetchHrCohort, listTeams,
  fetchCohortComparison, fetchMentorMatch, fetchReviewAnalytics,
} from '../lib/api'
import type {
  HrAttritionRisk, HrCompletionMember, HrRampTime, HrEngagement,
  CohortComparisonEntry, MentorMatchResponse, ReviewAnalytics,
} from '../lib/api'
import ConsolePanel from '../components/ui/console-panel'
import ReadoutBank, { type Readout } from '../components/ui/readout-bank'
import { PageHeader } from '../components/ui/page-header'
import { Hash, CaretDown } from '@phosphor-icons/react'
import { ResponsiveContainer, Tooltip, Cell, PieChart, Pie } from 'recharts'
import RampPanel from '../components/dashboard/RampPanel'
import RetentionCurvesPanel from '../components/dashboard/RetentionCurvesPanel'

const SIG = { go: '#17A34A', blue: '#2472C4', amber: '#D6870F' }
const TOOLTIP = {
  background: 'rgb(var(--bg-elevated))',
  border: '1px solid rgb(var(--border-rgb) / 0.18)',
  borderRadius: '4px',
  fontSize: '12px',
  color: 'rgb(var(--text-primary))',
  boxShadow: '0 4px 16px rgb(var(--border-rgb) / 0.12)',
}

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } }
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 90, damping: 18 } } }

/** Big mono readout used inside cards for a headline measured value. */
function CardReadout({ value, unit, color }: { value: string | number; unit: string; color?: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-4">
      <span className={cn('font-code tabular-nums text-3xl font-semibold leading-none', color ?? 'text-ink')}>{value}</span>
      <span className="text-caption text-ink-muted">{unit}</span>
    </div>
  )
}

function TeamSelector({ teams, selected, onChange }: {
  teams: { id: string; name: string; team_id?: string }[]; selected: string; onChange: (id: string) => void
}) {
  if (teams.length <= 1) return null
  return (
    <div className="flex items-center gap-1.5 bg-panel rounded-btn border border-seam px-2">
      <Hash size={13} className="text-ink-muted" weight="bold" />
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Select team"
        className="bg-transparent text-body-sm text-ink font-medium py-1.5 pr-6 rounded focus:outline-none cursor-pointer appearance-none"
      >
        {teams.map((t) => (
          <option key={t.team_id || t.id} value={t.team_id || t.id} className="bg-panel-raised">{t.name}</option>
        ))}
      </select>
      <CaretDown size={11} weight="bold" className="text-ink-muted -ml-5 pointer-events-none" />
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
    <ConsolePanel rail="Ramp Time" designator="DAYS TO 1ST PR" status="standby">
      <CardReadout value={rampTime.team_average_days ?? 'N/A'} unit="days avg" color="text-mission" />
      <p className="text-caption text-ink-muted mb-3">Slowest members</p>
      <div className="space-y-2">
        {topSlowest.length === 0 && <p className="text-caption text-ink-disabled italic">No completions yet.</p>}
        {topSlowest.map((m, i) => (
          <div key={m.user_id} className="flex items-center gap-2">
            <span className="w-4 text-caption text-ink-muted tabular-nums">{i + 1}.</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-body-xs text-ink truncate">{m.name}</span>
                <span className={cn('readout text-caption tabular-nums', (m.ramp_days || 0) > 10 ? 'text-abort' : 'text-ink-muted')}>{m.ramp_days}d</span>
              </div>
              <div className="h-1 rounded-tile bg-well overflow-hidden mt-1 border border-seam">
                <div className={cn('h-full', (m.ramp_days || 0) > 10 ? 'bg-error' : 'bg-info')} style={{ width: `${Math.min(((m.ramp_days || 0) / 20) * 100, 100)}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </ConsolePanel>
  )
}

function CompletionRatesCard({ members }: { members: HrCompletionMember[] | undefined }) {
  if (!members) return null
  const avgPct = members.length > 0 ? Math.round(members.reduce((s, m) => s + m.completion_pct, 0) / members.length) : 0
  return (
    <ConsolePanel rail="Onboarding Completion" designator="TEAM AVG" status="go">
      <CardReadout value={`${avgPct}%`} unit="team avg" color="text-go" />
      <div className="space-y-2.5">
        {members.length === 0 && <p className="text-caption text-ink-disabled italic">No team members yet.</p>}
        {members.map((m) => (
          <div key={m.user_id}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-body-xs text-ink truncate">{m.name}</span>
              <span className="readout text-caption tabular-nums text-ink-muted">{m.completed}/{m.assigned}</span>
            </div>
            <div className="h-2 rounded-tile bg-well overflow-hidden border border-seam">
              <motion.div initial={{ width: 0 }} animate={{ width: `${m.completion_pct}%` }} transition={{ duration: 0.6, ease: 'easeOut' }}
                className={cn('h-full', m.completion_pct >= 80 ? 'bg-success' : m.completion_pct >= 50 ? 'bg-info' : m.completion_pct >= 25 ? 'bg-warning' : 'bg-error')} />
            </div>
          </div>
        ))}
      </div>
    </ConsolePanel>
  )
}

function CohortFunnelCard({ members }: { members: HrCompletionMember[] | undefined }) {
  if (!members || members.length === 0) return null
  const totalAssigned = members.reduce((s, m) => s + m.assigned, 0)
  const totalCompleted = members.reduce((s, m) => s + m.completed, 0)
  const inProgress = totalAssigned - totalCompleted
  const funnelData = [
    { name: 'Joined', value: members.length, color: SIG.blue },
    { name: 'Assigned', value: totalAssigned, color: SIG.blue },
    { name: 'In Progress', value: inProgress, color: SIG.amber },
    { name: 'Completed', value: totalCompleted, color: SIG.go },
  ]
  return (
    <ConsolePanel rail="Cohort Funnel" designator="FIDO" status="standby">
      <div className="flex items-center gap-4">
        <div className="w-36 h-36 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={funnelData} cx="50%" cy="50%" innerRadius={38} outerRadius={62} paddingAngle={3} dataKey="value" stroke="none">
                {funnelData.map((d) => <Cell key={d.name} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={TOOLTIP} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-2">
          {funnelData.map((d) => {
            const pct = totalAssigned > 0 ? Math.round((d.value / funnelData[1].value) * 100) : 0
            return d.value === 0 ? null : (
              <div key={d.name} className="flex items-center justify-between text-caption">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-tile" style={{ backgroundColor: d.color }} />
                  <span className="text-ink-secondary">{d.name}</span>
                </div>
                <span className="readout tabular-nums text-ink">{d.value}<span className="text-ink-muted ml-1">({pct}%)</span></span>
              </div>
            )
          })}
        </div>
      </div>
    </ConsolePanel>
  )
}

function EngagementCard({ engagement }: { engagement: HrEngagement | undefined }) {
  if (!engagement) return null
  const memberCount = engagement.members.length
  return (
    <ConsolePanel rail="Engagement" designator="ACTIVE STREAKS" status="caution">
      <CardReadout value={engagement.active_streaks} unit={`/ ${memberCount} active streaks`} color="text-caution" />
      <div className="space-y-1.5">
        {engagement.members.length === 0 && <p className="text-caption text-ink-disabled italic">No streak data.</p>}
        {engagement.members.slice(0, 6).map((m) => (
          <div key={m.user_id} className="flex items-center gap-3 p-2 rounded-tile hover:bg-well/60 transition-colors">
            <span className="flex-1 text-body-xs text-ink truncate">{m.name}</span>
            <span className={cn('readout text-caption tabular-nums', m.current_streak > 0 ? 'text-caution' : 'text-ink-disabled')}>{m.current_streak}d</span>
            {m.longest_streak > m.current_streak && <span className="text-caption text-ink-muted">best {m.longest_streak}d</span>}
          </div>
        ))}
      </div>
    </ConsolePanel>
  )
}

function ReviewAnalyticsCard({ analytics }: { analytics: ReviewAnalytics | undefined }) {
  if (!analytics) return null
  return (
    <ConsolePanel rail="Review Analytics" designator="EECOM" status="standby">
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        {[
          { label: 'Rework rate', value: `${analytics.rework_rate_pct}%`, color: analytics.rework_rate_pct > 30 ? 'text-abort' : analytics.rework_rate_pct > 15 ? 'text-caution' : 'text-go' },
          { label: 'Tasks reworked', value: String(analytics.reworked_task_count), color: 'text-ink' },
          { label: 'Avg turnaround', value: analytics.avg_review_turnaround_hours != null ? `${analytics.avg_review_turnaround_hours}h` : 'N/A', color: 'text-ink' },
          { label: 'Pending review', value: String(analytics.pending_review_count), color: analytics.pending_review_count > 0 ? 'text-caution' : 'text-go' },
        ].map((s) => (
          <div key={s.label} className="bg-well rounded-tile p-2.5 border border-seam">
            <div className="text-caption text-ink-muted mb-0.5">{s.label}</div>
            <div className={cn('readout text-body font-semibold tabular-nums', s.color)}>{s.value}</div>
          </div>
        ))}
      </div>
      {analytics.top_reviewers.length > 0 && (
        <div>
          <div className="overline text-ink-muted/70 mb-2">Top reviewers</div>
          <div className="space-y-1.5">
            {analytics.top_reviewers.slice(0, 5).map((r, i) => (
              <div key={r.user_id} className="flex items-center gap-2">
                <span className="w-4 text-caption text-ink-muted tabular-nums">{i + 1}.</span>
                <span className="flex-1 text-body-xs text-ink truncate">{r.name || 'N/A'}</span>
                <span className="readout text-caption tabular-nums text-mission">{r.reviews}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </ConsolePanel>
  )
}

function CohortComparisonCard({ cohorts }: { cohorts: CohortComparisonEntry[] | undefined }) {
  if (!cohorts || cohorts.length === 0) return null
  const sorted = [...cohorts].sort((a, b) => (a.avg_ramp_days ?? 999) - (b.avg_ramp_days ?? 999))
  const best = sorted[0]
  return (
    <ConsolePanel rail="Cohort Comparison" designator="TRAJ" status="standby">
      <p className="text-caption text-ink-muted mb-4">
        Fastest: <span className="text-go font-medium">{best.label}</span> at {best.avg_ramp_days ?? 'N/A'}d avg ramp
      </p>
      <div className="space-y-3">
        {cohorts.slice(0, 6).map((c) => (
          <div key={c.cohort}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-body-xs text-ink font-medium truncate">{c.label} <span className="text-ink-muted">({c.member_count})</span></span>
              <span className="readout text-caption tabular-nums text-ink-muted">{c.avg_ramp_days != null ? `${c.avg_ramp_days}d` : 'N/A'}</span>
            </div>
            <div className="h-1.5 rounded-tile bg-well overflow-hidden border border-seam">
              <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(((c.avg_ramp_days ?? 999) / 30) * 100, 100)}%` }} transition={{ duration: 0.5, ease: 'easeOut' }}
                className={cn('h-full', c.avg_ramp_days != null && c.avg_ramp_days <= 7 ? 'bg-success' : c.avg_ramp_days != null && c.avg_ramp_days <= 14 ? 'bg-info' : 'bg-warning')} />
            </div>
            <div className="flex gap-3 mt-1 text-caption text-ink-muted">
              <span>{c.avg_days_to_first_pr != null ? `1st PR ${c.avg_days_to_first_pr}d` : 'no 1st PR'}</span>
              <span>completion {c.avg_completion_pct ?? 0}%</span>
              <span className={c.blocker_count > 0 ? 'text-caution' : ''}>blockers {c.blocker_count}</span>
            </div>
          </div>
        ))}
      </div>
    </ConsolePanel>
  )
}

function MentorMatchCard({ match, members, selectedId, onSelect }: {
  match: MentorMatchResponse | undefined
  members: Array<{ user_id: string; name: string }>
  selectedId: string
  onSelect: (id: string) => void
}) {
  if (members.length === 0) return null
  return (
    <ConsolePanel rail="Mentor Matches" designator="CAPCOM" status="caution">
      <label htmlFor="mentor-dev-select" className="block text-caption text-ink-muted mb-1.5">New dev</label>
      <div className="relative mb-3">
        <select id="mentor-dev-select" aria-label="Select new dev" value={selectedId} onChange={(e) => onSelect(e.target.value)}
          className="w-full appearance-none input pr-8">
          {members.map((member) => <option key={member.user_id} value={member.user_id} className="bg-panel-raised">{member.name}</option>)}
        </select>
        <CaretDown size={12} weight="bold" className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
      </div>
      {!match || match.matches.length === 0 ? (
        <p className="text-caption text-ink-disabled italic py-4 text-center">No mentor matches yet. Assign tasks to build their language profile.</p>
      ) : (
        <>
          <p className="text-caption text-ink-muted mb-3 truncate">
            Languages: <span className="text-mission readout">{match.new_dev_languages.join(', ') || 'N/A'}</span>
          </p>
          <div className="space-y-2">
            {match.matches.slice(0, 4).map((m) => (
              <div key={m.user_id} className="flex items-center gap-3 p-2.5 rounded-tile bg-well border border-seam">
                <div className="w-8 h-8 rounded-tile bg-mission/10 border border-mission/25 flex items-center justify-center text-caption font-bold text-mission font-display shrink-0">
                  {m.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-body-xs font-medium text-ink truncate">{m.name}</span>
                    <span className="readout text-caption tabular-nums text-mission">{m.score}</span>
                  </div>
                  <div className="text-caption text-ink-muted truncate">
                    {m.shared_languages.length > 0 ? `Shared: ${m.shared_languages.join(', ')}` : 'No shared languages'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </ConsolePanel>
  )
}

function AttritionRiskCard({ risk }: { risk: HrAttritionRisk | undefined }) {
  if (!risk) return null
  if (risk.at_risk_count === 0) {
    return (
      <ConsolePanel rail="Attrition Risk" designator="ALL NOMINAL" status="go">
        <div className="text-center py-6">
          <p className="text-ink-secondary text-body-sm">No members at risk. Team is healthy.</p>
        </div>
      </ConsolePanel>
    )
  }
  return (
    <ConsolePanel rail="Attrition Risk" designator={`${risk.at_risk_count} FLAGGED`} status="abort">
      <CardReadout value={risk.at_risk_count} unit="member(s) flagged" color="text-abort" />
      <div className="space-y-2">
        {risk.at_risk.map((m, i) => (
          <motion.div key={m.user_id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
            className="p-3 rounded-tile bg-abort/10/40 border border-abort/20">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-5 h-5 rounded-tile bg-abort/10 border border-abort/25 flex items-center justify-center text-caption font-bold text-abort">{m.name.charAt(0).toUpperCase()}</div>
              <span className="text-body-xs font-medium text-ink">{m.name}</span>
            </div>
            <ul className="space-y-0.5">
              {m.reasons.map((reason, ri) => (
                <li key={ri} className="flex items-start gap-1.5 text-caption text-ink-secondary">
                  <span className="text-abort mt-0.5">•</span><span>{reason}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>
    </ConsolePanel>
  )
}

export default function HrDashboardPage() {
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [selectedDevId, setSelectedDevId] = useState<string>('')
  const { user } = useAuth()

  const { data: teamsList } = useQuery({
    queryKey: ['teams', user?.id],
    queryFn: async () => {
      // Use the uid from AuthContext — falls back to 'current-user' so the
      // backend resolves the caller from the Bearer token automatically.
      const uid = user?.id || 'current-user'
      try {
        const result = await listTeams(uid)
        return (result as any).teams || result || []
      } catch {
        return []
      }
    },
    enabled: !!user,
    staleTime: 60_000,
  })

  const teams = useMemo(() => {
    const raw = (teamsList as any)?.teams || teamsList || []
    return Array.isArray(raw) ? raw.map((t: any) => ({ ...t, id: t.team_id || t.id })) : []
  }, [teamsList])

  const teamId = selectedTeamId || (teams[0]?.team_id || teams[0]?.id || '')

  const { data: cohort, isLoading: cohortLoading, error: cohortError } = useQuery({
    queryKey: ['hrCohort', teamId], queryFn: () => fetchHrCohort(teamId), enabled: !!teamId, staleTime: 30_000,
  })
  const { data: cohortsData } = useQuery({
    queryKey: ['hrCohortComparison', teamId], queryFn: () => fetchCohortComparison(teamId), enabled: !!teamId, staleTime: 60_000,
  })
  const { data: reviewData } = useQuery({
    queryKey: ['hrReviewAnalytics', teamId], queryFn: () => fetchReviewAnalytics(teamId), enabled: !!teamId, staleTime: 60_000,
  })

  const devMembers = useMemo(() => {
    const rows = cohort?.ramp_time?.members || []
    return rows.map((m) => ({ user_id: m.user_id, name: m.name }))
  }, [cohort])

  const activeDevId = devMembers.some((m) => m.user_id === selectedDevId) ? selectedDevId : devMembers[0]?.user_id || ''

  const { data: mentorData } = useQuery({
    queryKey: ['hrMentorMatch', teamId, activeDevId], queryFn: () => fetchMentorMatch(teamId, activeDevId), enabled: !!teamId && !!activeDevId, staleTime: 120_000,
  })

  if (cohortLoading) {
    return (
      <div className="animate-in w-full min-h-[calc(100vh-4rem)] p-4 sm:p-6 space-y-6">
        <div className="h-24 rounded-card bg-panel border border-seam animate-skeleton" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {[...Array(3)].map((_, i) => <div key={i} className="h-64 rounded-card bg-panel border border-seam animate-skeleton" />)}
        </div>
      </div>
    )
  }

  if (cohortError || !cohort) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-6">
        <ConsolePanel rail="Signal lost" designator="Personnel" status="abort" className="max-w-md w-full">
          <p className="text-abort text-body-sm font-code mb-1">Failed to load HR metrics.</p>
          <p className="text-ink-muted text-caption font-code mb-5">Check that the backend is running and the team has members.</p>
          <button onClick={() => window.location.reload()} className="btn">Reacquire</button>
        </ConsolePanel>
      </div>
    )
  }

  const { ramp_time, onboarding_completion, engagement, attrition_risk, member_count } = cohort

  const readouts: Readout[] = [
    { label: 'Cohort Size', value: member_count, color: 'text-ink' },
    { label: 'Avg Ramp', value: ramp_time?.team_average_days ?? 'N/A', suffix: ramp_time?.team_average_days != null ? 'd' : '', color: ramp_time?.team_average_days != null && ramp_time.team_average_days > 10 ? 'text-abort' : 'text-mission' },
    { label: 'Active Streaks', value: engagement?.active_streaks ?? 0, color: 'text-caution' },
    { label: 'At Risk', value: attrition_risk?.at_risk_count ?? 0, color: (attrition_risk?.at_risk_count ?? 0) > 0 ? 'text-abort' : 'text-go' },
  ]

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="min-h-[calc(100vh-4rem)] p-4 sm:p-6 max-w-full overflow-x-hidden space-y-6">
      {/* Header */}
      <motion.div variants={item}>
        <PageHeader
          eyebrow="Folio 07 · People"
          title="HR Console"
          subtitle={`${member_count} member${member_count !== 1 ? 's' : ''} in cohort`}
          actions={<TeamSelector teams={teams} selected={teamId} onChange={setSelectedTeamId} />}
        />
      </motion.div>

      {/* Cohort telemetry */}
      <motion.div variants={item}>
        <ReadoutBank callsign="Cohort" items={readouts} columns={4} />
      </motion.div>

      {/* Row 1 */}
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <RampTimeCard rampTime={ramp_time} />
        <CohortFunnelCard members={onboarding_completion?.members} />
        <EngagementCard engagement={engagement} />
      </motion.div>

      {/* Row 2 */}
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <CompletionRatesCard members={onboarding_completion?.members} />
        <AttritionRiskCard risk={attrition_risk} />
      </motion.div>

      {/* Row 3 */}
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <ReviewAnalyticsCard analytics={reviewData} />
        <CohortComparisonCard cohorts={cohortsData?.cohorts} />
        <MentorMatchCard match={mentorData} members={devMembers} selectedId={activeDevId} onSelect={setSelectedDevId} />
      </motion.div>

      {/* Row 4 — org ramp health + retention curves (shared leadership telemetry) */}
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <RampPanel teamId={teamId} />
        <RetentionCurvesPanel teamId={teamId} />
      </motion.div>
    </motion.div>
  )
}
