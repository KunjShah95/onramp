import { useEffect, useState } from 'react'
import {
  PersonArmsSpread,
  Gauge,
  CheckCircle,
  WarningCircle,
  Timer,
} from '@phosphor-icons/react'
import { useAuth } from '../../context/AuthContext'
import {
  fetchReviewerLoad,
  fetchConsistencyScores,
  suggestReviewer,
  type ReviewerLoadResponse,
  type ConsistencyResponse,
  type ReviewerSuggestionResponse,
} from '../../lib/api'
import { cn } from '../../lib/utils'
import ConsolePanel from '../ui/console-panel'

/** Load tone: ≥75 busy (abort), ≥40 warm (caution), else clear. */
function loadTone(score: number): 'go' | 'caution' | 'abort' {
  if (score >= 75) return 'abort'
  if (score >= 40) return 'caution'
  return 'go'
}

/** Consistency tone: ≥70 go, ≥40 caution, below abort; no score → idle. */
function scoreTone(score: number | null): 'go' | 'caution' | 'abort' | 'idle' {
  if (score == null) return 'idle'
  if (score >= 70) return 'go'
  if (score >= 40) return 'caution'
  return 'abort'
}

const TONE_CLASS = {
  go: 'bg-go/10 text-go border-go/30',
  caution: 'bg-caution/10 text-caution border-caution/30',
  abort: 'bg-abort/10 text-abort border-abort/30',
  idle: 'bg-base text-ink-tertiary border-seam',
} as const

const BAR_TONE = { go: 'bg-go', caution: 'bg-caution', abort: 'bg-abort' } as const

/**
 * Review Ops (v1.5) — load balancing + consistency on top of the review queue.
 *
 * Self-contained console panel (same rail/designator/LED language as
 * DoraMetricsPanel / RampPanel): shows the least-loaded reviewer suggestion,
 * a per-reviewer load board, and consistency scores. Best-effort — any
 * failing fetch renders a compact fallback instead of breaking the page.
 */
export default function ReviewOpsPanel({ teamId }: { teamId?: string }) {
  const { activeTeamId } = useAuth()
  const resolvedId = (teamId || activeTeamId || '').trim()

  const [load, setLoad] = useState<ReviewerLoadResponse | null>(null)
  const [suggestion, setSuggestion] = useState<ReviewerSuggestionResponse | null>(null)
  const [consistency, setConsistency] = useState<ConsistencyResponse | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!resolvedId) return
    let cancelled = false
    // Reset first so a team switch never flashes the previous team's board.
    setLoad(null)
    setSuggestion(null)
    setConsistency(null)
    setFailed(false)
    Promise.allSettled([
      fetchReviewerLoad(resolvedId),
      suggestReviewer(resolvedId),
      fetchConsistencyScores(resolvedId),
    ]).then(([l, s, c]) => {
      if (cancelled) return
      setLoad(l.status === 'fulfilled' ? l.value : null)
      setSuggestion(s.status === 'fulfilled' ? s.value : null)
      setConsistency(c.status === 'fulfilled' ? c.value : null)
      setFailed(l.status === 'rejected' && s.status === 'rejected' && c.status === 'rejected')
    })
    return () => { cancelled = true }
  }, [resolvedId])

  if (!resolvedId || failed) return null

  const reviewers = load?.reviewers ?? []
  const maxLoad = reviewers.length ? Math.max(...reviewers.map((r) => r.load_score)) : 0
  const status = reviewers.length ? loadTone(maxLoad) : 'go'
  const pick = suggestion?.suggestion

  return (
    <ConsolePanel
      rail={reviewers.length ? 'Load board' : 'Review ops'}
      designator={pick ? `${pick.name.toUpperCase()} NEXT` : `${reviewers.length} REVIEWERS`}
      status={status}
      live={status !== 'abort'}
    >
      {/* Next-reviewer suggestion */}
      {pick && (
        <div className="flex items-center gap-3 rounded-[3px] border border-go/25 bg-go/[0.06] px-3 py-2.5 mb-3">
          <div className="w-8 h-8 rounded-[3px] bg-go/10 border border-go/25 flex items-center justify-center shrink-0">
            <PersonArmsSpread size={14} weight="fill" className="text-go" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-ink leading-tight">
              Next review → {pick.name}
              <span className="text-ink-tertiary font-normal">
                {' '}· {pick.role || 'reviewer'}
              </span>
            </p>
            <p className="text-[11px] text-ink-tertiary font-code mt-0.5">
              LEAST LOADED · {pick.pending} PENDING · LOAD {pick.load_score}
              {pick.rework_pct != null && ` · REWORK ${pick.rework_pct}%`}
            </p>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-go shrink-0">
            Suggested
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Load board */}
        <div>
          <p className="overline text-ink-muted/60 mb-2">Reviewer load</p>
          {reviewers.length === 0 ? (
            <p className="text-[11px] text-ink-tertiary">No reviewers on this team yet.</p>
          ) : (
            <div className="space-y-2">
              {reviewers.slice(0, 6).map((r) => {
                const tone = loadTone(r.load_score)
                return (
                  <div key={r.user_id} className="flex items-center gap-2.5">
                    <span className="text-[11px] text-ink-secondary w-24 truncate font-medium">{r.name}</span>
                    <span className="text-[10px] font-code text-ink-tertiary w-14 shrink-0 tabular-nums">
                      {r.pending} pend · {r.in_review} act
                    </span>
                    <div className="flex-1 h-1 rounded-full bg-base border border-seam overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', BAR_TONE[tone])}
                        style={{ width: `${Math.max(4, r.load_score)}%` }}
                      />
                    </div>
                    <span className={cn('text-[10px] font-code tabular-nums w-7 text-right', tone === 'go' ? 'text-go' : tone === 'caution' ? 'text-caution' : 'text-abort')}>
                      {r.load_score}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Consistency */}
        <div>
          <p className="overline text-ink-muted/60 mb-2">Consistency</p>
          {!consistency || consistency.reviewers.length === 0 ? (
            <p className="text-[11px] text-ink-tertiary">Not enough reviews to score yet.</p>
          ) : (
            <div className="space-y-2">
              {consistency.reviewers.slice(0, 6).map((r) => {
                const tone = scoreTone(r.score)
                return (
                  <div key={r.user_id} className="flex items-center gap-2.5">
                    <span className="text-[11px] text-ink-secondary w-24 truncate font-medium">{r.name}</span>
                    <span className="text-[10px] font-code text-ink-tertiary flex-1 tabular-nums">
                      {r.reviews} rev · {r.rework_rate_pct ?? 0}% rework
                      {r.avg_turnaround_hours != null && (
                        <span className="inline-flex items-center gap-0.5 ml-2">
                          <Timer size={9} /> {Math.round(r.avg_turnaround_hours)}h
                        </span>
                      )}
                    </span>
                    <span className={cn(
                      'px-1.5 py-0.5 rounded-[2px] text-[10px] font-semibold tabular-nums border',
                      TONE_CLASS[tone]
                    )}>
                      {r.score != null ? r.score : 'N/A'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-3 pt-2 border-t border-seam text-[10px] text-ink-tertiary font-code">
        <span className="inline-flex items-center gap-1"><Gauge size={10} /> load = pending×25 + active×12</span>
        <span className="inline-flex items-center gap-1"><CheckCircle size={10} /> score ≥70</span>
        <span className="inline-flex items-center gap-1"><WarningCircle size={10} /> &lt;40</span>
      </div>
    </ConsolePanel>
  )
}
