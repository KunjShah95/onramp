/*
 * THESIS: Authenticated chrome is a library spine: find your place, then work.
 *   Refuses a huge icon carnival sidebar and a mission-clock top bar.
 * OWN-WORLD: Cool reading-room rail, 3px teal spine on the current item,
 *   Schibsted wordmark, sentence-case groups (Home / Daily / Ship / People / Steward).
 * STORY: A role-fluent engineer can name where they are in one glance.
 * FIRST VIEWPORT: 212px rail, 48px bar, open table. Primary action lives in the page, not the chrome.
 * FORM: Library stacks (assigned direction 5) + wound-medium staging for progress.
 */
import { type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface PageHeaderProps {
  title: string
  subtitle?: string
  pills?: { label: string; value: string | number; color?: string }[]
  actions?: ReactNode
  mono?: boolean
  /** Call number shown beside the title, e.g. "ONB.04". */
  eyebrow?: string
  flush?: boolean
  className?: string
}

export function PageHeader({ title, subtitle, pills, actions, mono, eyebrow, flush, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col md:flex-row md:items-end justify-between gap-4', flush ? 'mb-4' : 'mb-6', className)}>
      <div className="min-w-0">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="spine-band h-5 self-center" aria-hidden />
          <h1 className={cn('font-display text-display-md text-ink tracking-tight min-w-0', mono && 'font-code')}>
            {title}
          </h1>
          {eyebrow && (
            <span className="hidden sm:inline font-code text-[11px] text-ink-muted tabular-nums tracking-wide shrink-0">
              {eyebrow}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-body-sm text-ink-tertiary mt-1.5 max-w-xl ml-[15px]">{subtitle}</p>
        )}
        {pills && pills.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-3 ml-[15px]">
            {pills.map((p, i) => (
              <span key={i} className="inline-flex items-baseline gap-1.5">
                <span className={cn('font-code font-medium tabular-nums text-body-sm', p.color ?? 'text-ink')}>{p.value}</span>
                <span className="text-caption text-ink-muted">{p.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2.5 shrink-0">{actions}</div>
      )}
    </div>
  )
}
