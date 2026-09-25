import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Heartbeat, Code, WarningCircle, Bug, GitBranch, Sparkle,
  CaretRight, ArrowUpRight, BookOpen, TreeStructure, ArrowsClockwise, Files,
} from '@phosphor-icons/react'
import { cn } from '../lib/utils'
import ConsolePanel from '../components/ui/console-panel'
import { EmptyState } from '../components/ui/empty-state'
import { PageHeader } from '../components/ui/page-header'
import { useToast } from '../context/ToastContext'
import { fetchHealthScore, fetchRepos } from '../lib/api'
import type { HealthScoreResult } from '../lib/api'

type Tone = 'go' | 'caution' | 'abort' | 'mission'

function parseRepo(input: string): { owner: string; repo: string } | null {
  let s = input.trim()
  s = s.replace(/^https?:\/\//, '').replace(/^(www\.)?github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '')
  const parts = s.split('/').filter(Boolean)
  if (parts.length < 2) return null
  return { owner: parts[0], repo: parts[1] }
}

/** Map a 0–100 value onto the go/caution/abort scale. */
function toneFor(pct: number, good = 70, ok = 40): Tone {
  return pct >= good ? 'go' : pct >= ok ? 'caution' : 'abort'
}

const toneText: Record<Tone, string> = {
  go: 'text-go', caution: 'text-caution', abort: 'text-abort', mission: 'text-mission',
}
const toneBg: Record<Tone, string> = {
  go: 'bg-go', caution: 'bg-caution', abort: 'bg-abort', mission: 'bg-mission',
}

function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const r = size * 0.42
  const circ = 2 * Math.PI * r
  const offset = circ - (Math.max(0, Math.min(100, score)) / 100) * circ
  const color = score >= 80 ? 'var(--go)' : score >= 60 ? 'var(--caution)' : 'var(--abort)'
  return (
    <svg width={size} height={size} className="shrink-0" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--seam)" strokeWidth={6} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={6} fill="none" strokeLinecap="round" strokeDasharray={circ} style={{ strokeDashoffset: offset, transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 600ms ease-out' }} />
    </svg>
  )
}

/** One labelled signal with a horizontal meter. */
function SignalRow({ icon: Icon, label, value, pct, tone, hint }: {
  icon: typeof Code; label: string; value: string; pct: number; tone: Tone; hint?: string
}) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon size={14} weight="fill" className={cn('shrink-0', toneText[tone])} />
          <span className="text-[13px] font-medium text-ink truncate">{label}</span>
          {hint && <span className="hidden sm:inline font-code text-[11px] text-ink-tertiary truncate">· {hint}</span>}
        </div>
        <span className={cn('font-code text-[13px] font-semibold tabular-nums shrink-0', toneText[tone])}>{value}</span>
      </div>
      <div className="h-1.5 rounded-[2px] bg-well overflow-hidden">
        <div
          className={cn('h-full rounded-[2px] transition-[width] duration-500 ease-out', toneBg[tone])}
          style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  )
}

