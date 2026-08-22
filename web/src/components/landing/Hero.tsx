import { Fragment, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { ArrowRight, CaretDown, Check, Play } from '@phosphor-icons/react'
import { HeroSpotlight, Magnetic } from '../ui/landing-motion'
import ArchitectureMapStatic from './ArchitectureMapStatic'

const EASE = [0.16, 1, 0.3, 1] as const

const HEADLINE_A = ['Onboarding', 'in', 'days,']
const HEADLINE_B = ['not', 'months.']

function Word({ children, i }: { children: string; i: number }) {
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
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const sceneY = useTransform(scrollYProgress, [0, 1], [0, 60])
  const copyOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])
  const copyY = useTransform(scrollYProgress, [0, 0.5], [0, 32])

  return (
    <section ref={ref} className="relative overflow-hidden bg-room pt-28 pb-20 sm:pt-32 lg:pb-28">
      {/* animated aurora mesh — slow, GPU-friendly, decorative */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <motion.div
          className="absolute -top-48 left-1/4 h-[480px] w-[680px] -translate-x-1/2 rounded-full bg-accent-primary/[0.09] blur-[120px]"
          animate={reduced ? undefined : { y: [0, 32, 0], scale: [1, 1.06, 1] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute right-0 top-1/3 h-[380px] w-[440px] rounded-full bg-accent-via/[0.09] blur-[110px]"
          animate={reduced ? undefined : { y: [0, -28, 0], scale: [1, 1.08, 1] }}
          transition={{ duration: 17, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
        <motion.div
          className="absolute -bottom-24 left-[8%] h-[320px] w-[420px] rounded-full bg-accent-to/[0.07] blur-[110px]"
          animate={reduced ? undefined : { y: [0, 24, 0], scale: [1, 1.05, 1] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
        />
        <div className="noise-overlay" />
      </div>
      {/* cursor-follow spotlight */}
      <HeroSpotlight />
      {/* dot grid floor */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage: 'radial-gradient(rgba(15,23,42,0.10) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
          maskImage: 'radial-gradient(ellipse 90% 80% at 50% 0%, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 90% 80% at 50% 0%, black 30%, transparent 75%)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-[1280px] px-6 lg:px-10">
        <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-12">
          {/* copy */}
          <motion.div style={{ opacity: copyOpacity, y: copyY }} className="lg:col-span-6">
            {/* <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05, ease: EASE }}
              className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3.5 py-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-accent-primary" />
              <span className="text-[12px] font-medium text-ink-secondary">
                Onboarding that actually tracks
              </span>
            </motion.div> */}

            <h1 className="mt-7 font-body text-[clamp(2.5rem,6.5vw,4.9rem)] font-bold leading-[1.02] tracking-[-0.03em] text-ink">
              {HEADLINE_A.map((w, i) => (
                <Fragment key={`${w}-${i}`}>
                  <Word i={i}>{w}</Word>{' '}
                </Fragment>
              ))}
              <br />
              <span className="text-gradient">
                {HEADLINE_B.map((w, i) => (
                  <Fragment key={`${w}-${i}`}>
                    <Word i={HEADLINE_A.length + i}>{w}</Word>
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
              <Magnetic strength={0.2}>
                <Link
                  to="/register"
                  className="group inline-flex h-12 items-center gap-2 rounded-md bg-accent-primary px-7 text-[15px] font-semibold text-white shadow-[0_8px_24px_rgba(79,70,229,0.30)] transition-all hover:bg-accent-primary-hover hover:shadow-[0_10px_32px_rgba(79,70,229,0.38)] active:translate-y-px"
                >
                  Try for free
                  <ArrowRight size={16} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Magnetic>
              <Link
                to="/pricing"
                className="group inline-flex h-12 items-center gap-2.5 rounded-md text-[15px] font-semibold text-ink transition-colors hover:text-accent-primary-hover"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-white transition-colors group-hover:border-accent-primary/40">
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
          </motion.div>

          {/* 3D product window */}
          <motion.div style={{ y: sceneY }} className="lg:col-span-6">
            <motion.div
              initial={{ opacity: 0, y: 36 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.1, delay: 0.4, ease: EASE }}
              className="relative"
            >
              <div className="relative overflow-hidden rounded-2xl border border-black/10 bg-[#0B1016] shadow-[0_24px_64px_rgba(15,23,42,0.22)]">
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

              {/* floating telemetry cards */}
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.8, delay: 1.15, ease: EASE }}
                className="absolute -left-5 top-16 z-30 hidden md:block"
              >
                <motion.div
                  animate={reduced ? undefined : { y: [0, -7, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                  className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/85 px-3.5 py-2.5 shadow-[0_12px_32px_rgba(15,23,42,0.14)] backdrop-blur-xl"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  <div className="leading-tight">
                    <p className="font-code text-[10.5px] font-semibold text-ink">Map updated</p>
                    <p className="font-code text-[9.5px] text-ink-tertiary">2m ago · 14 services</p>
                  </div>
                </motion.div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.8, delay: 1.3, ease: EASE }}
                className="absolute -bottom-5 -right-4 z-30 hidden md:block"
              >
                <motion.div
                  animate={reduced ? undefined : { y: [0, 6, 0] }}
                  transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
                  className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/85 px-3.5 py-2.5 shadow-[0_12px_32px_rgba(15,23,42,0.14)] backdrop-blur-xl"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-primary text-white">
                    <Check size={12} weight="bold" />
                  </span>
                  <div className="leading-tight">
                    <p className="font-code text-[10.5px] font-semibold text-ink">First PR merged</p>
                    <p className="font-code text-[9.5px] text-ink-tertiary">+2h to value · #147</p>
                  </div>
                </motion.div>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* scroll indicator */}
      <motion.a
        href="#the-gap"
        aria-label="Scroll to see the problem"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.7, duration: 0.8 }}
        className="absolute bottom-5 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-1.5 lg:flex"
      >
        <span className="font-code text-[9.5px] uppercase tracking-[0.2em] text-ink-tertiary">Scroll</span>
        <motion.span
          animate={reduced ? undefined : { y: [0, 5, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          className="text-ink-tertiary"
        >
          <CaretDown size={13} />
        </motion.span>
      </motion.a>
    </section>
  )
}
