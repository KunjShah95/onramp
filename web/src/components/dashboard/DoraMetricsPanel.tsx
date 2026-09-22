import { useQuery } from '@tanstack/react-query'
import { cn } from '../../lib/utils'
import ConsolePanel from '../ui/console-panel'
import { EmptyRow } from '../ui/empty-state'
import { SkeletonBase } from '../ui/Skeleton'
import { fetchDoraSummary, fetchVelocityTrends, fetchTeamThroughput, listTeams } from '../../lib/api'
import type { DoraSummary, VelocityTrend, MemberThroughput } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, AreaChart, Area,
} from 'recharts'

function Panel({ callsign, designator, className, children }: { callsign: string; designator?: string; className?: string; children: React.ReactNode }) {
  return (
    <ConsolePanel rail={callsign} designator={designator} status="standby" className={className}>
      {children}
    </ConsolePanel>
  )
}

const CLASS_BG: Record<string, string> = { elite: 'bg-go/10 border-go/20', high: 'bg-mission/10 border-mission/20', medium: 'bg-caution/10 border-caution/20', low: 'bg-abort/10 border-abort/20', none: 'bg-well/40 border-seam' }
const CLASS_COLORS: Record<string, string> = { elite: 'text-go', high: 'text-mission', medium: 'text-caution', low: 'text-abort', none: 'text-ink-muted' }
const TOOLTIP = { background: 'rgb(var(--bg-elevated))', border: '1px solid rgb(var(--border-rgb) / 0.18)', borderRadius: '4px', fontSize: '12px', color: 'rgb(var(--text-primary))', boxShadow: '0 4px 16px rgb(var(--border-rgb) / 0.12)' }

function MetricBadge({ classification, value, label }: { classification: string; value: string; label: string }) {
  return (
    <div className={cn('rounded-tile border p-4', CLASS_BG[classification] || CLASS_BG.none)}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-caption text-ink-muted font-code">{label}</span>
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

  const { data: dora, isLoading, isError, refetch } = useQuery<DoraSummary>({
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
    return <div aria-busy="true" aria-label="Loading DORA metrics" role="status" className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[1,2,3,4].map(i => <SkeletonBase key={i} className="h-24 rounded-tile border border-seam" />)}</div>
  }

  if (isError) {
    return (
      <Panel callsign="DORA" designator="Unavailable">
        <p className="text-sm text-abort font-medium" role="alert">DORA telemetry unavailable.</p>
        <p className="text-caption text-ink-muted mt-1">Check your connection and retry.</p>
        <button onClick={() => refetch()} className="mt-3 btn-secondary !px-3 !py-1.5 text-caption focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-go/50">Retry</button>
      </Panel>
    )
  }

  const m = dora?.metrics
  const velocityData = velocity?.trends?.slice(-12) || []
  // Explicitly extract throughput members so TypeScript can narrow the type
  const throughputMembers: MemberThroughput[] | undefined = throughput?.members
  const hasThroughput = Array.isArray(throughputMembers) && throughputMembers.length > 0

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-3">
          <span className={
            (dora?.overall_score || 0) >= 75 ? 'text-display-sm font-bold font-code text-go'
            : (dora?.overall_score || 0) >= 50 ? 'text-display-sm font-bold font-code text-mission'
            : 'text-display-sm font-bold font-code text-caution'
          }>
            {dora?.overall_score ?? '—'}
          </span>
          <span className="text-body-sm text-ink-muted font-code">DORA<br />Score</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {m?.deployment_frequency && <MetricBadge classification={m.deployment_frequency.classification} value={m.deployment_frequency.value} label="Deploy Frequency" />}
        {m?.lead_time_for_changes && <MetricBadge classification={m.lead_time_for_changes.classification} value={m.lead_time_for_changes.value} label="Lead Time" />}
        {m?.change_failure_rate && <MetricBadge classification={m.change_failure_rate.classification} value={m.change_failure_rate.value} label="Change Failure Rate" />}
        {m?.mttr && <MetricBadge classification={m.mttr.classification} value={m.mttr.value} label="MTTR" />}
      </div>

      {velocityData.length > 0 && (
        <Panel callsign="Velocity" designator="12 weeks">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={velocityData}>
                <defs><linearGradient id="completedGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--go)" stopOpacity={0.2} /><stop offset="100%" stopColor="var(--go)" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border-rgb) / 0.10)" />
                <XAxis dataKey="week" tick={{ fontSize: 10, fontFamily: 'IBM Plex Mono' }} stroke="rgb(var(--text-tertiary) / 0.75)" />
                <YAxis tick={{ fontSize: 10, fontFamily: 'IBM Plex Mono' }} stroke="rgb(var(--text-tertiary) / 0.75)" allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP} />
                <Area type="monotone" dataKey="completed" stroke="var(--go)" fill="url(#completedGrad)" strokeWidth={2} />
                <Line type="monotone" dataKey="completed_ma4" stroke="var(--mission)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}

      {hasThroughput && throughputMembers && (
        <Panel callsign="Throughput" designator="30 days">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={throughputMembers.map(member => ({ name: member.name.length > 10 ? member.name.slice(0, 10) + '…' : member.name, completed: member.completed, inProgress: member.in_progress })).reverse()}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border-rgb) / 0.10)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fontFamily: 'IBM Plex Mono' }} stroke="rgb(var(--text-tertiary) / 0.75)" />
                <YAxis tick={{ fontSize: 10, fontFamily: 'IBM Plex Mono' }} stroke="rgb(var(--text-tertiary) / 0.75)" allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP} />
                <Bar dataKey="completed" fill="var(--go)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="inProgress" fill="var(--mission)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}

      {!dora && (
        <EmptyRow label="No DORA data yet — complete tasks to generate metrics." />
      )}
    </div>
  )
}
