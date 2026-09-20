import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TreeStructure, List, X } from '@phosphor-icons/react'
import { prefetchProps } from '../../lib/prefetch'
import ThemeToggle from './ThemeToggle'
import { useLandingTheme } from '../../hooks/useLandingTheme'

const NAV_LINKS = [
  { label: 'The gap', href: '#the-gap', isAnchor: true },
  { label: 'The map', href: '#the-map', isAnchor: true },
  { label: 'Metrics', href: '#metrics', isAnchor: true },
  { label: 'Pricing', href: '#pricing', isAnchor: true },
  { label: 'Why Onramp', href: '/why-onramp', isAnchor: false },
]

const SECTION_IDS = ['the-gap', 'the-map', 'metrics', 'pricing']

/* Calm nav — no hide-on-scroll, no blur-xl theatrics, no magnetic CTA,
 * no layoutId spring underline, no glow shadow. Sticky bar, hairline
 * border, plain active state. */
export default function LandingNav() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const { isLight } = useLandingTheme()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(`#${entry.target.id}`)
        }
      },
      { rootMargin: '-40% 0px -55% 0px' }
    )
    SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  return (
    <nav
      className={`fixed inset-x-0 top-0 z-50 border-b transition-colors duration-150 ${
 isLight
 ? scrolled
 ? 'border-black/10 bg-white'
 : 'border-black/5 bg-white'
 : scrolled
 ? 'border-seam bg-room'
 : 'border-seam bg-room'
 }`}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2" aria-label="Onramp home">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink text-[var(--panel-raised)]">
            <TreeStructure size={14} weight="bold" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-ink">Onramp</span>
        </Link>

        <div className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((l) => {
            const isRoute = !l.isAnchor
            const isActive = active === l.href
            const cls = `text-[13.5px] transition-colors ${
              isActive ? 'font-medium text-ink' : 'text-ink-secondary hover:text-ink'
            }`
            return isRoute ? (
              <Link key={l.href} to={l.href} {...prefetchProps(l.href)} className={cls}>
                {l.label}
              </Link>
            ) : (
              <a key={l.href} href={l.href} className={cls}>
                {l.label}
              </a>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/login"
            {...prefetchProps('/login')}
            className="hidden text-[13.5px] text-ink-secondary transition-colors hover:text-ink sm:inline"
          >
            Log in
          </Link>
          <ThemeToggle />
          <Link
            to="/register"
            {...prefetchProps('/register')}
            className="inline-flex items-center rounded-md bg-ink px-3.5 py-1.5 text-[13.5px] font-medium text-[var(--panel-raised)] transition-opacity hover:opacity-90"
          >
            Try for free
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
        <div className={`border-t md:hidden ${isLight ? 'border-black/5 bg-white' : 'border-seam bg-room'}`}>
          <div className="flex flex-col gap-1 px-6 py-4">
            {NAV_LINKS.map((l) => {
              const isRoute = !l.isAnchor
              const cls = `rounded-md px-2 py-2 text-sm ${
                active === l.href ? 'font-medium text-ink' : 'text-ink-secondary hover:text-ink'
              }`
              return isRoute ? (
                <Link key={l.href} to={l.href} onClick={() => setOpen(false)} className={cls}>
                  {l.label}
                </Link>
              ) : (
                <a key={l.href} href={l.href} onClick={() => setOpen(false)} className={cls}>
                  {l.label}
                </a>
              )
            })}
            <div className={`my-2 border-t ${isLight ? 'border-black/5' : 'border-seam'}`} />
            <Link
              to="/login"
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-2 text-sm text-ink-secondary hover:text-ink"
            >
              Log in
            </Link>
          </div>
        </div>
      )}
    </nav>
  )
}
