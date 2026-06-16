import { useState, useEffect } from 'react'
import { fetchCTODashboard } from '../lib/api'

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCTODashboard()
      .then(setDashboard)
      .catch(() => setDashboard(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="animate-in max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card h-24 animate-pulse bg-bg-secondary" />
          ))}
        </div>
      </div>
    )
  }

  const metrics = dashboard || {
    total_repos: 0, onboarding_time_saved_hours: 0,
    first_prs_merged: 0, learning_paths_generated: 0,
    actions: [], services: [],
  }

  return (
    <div className="animate-in max-w-6xl">
      <h1 className="font-display text-2xl font-bold text-text-primary mb-1">Team Dashboard</h1>
      <p className="text-text-secondary text-sm mb-8">Overview of onboarding metrics and team health</p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Repositories', value: metrics.total_repos, color: 'text-accent-from' },
          { label: 'Onboarding Hours Saved', value: metrics.onboarding_time_saved_hours, color: 'text-accent-via' },
          { label: 'First PRs Merged', value: metrics.first_prs_merged, color: 'text-accent-to' },
          { label: 'Learning Paths', value: metrics.learning_paths_generated, color: 'text-yellow-400' },
        ].map((m) => (
          <div key={m.label} className="card text-center">
            <div className={`font-display text-3xl font-bold ${m.color}`}>{m.value}</div>
            <div className="text-xs text-text-muted mt-1">{m.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {metrics.actions && metrics.actions.length > 0 && (
          <div className="card">
            <h2 className="font-display text-base font-semibold text-text-primary mb-4">Action Items</h2>
            <div className="space-y-3">
              {metrics.actions.map((a: any, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-card bg-bg-secondary border border-border/40">
                  <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                    a.severity === 'warning' ? 'bg-yellow-400' : 'bg-accent-from'
                  }`} />
                  <div>
                    <p className="text-sm font-medium text-text-primary">{a.title}</p>
                    <p className="text-xs text-text-muted mt-0.5">{a.subtitle}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {metrics.services && metrics.services.length > 0 && (
          <div className="card">
            <h2 className="font-display text-base font-semibold text-text-primary mb-4">Service Status</h2>
            <div className="space-y-2">
              {metrics.services.map((s: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border/40 last:border-b-0">
                  <span className="text-sm text-text-secondary">{s.name}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    s.status === 'healthy' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                  }`}>{s.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
