import { useState, useEffect } from 'react'
import { MilestoneListSkeleton, SkeletonBase } from '../components/ui/Skeleton'
import { fetchRoadmap, type Milestone } from '../lib/api'

export default function Roadmap() {
  const [milestones, setMilestones] = useState<Milestone[]>([])
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

    fetchRoadmap()
      .then((data) => { if (!cancelled) setMilestones(data.milestones) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load roadmap') })
      .finally(hide)

    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="animate-in max-w-xl">
        <SkeletonBase className="h-8 w-36" />
        <div className="mt-8">
          <MilestoneListSkeleton count={5} />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="animate-in max-w-xl">
        <div className="card border-l-[3px] border-red-500 p-6">
          <h2 className="font-display text-lg font-semibold text-red-400">Failed to load roadmap</h2>
          <p className="text-text-secondary text-sm mt-2">{error}</p>
          <button onClick={() => window.location.reload()} className="btn mt-4 text-sm">Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-in max-w-xl">
      <h1 className="font-display text-2xl font-bold text-text-primary">Roadmap</h1>
      <div className="mt-8 space-y-4">
        {milestones.map(m => (
          <div key={m.id} className="card relative overflow-hidden">
            <div className="flex items-start justify-between mb-3">
              <div>
                <span className="text-xs text-accent-from uppercase tracking-wider font-semibold">{m.phase}</span>
                <h3 className="font-display text-base font-semibold text-text-primary mt-1">{m.title}</h3>
              </div>
              <span className={`badge ${m.status === 'completed' ? 'badge-success' : m.status === 'active' ? 'badge-warning' : ''}`}>{m.status}</span>
            </div>
            <div className="h-1 bg-bg-tertiary rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${m.progress}%`,
                  background: m.status === 'completed'
                    ? 'linear-gradient(to right, #8B5CF6, #6366F1)'
                    : 'linear-gradient(to right, #F59E0B, #F97316)'
                }}
              />
            </div>
            <span className="text-xs text-text-muted mt-2 block">{m.progress}% complete</span>
          </div>
        ))}
      </div>
    </div>
  )
}
