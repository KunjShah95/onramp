import { useState } from 'react'
import { analyzeArchitecture } from '../lib/api'
import type { ArchitectureResult } from '../lib/types'
import ArchitectureDiagram from '../components/ArchitectureDiagram'
import { ExploreResultSkeleton } from '../components/ui/Skeleton'

export default function ExplorePage() {
  const [repoUrl, setRepoUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ArchitectureResult | null>(null)
  const [error, setError] = useState('')

  async function handleAnalyze() {
    if (!repoUrl.trim()) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const data = await analyzeArchitecture(repoUrl.trim())
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed')
    }
    setLoading(false)
  }

  return (
    <div className="animate-in max-w-5xl">
      <h1 className="font-display text-2xl font-bold text-text-primary mb-1">Architecture Explorer</h1>
      <p className="text-text-secondary text-sm mb-6">Analyze any GitHub repository and visualize its structure</p>

      <div className="flex gap-3 mb-8">
        <input
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="https://github.com/facebook/react"
          className="input flex-1"
          onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
        />
        <button
          onClick={handleAnalyze}
          disabled={loading || !repoUrl.trim()}
          className="btn whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 text-red-400 rounded-card p-4 mb-6 text-sm border border-red-500/20">{error}</div>
      )}

      {loading && <ExploreResultSkeleton />}

      {result && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="card text-center">
              <div className="font-display text-2xl font-bold text-accent-from">{result.entities.files.length}</div>
              <div className="text-xs text-text-muted mt-1">Files</div>
            </div>
            <div className="card text-center">
              <div className="font-display text-2xl font-bold text-accent-via">{result.entities.classes.length}</div>
              <div className="text-xs text-text-muted mt-1">Classes</div>
            </div>
            <div className="card text-center">
              <div className="font-display text-2xl font-bold text-accent-to">{result.entities.functions.length}</div>
              <div className="text-xs text-text-muted mt-1">Functions</div>
            </div>
            <div className="card text-center">
              <div className="font-display text-2xl font-bold text-yellow-400">{result.circular_dependencies.length}</div>
              <div className="text-xs text-text-muted mt-1">Circular Deps</div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-0">
              <span className="text-sm text-text-secondary">Architecture Pattern</span>
              <span className="badge badge-success uppercase text-xs">
                {result.architecture_pattern}
              </span>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-medium text-text-secondary mb-3">Architecture Diagram</h2>
            <ArchitectureDiagram
              mermaidCode={result.architecture_diagram}
              dependencies={result.dependencies}
              services={result.services}
            />
          </div>
        </div>
      )}
    </div>
  )
}
