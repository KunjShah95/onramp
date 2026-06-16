import { useState } from 'react'
import {
  analyzeArchitecture,
  fetchHealthScore,
  findSimilarPatterns,
} from '../lib/api'
import type { ArchitectureResult } from '../lib/types'
import ArchitectureDiagram from '../components/ArchitectureDiagram'
import { ExploreResultSkeleton } from '../components/ui/Skeleton'
import { cn } from '../lib/utils'

export default function ExplorePage() {
  const [repoUrl, setRepoUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ArchitectureResult | null>(null)
  const [health, setHealth] = useState<any | null>(null)
  const [error, setError] = useState('')

  // Pattern Recognition & OS Comparisons states
  const [selectedPattern, setSelectedPattern] = useState<string>('')
  const [patternLoading, setPatternLoading] = useState(false)
  const [patternData, setPatternData] = useState<any | null>(null)

  async function handleAnalyze() {
    if (!repoUrl.trim()) return
    setLoading(true)
    setError('')
    setResult(null)
    setHealth(null)
    setSelectedPattern('')
    setPatternData(null)
    try {
      const data = await analyzeArchitecture(repoUrl.trim())
      setResult(data)

      // Parse owner and repo
      let owner = 'owner'
      let repo = 'repo'
      const parts = repoUrl.trim().replace(/\.git$/, '').split('/')
      if (parts.length >= 2) {
        owner = parts[parts.length - 2]
        repo = parts[parts.length - 1]
      }

      try {
        const healthData = await fetchHealthScore(owner, repo, data)
        setHealth(healthData)
      } catch { /* health score optional */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed')
    }
    setLoading(false)
  }

  async function handleDetectPattern(pattern: string) {
    if (!result) return
    setSelectedPattern(pattern)
    setPatternLoading(true)
    setPatternData(null)
    try {
      const repoStructure = {
        files: result.entities.files.map((f) => ({ path: f.path })),
      }
      const data = await findSimilarPatterns(pattern, repoStructure)
      setPatternData(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pattern analysis failed')
    }
    setPatternLoading(false)
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

          {health && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="card">
                <h3 className="font-display text-base font-semibold text-text-primary mb-4">Codebase Health Score</h3>
                <div className="flex items-center gap-6">
                  <div className="relative w-20 h-20 flex items-center justify-center rounded-full border-4 border-accent-from/20">
                    <span className="font-display text-2xl font-bold text-accent-from font-mono">{health.overall_score}</span>
                    <span className="text-[9px] text-text-muted absolute bottom-2">/100</span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div>
                      <span className="text-text-muted">Test Coverage:</span>{' '}
                      <span className="text-text-secondary font-semibold font-mono">{health.test_coverage}%</span>
                    </div>
                    <div>
                      <span className="text-text-muted">Maintainability Index:</span>{' '}
                      <span className="text-text-secondary font-semibold font-mono">{health.maintainability}/10</span>
                    </div>
                    <div>
                      <span className="text-text-muted">Complexity Level:</span>{' '}
                      <span className="badge badge-warning capitalize font-semibold py-0">{health.complexity}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card">
                <h3 className="font-display text-base font-semibold text-text-primary mb-3">Recommendations</h3>
                {health.recommendations && health.recommendations.length > 0 ? (
                  <ul className="space-y-1.5 text-[11px] text-text-secondary list-disc pl-4">
                    {health.recommendations.map((rec: string, idx: number) => (
                      <li key={idx} className="leading-normal">{rec}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-text-muted">Repository meets all health standards.</p>
                )}
              </div>
            </div>
          )}

          <div className="card">
            <div className="flex items-center justify-between mb-0">
              <span className="text-sm text-text-secondary">Architecture Pattern</span>
              <span className="badge badge-success uppercase text-xs">
                {result.architecture_pattern}
              </span>
            </div>
          </div>

          {/* Pattern Recognition & OS Comparisons */}
          <div className="card space-y-6">
            <div>
              <h3 className="font-display text-base font-semibold text-text-primary mb-1">
                Pattern Recognition & OS Comparisons
              </h3>
              <p className="text-xs text-text-muted">
                Detect design patterns in this codebase and compare them with alternative open-source architectures.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium text-text-secondary">Select Pattern:</span>
              <div className="flex gap-2">
                {['authentication', 'api_design', 'database', 'testing'].map((p) => (
                  <button
                    key={p}
                    onClick={() => handleDetectPattern(p)}
                    className={cn(
                      'px-3 py-1.5 rounded-btn text-xs font-semibold transition-all duration-200 capitalize',
                      selectedPattern === p
                        ? 'bg-accent-from text-white shadow-card'
                        : 'bg-bg-secondary text-text-secondary hover:bg-bg-secondary/80'
                    )}
                  >
                    {p.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {patternLoading ? (
              <div className="flex flex-col items-center py-8 space-y-2">
                <div className="loader"></div>
                <p className="text-xs text-text-muted">Analyzing patterns and searching open-source alternatives...</p>
              </div>
            ) : patternData ? (
              <div className="space-y-4">
                <div className="bg-bg-secondary p-4 rounded-card border border-border/40">
                  <span className="text-[10px] text-accent-from font-mono uppercase tracking-wider block mb-1 font-bold">
                    Detected Pattern: {patternData.pattern}
                  </span>
                  <div className="text-xs text-text-secondary leading-relaxed">
                    <span className="font-semibold text-text-primary">Your Approach:</span>{' '}
                    {patternData.your_approach?.approach}
                  </div>
                  {patternData.your_approach?.files && patternData.your_approach.files.length > 0 && (
                    <div className="mt-2">
                      <span className="text-[10px] text-text-muted font-semibold block mb-1">Relevant Files:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {patternData.your_approach.files.map((f: string, i: number) => (
                          <span key={i} className="text-[9px] bg-bg-primary border border-border/30 text-text-muted px-2 py-0.5 rounded font-code">
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {patternData.similar_solutions && patternData.similar_solutions.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-border/40 text-xs">
                      <thead>
                        <tr className="text-text-muted text-left font-medium">
                          <th className="pb-2 font-semibold text-left">Alternative Repository / Solution</th>
                          <th className="pb-2 font-semibold text-left">Approach</th>
                          <th className="pb-2 font-semibold text-left">Differences & Tradeoffs</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20 text-text-secondary">
                        {patternData.similar_solutions.map((sol: any, idx: number) => (
                          <tr key={idx} className="hover:bg-bg-secondary/20 transition-colors">
                            <td className="py-2.5 pr-4 font-semibold text-text-primary font-mono">{sol.repo}</td>
                            <td className="py-2.5 pr-4">{sol.approach}</td>
                            <td className="py-2.5">{sol.why_different}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-text-muted text-center py-4">
                Select a pattern to compare implementations with other open-source projects.
              </div>
            )}
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
