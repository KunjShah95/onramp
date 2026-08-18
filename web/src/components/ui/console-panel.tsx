import { type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface ConsolePanelProps {
  children: ReactNode
  rail?: string
  designator?: string
  status?: 'go' | 'standby' | 'caution' | 'abort' | 'idle'
  action?: ReactNode
  live?: boolean
  raised?: boolean
  className?: string
  pad?: 'default' | 'dense' | 'none'
  hoverable?: boolean
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void
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
 * Section panel. Open grouping with an optional header row.
 * Cards only when the grouping is real; otherwise prefer a ruled heading.
 */
export default function ConsolePanel({
  children, rail, designator, status, action,
  raised, className, pad = 'default', hoverable, onClick,
}: ConsolePanelProps) {
  const hasRail = rail || designator || status || action
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-card border border-seam bg-panel overflow-hidden',
        raised && 'bg-panel-raised',
        hoverable && 'cursor-pointer transition-colors hover:border-seam-strong hover:bg-panel-raised',
        className,
      )}
    >
      {hasRail && (
        <div className="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-seam">
          {status && (
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full shrink-0',
                dotMap[status],
              )}
            />
          )}
          {rail && <span className="font-heading text-[13px] font-semibold text-ink">{rail}</span>}
          {designator && <span className="designator">{designator}</span>}
          {action && <div className="ml-auto flex items-center">{action}</div>}
        </div>
      )}
      <div className={padMap[pad]}>{children}</div>
    </div>
  )
}
