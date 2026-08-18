import { type ReactNode } from 'react'
import { cn } from '../../../lib/utils'

type Verdict = 'go' | 'hold' | 'standby'

interface StatusVerdictProps {
  /** 'go' = green, 'hold' = amber, 'standby' = blue. */
  verdict: Verdict
  /** One-line verdict (e.g. "All systems GO"). */
  label: string
  /** Sub-line beneath the label (e.g. "3 reviews pending"). */
  detail?: string
  /** Right-side slot — typically a primary action button. */
  action?: ReactNode
  className?: string
}

const VERDICT = {
  go: { dot: 'bg-go', text: 'text-go' },
  hold: { dot: 'bg-caution', text: 'text-caution' },
  standby: { dot: 'bg-mission', text: 'text-mission' },
} as const

/**
 * Verdict — one dot, one line of truth, one action. Rendered as a ruled
 * strip (hairline top + bottom), not a card: it is context for the page,
 * not a container for content.
 */
export default function StatusVerdict({ verdict, label, detail, action, className }: StatusVerdictProps) {
  const v = VERDICT[verdict]
  return (
    <div className={cn(
      'flex items-center justify-between gap-6 border-y border-seam py-3.5',
      className,
    )}>
      <div className="flex items-center gap-3 min-w-0">
        <span className={cn('h-2 w-2 rounded-full shrink-0', v.dot)} />
        <div className="min-w-0">
          <div className={cn('font-heading text-[15px] font-semibold tracking-tight leading-none', v.text)}>{label}</div>
          {detail && (
            <div className="mt-1 font-body text-[13px] text-ink-secondary truncate">{detail}</div>
          )}
        </div>
      </div>
      {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
    </div>
  )
}