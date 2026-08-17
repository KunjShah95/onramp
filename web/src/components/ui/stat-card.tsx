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
 * Stat card — a flat, seated cell. Label reads as a small-cap caption,
 * value as tabular mono. No float shadow, no lift unless interactive.
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
        'rounded-card border border-seam bg-panel p-4 overflow-hidden',
        'transition-[border-color,box-shadow] duration-200',
        onClick && 'cursor-pointer hover:border-seam-strong',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="overline text-ink-muted/80">{label}</div>
          <div className={cn('font-code tabular-nums text-2xl font-semibold tracking-tight leading-none mt-2', color)}>
            {value}
          </div>
          {sub && <div className="text-caption text-ink-muted mt-1.5">{sub}</div>}
        </div>
        {icon && (
          <div className="shrink-0 text-ink-muted/40 mt-0.5">{icon}</div>
        )}
      </div>
    </div>
  )
}
