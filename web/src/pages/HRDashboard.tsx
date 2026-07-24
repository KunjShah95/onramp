import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Users, Clock, ChartLineUp, Warning } from '@phosphor-icons/react'
import PageTransition from '../components/ui/page-transition'
import CardSpotlight from '../components/ui/card-spotlight'
import { EmptyState } from '../components/ui/empty-state'
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
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-accent-primary" weight="duotone" />
          </div>
          <div>
            <h1 className="text-display-sm font-display font-medium text-text-primary">
              HR Onboarding Analytics
            </h1>
            <p className="text-body-sm text-text-tertiary">
              Cohort ramp time, completion, engagement, and attrition risk.
            </p>
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-lg bg-error-muted border border-error/20 text-error text-body-sm">
            {error}
          </div>
        )}

        {loading && (
          <CardSpotlight className="p-6">
            <p className="text-body-sm text-text-tertiary">Loading cohort metrics…</p>
          </CardSpotlight>
        )}

        {!loading && !error && data && (
          <div className="space-y-4">
            {/* Summary tiles */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <CardSpotlight className="p-5">
                <div className="flex items-center gap-2 text-text-tertiary mb-1">
                  <Clock className="w-4 h-4" weight="duotone" />
                  <span className="text-caption">Avg. ramp time</span>
                </div>
                <p className="text-display-sm font-display text-text-primary">
                  {data.ramp_time.team_average_days ?? '—'}
                  {data.ramp_time.team_average_days != null && (
                    <span className="text-body-sm text-text-tertiary ml-1">days</span>
                  )}
                </p>
              </CardSpotlight>
              <CardSpotlight className="p-5">
                <div className="flex items-center gap-2 text-text-tertiary mb-1">
                  <ChartLineUp className="w-4 h-4" weight="duotone" />
                  <span className="text-caption">Active streaks</span>
                </div>
                <p className="text-display-sm font-display text-text-primary">
                  {data.engagement.active_streaks}
                  <span className="text-body-sm text-text-tertiary ml-1">/ {data.member_count}</span>
                </p>
              </CardSpotlight>
              <CardSpotlight className="p-5">
                <div className="flex items-center gap-2 text-text-tertiary mb-1">
                  <Warning className="w-4 h-4" weight="duotone" />
                  <span className="text-caption">At risk</span>
                </div>
                <p className="text-display-sm font-display text-text-primary">
                  {data.attrition_risk.at_risk_count}
                </p>
              </CardSpotlight>
            </div>

            {/* Completion % per member */}
            <CardSpotlight className="p-6">
              <h3 className="text-body font-medium text-text-primary mb-4">Onboarding completion</h3>
              <div className="space-y-3">
                {data.onboarding_completion.members.map((m) => {
                  const ramp = data.ramp_time.members.find((r) => r.user_id === m.user_id)
                  return (
                    <div key={m.user_id} className="space-y-1">
                      <div className="flex items-center justify-between text-body-sm">
                        <span className="text-text-secondary">{m.name}</span>
                        <span className="text-text-tertiary">
                          {m.completed}/{m.assigned} · {m.completion_pct}%
                          {ramp?.ramp_days != null && ` · ramp ${ramp.ramp_days}d`}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-bg-tertiary/40 overflow-hidden">
                        <motion.div
                          className="h-full bg-accent-primary rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${m.completion_pct}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                    </div>
                  )
                })}
                {data.onboarding_completion.members.length === 0 && (
                  <p className="text-body-sm text-text-tertiary">No members in this team.</p>
                )}
              </div>
            </CardSpotlight>

            {/* Engagement */}
            <CardSpotlight className="p-6">
              <h3 className="text-body font-medium text-text-primary mb-4">Engagement</h3>
              <div className="space-y-2">
                {data.engagement.members.map((m) => (
                  <div key={m.user_id} className="flex items-center justify-between text-body-sm">
                    <span className="text-text-secondary">{m.name}</span>
                    <span className="text-text-tertiary">
                      🔥 {m.current_streak} (best {m.longest_streak})
                    </span>
                  </div>
                ))}
              </div>
            </CardSpotlight>

            {/* Attrition risk */}
            <CardSpotlight className="p-6 border border-error/10">
              <h3 className="text-body font-medium text-text-primary mb-4 flex items-center gap-2">
                <Warning className="w-4 h-4 text-error" weight="duotone" />
                Attrition risk
              </h3>
              {data.attrition_risk.at_risk.length === 0 ? (
                <EmptyState
                  icon={<ChartLineUp className="w-10 h-10 text-text-tertiary/30" weight="duotone" />}
                  title="No members flagged"
                  description="No stalled tasks or lost streaks detected in this cohort."
                />
              ) : (
                <div className="space-y-3">
                  {data.attrition_risk.at_risk.map((m) => (
                    <div key={m.user_id} className="px-4 py-3 rounded-lg bg-error-muted/40 border border-error/20">
                      <p className="text-body-sm font-medium text-text-primary">{m.name}</p>
                      <ul className="mt-1 space-y-0.5 list-disc list-inside text-caption text-error/80">
                        {m.reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </CardSpotlight>
          </div>
        )}
      </div>
    </PageTransition>
  )
}
