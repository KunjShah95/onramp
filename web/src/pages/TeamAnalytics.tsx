import { useState, useEffect } from 'react'
import { StatsGridSkeleton, ListPanelSkeleton, SkeletonBase } from '../components/ui/Skeleton'
import { fetchTeamAnalytics, type TeamMember } from '../lib/api'

export default function TeamAnalytics() {
  const [members, setMembers] = useState<TeamMember[]>([])
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

    fetchTeamAnalytics()
      .then((data) => { if (!cancelled) setMembers(data.members) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load team data') })
      .finally(hide)

    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="animate-in">
        <SkeletonBase className="h-8 w-48" />
        <div className="mt-8 space-y-6">
          <StatsGridSkeleton count={4} />
          <ListPanelSkeleton rows={4} />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="animate-in">
        <div className="card border-l-[3px] border-red-500 p-6">
          <h2 className="font-display text-lg font-semibold text-red-400">Failed to load team analytics</h2>
          <p className="text-text-secondary text-sm mt-2">{error}</p>
          <button onClick={() => window.location.reload()} className="btn mt-4 text-sm">Retry</button>
        </div>
      </div>
    )
  }

  const totalRepos = members.reduce((s, m) => s + m.repos, 0)
  const totalAnalyses = members.reduce((s, m) => s + m.analyses, 0)
  const avgAnalyses = members.length ? (totalAnalyses / members.length).toFixed(2) : '0'

  return (
    <div className="animate-in">
      <h1 className="font-display text-2xl font-bold text-text-primary">Team Analytics</h1>
      <div className="mt-8 space-y-6">
        <div className="card grid grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-text-muted text-xs">Total Repos</p>
            <p className="font-display text-2xl font-bold text-accent-from mt-1">{totalRepos}</p>
          </div>
          <div>
            <p className="text-text-muted text-xs">Total Analyses</p>
            <p className="font-display text-2xl font-bold text-accent-from mt-1">{totalAnalyses}</p>
          </div>
          <div>
            <p className="text-text-muted text-xs">Avg per Member</p>
            <p className="font-display text-2xl font-bold text-text-primary mt-1">{avgAnalyses}</p>
          </div>
          <div>
            <p className="text-text-muted text-xs">Active</p>
            <p className="font-display text-2xl font-bold text-accent-from mt-1">{members.length}</p>
          </div>
        </div>

        <div className="card">
          <h3 className="font-display text-base font-semibold text-text-primary">Team Members</h3>
          <div className="mt-4 space-y-3">
            {members.map(m => (
              <div key={m.name} className="flex items-center justify-between p-3 bg-bg-tertiary rounded-btn">
                <div>
                  <p className="font-medium text-sm text-text-primary">{m.name}</p>
                  <p className="text-text-muted text-xs mt-0.5">{m.repos} repos · {m.analyses} analyses</p>
                </div>
                <span className={`badge ${m.contribution === 'high' ? 'badge-success' : m.contribution === 'medium' ? 'badge-warning' : ''}`}>{m.contribution}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
