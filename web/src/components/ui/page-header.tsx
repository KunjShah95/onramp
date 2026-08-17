/*
 * Page header — THE WORKBENCH editorial folio.
 *   Kicker (mono folio index) → display title with a 3px signal rule →
 *   subtitle → quiet readout pills. Actions sit on the far right.
 *   The header reads like a section opener in a technical journal:
 *   index first, statement second, detail third.
 */
import { type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface PageHeaderProps {
  title: string
  subtitle?: string
  pills?: { label: string; value: string | number; color?: string }[]
  actions?: ReactNode
  mono?: boolean
  /** Folio index shown above the title, e.g. "01 — Tasks". Rendered as a mono kicker. */
  eyebrow?: string
  flush?: boolean
  className?: string
}

export function PageHeader({ title, subtitle, pills, actions, mono, eyebrow, flush, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col md:flex-row md:items-end justify-between gap-4', flush ? 'mb-4' : 'mb-6', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="index-kicker mb-2.5">
            {eyebrow}
          </div>
        )}
        <div className="flex items-center gap-3 min-w-0">
          <h1
            className={cn(
              'font-display text-display-lg md:text-display-xl text-ink tracking-tight min-w-0',
              mono && 'font-code'
            )}
          >
            {title}
          </h1>
          <span className="rule-accent hidden md:inline-block self-center shrink-0" aria-hidden />
        </div>
        {subtitle && (
          <p className="text-body-sm text-ink-tertiary mt-2 max-w-xl">{subtitle}</p>
        )}
        {pills && pills.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 mt-3">
            {pills.map((p, i) => (
              <span key={i} className="inline-flex items-baseline gap-1.5">
                <span className={cn('font-code font-medium tabular-nums text-body-sm', p.color ?? 'text-ink')}>{p.value}</span>
                <span className="overline">{p.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">{actions}</div>
      )}
    </div>
  )
}
