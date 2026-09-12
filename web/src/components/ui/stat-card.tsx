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
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`${label}: ${value}`}
        className={cn(
          'rounded-card border border-seam bg-panel p-4 overflow-hidden text-left w-full',
          'transition-[border-color,box-shadow] duration-200',
          'cursor-pointer hover:border-seam-strong',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-go/50',
          className
        )}
      >
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="overline text-ink-muted/80 block">{label}</span>
            <span className={cn('font-code tabular-nums text-2xl font-semibold tracking-tight leading-none mt-2 block', color)}>
              {value}
            </span>
            {sub && <span className="text-caption text-ink-muted mt-1.5 block">{sub}</span>}
          </span>
          {icon && (
            <span className="shrink-0 text-ink-muted/40 mt-0.5" aria-hidden>{icon}</span>
          )}
        </span>
      </button>
    )
  }
  return (
    <div
      className={cn(
        'rounded-card border border-seam bg-panel p-4 overflow-hidden',
        'transition-[border-color,box-shadow] duration-200',
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
