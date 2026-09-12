import { Fragment, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, CaretDown, Check, Play } from '@phosphor-icons/react'
import { HeroSpotlight } from '../ui/landing-motion'
import ArchitectureMapStatic from './ArchitectureMapStatic'

const EASE = [0.16, 1, 0.3, 1] as const

const HEADLINE_A = ['Onboarding', 'in', 'days,']
const HEADLINE_B = ['not', 'months.']

function Word({ children, i, reduced }: { children: string; i: number; reduced?: boolean | null }) {
  if (reduced) return <span className="inline-block">{children}</span>
  return (
    <span className="inline-block overflow-hidden align-bottom">
      <motion.span
        className="inline-block"
        initial={{ y: '110%' }}
        animate={{ y: 0 }}
        transition={{ duration: 0.8, delay: 0.15 + i * 0.09, ease: EASE }}
      >
        {children}
      </motion.span>
    </span>
  )
}

export default function Hero() {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  return (
    <section ref={ref} className="relative overflow-hidden bg-room pt-28 pb-20 sm:pt-32 lg:pb-28">
      {/* single ambient glow — one idea, GPU-cheap, decorative */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-48 left-1/4 h-[480px] w-[680px] -translate-x-1/2 rounded-full bg-accent-primary/[0.10] blur-[120px]" />
        <div className="noise-overlay" />
      </div>
      {/* cursor-follow spotlight */}
      <HeroSpotlight />
      {/* dot grid floor */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage: 'radial-gradient(rgb(var(--border-rgb) / 0.16) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
          maskImage: 'radial-gradient(ellipse 90% 80% at 50% 0%, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 90% 80% at 50% 0%, black 30%, transparent 75%)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-[1280px] px-6 lg:px-10">
        <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-12">
          {/* copy */}
          <div className="lg:col-span-6">
            <h1 className="mt-7 font-body text-[clamp(2.5rem,6.5vw,4.9rem)] font-bold leading-[1.02] tracking-[-0.03em] text-ink [text-wrap:balance]">
              {HEADLINE_A.map((w, i) => (
                <Fragment key={`${w}-${i}`}>
                  <Word i={i} reduced={reduced}>{w}</Word>{' '}
                </Fragment>
              ))}
              <br />
              <span className="text-gradient">
                {HEADLINE_B.map((w, i) => (
                  <Fragment key={`${w}-${i}`}>
                    <Word i={HEADLINE_A.length + i} reduced={reduced}>{w}</Word>
                    {i < HEADLINE_B.length - 1 && ' '}
                  </Fragment>
                ))}
              </span>
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.8, ease: EASE }}
              className="mt-6 max-w-lg text-[clamp(1.1rem,1.6vw,1.35rem)] font-medium leading-[1.4] text-ink-secondary"
            >
              Onramp turns your repo into a live ramp — learning paths, graded tasks, and
              a review queue. New devs land their first merged PR faster, seniors stop
              re-answering the same questions.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.95, ease: EASE }}
              className="mt-9 flex flex-wrap items-center gap-4"
            >
              <Link
                to="/register"
                className="group inline-flex h-12 items-center gap-2 rounded-md bg-accent-primary px-7 text-[15px] font-semibold text-[rgb(var(--accent-foreground))] shadow-[0_0_28px_rgb(var(--accent-primary)/0.4)] transition-all hover:bg-accent-primary-hover hover:shadow-[0_0_36px_rgb(var(--accent-primary)/0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-go/50"
              >
                Try for free
                <ArrowRight size={16} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/pricing"
                className="group inline-flex h-12 items-center gap-2.5 rounded-md text-[15px] font-semibold text-ink transition-colors hover:text-accent-primary-hover"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-seam bg-panel transition-colors group-hover:border-accent-primary/40">
                  <Play size={12} weight="fill" className="text-accent-primary" />
                </span>
                See pricing
              </Link>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 1.1 }}
              className="mt-4 text-[13px] text-ink-tertiary"
            >
              No credit card required · Read-only GitHub access
            </motion.p>
          </div>

          {/* product window — seated, one reveal */}
          <div className="lg:col-span-6">
            <motion.div
              initial={{ opacity: 0, y: 36 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.1, delay: 0.4, ease: EASE }}
              className="relative"
            >
              <div className="relative overflow-hidden rounded-xl border border-seam bg-[#0B1016] shadow-seam">
                {/* window chrome */}
                <div className="relative z-20 flex items-center justify-between border-b border-white/10 px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
                  </div>
                  <span className="font-code text-[11px] text-slate-400">acme/platform · architecture</span>
                  <span className="w-8" />
                </div>
                <div className="relative h-[380px] sm:h-[460px]">
                  <ArchitectureMapStatic className="h-full w-full" />
                </div>
              </div>

              {/* seated telemetry cards — no float loops, no ping */}
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.8, delay: 1.15, ease: EASE }}
                className="absolute -left-5 top-16 z-30 hidden md:block"
              >
                <div className="flex items-center gap-2.5 rounded-card border border-seam bg-panel px-3.5 py-2.5 shadow-seam">
                  <span className="h-2 w-2 rounded-full bg-go" aria-hidden />
                  <div className="leading-tight">
                    <p className="font-code text-[11px] font-semibold text-ink">Map updated</p>
                    <p className="font-code text-[11px] text-ink-secondary">2m ago · 14 services</p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.8, delay: 1.3, ease: EASE }}
                className="absolute -bottom-5 -right-4 z-30 hidden md:block"
              >
                <div className="flex items-center gap-2.5 rounded-card border border-seam bg-panel px-3.5 py-2.5 shadow-seam">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-go text-[rgb(var(--accent-foreground))]">
                    <Check size={12} weight="bold" />
                  </span>
                  <div className="leading-tight">
                    <p className="font-code text-[11px] font-semibold text-ink">First PR merged</p>
                    <p className="font-code text-[11px] text-ink-secondary">Faster to value · #147</p>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* scroll cue — static, no bounce */}
      <motion.a
        href="#the-gap"
        aria-label="Scroll to see the problem"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.7, duration: 0.8 }}
        className="absolute bottom-5 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-1.5 lg:flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-go/50 rounded"
      >
        <span className="font-code text-[11px] uppercase tracking-[0.2em] text-ink-secondary">Scroll</span>
        <span className="text-ink-secondary" aria-hidden>
          <CaretDown size={13} />
        </span>
      </motion.a>
    </section>
  )
}
