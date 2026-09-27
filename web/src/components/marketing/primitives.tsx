import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Plus } from '@phosphor-icons/react'
import { cn } from '../../lib/utils'
import { prefetchProps } from '../../lib/prefetch'
import { track, useSectionView } from '../../lib/track'

/* Shared building blocks for every public page, so the landing page and the
 * sub-pages speak one visual language: mono labels, claim headings, one
 * primary action style, hairline cards with an inner highlight. */

/** Milliseconds after which a section is revealed regardless of scroll state. */
const REVEAL_FAILSAFE_MS = 1500

/**
 * Reveal a section as it enters the viewport.
 *
 * The hidden state is applied from inside the effect, never from JSX, and only
 * once we know IntersectionObserver exists. That ordering is the whole point:
 * if the observer is unavailable, the throws, or the element is somehow never
 * intersected, the content is simply visible. Losing the animation is a fair
 * trade; content that never appears is not. The timer is the second guard.
 */
function useScrollReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') return

    const reveal = () => {
      el.classList.add('mk-in')
      io.disconnect()
      clearTimeout(timer)
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) reveal()
      },
      // Fire slightly before the section is fully on screen so the entrance
      // reads as deliberate rather than as a late pop.
      { rootMargin: '0px 0px -10% 0px', threshold: 0 },
    )

    // Apply the hidden state only now that we can guarantee it will be undone.
    el.classList.add('mk-reveal')
    io.observe(el)

    const timer = setTimeout(reveal, REVEAL_FAILSAFE_MS)
    return () => {
      clearTimeout(timer)
      io.disconnect()
    }
  }, [])

  return ref
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('mk-label', className)}>{children}</p>
}

export function SectionHeader({
  label,
  title,
  lede,
  align = 'left',
  className,
}: {
  label?: string
  title: ReactNode
  lede?: ReactNode
  align?: 'left' | 'center'
  className?: string
}) {
  return (
    <div className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center', className)}>
      {label && <Label>{label}</Label>}
      <h2 className="mt-3 text-[28px] font-semibold leading-[1.1] tracking-[-0.025em] text-ink sm:text-[36px]">
        {title}
      </h2>
      {lede && (
        <p
          className={cn(
            'mt-4 max-w-xl text-[16px] leading-[1.6] text-ink-secondary',
            align === 'center' && 'mx-auto',
          )}
        >
          {lede}
        </p>
      )}
    </div>
  )
}

export function PageHero({
  label,
  title,
  lede,
  actions,
  className,
}: {
  label: string
  title: ReactNode
  lede?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('max-w-3xl', className)}>
      <Label className="mk-rise">{label}</Label>
      <h1
        className="mk-rise mt-4 text-[clamp(2.2rem,5vw,3.5rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-ink"
        style={{ '--i': 1 } as React.CSSProperties}
      >
        {title}
      </h1>
      {lede && (
        <p
          className="mk-rise mt-5 max-w-2xl text-[17px] leading-[1.6] text-ink-secondary"
          style={{ '--i': 2 } as React.CSSProperties}
        >
          {lede}
        </p>
      )}
      {actions && (
        <div className="mk-rise mt-8 flex flex-wrap items-center gap-3" style={{ '--i': 3 } as React.CSSProperties}>
          {actions}
        </div>
      )}
    </header>
  )
}

const BTN_BASE =
  'group inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-[14.5px] font-medium transition-[background-color,opacity,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-go focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--room)]'

export function PrimaryCta({
  to,
  children,
  className,
  placement,
}: {
  to: string
  children: ReactNode
  className?: string
  /** Where on the page this CTA sits, so the funnel knows which one converts. */
  placement?: string
}) {
  return (
    <Link
      to={to}
      {...prefetchProps(to)}
      onClick={() => track('cta_click', { placement: placement ?? 'unknown', href: to })}
      className={cn(BTN_BASE, 'bg-ink text-[var(--room)] hover:opacity-90', className)}
    >
      {children}
      <ArrowRight size={15} weight="bold" className="transition-transform duration-150 group-hover:translate-x-0.5" />
    </Link>
  )
}

