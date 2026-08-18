import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { TreeStructure, List, X } from '@phosphor-icons/react'
import { Magnetic } from '../ui/landing-motion'
import { prefetchProps } from '../../lib/prefetch'

const NAV_LINKS = [
  { label: 'The gap', href: '#the-gap', isAnchor: true },
  { label: 'The map', href: '#the-map', isAnchor: true },
  { label: 'Metrics', href: '#metrics', isAnchor: true },
  { label: 'Pricing', href: '#pricing', isAnchor: true },
  { label: 'Why Onramp', href: '/why-onramp', isAnchor: false },
]

const SECTION_IDS = ['the-gap', 'the-map', 'metrics', 'pricing']

export default function LandingNav() {
  const [open, setOpen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const lastY = useRef(0)
  const reduced = useReducedMotion()

  // Hide on scroll down, reveal on scroll up (past a small dead zone).
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      setScrolled(y > 8)
      if (y > 120 && y > lastY.current + 4) setHidden(true)
      else if (y < lastY.current - 4 || y <= 120) setHidden(false)
      lastY.current = y
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Scrollspy — track which anchor section is currently in the reading band.
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
    <motion.nav
      animate={reduced ? undefined : { y: hidden ? '-100%' : '0%' }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      className={`fixed inset-x-0 top-0 z-50 border-b backdrop-blur-xl transition-[border-color,box-shadow,background-color] duration-300 ${
        scrolled
          ? 'border-black/10 bg-white/85 shadow-[0_8px_32px_rgba(15,23,42,0.06)]'
          : 'border-black/5 bg-white/70'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-6 lg:px-10">
        <Link to="/" className="group flex items-center gap-2.5" aria-label="Onramp home">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent-primary to-accent-via text-white shadow-[0_4px_14px_rgba(79,70,229,0.35)] transition-transform duration-200 group-hover:scale-105">
            <TreeStructure size={16} weight="bold" />
          </span>
          <span className="font-body text-sm font-bold tracking-tight text-ink">ONRAMP</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((l) => {
            const isRoute = !l.isAnchor
            const isActive = active === l.href
            const cls = `relative rounded-md px-1 py-1 text-[13.5px] font-medium transition-colors ${
              isActive ? 'text-ink' : 'text-ink-secondary hover:text-ink'
            }`
            const underline = isActive && (
              <motion.span
                layoutId="landing-nav-active"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                className="absolute inset-x-0 -bottom-0.5 h-[2px] rounded-full bg-accent-primary"
              />
            )
            return isRoute ? (
              <Link key={l.href} to={l.href} {...prefetchProps(l.href)} className={cls}>
                {l.label}
              </Link>
            ) : (
              <a key={l.href} href={l.href} className={cls}>
                {l.label}
                {underline}
              </a>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/login"
            {...prefetchProps('/login')}
            className="hidden text-[13.5px] font-medium text-ink-secondary transition-colors hover:text-ink sm:inline"
          >
            Log in
          </Link>
          <Magnetic strength={0.18}>
            <Link
              to="/register"
              {...prefetchProps('/register')}
              className="inline-flex items-center rounded-md bg-accent-primary px-4 py-2 text-[13.5px] font-semibold text-white shadow-[0_4px_16px_rgba(79,70,229,0.28)] transition-all hover:bg-accent-primary-hover hover:shadow-[0_6px_20px_rgba(79,70,229,0.36)] active:translate-y-px"
            >
              Try for free
            </Link>
          </Magnetic>
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

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-t border-black/5 bg-white md:hidden"
          >
            <div className="flex flex-col gap-1 px-6 py-4">
              {NAV_LINKS.map((l) => {
                const isRoute = !l.isAnchor
                const cls = `rounded-md px-2 py-2.5 text-[14px] font-medium transition-colors ${
                  active === l.href ? 'bg-accent-primary/[0.06] text-accent-primary' : 'text-ink-secondary hover:bg-black/5 hover:text-ink'
                }`
                return isRoute ? (
                  <Link
                    key={l.href}
                    to={l.href}
                    onClick={() => setOpen(false)}
                    className={cls}
                  >
                    {l.label}
                  </Link>
                ) : (
                  <a
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className={cls}
                  >
                    {l.label}
                  </a>
                )
              })}
              <div className="my-2 border-t border-black/5" />
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-2.5 text-[14px] font-medium text-ink-secondary transition-colors hover:bg-black/5 hover:text-ink"
              >
                Log in
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  )
}
