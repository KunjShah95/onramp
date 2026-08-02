import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { cn } from '../../lib/utils'
import { fetchDoraSummary, fetchVelocityTrends, fetchTeamThroughput, listTeams } from '../../lib/api'
import type { DoraSummary, VelocityTrend, MemberThroughput } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, AreaChart, Area,
} from 'recharts'

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } }
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 90, damping: 18 } } }

function Panel({ callsign, designator, className, children }: { callsign: string; designator?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('rounded-card border border-border bg-bg-secondary shadow-card overflow-hidden', className)}>
      <div className="console-rail"><span className="callsign">{callsign}</span>{designator && <span className="designator">{designator}</span>}<span className="led ml-auto" /></div>
      <div className="p-5">{children}</div>
    </div>
  )
}

const CLASS_BG: Record<string, string> = { elite: 'bg-success/10 border-success/20', high: 'bg-info/10 border-info/20', medium: 'bg-warning/10 border-warning/20', low: 'bg-error/10 border-error/20', none: 'bg-bg-tertiary/40 border-border' }
const CLASS_COLORS: Record<string, string> = { elite: 'text-success', high: 'text-info', medium: 'text-warning', low: 'text-error', none: 'text-text-muted' }
const TOOLTIP = { background: '#FFFFFF', border: '1px solid rgba(24,27,24,0.14)', borderRadius: '4px', fontSize: '12px', color: '#181B18', boxShadow: '0 4px 16px rgba(24,27,24,0.10)' }

function MetricBadge({ classification, value, label }: { classification: string; value: string; label: string }) {
  return (
    <div className={cn('rounded-xl border p-4', CLASS_BG[classification] || CLASS_BG.none)}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-caption text-text-muted font-code">{label}</span>
        <span className={cn('text-[10px] font-semibold uppercase tracking-wider', CLASS_COLORS[classification] || CLASS_COLORS.none)}>{classification}</span>
      </div>
      <div className={cn('text-lg font-semibold font-code', CLASS_COLORS[classification] || CLASS_COLORS.none)}>{value}</div>
    </div>
  )
}

export default function DoraMetricsPanel({ teamId }: { teamId?: string }) {
  const { activeTeamId } = useAuth()

  // Resolve a real team scope: explicit prop → active team from auth → first
  // team from the user's membership list. Without a team ID the backend DORA
  // endpoints would 403 on the team-access guard, so we never fire with empty.
  const { data: membership } = useQuery<Array<{ team_id?: string; id?: string }>>({
    queryKey: ['doraPanelTeams'],
    queryFn: async () => {
      const res = await listTeams('current-user')
      return (res as any)?.teams || (res as any) || []
    },
    staleTime: 120_000,
    enabled: !teamId && !activeTeamId,
  })

  const resolvedId =
    teamId ||
    activeTeamId ||
    (Array.isArray(membership) && (membership[0]?.team_id || membership[0]?.id)) ||
    ''

  const { data: dora, isLoading } = useQuery<DoraSummary>({
    queryKey: ['doraSummary', resolvedId],
    queryFn: () => fetchDoraSummary(resolvedId, 90),
    staleTime: 60_000,
    enabled: !!resolvedId,
  })

  const { data: velocity } = useQuery<{ trends: VelocityTrend[] }>({
    queryKey: ['velocityTrends', resolvedId],
    queryFn: () => fetchVelocityTrends(resolvedId, 12),
    staleTime: 60_000,
    enabled: !!resolvedId,
  })

  const { data: throughput } = useQuery<{ members: MemberThroughput[] }>({
    queryKey: ['teamThroughput', resolvedId],
    queryFn: () => fetchTeamThroughput(resolvedId, 30),
    staleTime: 60_000,
    enabled: !!resolvedId,
  })

  if (isLoading) {
    return <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[1,2,3,4].map(i => <div key={i} className="h-24 rounded-xl bg-bg-tertiary/40 animate-pulse" />)}</div>
  }

  const m = dora?.metrics
  const velocityData = velocity?.trends?.slice(-12) || []
  // Explicitly extract throughput members so TypeScript can narrow the type
  const throughputMembers: MemberThroughput[] | undefined = throughput?.members
  const hasThroughput = Array.isArray(throughputMembers) && throughputMembers.length > 0

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-5">
      <motion.div variants={item} className="flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-display-sm font-bold font-code" style={{ color: (dora?.overall_score || 0) >= 75 ? '#17A34A' : (dora?.overall_score || 0) >= 50 ? '#2472C4' : '#D6870F' }}>
            {dora?.overall_score ?? '—'}
          </span>
          <span className="text-body-sm text-text-muted font-code">DORA<br />Score</span>
        </div>
      </motion.div>

      <motion.div variants={item} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {m?.deployment_frequency && <MetricBadge classification={m.deployment_frequency.classification} value={m.deployment_frequency.value} label="Deploy Frequency" />}
        {m?.lead_time_for_changes && <MetricBadge classification={m.lead_time_for_changes.classification} value={m.lead_time_for_changes.value} label="Lead Time" />}
        {m?.change_failure_rate && <MetricBadge classification={m.change_failure_rate.classification} value={m.change_failure_rate.value} label="Change Failure Rate" />}
        {m?.mttr && <MetricBadge classification={m.mttr.classification} value={m.mttr.value} label="MTTR" />}
      </motion.div>

      {velocityData.length > 0 && (
        <motion.div variants={item}><Panel callsign="Velocity" designator="12 weeks">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={velocityData}>
                <defs><linearGradient id="completedGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#17A34A" stopOpacity={0.2} /><stop offset="100%" stopColor="#17A34A" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(24,27,24,0.06)" />
                <XAxis dataKey="week" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} stroke="rgba(24,27,24,0.3)" />
                <YAxis tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} stroke="rgba(24,27,24,0.3)" allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP} />
                <Area type="monotone" dataKey="completed" stroke="#17A34A" fill="url(#completedGrad)" strokeWidth={2} />
                <Line type="monotone" dataKey="completed_ma4" stroke="#2472C4" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel></motion.div>
      )}

      {hasThroughput && throughputMembers && (
        <motion.div variants={item}><Panel callsign="Throughput" designator="30 days">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={throughputMembers.map(member => ({ name: member.name.length > 10 ? member.name.slice(0, 10) + '…' : member.name, completed: member.completed, inProgress: member.in_progress })).reverse()}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(24,27,24,0.06)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} stroke="rgba(24,27,24,0.3)" />
                <YAxis tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} stroke="rgba(24,27,24,0.3)" allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP} />
                <Bar dataKey="completed" fill="#17A34A" radius={[2, 2, 0, 0]} />
                <Bar dataKey="inProgress" fill="#2472C4" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel></motion.div>
      )}

      {!dora && (
        <div className="text-center py-10 text-text-muted text-body-sm font-code">No DORA data yet. Complete tasks to generate metrics.</div>
      )}
    </motion.div>
  )
}
