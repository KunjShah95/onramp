import { type ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  /** Optional tracked-uppercase overline (e.g. "NO MODULES"). */
  eyebrow?: string
}

/**
 * EmptyState — an instrumented "nothing here yet" state, not a placeholder.
 * A seated icon tile, an optional overline that names the surface, a clear
 * title, a reason it matters, and an action when there is one to take.
 *
 * Icon sizing/colour is normalized inside the tile, so call sites can pass a
 * bare icon and it renders consistently (size 20px, ink-tertiary).
 */
export function EmptyState({ icon, title, description, action, eyebrow }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
      <div className="w-11 h-11 rounded-card border border-seam bg-panel-raised flex items-center justify-center mb-4 [&>svg]:w-5 [&>svg]:h-5 [&>svg]:text-ink-tertiary">
        {icon ?? null}
      </div>
      {eyebrow && (
        <div className="overline text-ink-muted mb-1.5">{eyebrow}</div>
      )}
      <p className="text-body-sm font-semibold text-ink">{title}</p>
      {description && (
        <p className="text-caption text-ink-muted max-w-[280px] leading-relaxed mt-1.5">
          {description}
        </p>
      )}
      {action && (
        <div className="mt-5 flex items-center gap-2">{action}</div>
      )}
    </div>
  )
}
