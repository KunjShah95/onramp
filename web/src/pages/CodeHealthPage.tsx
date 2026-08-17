import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Heartbeat, Code, WarningCircle, Bug, GitBranch, Sparkle,
  CaretRight, ArrowUpRight,
} from '@phosphor-icons/react'
import { cn } from '../lib/utils'
import ConsolePanel from '../components/ui/console-panel'
import InputField from '../components/ui/first-principles/InputField'
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

function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const r = size * 0.42
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const color = score >= 80 ? 'var(--go)' : score >= 60 ? 'var(--caution)' : 'var(--abort)'
  return (
    <svg width={size} height={size} className="drop-shadow-glow shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="hsl(var(--seam))" strokeWidth={6} fill="none" />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={color}
        strokeWidth={6}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
        style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
      />
    </svg>
  )
}

const fade = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const } },
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
  const verdict = score >= 80 ? 'go' as const : score >= 60 ? 'standby' as const : 'abort' as const
  const scoreLabel = score >= 80 ? 'Excellent' : score >= 60 ? 'Needs Work' : 'Critical'

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[hsl(var(--background))]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">

        {/* Hero — thesis + verb */}
        <motion.header initial="hidden" animate="show" variants={fade} className="mb-8">
          <div className="flex items-center gap-2.5 mb-2">
            <span className="designator opacity-50">FLIGHT · TELEMETRY</span>
            <span className="w-1 h-1 rounded-full bg-ink-disabled" />
            <span className="designator opacity-50">REPO HEALTH</span>
          </div>
          <h1 className="font-display text-4xl md:text-5xl text-ink font-bold tracking-tight leading-[1.05]">
            One score, four signals.
          </h1>
          <p className="font-body text-[15px] text-ink-secondary mt-2 max-w-xl">
            Score a GitHub repo on test coverage, maintainability, complexity, and overall health.
            One dominant read. Drill down if you need to.
          </p>
        </motion.header>

        {/* Action row */}
        <motion.div initial="hidden" animate="show" variants={fade} className="mb-10">
          <ConsolePanel pad="dense" className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
            <div className="flex-1">
              <InputField
                label="Repository"
                icon={<GitBranch size={14} weight="bold" />}
                placeholder="github.com/owner/repo"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
              />
            </div>
            <button
              onClick={handleAnalyze}
              disabled={loading || !repoUrl.trim()}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-[3px] bg-go px-5 py-2.5',
                'text-[13px] font-semibold text-white shadow-seam transition-all',
                'hover:bg-go-lit active:translate-y-px disabled:opacity-40 disabled:cursor-not-allowed',
                'sm:mb-0.5'
              )}
            >
              {loading ? (
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Sparkle size={12} weight="fill" />
              )}
              {loading ? 'Scoring' : 'Analyze'}
              <ArrowUpRight size={12} weight="bold" />
            </button>
          </ConsolePanel>
        </motion.div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-6"
            >
              <ConsolePanel pad="dense" className="flex items-center justify-between">
                <span className="text-[13px] text-abort">{error}</span>
                <button onClick={handleAnalyze} disabled={loading} className="text-[12px] text-abort/70 hover:text-abort underline">
                  Retry
                </button>
              </ConsolePanel>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty */}
        {!loading && !result && (
          <motion.div initial="hidden" animate="show" variants={fade}>
            <ConsolePanel rail="Awaiting" designator="NO TELEMETRY" status="idle" className="py-16 text-center">
              <div className="w-14 h-14 rounded-[3px] bg-base border border-seam flex items-center justify-center mx-auto mb-4">
                <Heartbeat size={26} className="text-ink-disabled" weight="duotone" />
              </div>
              <p className="font-display text-lg text-ink font-semibold mb-1">Enter a repository</p>
              <p className="text-[13px] text-ink-tertiary max-w-sm mx-auto">
                We'll score it on test coverage, maintainability, complexity, and overall health.
              </p>
            </ConsolePanel>
          </motion.div>
        )}

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
                <div className="w-14 h-14 rounded-[3px] bg-caution/8 border border-caution/20 flex items-center justify-center mx-auto mb-3">
                  <div className="w-6 h-6 border-2 border-seam rounded-full border-t-caution animate-spin" />
                </div>
                <p className="font-code text-[13px] text-ink-secondary">Computing health score...</p>
                <p className="font-code text-[11px] text-ink-tertiary mt-1">Analyzing repository metrics</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        <AnimatePresence>
          {!loading && result && (
            <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.06 } } }} className="space-y-6">

              {/* Verdict hero — the single dominant read */}
              <motion.div variants={fade}>
                <ConsolePanel rail="Verdict" designator="OVERALL" status={verdict === 'standby' ? 'caution' : verdict} live={verdict === 'go'}>
                  <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                    <div className="relative shrink-0">
                      <ScoreRing score={score} size={120} />
                      <div className="absolute inset-0 flex items-center justify-center flex-col">
                        <span className="font-display text-3xl font-bold text-ink tabular-nums">{score}</span>
                        <span className="font-code text-[9px] text-ink-tertiary tracking-widest">/100</span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="callsign text-ink mb-1.5">{scoreLabel.toUpperCase()}</div>
                      <p className="font-body text-[14px] text-ink-secondary leading-relaxed">
                        {score >= 80 && 'Tests run. Code reads clean. Complexity stays inside the lines.'}
                        {score < 80 && score >= 60 && 'Some drift. Coverage or complexity needs attention before the next push.'}
                        {score < 60 && 'Red flags. Review recommendations below before merging further changes.'}
                      </p>
                    </div>
                  </div>
                </ConsolePanel>
              </motion.div>

              {/* Sub-signals — the four tiles that feed the score */}
              <motion.div variants={fade} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'Test Coverage', value: `${result.test_coverage}%`, icon: Code, tone: result.test_coverage >= 70 ? 'go' : 'caution' },
                  { label: 'Maintainability', value: String(result.maintainability), icon: WarningCircle, tone: 'mission' as const },
                  { label: 'Complexity', value: result.complexity, icon: Bug, tone: 'mission' as const },
                  { label: 'Overall', value: String(score), icon: Heartbeat, tone: verdict === 'go' ? 'go' as const : verdict === 'standby' ? 'caution' as const : 'abort' as const },
                ].map((s) => (
                  <ConsolePanel key={s.label} pad="dense" className="flex flex-col">
                    <div className="flex items-center gap-2 mb-3">
                      <s.icon size={14} weight="fill" className={cn(
                        s.tone === 'go' && 'text-go',
                        s.tone === 'caution' && 'text-caution',
                        s.tone === 'abort' && 'text-abort',
                        s.tone === 'mission' && 'text-mission',
                      )} />
                      <span className="designator opacity-60">{s.label.toUpperCase()}</span>
                    </div>
                    <div className={cn('font-display text-3xl font-bold tabular-nums',
                      s.tone === 'go' && 'text-go',
                      s.tone === 'caution' && 'text-caution',
                      s.tone === 'abort' && 'text-abort',
                      s.tone === 'mission' && 'text-ink',
                    )}>{s.value}</div>
                  </ConsolePanel>
                ))}
              </motion.div>

              {/* Recommendations — only if they exist */}
              {result.recommendations && result.recommendations.length > 0 && (
                <motion.div variants={fade}>
                  <ConsolePanel
                    rail="Recommendations"
                    designator={`${result.recommendations.length} ACTIONS`}
                    status="caution"
                  >
                    <div className="space-y-2">
                      {result.recommendations.map((rec, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className={cn(
                            'flex items-start gap-3 px-3 py-2.5 rounded-[3px]',
                            'bg-base border border-seam hover:border-seam-strong transition-colors'
                          )}
                        >
                          <span className="font-code text-[11px] text-ink-tertiary tabular-nums mt-0.5 shrink-0 w-6">
                            {String(i + 1).padStart(2, '0')}
                          </span>
                          <CaretRight size={12} className="text-caution mt-1 shrink-0" weight="bold" />
                          <p className="font-body text-[13px] text-ink-secondary leading-relaxed flex-1">{rec}</p>
                        </motion.div>
                      ))}
                    </div>
                  </ConsolePanel>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
