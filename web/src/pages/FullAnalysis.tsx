import { useParams, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { AnalysisSkeleton } from '../components/ui/Skeleton'
import { fetchRepoAnalysis, type AnalysisData } from '../lib/api'

export default function FullAnalysis() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>()
  const [data, setData] = useState<AnalysisData | null>(null)
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

    fetchRepoAnalysis(owner, repo)
      .then((res) => { if (!cancelled) setData(res) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load analysis') })
      .finally(hide)

    return () => { cancelled = true }
  }, [owner, repo])

  if (loading) return <AnalysisSkeleton />
  if (error) {
    return (
      <div className="animate-in">
        <div className="mb-6">
          <Link to="/dashboard" className="text-text-secondary text-sm hover:text-text-primary transition-colors">← Back to Dashboard</Link>
        </div>
        <div className="card border-l-[3px] border-red-500 p-6">
          <h2 className="font-display text-lg font-semibold text-red-400">Failed to load analysis</h2>
          <p className="text-text-secondary text-sm mt-2">{error}</p>
          <button onClick={() => window.location.reload()} className="btn mt-4 text-sm">Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-in">
      <div className="mb-6">
        <Link to="/dashboard" className="text-text-secondary text-sm hover:text-text-primary transition-colors">← Back to Dashboard</Link>
        <h1 className="font-display text-2xl font-bold text-text-primary mt-2">{owner}/{repo}</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <h3 className="font-display text-base font-semibold text-text-primary">Entity Graph</h3>
          <p className="font-display text-2xl font-bold text-accent-from mt-2">{data?.graph.nodes} nodes</p>
          <p className="text-text-secondary text-sm">{data?.graph.edges} edges</p>
        </div>
        <div className="card">
          <h3 className="font-display text-base font-semibold text-text-primary">Wiki Pages</h3>
          <p className="font-display text-2xl font-bold text-accent-from mt-2">{data?.wiki.pages}</p>
          <p className="text-text-secondary text-sm">compiled pages</p>
        </div>
        <div className="card">
          <h3 className="font-display text-base font-semibold text-text-primary">Architecture Drift</h3>
          <p className="font-display text-2xl font-bold text-yellow-400 mt-2">{data?.drift.issues}</p>
          <p className="text-text-secondary text-sm">issues detected</p>
        </div>
        <div className="card">
          <h3 className="font-display text-base font-semibold text-text-primary">Tech Debt</h3>
          <p className="font-display text-2xl font-bold text-red-400 mt-2">${(data?.tech_debt.total || 0).toLocaleString()}</p>
          <p className="text-text-secondary text-sm">total debt</p>
        </div>
      </div>

      <div className="mt-8">
        <Link to={`/repo/${owner}/${repo}`} className="btn">Explore Full Analysis</Link>
      </div>
    </div>
  )
}
