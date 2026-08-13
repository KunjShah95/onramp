import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { TreeStructure } from '@phosphor-icons/react'

export default function AuthNavbar() {
  return (
    <motion.nav
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-base/80 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-6 lg:px-10">
        <Link to="/" className="group flex items-center gap-2.5" aria-label="Onramp home">
          <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-cyan-400/90 text-[#0F1419] transition-transform duration-200 group-hover:scale-105">
            <TreeStructure size={16} weight="bold" />
          </span>
          <span className="font-display text-sm font-bold tracking-tight text-white">ONRAMP</span>
        </Link>
        <div className="hidden items-center gap-8 md:flex">
          <Link to="/docs" className="text-[13px] font-medium text-ink-secondary transition-colors hover:text-white">
            Docs
          </Link>
          <Link to="/why-onramp" className="text-[13px] font-medium text-ink-secondary transition-colors hover:text-white">
            Why Onramp
          </Link>
          <Link to="/pricing" className="text-[13px] font-medium text-ink-secondary transition-colors hover:text-white">
            Pricing
          </Link>
          <Link to="/changelog" className="text-[13px] font-medium text-ink-secondary transition-colors hover:text-white">
            Changelog
          </Link>
        </div>
        <div className="flex items-center gap-4 md:hidden">
          <Link
            to="/register"
            className="inline-flex items-center rounded-sm bg-accent-primary px-4 py-2 text-[13px] font-bold text-[#0F1419] shadow-[0_0_24px_rgba(0,217,255,0.35)] transition-all hover:bg-accent-primary-hover active:translate-y-px"
          >
            Sign up
          </Link>
        </div>
      </div>
    </motion.nav>
  )
}
