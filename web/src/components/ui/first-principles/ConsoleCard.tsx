import { type ReactNode } from 'react'
import { cn } from '../../../lib/utils'

interface ConsoleCardProps {
  children: ReactNode
  /** Call-sign header. Tracked uppercase. Names what this surface IS. */
  rail?: string
  /** Mono designator next to the call-sign. */
  designator?: string
  /** Status LED color. */
  status?: 'go' | 'standby' | 'caution' | 'abort' | 'idle'
  /** Right-aligned action slot. */
  action?: ReactNode
  /** Body padding. default = 20px. */
  pad?: 'default' | 'dense' | 'none'
  className?: string
}

const LED = {
  go: 'bg-go-lit',
  standby: 'bg-mission-lit',
  caution: 'bg-caution-lit',
  abort: 'bg-abort-lit',
  idle: 'bg-ink-disabled',
} as const

const PAD = { default: 'p-5', dense: 'p-4', none: '' } as const

/**
 * Seated instrument card. One seam, one call-sign rail, one body. Same DNA as
 * the Mission Control console panel, but leaner — no shadow lift on hover,
 * no LED pulse. Use when the surface needs to feel seated, not interactive.
 */
export default function ConsoleCard({
  children, rail, designator, status, action, pad = 'default', className,
}: ConsoleCardProps) {
  const hasRail = rail || designator || status || action
  return (
    <div className={cn('rounded-card border border-seam bg-panel overflow-hidden', className)}>
      {hasRail && (
        <div className="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-seam">
          {status && <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', LED[status])} />}
          {rail && <span className="callsign opacity-60">{rail}</span>}
          {designator && <span className="designator">{designator}</span>}
          {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={PAD[pad]}>{children}</div>
    </div>
  )
}