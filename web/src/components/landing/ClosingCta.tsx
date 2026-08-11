import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight } from '@phosphor-icons/react'

const EASE = [0.16, 1, 0.3, 1] as const

export default function ClosingCta() {
  return (
    <section className="relative overflow-hidden border-t border-white/5 bg-panel">
      {/* ambient glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[360px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-primary/10 blur-[120px]" />
        <div className="absolute right-10 top-0 h-[220px] w-[320px] rounded-full bg-go/10 blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-[1280px] px-6 py-24 lg:px-10 lg:py-32">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.7, ease: EASE }}
          className="mx-auto max-w-2xl text-center"
        >
          <p className="font-code text-[11px] font-medium uppercase tracking-[0.16em] text-accent-primary">
            Ready when you are
          </p>
          <h2 className="mt-4 font-display text-[clamp(1.9rem,5vw,3.2rem)] font-bold leading-[1.04] tracking-[-0.02em] text-white">
            Your codebase is already a map. Make it visible in minutes.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[15px] leading-[1.65] text-ink-tertiary">
            Install the GitHub App, pick a repository, and watch your architecture draw itself — fresh on every push.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/register"
              className="group inline-flex h-12 items-center gap-2 rounded-sm bg-accent-primary px-7 text-[15px] font-bold text-[#0F1419] shadow-[0_0_32px_rgba(0,217,255,0.4)] transition-all hover:bg-accent-primary-hover hover:shadow-[0_0_44px_rgba(0,217,255,0.55)] active:translate-y-px"
            >
              Try for free
              <ArrowRight size={16} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/pricing"
              className="inline-flex h-12 items-center rounded-sm border border-white/10 bg-panel-raised px-7 text-[15px] font-semibold text-white transition-all hover:border-accent-primary/40 active:translate-y-px"
            >
              See pricing
            </Link>
          </div>
          <p className="mt-4 font-code text-[11px] text-ink-tertiary">
            No credit card required · Read-only GitHub access · Cancel anytime
          </p>
        </motion.div>
      </div>
    </section>
  )
}
