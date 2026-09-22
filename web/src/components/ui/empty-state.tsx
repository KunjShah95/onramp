import { type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  /** Optional tracked-uppercase overline (e.g. "NO MODULES"). */
  eyebrow?: string
  /** Roomy dashed container for first-run / zero-data panels. */
  framed?: boolean
  /** Compact density for rows inside cards and tables. */
  compact?: boolean
  className?: string
}

/**
 * EmptyState — an instrumented "nothing here yet" state, not a placeholder.
 * A seated icon tile, an optional overline that names the surface, a clear
 * title, a reason it matters, and an action when there is one to take.
 *
 * Icon sizing/colour is normalized inside the tile, so call sites can pass a
 * bare icon and it renders consistently (size 20px, ink-tertiary).
 */
export function EmptyState({ icon, title, description, action, eyebrow, framed, compact, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-6 px-4' : 'py-14 px-6',
        framed && 'empty-panel',
        className,
      )}
    >
      <div className="empty-tile w-11 h-11 rounded-card border border-seam bg-panel-raised flex items-center justify-center mb-4 [&>svg]:w-5 [&>svg]:h-5 [&>svg]:text-ink-tertiary">
        {icon ?? null}
      </div>
      {eyebrow && (
        <div className="overline text-ink-muted mb-1.5">{eyebrow}</div>
      )}
      <p className="text-body-sm font-semibold text-ink text-balance">{title}</p>
      {description && (
        <p className="text-caption text-ink-muted max-w-[280px] leading-relaxed mt-1.5 text-pretty">
          {description}
        </p>
      )}
      {action && (
        <div className="mt-5 flex flex-col sm:flex-row items-center gap-2">{action}</div>
      )}
    </div>
  )
}

/**
 * EmptyRow — single-line zero-data row for lists and table bodies.
 * Keeps the same voice as EmptyState at row density.
 */
export function EmptyRow({ label = 'Nothing here yet', className }: { label?: string; className?: string }) {
  return (
    <p className={cn('text-center py-6 text-body-sm text-ink-muted', className)}>
      {label}
    </p>
  )
}
