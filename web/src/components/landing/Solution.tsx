import { lazy, Suspense, useRef, useState } from 'react'
import { motion, useScroll, useMotionValueEvent } from 'framer-motion'
import { CheckCircle, GitBranch, Users, Waveform } from '@phosphor-icons/react'
import LazyMount from '../ui/LazyMount'
import SectionHeading from './SectionHeading'
import type { TooltipInfo } from './ArchitectureMap'

const ArchitectureMap = lazy(() => import('./ArchitectureMap'))

function MapFallback() {
  return (
    <div className="flex h-full items-center justify-center font-code text-[11px] uppercase tracking-[0.18em] text-slate-500">
      Building map…
    </div>
  )
}

const EASE = [0.16, 1, 0.3, 1] as const

const CALLOUTS = [
  { icon: CheckCircle, color: 'text-go-lit', ring: 'border-go-lit/30', label: 'Every service indexed', note: 'from source, not docs' },
  { icon: GitBranch, color: 'text-accent-via', ring: 'border-accent-via/30', label: 'Dependencies mapped', note: 'drawn as a live graph' },
  { icon: Users, color: 'text-accent-via', ring: 'border-accent-via/30', label: 'Ownership visible', note: 'who owns what, always' },
  { icon: Waveform, color: 'text-[#F59E0B]', ring: 'border-[#F59E0B]/30', label: 'Updated on every push', note: 'fresh from HEAD' },
]

const TOOLTIP_DOMAIN_LABEL: Record<string, string> = { client: 'client', api: 'api', core: 'core', data: 'data' }

export default function Solution() {
  const ref = useRef<HTMLDivElement>(null)
  const progressRef = useRef(0)
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    progressRef.current = v
  })

  return (
    <section id="the-map" className="relative scroll-mt-24 border-t border-black/5 bg-room">
      <div className="relative mx-auto max-w-[1280px] px-6 py-24 lg:px-10 lg:py-32">
        <SectionHeading
          eyebrow="The product"
          heading={<>One GitHub App. Instant clarity.</>}
          sub="Onramp parses your services, dependencies, and ownership straight from source. The map is the source of truth — it builds itself from HEAD and stays fresh on every push."
        />

        <motion.div
          initial={{ opacity: 0, y: 36 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.9, ease: EASE }}
          className="relative mt-14 overflow-hidden"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-8 top-4 bottom-0 rounded-[32px] opacity-80"
            style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(8,145,178,0.08), transparent 65%)' }}
          />
          <div className="relative overflow-hidden rounded-2xl border border-black/10 bg-[#0B1016] shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-go-lit" />
                <span className="font-code text-[11px] text-slate-400">Architecture map</span>
              </div>
              <span className="font-code text-[11px] text-slate-400">drag to orbit · scroll to build</span>
            </div>

            <div className="relative h-[480px] sm:h-[560px] lg:h-[600px]">
              <LazyMount className="h-full w-full" delayMs={700} fallback={<MapFallback />}>
                <Suspense fallback={<MapFallback />}>
                  <ArchitectureMap className="h-full w-full" progressRef={progressRef} onHover={setTooltip} />
                </Suspense>
              </LazyMount>

              {tooltip && (
                <div
                  className="pointer-events-none absolute z-30 w-56 rounded-[12px] border border-white/15 bg-[#0F1419]/95 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.6)] backdrop-blur"
                  style={{ left: Math.min(tooltip.x + 16, window.innerWidth - 240), top: Math.max(tooltip.y + 16, 72) }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-body text-[13px] font-bold text-white">{tooltip.label}</span>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 font-code text-[9px] uppercase tracking-[0.1em] text-slate-400">
                      {TOOLTIP_DOMAIN_LABEL[tooltip.domain]}
                    </span>
                  </div>
                  <p className="mt-1 font-code text-[11px] text-slate-400">{tooltip.sub}</p>
                  <dl className="mt-3 space-y-1.5 border-t border-white/10 pt-3">
                    <div className="flex justify-between gap-3 font-code text-[10px]">
                      <dt className="text-slate-500">owner</dt>
                      <dd className="text-slate-300">{tooltip.owner}</dd>
                    </div>
                    <div className="flex justify-between gap-3 font-code text-[10px]">
                      <dt className="text-slate-500">tests</dt>
                      <dd className="text-slate-300">{tooltip.tests.toLocaleString()}</dd>
                    </div>
                    <div className="flex justify-between gap-3 font-code text-[10px]">
                      <dt className="text-slate-500">last commit</dt>
                      <dd className="text-go-lit">{tooltip.lastCommit}</dd>
                    </div>
                  </dl>
                </div>
              )}

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
    <div
      className={`flex items-center gap-3 rounded-[12px] border bg-[#0F1419]/90 px-4 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.4)] backdrop-blur transition-transform duration-300 hover:-translate-y-0.5 ${ring}`}
    >
      <Icon size={18} weight="bold" className={color} />
      <div>
        <div className="font-body text-[12px] font-bold text-white">{label}</div>
        <div className="font-code text-[10px] text-slate-400">{note}</div>
      </div>
    </div>
  )
}
