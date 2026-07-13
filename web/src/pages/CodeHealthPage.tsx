import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Heartbeat,
  WarningCircle,
  Bug,
  Code,
  GitBranch,
  Spinner,
} from '@phosphor-icons/react'
import PageTransition from '../components/ui/page-transition'
import CardSpotlight from '../components/ui/card-spotlight'
import { EmptyState } from '../components/ui/empty-state'
import { useToast } from '../context/ToastContext'
import { fetchHealthScore } from '../lib/api'
import type { HealthScoreResult } from '../lib/api'

function parseRepo(input: string): { owner: string; repo: string } | null {
  let s = input.trim()
  s = s.replace(/^https?:\/\//, '').replace(/^github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '')
  const parts = s.split('/').filter(Boolean)
  if (parts.length < 2) return null
  return { owner: parts[0], repo: parts[1] }
}

export default function CodeHealthPage() {
  const [repoUrl, setRepoUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<HealthScoreResult | null>(null)
  const [error, setError] = useState('')

  const toast = useToast()

  async function handleAnalyze() {
    const parsed = parseRepo(repoUrl)
    if (!parsed) {
      setError('Enter a GitHub repo as owner/repo or a full URL.')
      return
    }
    setLoading(true); setError(''); setResult(null)
    try {
      const data = await fetchHealthScore(parsed.owner, parsed.repo, {})
      setResult(data)
    } catch (err: any) {
      setError(err.message || 'Failed to compute health score.')
      toast.error('Health check failed', err.message)
    } finally {
      setLoading(false)
    }
  }

  const score = result?.overall_score ?? 0
  const scoreColor = score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-red-400'

  return (
    <PageTransition>
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center">
            <Heartbeat className="w-5 h-5 text-accent-primary" weight="duotone" />
          </div>
          <div>
            <h1 className="text-display-sm font-display font-medium text-text-primary">
              Code Health
            </h1>
            <p className="text-body-sm text-text-tertiary">
              Monitor code quality metrics for a repository.
            </p>
          </div>
        </div>

        {/* Repo input */}
        <div className="relative flex items-center w-full md:w-[520px]">
          <GitBranch size={16} className="absolute left-3.5 text-text-tertiary/40 pointer-events-none" />
          <input
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
            placeholder="github.com/owner/repo"
            className="w-full bg-bg-secondary border border-border text-text-primary text-body-sm rounded-input pl-9 pr-28 py-2.5 focus:outline-none focus:border-accent-primary/60 focus:ring-1 focus:ring-accent-primary/40 transition-colors placeholder:text-text-tertiary/40"
          />
          <button
            onClick={handleAnalyze}
            disabled={loading || !repoUrl.trim()}
            className="absolute right-1.5 bg-accent-primary hover:brightness-110 disabled:opacity-40 text-[#09090B] px-3 py-1.5 rounded-md text-caption font-semibold transition-all"
          >
            {loading ? 'Scoring…' : 'Score'}
          </button>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-lg bg-error-muted border border-error/20 text-error text-body-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={handleAnalyze} disabled={loading} className="text-caption underline ml-4 text-error/70 hover:text-error">Retry</button>
          </div>
        )}

        {!loading && !result && (
          <CardSpotlight className="border border-accent-primary/10">
            <EmptyState
              icon={<Heartbeat className="w-10 h-10 text-text-tertiary/30" weight="duotone" />}
              title="Enter a GitHub repository above"
              description="We'll score it on test coverage, maintainability, complexity, and more."
            />
          </CardSpotlight>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16 gap-3 text-text-tertiary">
            <Spinner className="w-5 h-5 animate-spin" />
            <span className="text-caption">Computing health score…</span>
          </div>
        )}

        {!loading && result && (
          <>
            {/* Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Overall Score', value: String(result.overall_score), icon: Heartbeat, color: scoreColor },
                { label: 'Test Coverage', value: `${result.test_coverage}%`, icon: Code, color: result.test_coverage >= 70 ? 'text-blue-400' : 'text-amber-400' },
                { label: 'Maintainability', value: String(result.maintainability), icon: WarningCircle, color: 'text-purple-400' },
                { label: 'Complexity', value: result.complexity, icon: Bug, color: 'text-cyan-400' },
              ].map((metric, i) => (
                <motion.div key={metric.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                  <CardSpotlight className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-9 h-9 rounded-lg ${metric.color.replace('text', 'bg')}/10 flex items-center justify-center`}>
                        <metric.icon className={`w-4.5 h-4.5 ${metric.color}`} weight="duotone" />
                      </div>
                      <span className="text-caption text-text-tertiary">{metric.label}</span>
                    </div>
                    <span className={`text-display-xs font-display font-medium ${metric.color}`}>{metric.value}</span>
                  </CardSpotlight>
                </motion.div>
              ))}
            </div>

            {/* Recommendations */}
            {result.recommendations?.length > 0 && (
              <CardSpotlight className="p-5 border border-accent-primary/10">
                <h3 className="text-body-sm font-medium text-text-primary mb-3">Recommendations</h3>
                <div className="space-y-3">
                  {result.recommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-accent-primary/10 text-accent-primary">
                        <Bug className="w-3.5 h-3.5" weight="fill" />
                      </div>
                      <p className="text-body-sm text-text-secondary">{rec}</p>
                    </div>
                  ))}
                </div>
              </CardSpotlight>
            )}
          </>
        )}
      </div>
    </PageTransition>
  )
}
