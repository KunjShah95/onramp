import { type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface ConsolePanelProps {
  children: ReactNode
  /** Call-sign header (tracked uppercase). Names a real console position. */
  rail?: string
  /** Mono designator shown next to the call-sign (position code / count). */
  designator?: string
  /** Status LED colour. `go` also pulses when `live`. */
  status?: 'go' | 'standby' | 'caution' | 'abort' | 'idle'
  /** Right-aligned control(s) in the rail (e.g. a "view all" link). */
  action?: ReactNode
  /** Blink the LED to signal a live telemetry feed. */
  live?: boolean
  raised?: boolean
  className?: string
  /** Body padding preset. `dense` = 12–16px for tables. */
  pad?: 'default' | 'dense' | 'none'
  hoverable?: boolean
}

const dotMap = {
  go: 'bg-go-lit',
  standby: 'bg-mission-lit',
  caution: 'bg-caution-lit',
  abort: 'bg-abort-lit',
  idle: 'bg-ink-disabled',
} as const

const padMap = {
  default: 'p-5',
  dense: 'p-3.5',
  none: '',
} as const

/**
 * Console Panel (signature). A seated instrument panel with an optional
 * call-sign rail carrying a position label, mono designator, live LED, and
 * an action slot. Flat by default — lifts only on hover when interactive.
 */
export default function ConsolePanel({
  children, rail, designator, status, action, live,
  raised, className, pad = 'default', hoverable,
}: ConsolePanelProps) {
  const hasRail = rail || designator || status || action
  return (
    <div
      className={cn(
        'rounded-card border border-seam bg-panel shadow-seam overflow-hidden',
        raised && 'bg-panel-raised',
        (hoverable || raised) && 'transition-[box-shadow,border-color,transform] duration-200',
        hoverable && 'cursor-pointer hover:shadow-lift hover:border-seam-strong',
        className,
      )}
    >
      {hasRail && (
        <div className="console-rail">
          {status && (
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full shrink-0',
                dotMap[status],
                live && status === 'go' && 'motion-safe:animate-pulse-glow',
              )}
            />
          )}
          {rail && <span className="callsign opacity-60">{rail}</span>}
          {designator && <span className="designator">{designator}</span>}
          {action && <div className="ml-auto flex items-center">{action}</div>}
        </div>
      )}
      <div className={padMap[pad]}>{children}</div>
    </div>
  )
}
