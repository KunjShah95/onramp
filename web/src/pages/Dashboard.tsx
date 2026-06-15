import { useState, useEffect } from 'react'
import RepoCard from '../components/dashboard/RepoCard'
import SearchBar from '../components/dashboard/SearchBar'
import { DashboardSkeleton } from '../components/ui/Skeleton'
import { fetchRepos, type RepoItem } from '../lib/api'

export default function Dashboard() {
  const [repos, setRepos] = useState<RepoItem[]>([])
  const [search, setSearch] = useState('')
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

    fetchRepos()
      .then((data) => { if (!cancelled) setRepos(data.repos) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load repos') })
      .finally(hide)

    return () => { cancelled = true }
  }, [])

  const filtered = repos.filter(
    (r) => r.name.toLowerCase().includes(search.toLowerCase()) || r.owner.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <DashboardSkeleton />
  if (error) {
    return (
      <div className="animate-in max-w-3xl">
        <div className="card border-l-[3px] border-red-500 p-6">
          <h2 className="font-display text-lg font-semibold text-red-400">Failed to load repositories</h2>
          <p className="text-text-secondary text-sm mt-2">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="btn mt-4 text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-in max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold text-text-primary">Repositories</h1>
        <button className="btn text-sm">+ Add Repository</button>
      </div>
      <div className="mb-6">
        <SearchBar value={search} onChange={setSearch} />
      </div>
      <div className="space-y-3">
        {filtered.map((repo) => (
          <RepoCard
            key={repo.id}
            name={repo.name}
            owner={repo.owner}
            status={repo.status}
            lastAnalyzed={repo.last_analyzed}
          />
        ))}
        {filtered.length === 0 && (
          <p className="text-text-muted text-sm text-center py-12">No repositories found.</p>
        )}
      </div>
    </div>
  )
}
