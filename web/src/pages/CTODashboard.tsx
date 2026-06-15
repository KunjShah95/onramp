import { useState, useEffect } from 'react'
import { StatsGridSkeleton, ListPanelSkeleton, SkeletonBase } from '../components/ui/Skeleton'
import { fetchCTODashboard, type CTOResponse } from '../lib/api'

export default function CTODashboard() {
  const [data, setData] = useState<CTOResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const startTime = Date.now()

    const hide = () => {
      const elapsed = Date.now() - startTime
      const remaining = Math.max(0, 150 - elapsed)
      setTimeout(() => { if (!cancelled) setLoading(false) }, remaining)
    }

    fetchCTODashboard()
      .then((res) => { if (!cancelled) setData(res) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load dashboard') })
      .finally(hide)

    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="animate-in">
        <SkeletonBase className="h-8 w-48" />
        <div className="mt-8">
          <StatsGridSkeleton />
        </div>
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ListPanelSkeleton rows={3} />
          <ListPanelSkeleton rows={4} />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="animate-in">
        <div className="card border-l-[3px] border-red-500 p-6">
          <h2 className="font-display text-lg font-semibold text-red-400">Failed to load dashboard</h2>
          <p className="text-text-secondary text-sm mt-2">{error}</p>
          <button onClick={() => window.location.reload()} className="btn mt-4 text-sm">Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-in">
      <h1 className="font-display text-2xl font-bold text-text-primary">CTO Dashboard</h1>
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card border-l-[3px] border-accent-from">
          <p className="text-text-muted text-xs">Total Repositories</p>
          <p className="font-display text-3xl font-bold text-accent-from mt-1">{data?.total_repos}</p>
          <p className="text-text-secondary text-xs mt-1">+12 this month</p>
        </div>
        <div className="card border-l-[3px] border-yellow-500">
          <p className="text-text-muted text-xs">Tech Debt</p>
          <p className="font-display text-3xl font-bold text-yellow-400 mt-1">${(data?.tech_debt ?? 0).toLocaleString()}</p>
          <p className="text-text-secondary text-xs mt-1">+8% from last quarter</p>
        </div>
        <div className="card border-l-[3px] border-red-500">
          <p className="text-text-muted text-xs">Architecture Drift</p>
          <p className="font-display text-3xl font-bold text-red-400 mt-1">{data?.drift_issues}</p>
          <p className="text-text-secondary text-xs mt-1">critical issues</p>
        </div>
        <div className="card border-l-[3px] border-blue-500">
          <p className="text-text-muted text-xs">Wiki Pages</p>
          <p className="font-display text-3xl font-bold text-blue-400 mt-1">{data?.wiki_pages}</p>
          <p className="text-text-secondary text-xs mt-1">generated</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="font-display text-base font-semibold text-text-primary">High Priority Actions</h3>
          <div className="mt-4 space-y-3">
            {(data?.actions ?? []).map((action, i) => (
              <div
                key={i}
                className={`p-3 bg-bg-tertiary rounded-btn border-l-[3px] ${
                  action.severity === 'critical' ? 'border-red-500' :
                  action.severity === 'warning' ? 'border-yellow-500' : 'border-accent-from'
                }`}
              >
                <p className="font-medium text-sm text-text-primary">{action.title}</p>
                <p className="text-text-muted text-xs mt-0.5">{action.subtitle}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3 className="font-display text-base font-semibold text-text-primary">System Health</h3>
          <div className="mt-4 space-y-0">
            {(data?.services ?? []).map(s => (
              <div key={s.name} className="flex items-center justify-between py-3 border-b border-border last:border-b-0">
                <span className="text-sm text-text-primary">{s.name}</span>
                <span className={`badge ${s.status === 'healthy' ? 'badge-success' : 'badge-warning'}`}>{s.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
