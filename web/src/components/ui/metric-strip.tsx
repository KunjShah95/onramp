import { type ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * Metric strip — the workbench alternative to a grid of floating stat cards.
 * One ruled panel; each cell is split from its neighbour by a hairline.
 * Compose with `grid-cols-2 lg:grid-cols-4` (etc.) on the strip; the mobile
 * fallback collapses to two columns with internal rules (see .metric-strip).
 */
export function MetricStrip({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('metric-strip', className)}>{children}</div>
}

interface MetricCellProps {
  label: string
  value: ReactNode
  /** Tailwind text-color class for the value (defaults to ink). */
  accent?: string
  sub?: ReactNode
  className?: string
}

export function MetricCell({ label, value, accent, sub, className }: MetricCellProps) {
  return (
    <div className={cn('metric-cell', className)}>
      <div className="overline text-ink-muted/80">{label}</div>
      <div className={cn('font-code tabular-nums text-2xl md:text-[28px] font-semibold leading-none mt-2', accent ?? 'text-ink')}>
        {value}
      </div>
      {sub && <div className="text-caption text-ink-muted mt-1.5">{sub}</div>}
    </div>
  )
}
