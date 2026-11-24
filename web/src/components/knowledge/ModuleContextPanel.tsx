/*
 * "Why is it like this, and who do I ask?" for one module.
 *
 * Two different kinds of "who" on purpose: people who *wrote* it (git) and
 * people who have *proven* they understand it today (Knowledge Map). The
 * gap between them is the interesting part — authors leave, knowledge decays.
 */
import { useQuery } from '@tanstack/react-query'
import { ArrowSquareOut, ChatCircleText, ChatsCircle, GitCommit, Scroll, Spinner, UserCircle, Warning } from '@phosphor-icons/react'

import { fetchModuleContext } from '../../lib/api'
import { cn } from '../../lib/utils'

const label = 'text-ink-tertiary/70 uppercase tracking-widest text-[10px] mb-1'

function when(ts: string | null): string {
  if (!ts) return ''
  const n = Number(ts)
  const d = Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date(ts)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ModuleContextPanel({ owner, repo, node }: { owner: string; repo: string; node: string }) {
  const q = useQuery({
    queryKey: ['module-context', owner, repo, node],
    queryFn: () => fetchModuleContext(owner, repo, node),
  })

  if (q.isLoading) {
    return <div className="flex items-center gap-2 text-caption text-ink-tertiary border-t border-seam pt-3"><Spinner className="animate-spin" /> Gathering history…</div>
  }
  if (q.isError || !q.data) return null
  const { who, why, has_history: hasHistory } = q.data
  const discussions = why.discussions ?? []
  const empty = !why.history.length && !why.decisions.length && !why.walkthrough_notes.length && !discussions.length

  return (
    <div className="border-t border-seam pt-3 space-y-3 text-caption">
      <div>
        <div className={label}>Who to ask</div>
        {who.understands.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {who.understands.map((n) => (
              <span key={n} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[3px] bg-go/10 text-go"><UserCircle />{n}</span>
            ))}
          </div>
        ) : (
          <p className="text-ink-tertiary">Nobody has shown they understand this yet.</p>
        )}
        {who.bus_factor <= 1 && (
          <p className="text-caution flex items-center gap-1 mt-1"><Warning /> {who.bus_factor === 0 ? 'No one' : 'Only one person'} on the team understands this module.</p>
        )}
        {who.wrote.length > 0 && (
          <p className="text-ink-tertiary mt-1">
            Wrote it: {who.wrote.map((a) => `${a.name} (${a.commits})`).join(', ')}
          </p>
        )}
      </div>

      <div>
        <div className={label}>Why it's like this</div>
        {empty && (
          <p className="text-ink-tertiary">
            {hasHistory ? 'No recorded decisions or recent changes for this module.' : 'No history captured yet. Rebuild the graph to pull commit history and decision records.'}
          </p>
        )}
        <ul className="space-y-2">
          {why.decisions.map((d) => (
            <li key={d.path} className="flex gap-1.5">
              <Scroll className="text-mission shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-ink font-medium">{d.title}</div>
                <div className="font-code text-ink-tertiary truncate" title={d.path}>{d.path}</div>
                {d.excerpt && <div className="text-ink-secondary mt-0.5">{d.excerpt}</div>}
              </div>
            </li>
          ))}
          {why.walkthrough_notes.map((n, i) => (
            <li key={`${n.walkthrough_id}-${i}`} className="flex gap-1.5">
              <ChatCircleText className="text-go shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-ink-secondary">{n.note}</div>
                <div className={cn('text-ink-tertiary', n.status !== 'fresh' && 'text-caution')}>
                  {n.author || 'A senior'} · {n.walkthrough}{n.status !== 'fresh' && ' · code changed since'}
                </div>
              </div>
            </li>
          ))}
          {discussions.map((d, i) => (
            <li key={`${d.pr_number}-${d.created_at}-${i}`} className="flex gap-1.5">
              <ChatsCircle className="text-mission shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-ink-secondary whitespace-pre-wrap">{d.body}</div>
                <div className="text-ink-tertiary">
                  {d.author} in review ·{' '}
                  <a href={d.pr_url} target="_blank" rel="noreferrer" className="text-go/80 hover:text-go">PR #{d.pr_number}</a>
                  <span className="font-code"> · {d.path.split('/').pop()}{d.line ? `:${d.line}` : ''}</span>
                </div>
              </div>
            </li>
          ))}
          {why.history.map((c) => (
            <li key={c.sha} className="flex gap-1.5">
              <GitCommit className="text-ink-tertiary shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-ink-secondary">
                  {c.subject}
                  {c.pr_url && (
                    <a href={c.pr_url} target="_blank" rel="noreferrer" className="ml-1 text-go/80 hover:text-go inline-flex items-center gap-0.5">
                      PR #{c.pr_number}<ArrowSquareOut />
                    </a>
                  )}
                </div>
                <div className="text-ink-tertiary font-code">{c.sha} · {c.author}{when(c.date) && ` · ${when(c.date)}`}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
