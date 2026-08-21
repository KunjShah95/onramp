import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight } from '@phosphor-icons/react'
import { Magnetic, SpotlightCard } from '../ui/landing-motion'

const EASE = [0.16, 1, 0.3, 1] as const

/**
 * ClosingCta — the final call-to-action, a self-contained light panel.
 *
 * Rendered as its own distinct white container on the slate band (clearly
 * separate from the white pricing section above it) and kept fully in the
 * light premium system: Inter type, slate ink, indigo/cyan/violet accents.
 */
export default function ClosingCta() {
  return (
    <section
      id="the-open-door"
      className="relative scroll-mt-24 border-t border-black/5 bg-base py-24 lg:py-32"
    >
      <div className="mx-auto max-w-[1280px] px-6 lg:px-10">
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.8, ease: EASE }}
          className="relative overflow-hidden rounded-3xl border border-black/10 px-6 py-20 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_64px_rgba(15,23,42,0.06)] sm:px-14 lg:py-28"
        >
          <SpotlightCard glow="rgba(79,70,229,0.08)" className="h-full w-full rounded-3xl bg-white">
            {/* soft ambient tint */}
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div className="absolute left-1/2 top-0 h-[280px] w-[600px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-accent-primary/[0.07] blur-[100px]" />
            </div>

          <div className="relative">
            <p className="font-code text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-primary">
              Get started
            </p>
            <h2 className="mx-auto mt-4 max-w-2xl font-body text-[clamp(1.9rem,5vw,3.2rem)] font-bold leading-[1.06] tracking-[-0.02em] text-ink">
              Onboarding in days, not months.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-[16px] leading-[1.65] text-ink-secondary">
              Install the GitHub App, pick a repository, and watch your ramp turn into a
              live workflow · fresh on every push.
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Magnetic strength={0.2}>
                <Link
                  to="/register"
                  className="group inline-flex h-12 items-center gap-2 rounded-md bg-accent-primary px-8 text-[15px] font-semibold text-white shadow-[0_8px_24px_rgba(79,70,229,0.30)] transition-all hover:bg-accent-primary-hover hover:shadow-[0_10px_32px_rgba(79,70,229,0.38)] active:translate-y-px"
                >
                  Try for free
                  <ArrowRight size={16} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Magnetic>
              <Link
                to="/pricing"
                className="inline-flex h-12 items-center rounded-md border border-black/10 bg-white px-8 text-[15px] font-semibold text-ink transition-all hover:border-accent-primary/40 active:translate-y-px"
              >
                See pricing
              </Link>
            </div>
            <p className="mt-5 font-code text-[11px] text-ink-tertiary">
              No credit card required · Read-only GitHub access · Cancel anytime
            </p>
          </div>
          </SpotlightCard>
        </motion.div>
      </div>
    </section>
  )
}
