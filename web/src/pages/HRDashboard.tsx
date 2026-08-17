import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChartLineUp } from '@phosphor-icons/react'
import PageTransition from '../components/ui/page-transition'
import ConsolePanel from '../components/ui/console-panel'
import { EmptyState } from '../components/ui/empty-state'
import { PageHeader } from '../components/ui/page-header'
import { MetricStrip, MetricCell } from '../components/ui/metric-strip'
import { API_BASE, authHeaders } from '../lib/api'

// ── Types mirroring hr_metrics_service.cohort_summary ──────────────────────
interface RampMember { user_id: string; name: string; ramp_days: number | null }
interface CompletionMember { user_id: string; name: string; assigned: number; completed: number; completion_pct: number }
interface EngagementMember { user_id: string; name: string; current_streak: number; longest_streak: number }
interface RiskMember { user_id: string; name: string; reasons: string[] }

interface CohortSummary {
  team_id: string
  member_count: number
  ramp_time: { members: RampMember[]; team_average_days: number | null }
  onboarding_completion: { members: CompletionMember[] }
  engagement: { members: EngagementMember[]; active_streaks: number }
  attrition_risk: { at_risk: RiskMember[]; at_risk_count: number }
  generated_at: string
}

/** Unwrap the backend `{success, data}` envelope if present. */
function unwrap<T>(json: any): T {
  if (json && typeof json === 'object' && 'success' in json && 'data' in json) {
    return json.data as T
  }
  return json as T
}

export default function HRDashboard() {
  const { teamId } = useParams<{ teamId: string }>()
  const [data, setData] = useState<CohortSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!teamId) return
    let cancelled = false
    async function load() {
      setLoading(true); setError('')
      try {
        const res = await fetch(`${API_BASE}/hr/cohort/${teamId}`, { headers: authHeaders() })
        if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
        const json = unwrap<CohortSummary>(await res.json())
        if (!cancelled) setData(json)
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load cohort metrics.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [teamId])

  return (
    <PageTransition>
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <PageHeader
          eyebrow="Folio 07 · People"
          title="HR Onboarding Analytics"
          subtitle="Cohort ramp time, completion, engagement, and attrition risk."
        />

        {error && (
          <div className="px-4 py-3 rounded-lg bg-abort/10 border border-abort/20 text-abort text-body-sm">
            {error}
          </div>
        )}

        {loading && (
          <ConsolePanel rail="Loading" designator="Cohort">
            <p className="text-body-sm text-ink-tertiary">Loading cohort metrics…</p>
          </ConsolePanel>
        )}

        {!loading && !error && data && (
          <div className="space-y-4">
            {/* Summary metrics */}
            <MetricStrip className="grid-cols-1 sm:grid-cols-3">
              <MetricCell
                label="Avg ramp time"
                value={data.ramp_time.team_average_days ?? '—'}
                sub={data.ramp_time.team_average_days != null ? 'days to first PR' : undefined}
              />
              <MetricCell label="Active streaks" value={data.engagement.active_streaks} sub={`/ ${data.member_count} members`} />
              <MetricCell
                label="At risk"
                value={data.attrition_risk.at_risk_count}
                accent={(data.attrition_risk.at_risk_count ?? 0) > 0 ? 'text-abort' : undefined}
                sub="stalled or disengaged"
              />
            </MetricStrip>

            {/* Completion % per member */}
            <ConsolePanel rail="Onboarding completion">
              <div className="space-y-3">
                {data.onboarding_completion.members.map((m) => {
                  const ramp = data.ramp_time.members.find((r) => r.user_id === m.user_id)
                  return (
                    <div key={m.user_id} className="space-y-1">
                      <div className="flex items-center justify-between text-body-sm">
                        <span className="text-ink-secondary">{m.name}</span>
                        <span className="text-ink-tertiary">
                          {m.completed}/{m.assigned} · {m.completion_pct}%
                          {ramp?.ramp_days != null && ` · ramp ${ramp.ramp_days}d`}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-well/40 overflow-hidden">
                        <motion.div
                          className="h-full bg-go rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${m.completion_pct}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                    </div>
                  )
                })}
                {data.onboarding_completion.members.length === 0 && (
                  <p className="text-body-sm text-ink-tertiary">No members in this team.</p>
                )}
              </div>
            </ConsolePanel>

            {/* Engagement */}
            <ConsolePanel rail="Engagement">
              <div className="space-y-2">
                {data.engagement.members.map((m) => (
                  <div key={m.user_id} className="flex items-center justify-between text-body-sm">
                    <span className="text-ink-secondary">{m.name}</span>
                    <span className="text-ink-tertiary">
                      {m.current_streak} (best {m.longest_streak})
                    </span>
                  </div>
                ))}
              </div>
            </ConsolePanel>

            {/* Attrition risk */}
            <ConsolePanel rail="Attrition risk" status="abort">
              {data.attrition_risk.at_risk.length === 0 ? (
                <EmptyState
                  icon={<ChartLineUp className="w-10 h-10 text-ink-tertiary/30" weight="duotone" />}
                  title="No members flagged"
                  description="No stalled tasks or lost streaks detected in this cohort."
                />
              ) : (
                <div className="space-y-3">
                  {data.attrition_risk.at_risk.map((m) => (
                    <div key={m.user_id} className="px-4 py-3 rounded-lg bg-abort/10/40 border border-abort/20">
                      <p className="text-body-sm font-medium text-ink">{m.name}</p>
                      <ul className="mt-1 space-y-0.5 list-disc list-inside text-caption text-abort/80">
                        {m.reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </ConsolePanel>
          </div>
        )}
      </div>
    </PageTransition>
  )
}
