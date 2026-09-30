/*
 * GroundingPanel — shows how much of an AI answer the repository graph backs.
 *
 * The check is deterministic (import graph, not a second model), so the copy
 * is careful: "backed by the graph" / "no import path found" / "file not in
 * repo" — never "correct" or "wrong" about behaviour we didn't verify.
 */
import { useState } from 'react'
import { CaretDown, CheckCircle, Question, ShieldCheck, Warning } from '@phosphor-icons/react'

import type { AnswerGrounding } from '../../lib/api'
import { cn } from '../../lib/utils'

const VERDICT = {
  direct: { label: 'direct import', cls: 'text-go', Icon: CheckCircle },
  indirect: { label: 'via other modules', cls: 'text-go/80', Icon: CheckCircle },
  unsupported: { label: 'no import path found', cls: 'text-caution', Icon: Warning },
} as const

function shortName(id: string): string {
  const parts = id.split('/')
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : id
}

export default function GroundingPanel({ grounding }: { grounding: AnswerGrounding }) {
  const [open, setOpen] = useState(false)
  if (!grounding.available || !grounding.summary) return null
  const { summary } = grounding
  const claims = grounding.claims ?? []
  const unknown = grounding.unknown_paths ?? []
  if (summary.paths_checked === 0 && summary.claims_checked === 0) return null

  const problems = summary.unsupported_claims + summary.unknown_paths
  const headline = problems === 0
    ? `Backed by the repo graph: ${summary.paths_checked} file${summary.paths_checked === 1 ? '' : 's'}${summary.claims_checked ? `, ${summary.claims_checked} relationship${summary.claims_checked === 1 ? '' : 's'}` : ''}`
    : `${problems} statement${problems === 1 ? '' : 's'} not backed by the repo graph`

  return (
    <div className={cn('mt-2 rounded-[3px] border text-caption', problems ? 'border-caution/40 bg-caution/5' : 'border-go/30 bg-go/5')}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left"
      >
        {problems ? <Warning className="text-caution shrink-0" /> : <ShieldCheck className="text-go shrink-0" />}
        <span className={cn('font-medium', problems ? 'text-caution' : 'text-go')}>{headline}</span>
        <CaretDown className={cn('ml-auto text-ink-tertiary transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="px-2.5 pb-2.5 space-y-2 border-t border-seam/60 pt-2">
          {unknown.length > 0 && (
            <div>
              <div className="text-ink-tertiary/70 uppercase tracking-widest text-[10px] mb-1">Files not in this repository</div>
              <ul className="space-y-0.5">
                {unknown.map((p) => (
                  <li key={p} className="flex items-center gap-1.5 font-code text-caution"><Question className="shrink-0" />{p}</li>
                ))}
              </ul>
            </div>
          )}
          {claims.length > 0 && (
            <div>
              <div className="text-ink-tertiary/70 uppercase tracking-widest text-[10px] mb-1">Relationships checked</div>
              <ul className="space-y-1">
                {claims.map((c, i) => {
                  const v = VERDICT[c.verdict]
                  return (
                    <li key={i} className="flex items-start gap-1.5" title={c.sentence}>
                      <v.Icon className={cn('shrink-0 mt-0.5', v.cls)} />
                      <span className="font-code text-ink-secondary">
                        {shortName(c.source)} <span className="text-ink-tertiary">{c.relation}</span> {shortName(c.target)}
                      </span>
                      <span className={cn('ml-auto shrink-0', v.cls)}>{v.label}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          <p className="text-ink-tertiary">
            Checked against the import graph, not another model. Behavioural claims aren't verified.
          </p>
        </div>
      )}
    </div>
  )
}
