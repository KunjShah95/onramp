import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TreeStructure, List, X } from '@phosphor-icons/react'

import { prefetchProps } from '../../lib/prefetch'
import ThemeToggle from '../landing/ThemeToggle'
import { useLandingTheme } from '../../hooks/useLandingTheme'

export interface NavLinkItem {
  label: string
  href: string
  active?: boolean
}

interface MarketingNavProps {
  /** Optional custom links. Defaults to Docs / Why Onramp / Pricing / Changelog. */
  links?: NavLinkItem[]
  /** Whether the nav should be fixed (vs relative/static). Default true. */
  fixed?: boolean
}

const DEFAULT_LINKS: NavLinkItem[] = [
  { label: 'Docs', href: '/docs' },
  { label: 'Why Onramp', href: '/why-onramp' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'Changelog', href: '/changelog' },
]

export default function MarketingNav({
  links = DEFAULT_LINKS,
  fixed = true,
}: MarketingNavProps) {
  const [open, setOpen] = useState(false)
  const { isLight } = useLandingTheme()

  return (
    <nav
      className={[
        'border-b backdrop-blur-xl transition-[border-color,box-shadow,background-color] duration-300',
        fixed
          ? isLight
            ? 'fixed inset-x-0 top-0 z-50 border-black/5 bg-white/80'
            : 'fixed inset-x-0 top-0 z-50 border-seam bg-room/70'
          : 'border-transparent bg-transparent',
      ].join(' ')}
    >
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-6 lg:px-10">
        {/* Logo — same gradient mark as LandingNav for identity unity */}
        <Link to="/" className="group flex items-center gap-2.5" aria-label="Onramp home">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-go text-white shadow-[0_0_20px_rgb(var(--accent-primary)/0.35)] transition-transform duration-200 group-">
            <TreeStructure size={16} weight="bold" />
          </span>
          <span className="font-body text-sm font-bold tracking-tight text-ink">ONRAMP</span>
        </Link>

        {/* Center nav links */}
        <div className="hidden items-center gap-8 md:flex">
          {links.map((link) =>
            link.active ? (
              <span
                key={link.label}
                className="text-[13px] font-medium text-ink"
              >
                {link.label}
              </span>
            ) : (
              <Link
                key={link.label}
                to={link.href}
                {...prefetchProps(link.href)}
                className="text-[13px] font-medium text-ink-secondary transition-colors hover:text-ink"
              >
                {link.label}
              </Link>
            )
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            to="/login"
            {...prefetchProps('/login')}
            className="hidden text-[13px] font-medium text-ink-secondary transition-colors hover:text-ink sm:inline"
          >
            Log in
          </Link>
          <Link
            to="/register"
            {...prefetchProps('/register')}
<<<<<<< HEAD
            className="inline-flex items-center rounded-md bg-accent-primary px-4 py-2 text-[13px] font-semibold text-[rgb(var(--accent-foreground))] transition-colors hover:bg-accent-primary-hover"
=======
            className="inline-flex items-center rounded-md bg-accent-primary px-4 py-2 text-[13px] font-semibold text-accent-foreground shadow-[0_0_24px_rgb(var(--accent-primary)/0.4)] transition-all hover:bg-accent-primary-hover hover:shadow-[0_0_32px_rgb(var(--accent-primary)/0.55)] active:translate-y-px"
>>>>>>> cae272328a35776c20cb7e65ca99143addd641e7
          >
            Try for free
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="hit-slop flex h-9 w-9 items-center justify-center rounded-sm text-ink-secondary md:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X size={18} /> : <List size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      
        {open && (
          <div className={`overflow-hidden border-t md:hidden ${isLight ? 'border-black/5 bg-white' : 'border-seam bg-base'}`}>
            <div className="flex flex-col gap-1 px-6 py-4">
              {links.map((link) =>
                link.active ? (
                  <span
                    key={link.label}
                    className="rounded-sm px-2 py-2.5 text-[14px] font-medium text-ink"
                  >
                    {link.label}
                  </span>
                ) : (
                  <Link
                    key={link.label}
                    to={link.href}
                    onClick={() => setOpen(false)}
                    {...prefetchProps(link.href)}
                    className={`rounded-sm px-2 py-2.5 text-[14px] font-medium text-ink-secondary transition-colors hover:text-ink ${isLight ? 'hover:bg-black/5' : 'hover:bg-white/5'}`}
                  >
                    {link.label}
                  </Link>
                )
              )}
              <div className={`my-2 border-t ${isLight ? 'border-black/5' : 'border-seam'}`} />
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                {...prefetchProps('/login')}
                className={`rounded-sm px-2 py-2.5 text-[14px] font-medium text-ink-secondary transition-colors hover:text-ink ${isLight ? 'hover:bg-black/5' : 'hover:bg-white/5'}`}
              >
                Log in
              </Link>
            </div>
          </div>
        )}
      
    </nav>
  )
}
