import { type ReactNode } from 'react'
import { cn } from '../../../lib/utils'

type Verdict = 'go' | 'hold' | 'standby'

interface StatusVerdictProps {
  /** 'go' = green, 'hold' = amber, 'standby' = blue. */
  verdict: Verdict
  /** One-line verdict (e.g. "All systems GO"). Tracked uppercase. */
  label: string
  /** Sub-line beneath the label (e.g. "3 reviews pending"). */
  detail?: string
  /** Right-side slot — typically a primary action button. */
  action?: ReactNode
  className?: string
}

const VERDICT = {
  go: { dot: 'bg-go-lit', text: 'text-go' },
  hold: { dot: 'bg-caution-lit', text: 'text-caution' },
  standby: { dot: 'bg-mission-lit', text: 'text-mission' },
} as const

/**
 * Mission-status verdict. The single thing you see at 5 meters: GO / HOLD /
 * STANDBY, one big dot, one line of truth, one action. Use once per page.
 */
export default function StatusVerdict({ verdict, label, detail, action, className }: StatusVerdictProps) {
  const v = VERDICT[verdict]
  return (
    <div className={cn(
      'flex items-center justify-between gap-6 rounded-card border border-seam bg-panel px-5 py-4',
      className,
    )}>
      <div className="flex items-center gap-3.5 min-w-0">
        <span className={cn('h-2.5 w-2.5 rounded-full shrink-0 motion-safe:animate-pulse-glow', v.dot)} />
        <div className="min-w-0">
          <div className={cn('callsign', v.text)}>{label}</div>
          {detail && (
            <div className="mt-0.5 font-body text-[13px] text-ink-secondary truncate">{detail}</div>
          )}
        </div>
      </div>
      {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
    </div>
  )
}