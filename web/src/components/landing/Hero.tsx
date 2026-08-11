import { lazy, Suspense, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, useScroll, useTransform } from 'framer-motion'
import { ArrowRight, Play, GitFork, GitCommit } from '@phosphor-icons/react'

const HeroScene = lazy(() => import('./HeroScene'))

const EASE = [0.16, 1, 0.3, 1] as const

const HEADLINE = ['Your', 'codebase', 'is', 'a', 'map.']

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
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const sceneY = useTransform(scrollYProgress, [0, 1], [0, 80])
  const copyOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])
  const copyY = useTransform(scrollYProgress, [0, 0.5], [0, 40])

  return (
    <section ref={ref} className="relative overflow-hidden bg-base pt-28 pb-0 sm:pt-32">
      {/* ambient glows */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/4 h-[520px] w-[720px] rounded-full bg-accent-via/10 blur-[120px]" />
        <div className="absolute right-0 top-1/3 h-[420px] w-[480px] rounded-full bg-accent-primary/10 blur-[110px]" />
        <div className="absolute bottom-0 left-10 h-[360px] w-[420px] rounded-full bg-go/5 blur-[100px]" />
      </div>

      {/* dot grid floor */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: 'radial-gradient(rgba(148,163,184,0.14) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
          maskImage: 'radial-gradient(ellipse 90% 80% at 50% 0%, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 90% 80% at 50% 0%, black 30%, transparent 75%)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-[1280px] px-6 lg:px-10">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
          {/* copy */}
          <motion.div
            style={{ opacity: copyOpacity, y: copyY }}
            className="lg:col-span-6"
          >
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05, ease: EASE }}
              className="inline-flex items-center gap-2 rounded-sm border border-white/10 bg-white/[0.04] px-3 py-1.5"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-go motion-safe:animate-pulse-glow" />
              <span className="font-code text-[11px] font-medium uppercase tracking-[0.14em] text-ink-secondary">
                Onramp · architecture map
              </span>
            </motion.div>

            <h1 className="mt-7 font-display text-[clamp(2.4rem,6.5vw,4.6rem)] font-bold leading-[1.02] tracking-[-0.02em] text-white">
              {HEADLINE.map((w, i) => (
                <Word key={`${w}-${i}`} i={i}>
                  {w}
                </Word>
              ))}
              <br />
              <Word i={HEADLINE.length}>Make</Word>{' '}
              <span className="bg-gradient-to-r from-accent-primary via-accent-via to-go bg-clip-text text-transparent">
                <Word i={HEADLINE.length + 1}>it</Word> <Word i={HEADLINE.length + 2}>visible.</Word>
              </span>
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.75, ease: EASE }}
              className="mt-6 max-w-lg text-[clamp(1.1rem,1.6vw,1.35rem)] font-medium leading-[1.35] text-ink-secondary"
            >
              Developers spend weeks finding the path.{' '}
              <span className="text-white">Onramp makes it visible in minutes.</span>
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.9, ease: EASE }}
              className="mt-9 flex flex-wrap items-center gap-4"
            >
              <Link
                to="/register"
                className="group inline-flex h-12 items-center gap-2 rounded-sm bg-accent-primary px-7 text-[15px] font-bold text-[#0F1419] shadow-[0_0_32px_rgba(0,217,255,0.4)] transition-all hover:bg-accent-primary-hover hover:shadow-[0_0_44px_rgba(0,217,255,0.55)] active:translate-y-px"
              >
                Try for free
                <ArrowRight size={16} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="#the-gap"
                className="inline-flex h-12 items-center gap-2 text-[15px] font-semibold text-accent-via transition-colors hover:text-accent-primary-hover"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-accent-via/40">
                  <Play size={12} weight="fill" />
                </span>
                Watch 2-min demo
              </Link>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 1.05 }}
              className="mt-4 text-caption text-ink-tertiary"
            >
              No credit card required · Read-only GitHub access
            </motion.p>
          </motion.div>

          {/* 3D scene */}
          <motion.div style={{ y: sceneY }} className="lg:col-span-6">
            <motion.div
              initial={{ opacity: 0, y: 36 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.1, delay: 0.4, ease: EASE }}
              className="relative"
            >
              <div className="relative overflow-hidden rounded-sm border border-white/10 bg-white/[0.02] shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_24px_64px_rgba(0,0,0,0.5)]">
                {/* rail */}
                <div className="relative z-20 flex items-center justify-between border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="h-1.5 w-1.5 rounded-full bg-go motion-safe:animate-pulse-glow" />
                    <span className="font-code text-[10px] font-medium uppercase tracking-[0.16em] text-ink-secondary">
                      Live index · acme/platform
                    </span>
                  </div>
                  <span className="flex items-center gap-1.5 rounded-sm border border-white/10 bg-white/5 px-2.5 py-1 font-code text-[10px] text-ink-secondary">
                    <GitCommit size={11} /> 842 commits
                  </span>
                </div>

                <div className="relative h-[380px] sm:h-[460px]">
                  <Suspense
                    fallback={
                      <div className="flex h-full items-center justify-center font-code text-[11px] uppercase tracking-[0.18em] text-ink-tertiary">
                        Initializing map…
                      </div>
                    }
                  >
                    <HeroScene className="h-full w-full" />
                  </Suspense>

                  {/* status chips */}
                  <div className="pointer-events-none absolute left-4 top-4 z-30 hidden gap-2 sm:flex">
                    <span className="flex items-center gap-1.5 rounded-sm border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2.5 py-1 font-code text-[10px] font-medium uppercase tracking-[0.12em] text-[#FBBF24]">
                      <GitFork size={11} weight="fill" /> 14 services
                    </span>
                    <span className="flex items-center gap-1.5 rounded-sm border border-accent-via/40 bg-accent-via/10 px-2.5 py-1 font-code text-[10px] font-medium uppercase tracking-[0.12em] text-accent-primary-hover">
                      mapping… indexed
                    </span>
                  </div>
                </div>

                {/* bottom fade */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-b from-transparent to-base"
                />
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