export default function CodeHealthPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialRepo = searchParams.get('owner') && searchParams.get('repo')
    ? `${searchParams.get('owner')}/${searchParams.get('repo')}`
    : ''
  const [repoUrl, setRepoUrl] = useState(initialRepo)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<HealthScoreResult | null>(null)
  const [analyzed, setAnalyzed] = useState<{ owner: string; repo: string } | null>(null)
  const [error, setError] = useState('')
  const toast = useToast()
  const autoRan = useRef(false)

  const { data: reposData } = useQuery({
    queryKey: ['repos'],
    queryFn: fetchRepos,
    staleTime: 60_000,
  })
  const trackedRepos = reposData?.repos ?? []

  async function analyze(input: string) {
    const parsed = parseRepo(input)
    if (!parsed) { setError('Enter a GitHub repo as owner/repo or a full URL.'); return }
    setRepoUrl(`${parsed.owner}/${parsed.repo}`)
    setLoading(true); setError(''); setResult(null)
    setSearchParams({ owner: parsed.owner, repo: parsed.repo }, { replace: true })
    try {
      const data = await fetchHealthScore(parsed.owner, parsed.repo, null)
      setResult(data)
      setAnalyzed(parsed)
    } catch (err: any) {
      const msg: string = err?.message || 'Failed to compute health score.'
      // Backend answers 400 when the repo has no index yet — make that actionable.
      const friendly = /repo_structure|index_id/i.test(msg)
        ? `${parsed.owner}/${parsed.repo} isn't indexed yet. Add it from Explore first, then score it here.`
        : msg
      setError(friendly)
      toast.error('Health check failed', friendly)
    } finally { setLoading(false) }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!loading) analyze(repoUrl)
  }

  // Deep link: /code-health?owner=x&repo=y runs immediately.
  useEffect(() => {
    if (initialRepo && !autoRan.current) {
      autoRan.current = true
      analyze(initialRepo)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const score = Math.round(result?.overall_score ?? 0)
  const verdict = score >= 80 ? 'go' as const : score >= 60 ? 'standby' as const : 'abort' as const
  const scoreLabel = score >= 80 ? 'Excellent' : score >= 60 ? 'Needs work' : 'Critical'

  const complexity = (result?.complexity ?? 'unknown').toLowerCase()
  const complexityTone: Tone = complexity === 'low' ? 'go' : complexity === 'medium' ? 'caution' : complexity === 'high' ? 'abort' : 'mission'
  const complexityPct = complexity === 'low' ? 90 : complexity === 'medium' ? 55 : complexity === 'high' ? 20 : 0
  const maintainability = result?.maintainability ?? 0
  const circular = result?.circular_dependencies ?? 0

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-base">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <header className="mb-8">
          <PageHeader
            eyebrow="Folio · Code health"
            title="Code Health"
            subtitle="Score a GitHub repo on test coverage, maintainability, complexity, and overall health · one dominant read, drill down if you need to."
          />
        </header>

        {/* Action row — single line on sm+, stacked on phones */}
        <div className="mb-10">
          <ConsolePanel pad="dense">
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <label htmlFor="code-health-repo" className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-tertiary">
                Repository
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1 min-w-0">
                  <GitBranch size={14} weight="bold" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-tertiary" />
                  <input
                    id="code-health-repo"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="owner/repo or https://github.com/owner/repo"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    className={cn(
                      'w-full h-10 bg-panel border border-seam text-ink placeholder:text-ink-muted rounded-[5px]',
                      'pl-10 pr-3.5 text-[14px] font-body shadow-seam',
                      'transition-[border-color,box-shadow] duration-150',
                      'hover:border-seam-strong focus:outline-none focus:border-go/60 focus:shadow-[0_0_0_3px_rgb(var(--go-rgb)_/_0.12)]',
                    )}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !repoUrl.trim()}
                  className={cn(
                    'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-[3px] bg-go px-5',
                    'text-[13px] font-semibold text-white shadow-seam transition-all whitespace-nowrap',
                    'hover:bg-go-lit active:translate-y-px disabled:opacity-40 disabled:cursor-not-allowed',
                  )}
                >
                  {loading ? (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Sparkle size={12} weight="fill" />
                  )}
                  {loading ? 'Scoring' : 'Analyze'}
                  {!loading && <ArrowUpRight size={12} weight="bold" />}
                </button>
              </div>

              {trackedRepos.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-code text-[11px] text-ink-tertiary mr-1">Tracked:</span>
                  {trackedRepos.slice(0, 8).map((r) => {
                    const slug = `${r.owner}/${r.name}`
                    const active = analyzed && `${analyzed.owner}/${analyzed.repo}` === slug
                    return (
                      <button
                        key={r.id ?? slug}
                        type="button"
                        disabled={loading}
                        onClick={() => analyze(slug)}
                        className={cn(
                          'max-w-full truncate rounded-[3px] border px-2 py-1 font-code text-[11px] transition-colors',
                          'disabled:opacity-50 disabled:cursor-not-allowed',
                          active
                            ? 'border-go/40 bg-go/10 text-go'
                            : 'border-seam bg-base text-ink-secondary hover:border-seam-strong hover:text-ink',
                        )}
                      >
                        {slug}
                      </button>
                    )
                  })}
                </div>
              )}
            </form>
          </ConsolePanel>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6">
            <ConsolePanel pad="dense">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[13px] text-abort">{error}</span>
                <div className="flex items-center gap-3 shrink-0">
                  {/isn't indexed/.test(error) && (
                    <Link to="/explore" className="text-[12px] text-mission hover:text-mission-lit underline">
                      Open Explore
                    </Link>
                  )}
                  <button onClick={() => analyze(repoUrl)} disabled={loading} className="text-[12px] text-abort/70 hover:text-abort underline">
                    Retry
                  </button>
                </div>
              </div>
            </ConsolePanel>
          </div>
        )}

        {/* Empty */}
        {!loading && !result && !error && (
          <ConsolePanel rail="Awaiting" designator="No data yet" status="idle">
            <EmptyState
              icon={<Heartbeat size={26} className="text-ink-disabled" weight="duotone" />}
              eyebrow="Code health"
              title="Enter a repository"
              description={trackedRepos.length > 0
                ? 'Pick a tracked repo above, or paste any indexed GitHub repo.'
                : "We'll score it on test coverage, maintainability, complexity, and overall health."}
            />
          </ConsolePanel>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-14 h-14 rounded-[3px] bg-caution/8 border border-caution/20 flex items-center justify-center mx-auto mb-3">
                <div className="w-6 h-6 border-2 border-seam rounded-full border-t-caution animate-spin" />
              </div>
              <p className="font-code text-[13px] text-ink-secondary">Computing health score...</p>
              <p className="font-code text-[11px] text-ink-tertiary mt-1">Analyzing repository metrics</p>
            </div>
          </div>
        )}

        {/* Results */}
        {!loading && result && (
          <div className="space-y-6">

            {/* Verdict hero — the single dominant read */}
            <ConsolePanel
              rail="Verdict"
              designator={analyzed ? `${analyzed.owner}/${analyzed.repo}`.toUpperCase() : 'OVERALL'}
              status={verdict === 'standby' ? 'caution' : verdict}
              live={verdict === 'go'}
              action={
                <button
                  onClick={() => analyze(repoUrl)}
                  className="inline-flex items-center gap-1.5 text-[12px] text-ink-tertiary hover:text-ink transition-colors"
                >
                  <ArrowsClockwise size={12} weight="bold" />
                  Rescore
                </button>
              }
            >
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                <div className="relative shrink-0">
                  <ScoreRing score={score} size={120} />
                  <div className="absolute inset-0 flex items-center justify-center flex-col">
                    <span className="font-display text-3xl font-bold text-ink tabular-nums">{score}</span>
                    <span className="font-code text-[9px] text-ink-tertiary tracking-widest">/100</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0 text-center sm:text-left">
                  <div className="font-display text-body-lg font-semibold text-ink mb-1.5">{scoreLabel}</div>
                  <p className="font-body text-[14px] text-ink-secondary leading-relaxed">
                    {score >= 80 && 'Tests run. Code reads clean. Complexity stays inside the lines.'}
                    {score < 80 && score >= 60 && 'Some drift. Coverage or complexity needs attention before the next push.'}
                    {score < 60 && 'Red flags. Review recommendations below before merging further changes.'}
                  </p>
                  {result.total_files !== undefined && (
                    <div className="mt-4 flex flex-wrap justify-center sm:justify-start gap-x-5 gap-y-1.5 font-code text-[12px] text-ink-tertiary">
                      <span className="inline-flex items-center gap-1.5"><Files size={12} /> {result.total_files} files</span>
                      <span className="inline-flex items-center gap-1.5"><Code size={12} /> {result.test_files ?? 0} test files</span>
                      <span className={cn('inline-flex items-center gap-1.5', circular > 0 && 'text-abort')}>
                        <TreeStructure size={12} /> {circular} circular dep{circular !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </ConsolePanel>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Signals — what feeds the score */}
              <ConsolePanel rail="Signals" designator="SCORE INPUTS" className="lg:col-span-3">
                <div className="divide-y divide-seam">
                  <SignalRow
                    icon={Code}
                    label="Test coverage"
                    hint="share of test files"
                    value={`${result.test_coverage}%`}
                    pct={result.test_coverage}
                    tone={toneFor(result.test_coverage, 30, 10)}
                  />
                  {result.documentation !== undefined && (
                    <SignalRow
                      icon={BookOpen}
                      label="Documentation"
                      hint="share of doc files"
                      value={`${result.documentation}%`}
                      pct={result.documentation}
                      tone={toneFor(result.documentation, 20, 5)}
                    />
                  )}
                  <SignalRow
                    icon={WarningCircle}
                    label="Maintainability"
                    value={`${maintainability}/10`}
                    pct={maintainability * 10}
                    tone={toneFor(maintainability * 10, 80, 50)}
                  />
                  {result.dependency_freshness !== undefined && (
                    <SignalRow
                      icon={TreeStructure}
                      label="Dependency load"
                      hint="imports per file"
                      value={`${result.dependency_freshness}`}
                      pct={result.dependency_freshness}
                      tone={toneFor(result.dependency_freshness)}
                    />
                  )}
                  <SignalRow
                    icon={Bug}
                    label="Complexity"
                    value={complexity}
                    pct={complexityPct}
                    tone={complexityTone}
                  />
                </div>
              </ConsolePanel>

              {/* Recommendations */}
              <ConsolePanel
                rail="Recommendations"
                designator={`${result.recommendations?.length ?? 0} ACTIONS`}
                status={result.recommendations?.length ? 'caution' : 'go'}
                className="lg:col-span-2"
              >
                {result.recommendations && result.recommendations.length > 0 ? (
                  <div className="space-y-2">
                    {result.recommendations.map((rec, i) => (
                      <div key={i} className="flex items-start gap-2.5 px-3 py-2.5 rounded-[3px] bg-base border border-seam hover:border-seam-strong transition-colors">
                        <span className="font-code text-[11px] text-ink-tertiary tabular-nums mt-0.5 shrink-0">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <CaretRight size={12} className="text-caution mt-1 shrink-0" weight="bold" />
                        <p className="font-body text-[13px] text-ink-secondary leading-relaxed flex-1">{rec}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px] text-ink-secondary py-2">Nothing to flag. Keep shipping.</p>
                )}
              </ConsolePanel>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
