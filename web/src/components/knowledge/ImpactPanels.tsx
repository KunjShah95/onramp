/*
 * Blast-radius panels for the Knowledge Map.
 *
 * Everything here is graph arithmetic over the architecture snapshot plus the
 * team's demonstrated understanding — no model guesses. "Reviewers" are the
 * people who have *proven* they understand the changed modules, not whoever
 * last touched the file.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowSquareOut, GitPullRequest, Lightning, ShieldCheck, Spinner, Target, Warning } from '@phosphor-icons/react'

import {
  fetchChangeImpact, fetchPrImpact, fetchStarterIssues,
  type ChangeImpact, type StarterIssue,
} from '../../lib/api'
import ConsolePanel from '../ui/console-panel'
import { EmptyRow } from '../ui/empty-state'
import { cn } from '../../lib/utils'

const chip = 'font-code text-[11px] px-1.5 py-0.5 rounded-[3px] border transition-colors'

function shortName(id: string): string {
  const parts = id.split('/')
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : id
}

function ModuleChip({ id, tone = 'neutral', onFocus }: { id: string; tone?: 'neutral' | 'known' | 'unknown'; onFocus?: (id: string) => void }) {
  return (
    <button
      type="button"
      title={id}
      onClick={() => onFocus?.(id)}
      className={cn(
        chip,
        tone === 'known' && 'border-go/40 text-go hover:border-go',
        tone === 'unknown' && 'border-caution/40 text-caution hover:border-caution',
        tone === 'neutral' && 'border-seam text-ink-secondary hover:border-seam-strong hover:text-ink',
      )}
    >
      {shortName(id)}
    </button>
  )
}

/** Shared rendering of a change's blast radius and who can review it. */
export function ImpactSummary({ impact, onFocus }: { impact: ChangeImpact; onFocus?: (id: string) => void }) {
  const shown = impact.affected_modules.slice(0, 8)
  return (
    <div className="space-y-3 text-caption">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-ink font-medium">
          {impact.blast_radius === 0 ? 'Nothing else depends on this' : `${impact.blast_radius} module${impact.blast_radius === 1 ? '' : 's'} can break`}
        </span>
        {impact.touches_critical.length > 0 && (
          <span className="text-caution flex items-center gap-1"><Warning /> touches the critical path</span>
        )}
      </div>
      {shown.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {shown.map((m) => <ModuleChip key={m} id={m} onFocus={onFocus} />)}
          {impact.affected_modules.length > shown.length && (
            <span className="text-ink-tertiary self-center">+{impact.affected_modules.length - shown.length} more</span>
          )}
        </div>
      )}
      <div>
        <div className="text-ink-tertiary/70 uppercase tracking-widest text-[10px] mb-1">Who understands it</div>
        {impact.reviewers.length === 0 ? (
          <p className="text-ink-tertiary">Nobody on the team has shown they understand this yet.</p>
        ) : (
          <ul className="space-y-1">
            {impact.reviewers.map((r) => (
              <li key={r.uid} className="flex items-center gap-2">
                <ShieldCheck className="text-go shrink-0" />
                <span className="text-ink truncate">{r.name || r.uid}</span>
                <span className="text-ink-tertiary font-code ml-auto">
                  {r.understands_changed.length} changed · {r.understands_affected} affected
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {impact.knowledge_gaps.length > 0 && impact.reviewers.length > 0 && (
        <p className="text-caution">
          No reviewer understands {impact.knowledge_gaps.map(shortName).join(', ')}. Worth a walkthrough.
        </p>
      )}
    </div>
  )
}

/** "If you change this module…" — lazy, only when a node is selected. */
export function NodeImpact({ owner, repo, node, onFocus }: { owner: string; repo: string; node: string; onFocus?: (id: string) => void }) {
  const q = useQuery({
    queryKey: ['change-impact', owner, repo, node],
    queryFn: () => fetchChangeImpact(owner, repo, { nodes: [node] }),
  })
  return (
    <div className="border-t border-seam pt-3">
      <div className="text-ink-tertiary/70 uppercase tracking-widest text-[10px] mb-2 flex items-center gap-1"><Lightning /> If you change this</div>
      {q.isLoading && <div className="flex items-center gap-2 text-caption text-ink-tertiary"><Spinner className="animate-spin" /> Tracing dependents…</div>}
      {q.isError && <p className="text-caption text-abort">{q.error instanceof Error ? q.error.message : 'Impact unavailable'}</p>}
      {q.data && <ImpactSummary impact={q.data} onFocus={onFocus} />}
    </div>
  )
}

function StarterRow({ issue, onFocus }: { issue: StarterIssue; onFocus?: (id: string) => void }) {
  const safe = issue.blast_radius !== null && issue.unknown_modules.length === 0
  return (
    <li className="py-2.5 space-y-1.5">
      <div className="flex items-start gap-2">
        <a
          href={issue.url}
          target="_blank"
          rel="noreferrer"
          className="text-body-xs text-ink font-medium hover:text-go flex-1 min-w-0"
        >
          <span className="font-code text-ink-tertiary mr-1.5">#{issue.number}</span>{issue.title}
          <ArrowSquareOut className="inline ml-1 text-ink-tertiary" />
        </a>
        <span
          className={cn(
            'shrink-0 font-code text-[11px] px-1.5 py-0.5 rounded-[3px]',
            issue.blast_radius === null ? 'bg-seam text-ink-tertiary' : safe ? 'bg-go/10 text-go' : 'bg-caution/10 text-caution',
          )}
          title="Modules that depend on what this issue touches"
        >
          {issue.blast_radius === null ? 'radius ?' : `radius ${issue.blast_radius}`}
        </span>
      </div>
      <p className="text-caption text-ink-tertiary">{issue.reason}</p>
      {issue.modules.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {issue.known_modules.map((m) => <ModuleChip key={m} id={m} tone="known" onFocus={onFocus} />)}
          {issue.unknown_modules.map((m) => <ModuleChip key={m} id={m} tone="unknown" onFocus={onFocus} />)}
        </div>
      )}
    </li>
  )
}

/** Open issues ranked by blast radius and by what *this* developer already knows. */
export function StarterTasks({ owner, repo, onFocus }: { owner: string; repo: string; onFocus?: (id: string) => void }) {
  const [showAll, setShowAll] = useState(false)
  const q = useQuery({
    queryKey: ['starter-issues', owner, repo],
    queryFn: () => fetchStarterIssues(owner, repo),
    staleTime: 5 * 60_000,
  })
  const issues = q.data?.issues ?? []
  const visible = showAll ? issues : issues.slice(0, 5)
  return (
    <ConsolePanel rail="Safe first tasks" designator="BLAST RADIUS" status="go">
      {q.isLoading && <div className="flex items-center gap-2 text-caption text-ink-tertiary"><Spinner className="animate-spin" /> Ranking open issues…</div>}
      {q.isError && <p className="text-caption text-abort">{q.error instanceof Error ? q.error.message : 'Issues unavailable'}</p>}
      {q.isSuccess && issues.length === 0 && <EmptyRow label="No open issues found" />}
      {issues.length > 0 && (
        <>
          <p className="text-caption text-ink-tertiary mb-1">
            Smallest radius in modules you already understand first.
            {!q.data?.labelled_good_first_issue && ' No "good first issue" labels, so showing all open issues.'}
          </p>
          <ul className="divide-y divide-seam">
            {visible.map((i) => <StarterRow key={i.number} issue={i} onFocus={onFocus} />)}
          </ul>
          {issues.length > 5 && (
            <button className="text-caption text-ink-tertiary/60 hover:text-go font-semibold mt-2" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer' : `Show ${issues.length - 5} more`}
            </button>
          )}
        </>
      )}
    </ConsolePanel>
  )
}

/** Paste a PR number → what it changes, what can break, who should review. */
export function PrImpactChecker({ owner, repo, onFocus }: { owner: string; repo: string; onFocus?: (id: string) => void }) {
  const [input, setInput] = useState('')
  const [pr, setPr] = useState<number | null>(null)
  const q = useQuery({
    queryKey: ['pr-impact', owner, repo, pr],
    queryFn: () => fetchPrImpact(owner, repo, pr as number),
    enabled: pr !== null,
    retry: false,
  })
  const submit = () => {
    const n = Number.parseInt(input.replace('#', ''), 10)
    if (Number.isFinite(n) && n > 0) setPr(n)
  }
  return (
    <ConsolePanel rail="Check a pull request" designator="IMPACT">
      <form
        className="flex gap-2 mb-3"
        onSubmit={(e) => { e.preventDefault(); submit() }}
      >
        <input
          aria-label="Pull request number"
          inputMode="numeric"
          placeholder="PR #"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 bg-base border border-seam text-ink text-body-sm rounded-[3px] px-3 py-1.5 focus:outline-none focus:border-go/60 focus:ring-1 focus:ring-go/30 placeholder:text-ink-muted/50"
        />
        <button
          type="submit"
          disabled={!input.trim() || q.isFetching}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-seam text-ink-secondary text-caption font-semibold rounded-[3px] hover:border-seam-strong hover:text-ink disabled:opacity-50"
        >
          {q.isFetching ? <Spinner className="animate-spin" /> : <GitPullRequest />} Analyze
        </button>
      </form>
      {q.isError && <p className="text-caption text-abort">{q.error instanceof Error ? q.error.message : 'Impact unavailable'}</p>}
      {q.data && (
        <div className="space-y-3">
          <div className="text-caption text-ink-tertiary flex items-center gap-1.5">
            <Target /> #{q.data.pr_number} changes {q.data.changed_modules.length} module{q.data.changed_modules.length === 1 ? '' : 's'}
            {q.data.unmapped_files.length > 0 && ` (${q.data.unmapped_files.length} file${q.data.unmapped_files.length === 1 ? '' : 's'} outside the graph)`}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {q.data.changed_modules.map((m) => <ModuleChip key={m} id={m} onFocus={onFocus} />)}
          </div>
          <ImpactSummary impact={q.data} onFocus={onFocus} />
        </div>
      )}
    </ConsolePanel>
  )
}
