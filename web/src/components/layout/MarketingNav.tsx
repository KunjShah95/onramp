import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { TreeStructure, List, X } from '@phosphor-icons/react'

import { prefetchProps } from '../../lib/prefetch'
import ThemeToggle from '../landing/ThemeToggle'
import { cn } from '../../lib/utils'

export interface NavLinkItem {
  label: string
  href: string
  /** Deprecated: active state now comes from the current route. */
  active?: boolean
}

interface MarketingNavProps {
  /** Optional custom links. Defaults to the shared public sitemap. */
  links?: NavLinkItem[]
  /** Whether the nav should be fixed (vs static). Default true. */
  fixed?: boolean
}

export const DEFAULT_LINKS: NavLinkItem[] = [
  { label: 'Product', href: '/#product' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'Why Onramp', href: '/why-onramp' },
  { label: 'Docs', href: '/docs' },
]

/* One nav for every public surface. Hairline bar that gains a translucent
 * backdrop once the page scrolls; brand mark, five links, one action. */
export default function MarketingNav({ links = DEFAULT_LINKS, fixed = true }: MarketingNavProps) {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { pathname, hash } = useLocation()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const isActive = (href: string) => {
    const [path, anchor] = href.split('#')
    if (anchor) return pathname === (path || '/') && hash === `#${anchor}`
    return pathname === href
  }

  return (
    <nav
      className={cn(
        'z-50 border-b transition-[background-color,border-color] duration-200',
        fixed && 'fixed inset-x-0 top-0',
        scrolled ? 'border-seam bg-room/80 backdrop-blur-md' : 'border-transparent bg-room/0',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5" aria-label="Onramp home">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink text-[var(--room)]">
            <TreeStructure size={14} weight="bold" />
          </span>
          <span className="font-display text-[15px] font-semibold tracking-[-0.01em] text-ink">Onramp</span>
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              to={l.href}
              {...prefetchProps(l.href)}
              aria-current={isActive(l.href) ? 'page' : undefined}
              className={cn(
                'text-[13.5px] transition-colors',
                isActive(l.href) ? 'text-ink' : 'text-ink-secondary hover:text-ink',
              )}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/login"
            {...prefetchProps('/login')}
            className="hidden px-2 text-[13.5px] text-ink-secondary transition-colors hover:text-ink sm:inline"
          >
            Log in
          </Link>
          <ThemeToggle />
          <Link
            to="/register"
            {...prefetchProps('/register')}
            className="inline-flex h-9 items-center rounded-lg bg-ink px-4 text-[13.5px] font-medium text-[var(--room)] transition-opacity hover:opacity-90"
          >
            Start free
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-md text-ink-secondary md:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X size={18} /> : <List size={18} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-seam bg-room md:hidden">
          <div className="flex flex-col gap-1 px-6 py-4">
            {[...links, { label: 'Log in', href: '/login' }].map((l) => (
              <Link
                key={l.href}
                to={l.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-2.5 text-[15px] text-ink-secondary hover:bg-well hover:text-ink"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  )
}
