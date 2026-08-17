import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import ConsolePanel from '../ui/console-panel'
import { fetchHeadcountFlow, type HeadcountFlowResponse } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { isLeaderRole } from './RampPanel'

/**
 * Headcount Flow (v1.6 wave 3 — P3: blind leaders) — hiring vs. attrition
 * at a glance. Joined and deactivated per calendar month as bars, with the
 * cumulative headcount as a line, so the C-suite sees whether the org is
 * growing or bleeding without leaving the console.
 *
 * Rides the new `GET /hr/headcount-flow` (team_members.joined_at vs
 * users.deactivated_at — the same leave signal as the retention curves).
 * Leader-gated like CohortTrendPanel / RetentionCurvesPanel.
 */
const SIG = {
  go: '#17A34A',
  abort: '#DC2F2F',
  line: '#2472C4',
  grid: 'rgb(var(--border-rgb) / 0.10)',
  axis: 'rgb(var(--text-tertiary) / 0.75)',
}
const TOOLTIP = {
  background: 'rgb(var(--bg-elevated))',
  border: '1px solid rgb(var(--border-rgb) / 0.18)',
  borderRadius: '4px',
  fontSize: '12px',
  color: 'rgb(var(--text-primary))',
  boxShadow: '0 4px 16px rgb(var(--border-rgb) / 0.12)',
}

export default function HeadcountFlowPanel({ teamId }: { teamId?: string }) {
  const { role, activeTeamId } = useAuth()
  const isLeader = isLeaderRole(role)
  const resolvedId = (teamId || activeTeamId || '').trim()

  const { data } = useQuery<HeadcountFlowResponse>({
    queryKey: ['headcountFlow', resolvedId],
    queryFn: () => fetchHeadcountFlow(resolvedId),
    enabled: isLeader && !!resolvedId,
    staleTime: 120_000,
  })

  if (!isLeader || !resolvedId) return null

  const months = (data?.months ?? []).slice(-12)
  const latestNet = months[months.length - 1]?.net ?? 0
  const totalDeactivated = (data?.total_joined ?? 0) - (data?.current_headcount ?? 0)
  const growth = (data?.current_headcount ?? 0) >= totalDeactivated
  const tone = months.length === 0 ? 'standby' : latestNet < 0 ? 'abort' : 'go'

  return (
    <ConsolePanel
      rail="Headcount Flow · Crew"
      designator={`${data?.current_headcount ?? 0} HEAD`}
      status={tone}
      live={tone === 'go'}
    >
      {months.length === 0 ? (
        <p className="text-caption text-ink-muted font-code py-2">
          No membership history yet — flows form as people join.
        </p>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-body-xs text-ink font-medium">
              {data?.current_headcount ?? 0} on team · {data?.total_joined ?? 0} onboarded
            </p>
            <p className="text-caption text-ink-muted">
              <span className="text-go font-medium">joined</span> / <span className="text-abort font-medium">left</span> · line = headcount
            </p>
          </div>
          <div className="h-40 bg-plot-grid rounded-tile">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={months} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke={SIG.grid} />
                <XAxis dataKey="label" tick={{ fill: SIG.axis, fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false}
                  interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fill: SIG.axis, fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} width={26} />
                <Tooltip
                  contentStyle={TOOLTIP}
                  formatter={(v, name) => [`${v}`, name === 'joined' ? 'joined' : name === 'deactivated' ? 'left' : 'headcount']}
                />
                <Bar dataKey="joined" fill={SIG.go} radius={[2, 2, 0, 0]} maxBarSize={18} />
                <Bar dataKey="deactivated" fill={SIG.abort} radius={[2, 2, 0, 0]} maxBarSize={18} />
                <Line type="monotone" dataKey="headcount" stroke={SIG.line} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 text-caption text-ink-muted font-code">
            <span className={growth ? 'text-go' : 'text-caution'}>
              {growth ? 'net growing' : 'net shrinking'} · {latestNet >= 0 ? `+${latestNet}` : latestNet} this month
            </span>
            <span>· {totalDeactivated} total left</span>
          </div>
        </motion.div>
      )}
    </ConsolePanel>
  )
}
