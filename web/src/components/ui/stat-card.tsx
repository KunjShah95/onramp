import { type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface StatCardProps {
  label: string
  value: string | number
  color?: string
  icon?: ReactNode
  sub?: string
  className?: string
  onClick?: () => void
}

/**
 * Stat card — a seated instrument panel for a single telemetry value.
 * Flat by default (hairline seam, no float-shadow), lifts only on hover
 * when interactive. Values render in tabular mono; the label reads as a
 * call-sign. No motion-lift springs, no accent gradient washes.
 */
export function StatCard({
  label,
  value,
  color = 'text-ink',
  icon,
  sub,
  className,
  onClick,
}: StatCardProps) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={cn(
        'rounded-card border border-seam bg-panel shadow-seam p-5 overflow-hidden',
        'transition-[border-color,box-shadow] duration-200',
        onClick && 'cursor-pointer hover:border-seam-strong hover:shadow-lift',
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className={cn('font-code tabular-nums text-2xl md:text-3xl font-semibold tracking-tight leading-none', color)}>
            {value}
          </div>
          <div className="text-overline text-ink-muted/60 mt-2">
            {label}
          </div>
          {sub && <div className="text-caption text-ink-muted/40 mt-1">{sub}</div>}
        </div>
        {icon && (
          <div className="ml-3 shrink-0 text-ink-muted/30">{icon}</div>
        )}
      </div>
    </div>
  )
}
