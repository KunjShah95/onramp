import { lazy, Suspense, useRef, useState } from 'react'
import { motion, useScroll, useMotionValueEvent } from 'framer-motion'
import { CheckCircle, GitBranch, Users, Waveform } from '@phosphor-icons/react'
import type { TooltipInfo } from './ArchitectureMap'

const ArchitectureMap = lazy(() => import('./ArchitectureMap'))

const EASE = [0.16, 1, 0.3, 1] as const

const CALLOUTS = [
  { icon: CheckCircle, color: 'text-[#10B981]', ring: 'border-[#10B981]/30', label: 'Every service indexed', note: 'from source, not docs' },
  { icon: GitBranch, color: 'text-[#06B6D4]', ring: 'border-[#06B6D4]/30', label: 'Dependencies mapped', note: 'drawn as a live graph' },
  { icon: Users, color: 'text-[#00D9FF]', ring: 'border-[#00D9FF]/30', label: 'Ownership visible', note: 'who owns what, always' },
  { icon: Waveform, color: 'text-[#F59E0B]', ring: 'border-[#F59E0B]/30', label: 'Updated on every push', note: 'fresh from HEAD' },
]

const TOOLTIP_DOMAIN_LABEL: Record<string, string> = {
  client: 'client',
  api: 'api',
  core: 'core',
  data: 'data',
}

export default function Solution() {
  const ref = useRef<HTMLDivElement>(null)
  const progressRef = useRef(0)
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    progressRef.current = v
  })

  return (
    <section id="the-map" className="relative border-t border-white/5 bg-panel">
      <div className="mx-auto max-w-[1280px] px-6 py-24 lg:px-10 lg:py-32">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.65, ease: EASE }}
          className="max-w-2xl"
        >
          <p className="font-code text-[11px] font-medium uppercase tracking-[0.16em] text-[#06B6D4]">
            The solution
          </p>
          <h2 className="mt-4 font-display text-[clamp(1.8rem,4vw,3rem)] font-bold leading-[1.06] tracking-[-0.02em] text-white">
            One GitHub App. Instant clarity.
          </h2>
          <p className="mt-4 max-w-xl text-[15px] leading-[1.65] text-ink-tertiary">
            Onramp parses your services, dependencies, and ownership straight from source.
            The map is the source of truth. Scroll — it builds itself. Drag — you orbit it.
          </p>
        </motion.div>

        {/* map stage */}
        <motion.div
          initial={{ opacity: 0, y: 36 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.9, ease: EASE }}
          className="relative mt-14"
        >
          <div className="relative overflow-hidden rounded-sm border border-white/10 bg-[#0B1016] shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_24px_64px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] motion-safe:animate-pulse-glow" />
                <span className="font-code text-[10px] font-medium uppercase tracking-[0.16em] text-ink-secondary">
                  Architecture map
                </span>
              </div>
              <span className="font-code text-[10px] text-ink-tertiary">
                drag to orbit · scroll to build
              </span>
            </div>

            <div className="relative h-[480px] sm:h-[560px]">
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center font-code text-[11px] uppercase tracking-[0.18em] text-ink-tertiary">
                    Building map…
                  </div>
                }
              >
                <ArchitectureMap className="h-full w-full" progressRef={progressRef} onHover={setTooltip} />
              </Suspense>

              {/* tooltip */}
              {tooltip && (
                <div
                  className="pointer-events-none absolute z-30 w-56 rounded-sm border border-white/15 bg-[#0F1419]/95 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.6)] backdrop-blur"
                  style={{
                    left: Math.min(tooltip.x + 16, window.innerWidth - 240),
                    top: Math.max(tooltip.y + 16, 72),
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-[13px] font-bold text-white">{tooltip.label}</span>
                    <span className="rounded-sm border border-white/10 px-1.5 py-0.5 font-code text-[9px] uppercase tracking-[0.1em] text-ink-tertiary">
                      {TOOLTIP_DOMAIN_LABEL[tooltip.domain]}
                    </span>
                  </div>
                  <p className="mt-1 font-code text-[11px] text-ink-tertiary">{tooltip.sub}</p>
                  <dl className="mt-3 space-y-1.5 border-t border-white/5 pt-3">
                    <div className="flex justify-between gap-3 font-code text-[10px]">
                      <dt className="text-ink-tertiary">owner</dt>
                      <dd className="text-ink-secondary">{tooltip.owner}</dd>
                    </div>
                    <div className="flex justify-between gap-3 font-code text-[10px]">
                      <dt className="text-ink-tertiary">tests</dt>
                      <dd className="text-ink-secondary">{tooltip.tests.toLocaleString()}</dd>
                    </div>
                    <div className="flex justify-between gap-3 font-code text-[10px]">
                      <dt className="text-ink-tertiary">last commit</dt>
                      <dd className="text-[#10B981]">{tooltip.lastCommit}</dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* callout boxes */}
              <div className="pointer-events-none absolute inset-0 z-20 hidden items-center justify-between p-6 lg:flex">
                <div className="flex h-full flex-col justify-between gap-3">
                  {CALLOUTS.slice(0, 2).map((c) => (
                    <Callout key={c.label} {...c} />
                  ))}
                </div>
                <div className="flex h-full flex-col items-end justify-between gap-3">
                  {CALLOUTS.slice(2).map((c) => (
                    <Callout key={c.label} {...c} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

function Callout({
  icon: Icon,
  color,
  ring,
  label,
  note,
}: {
  icon: typeof CheckCircle
  color: string
  ring: string
  label: string
  note: string
}) {
  return (
    <div className={`flex items-center gap-3 rounded-sm border bg-[#0F1419]/90 px-4 py-3 backdrop-blur transition-transform duration-300 ${ring}`}>
      <Icon size={18} weight="bold" className={color} />
      <div>
        <div className="font-display text-[12px] font-bold text-white">{label}</div>
        <div className="font-code text-[10px] text-ink-tertiary">{note}</div>
      </div>
    </div>
  )
}
