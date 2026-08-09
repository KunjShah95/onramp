import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../lib/utils'
import {
  Heartbeat, WarningCircle, Bug, Code, GitBranch, Sparkle,
  CaretRight, Lightbulb,
} from '@phosphor-icons/react'
import CardSpotlight from '../components/ui/card-spotlight'
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

function ScoreRing({ score, size = 100 }: { score: number; size?: number }) {
  const r = size * 0.42
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const color = score >= 80 ? '#0E7A3C' : score >= 60 ? '#B5710A' : '#BE3A2E'
  return (
    <svg width={size} height={size} className="ring-progress drop-shadow-glow shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.04)" strokeWidth={6} />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={color}
        strokeWidth={6}
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  )
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
}

export default function CodeHealthPage() {
  const [repoUrl, setRepoUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<HealthScoreResult | null>(null)
  const [error, setError] = useState('')
  const toast = useToast()

  async function handleAnalyze() {
    const parsed = parseRepo(repoUrl)
    if (!parsed) { setError('Enter a GitHub repo as owner/repo or a full URL.'); return }
    setLoading(true); setError(''); setResult(null)
    try {
      const data = await fetchHealthScore(parsed.owner, parsed.repo, {})
      setResult(data)
    } catch (err: any) {
      setError(err.message || 'Failed to compute health score.')
      toast.error('Health check failed', err.message)
    } finally { setLoading(false) }
  }

  const score = result?.overall_score ?? 0
  const scoreColor = score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-red-400'
  const scoreLabel = score >= 80 ? 'Excellent' : score >= 60 ? 'Needs Work' : 'Critical'

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="min-h-[calc(100vh-4rem)] relative">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <motion.div variants={item} className="mb-8">
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="tile tile-go">Code Health</span>
            <span className="designator opacity-50">REPO TELEMETRY</span>
          </div>
          <h1 className="text-display-md md:text-display-lg text-text-primary">Code Health</h1>
          <p className="text-body-sm text-text-secondary mt-1 font-code">Monitor code quality metrics for any GitHub repository</p>
        </motion.div>

        {/* Repo Input */}
        <motion.div variants={item} className="mb-8">
          <div className="max-w-xl relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500/8 to-emerald-500/8 rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity blur-sm" />
            <div className="relative flex items-center bg-bg-secondary border border-border group-focus-within:border-amber-400/20 rounded-xl px-3.5 py-2.5 transition-all">
              <GitBranch size={16} className="text-text-muted/30 shrink-0" />
              <input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                placeholder="github.com/owner/repo"
                className="flex-1 bg-transparent text-body-sm text-text-primary placeholder:text-text-muted/20 outline-none border-none ml-2.5" />
              <button onClick={handleAnalyze} disabled={loading || !repoUrl.trim()}
                className="flex items-center gap-1.5 bg-warning hover:bg-warning-lit disabled:opacity-40 text-[hsl(var(--primary-foreground))] px-3.5 py-1.5 rounded-btn text-caption font-semibold transition-all whitespace-nowrap">
                {loading ? <span className="w-3.5 h-3.5 border-2 border-[hsl(var(--primary-foreground))]/30 border-t-[hsl(var(--primary-foreground))] rounded-full animate-spin" /> : <Sparkle size={12} weight="fill" />}
                {loading ? 'Scoring' : 'Analyze'}
              </button>
            </div>
          </div>
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-6"
            >
              <div className="flex items-center justify-between p-3 rounded-xl bg-red-500/5 border border-red-500/15">
                <span className="text-body-xs text-red-300">{error}</span>
                <button onClick={handleAnalyze} disabled={loading}
                  className="text-caption text-red-400/60 hover:text-red-400 underline ml-4">Retry</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading */}
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center py-20"
            >
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-amber-400/8 border border-amber-400/15 flex items-center justify-center mx-auto mb-3">
                  <div className="w-6 h-6 border-2 border-border rounded-full border-t-amber-400 animate-spin" />
                </div>
                <p className="text-body-sm text-text-muted/60">Computing health score...</p>
                <p className="text-caption text-text-muted/20 mt-1">Analyzing repository metrics</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty State */}
        {!loading && !result && (
          <motion.div variants={item}>
            <CardSpotlight className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-14 h-14 rounded-2xl bg-bg-tertiary border border-border flex items-center justify-center mx-auto mb-4">
                <Heartbeat size={26} className="text-text-muted/20" />
              </div>
              <p className="text-body-sm text-text-muted/40 font-medium mb-1">Enter a repository</p>
              <p className="text-caption text-text-muted/20 max-w-sm">We'll score it on test coverage, maintainability, complexity, and more.</p>
            </CardSpotlight>
          </motion.div>
        )}

        {/* Results */}
        <AnimatePresence>
          {!loading && result && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              {/* Score Hero */}
              <motion.div variants={item} className="flex items-center gap-6 mb-6 p-5 rounded-2xl border border-border bg-gradient-to-r from-amber-500/[0.03] to-emerald-500/[0.03]">
                <div className="relative">
                  <ScoreRing score={score} size={100} />
                  <div className="absolute inset-0 flex items-center justify-center flex-col">
                    <span className="font-display text-display-sm font-bold text-text-primary tabular-nums">{score}</span>
                    <span className="text-[7px] text-text-muted/40 tracking-widest uppercase">/100</span>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={cn('font-display text-body font-bold', scoreColor)}>{scoreLabel}</span>
                    <div className={cn('w-2 h-2 rounded-full', score >= 80 ? 'bg-emerald-400' : score >= 60 ? 'bg-amber-400' : 'bg-red-400')} />
                  </div>
                  <p className="text-caption text-text-muted/40">Overall code health score</p>
                </div>
              </motion.div>

              {/* Metrics Grid */}
              <motion.div variants={item} className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                {[
                  { label: 'Test Coverage', value: `${result.test_coverage}%`, icon: Code, color: result.test_coverage >= 70 ? 'text-emerald-400' : 'text-amber-400', bg: 'bg-emerald-400/8 border-emerald-400/15' },
                  { label: 'Maintainability', value: String(result.maintainability), icon: WarningCircle, color: 'text-purple-400', bg: 'bg-purple-400/8 border-purple-400/15' },
                  { label: 'Complexity', value: result.complexity, icon: Bug, color: 'text-cyan-400', bg: 'bg-cyan-400/8 border-cyan-400/15' },
                  { label: 'Overall Score', value: String(score), icon: Heartbeat, color: scoreColor, bg: score >= 80 ? 'bg-emerald-400/8 border-emerald-400/15' : 'bg-amber-400/8 border-amber-400/15' },
                ].map((m, i) => (
                  <motion.div
                    key={m.label}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + i * 0.05, duration: 0.35 }}
                  >
                    <div className={cn('p-4 rounded-xl border', m.bg)}>
                      <m.icon size={16} className={cn(m.color, 'mb-2')} weight="fill" />
                      <div className={cn('font-display text-display-sm font-bold tabular-nums', m.color)}>{m.value}</div>
                      <div className="text-caption text-text-muted/40 mt-0.5">{m.label}</div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>

              {/* Recommendations */}
              {result.recommendations?.length > 0 && (
                <motion.div variants={item}>
                  <div className="flex items-center gap-2 mb-3">
                    <Lightbulb size={14} className="text-amber-400" weight="fill" />
                    <span className="text-body-xs font-semibold text-text-primary">Recommendations ({result.recommendations.length})</span>
                  </div>
                  <div className="space-y-2">
                    {result.recommendations.map((rec, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="flex items-start gap-3 p-3 rounded-xl bg-bg-tertiary/30 border border-border hover:border-border-hover transition-all"
                      >
                        <div className="w-7 h-7 rounded-lg bg-amber-400/8 border border-amber-400/10 flex items-center justify-center shrink-0">
                          <CaretRight size={12} className="text-amber-400" />
                        </div>
                        <p className="text-body-xs text-text-muted/60 leading-relaxed">{rec}</p>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
