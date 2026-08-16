import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { TreeStructure, List, X } from '@phosphor-icons/react'
import { prefetchProps } from '../../lib/prefetch'

const NAV_LINKS = [
  { label: 'The gap', href: '#the-gap', isAnchor: true },
  { label: 'The map', href: '#the-map', isAnchor: true },
  { label: 'Metrics', href: '#metrics', isAnchor: true },
  { label: 'Pricing', href: '#pricing', isAnchor: true },
  { label: 'Why Onramp', href: '/why-onramp', isAnchor: false },
]

export default function LandingNav() {
  const [open, setOpen] = useState(false)

  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b border-black/5 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-6 lg:px-10">
        <Link to="/" className="group flex items-center gap-2.5" aria-label="Onramp home">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-400/90 text-[#0F1419] transition-transform duration-200 group-hover:scale-105">
            <TreeStructure size={16} weight="bold" />
          </span>
          <span className="font-body text-sm font-bold tracking-tight text-ink">ONRAMP</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((l) => {
            const isRoute = !l.isAnchor
            return isRoute ? (
              <Link
                key={l.href}
                to={l.href}
                {...prefetchProps(l.href)}
                className="text-[13.5px] font-medium text-ink-secondary transition-colors hover:text-ink"
              >
                {l.label}
              </Link>
            ) : (
              <a
                key={l.href}
                href={l.href}
                className="text-[13.5px] font-medium text-ink-secondary transition-colors hover:text-ink"
              >
                {l.label}
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
          <Link
            to="/register"
            {...prefetchProps('/register')}
            className="inline-flex items-center rounded-md bg-accent-primary px-4 py-2 text-[13.5px] font-semibold text-white shadow-[0_4px_16px_rgba(8,145,178,0.25)] transition-all hover:bg-accent-primary-hover active:translate-y-px"
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
                return isRoute ? (
                  <Link
                    key={l.href}
                    to={l.href}
                    onClick={() => setOpen(false)}
                    className="rounded-md px-2 py-2.5 text-[14px] font-medium text-ink-secondary transition-colors hover:bg-black/5 hover:text-ink"
                  >
                    {l.label}
                  </Link>
                ) : (
                  <a
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="rounded-md px-2 py-2.5 text-[14px] font-medium text-ink-secondary transition-colors hover:bg-black/5 hover:text-ink"
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
    </nav>
  )
}
