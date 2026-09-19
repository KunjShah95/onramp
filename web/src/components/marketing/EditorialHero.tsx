import { type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface EditorialHeroProps {
  /** Mono folio index line, e.g. "Contact — 01". Renders as the index kicker. */
  index: string
  title: ReactNode
  lede?: ReactNode
  actions?: ReactNode
  className?: string
}

/**
 * EditorialHero — the shared opener for public marketing pages.
 *
 * Folio kicker → display title → lede → optional actions, hard-left aligned
 * and closed with a hairline. Deliberately badge-free: no pill, no dot chip,
 * no rounded frame. Hierarchy comes from the type scale and the kicker rule,
 * per DESIGN.md ("Precision over Decoration").
 */
export default function EditorialHero({
  index,
  title,
  lede,
  actions,
  className,
}: EditorialHeroProps) {
  return (
    <header className={cn('max-w-3xl border-b border-seam pb-9', className)}>
      <p className="index-kicker">{index}</p>
      <h1 className="mt-4 font-body text-[clamp(2rem,4.4vw,2.85rem)] font-bold leading-[1.06] tracking-[-0.03em] text-ink">
        {title}
      </h1>
      {lede && (
        <p className="mt-4 max-w-2xl text-[17px] leading-[1.6] text-ink-secondary">{lede}</p>
      )}
      {actions && <div className="mt-7 flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  )
}
