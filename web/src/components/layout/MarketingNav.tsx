import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TreeStructure, List, X } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'

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
  { label: 'Pricing', href: '/pricing' },
  { label: 'Changelog', href: '/changelog' },
]

export default function MarketingNav({
  links = DEFAULT_LINKS,
  fixed = true,
}: MarketingNavProps) {
  const [open, setOpen] = useState(false)

  return (
    <nav
      className={[
        'border-b border-white/5 bg-base/80 backdrop-blur-xl',
        fixed ? 'fixed inset-x-0 top-0 z-50' : '',
      ].join(' ')}
    >
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-6 lg:px-10">
        {/* Logo */}
        <Link to="/" className="group flex items-center gap-2.5" aria-label="Onramp home">
          <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-cyan-400/90 text-[#0F1419] transition-transform duration-200 group-hover:scale-105">
            <TreeStructure size={16} weight="bold" />
          </span>
          <span className="font-display text-sm font-bold tracking-tight text-white">ONRAMP</span>
        </Link>

        {/* Center nav links */}
        <div className="hidden items-center gap-8 md:flex">
          {links.map((link) =>
            link.active ? (
              <span
                key={link.label}
                className="text-[13px] font-medium text-white"
              >
                {link.label}
              </span>
            ) : (
              <Link
                key={link.label}
                to={link.href}
                className="text-[13px] font-medium text-ink-secondary transition-colors hover:text-white"
              >
                {link.label}
              </Link>
            )
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
          <Link
            to="/login"
            className="hidden text-[13px] font-medium text-ink-secondary transition-colors hover:text-white sm:inline"
          >
            Log in
          </Link>
          <Link
            to="/register"
            className="inline-flex items-center rounded-sm bg-accent-primary px-4 py-2 text-[13px] font-bold text-[#0F1419] shadow-[0_0_24px_rgba(0,217,255,0.35)] transition-all hover:bg-accent-primary-hover active:translate-y-px"
          >
            Try for free
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-sm text-ink-secondary md:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X size={18} /> : <List size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-t border-white/5 bg-base md:hidden"
          >
            <div className="flex flex-col gap-1 px-6 py-4">
              {links.map((link) =>
                link.active ? (
                  <span
                    key={link.label}
                    className="rounded-sm px-2 py-2.5 text-[14px] font-medium text-white"
                  >
                    {link.label}
                  </span>
                ) : (
                  <Link
                    key={link.label}
                    to={link.href}
                    onClick={() => setOpen(false)}
                    className="rounded-sm px-2 py-2.5 text-[14px] font-medium text-ink-secondary transition-colors hover:bg-white/5 hover:text-white"
                  >
                    {link.label}
                  </Link>
                )
              )}
              <div className="border-t border-white/5 my-2" />
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className="rounded-sm px-2 py-2.5 text-[14px] font-medium text-ink-secondary transition-colors hover:bg-white/5 hover:text-white"
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