export function SecondaryCta({
  to,
  children,
  className,
  placement,
}: {
  to: string
  children: ReactNode
  className?: string
  placement?: string
}) {
  const isAnchor = to.startsWith('#')
  const cls = cn(BTN_BASE, 'border border-seam-strong bg-transparent text-ink hover:bg-well', className)
  const onClick = () => track('cta_click', { placement: placement ?? 'unknown', href: to })
  return isAnchor ? (
    <a href={to} onClick={onClick} className={cls}>
      {children}
    </a>
  ) : (
    <Link to={to} {...prefetchProps(to)} onClick={onClick} className={cls}>
      {children}
    </Link>
  )
}

export function Section({
  id,
  children,
  className,
  band = false,
}: {
  id?: string
  children: ReactNode
  className?: string
  band?: boolean
}) {
  const revealRef = useScrollReveal<HTMLElement>()
  useSectionView(id)
  return (
    <section
      id={id}
      ref={revealRef}
      className={cn('landing-section scroll-mt-20 border-t border-seam', band ? 'bg-base' : 'bg-room', className)}
    >
      <div className="mx-auto max-w-6xl px-6 py-20 lg:px-8 lg:py-28">{children}</div>
    </section>
  )
}

export interface Faq {
  q: string
  a: string
}

/** Visible FAQ. Pair with `faqSchema(items)` so markup and JSON-LD never drift. */
export function FaqList({ items }: { items: Faq[] }) {
  return (
    <div className="divide-y divide-seam border-y border-seam">
      {items.map((f) => (
        <details key={f.q} className="group py-5">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-left text-[15.5px] font-medium text-ink [&::-webkit-details-marker]:hidden">
            {f.q}
            <Plus
              size={16}
              weight="bold"
              className="mt-1 shrink-0 text-ink-tertiary transition-transform duration-200 group-open:rotate-45"
            />
          </summary>
          <p className="mt-3 max-w-2xl text-[15px] leading-[1.65] text-ink-secondary">{f.a}</p>
        </details>
      ))}
    </div>
  )
}

export function faqSchema(items: Faq[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }
}

/** Closing call to action shared by every public page. */
export function CtaBand({
  title = 'Your next hire starts on a Monday. Have the map ready.',
  lede = 'Connect a repository in about a minute. Free for one repo, no card needed.',
}: {
  title?: ReactNode
  lede?: ReactNode
}) {
  return (
    <section className="border-t border-seam bg-room">
      <div className="mx-auto max-w-6xl px-6 py-20 lg:px-8 lg:py-24">
        <div className="mk-card relative overflow-hidden px-6 py-14 sm:px-14">
          <div className="mk-dots pointer-events-none absolute inset-0" aria-hidden />
          <div className="relative max-w-2xl">
            <h2 className="text-[30px] font-semibold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[40px]">
              {title}
            </h2>
            <p className="mt-4 text-[16px] leading-[1.6] text-ink-secondary">{lede}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <PrimaryCta to="/register" placement="closing-band">Start free</PrimaryCta>
              <SecondaryCta to="/contact" placement="closing-band">Talk to us</SecondaryCta>
            </div>
            <ol className="mt-10 grid grid-cols-1 gap-4 border-t border-seam pt-6 sm:grid-cols-3">
              {[
                ['01', 'Connect GitHub', 'Read-only. About 30 seconds.'],
                ['02', 'Index the repo', '2 to 10 minutes for most codebases.'],
                ['03', 'Invite the new hire', 'They land on the map, not a wiki.'],
              ].map(([n, t, d]) => (
                <li key={n}>
                  <span className="mk-label">{n}</span>
                  <p className="mt-1.5 text-[14px] font-medium text-ink">{t}</p>
                  <p className="mt-0.5 text-[13px] text-ink-tertiary">{d}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  )
}
