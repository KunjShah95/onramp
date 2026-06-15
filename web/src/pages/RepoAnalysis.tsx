import { useParams, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { RepoAnalysisSkeleton } from '../components/ui/Skeleton'
import { fetchRepoSections, type SectionItem } from '../lib/api'

export default function RepoAnalysis() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>()
  const [sections, setSections] = useState<SectionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!owner || !repo) return

    let cancelled = false
    setLoading(true)
    setError(null)
    const startTime = Date.now()

    const hide = () => {
      const elapsed = Date.now() - startTime
      const remaining = Math.max(0, 150 - elapsed)
      setTimeout(() => { if (!cancelled) setLoading(false) }, remaining)
    }

    fetchRepoSections(owner, repo)
      .then((data) => { if (!cancelled) setSections(data.sections) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load repo analysis') })
      .finally(hide)

    return () => { cancelled = true }
  }, [owner, repo])

  if (loading) return <RepoAnalysisSkeleton />
  if (error) {
    return (
      <div className="animate-in">
        <div className="mb-6">
          <Link to="/dashboard" className="text-text-secondary text-sm hover:text-text-primary transition-colors">← Back</Link>
        </div>
        <div className="card border-l-[3px] border-red-500 p-6">
          <h2 className="font-display text-lg font-semibold text-red-400">Failed to load repo analysis</h2>
          <p className="text-text-secondary text-sm mt-2">{error}</p>
          <button onClick={() => window.location.reload()} className="btn mt-4 text-sm">Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-in">
      <div className="mb-6">
        <Link to="/dashboard" className="text-text-secondary text-sm hover:text-text-primary transition-colors">← Back</Link>
        <h1 className="font-display text-2xl font-bold text-text-primary mt-2">{owner}/{repo}</h1>
      </div>

      <div className="card">
        <h2 className="font-display text-xl font-semibold text-text-primary">Repository Analysis</h2>
        <p className="text-text-secondary text-sm mt-4">
          Full analysis view with entity graph, wiki, drift detection, and tech debt breakdown.
        </p>
        <div className="mt-6 space-y-3">
          {sections.map((section, i) => (
            <div key={i} className="p-4 bg-bg-tertiary rounded-btn">
              <h3 className="font-display text-sm font-semibold text-text-primary">{section.title}</h3>
              <p className="text-text-secondary text-xs mt-1">{section.description}</p>
              <p className="text-text-muted text-xs mt-1">{section.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
