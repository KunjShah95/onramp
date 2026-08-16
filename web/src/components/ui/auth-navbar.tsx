import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { TreeStructure } from '@phosphor-icons/react'
import { prefetchProps } from '../../lib/prefetch'

export default function AuthNavbar() {
  return (
    <motion.nav
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed inset-x-0 top-0 z-50 border-b border-black/5 bg-white/80 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-6 lg:px-10">
        <Link to="/" className="group flex items-center gap-2.5" aria-label="Onramp home">
          <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-cyan-400/90 text-[#0F1419] transition-transform duration-200 group-hover:scale-105">
            <TreeStructure size={16} weight="bold" />
          </span>
          <span className="font-display text-sm font-bold tracking-tight text-ink">ONRAMP</span>
        </Link>
        <div className="hidden items-center gap-8 md:flex">
          <Link to="/docs" {...prefetchProps('/docs')} className="text-[13px] font-medium text-ink-secondary transition-colors hover:text-ink">
            Docs
          </Link>
          <Link to="/why-onramp" {...prefetchProps('/why-onramp')} className="text-[13px] font-medium text-ink-secondary transition-colors hover:text-ink">
            Why Onramp
          </Link>
          <Link to="/pricing" {...prefetchProps('/pricing')} className="text-[13px] font-medium text-ink-secondary transition-colors hover:text-ink">
            Pricing
          </Link>
          <Link to="/changelog" {...prefetchProps('/changelog')} className="text-[13px] font-medium text-ink-secondary transition-colors hover:text-ink">
            Changelog
          </Link>
        </div>
        <div className="flex items-center gap-4 md:hidden">
          <Link
            to="/register"
            {...prefetchProps('/register')}
            className="inline-flex items-center rounded-sm bg-accent-primary px-4 py-2 text-[13px] font-bold text-white shadow-[0_4px_16px_rgba(8,145,178,0.25)] transition-all hover:bg-accent-primary-hover active:translate-y-px"
          >
            Sign up
          </Link>
        </div>
      </div>
    </motion.nav>
  )
}
