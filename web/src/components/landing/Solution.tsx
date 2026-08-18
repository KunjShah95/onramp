import { motion } from 'framer-motion'
import { CheckCircle, GitBranch, Users, Waveform } from '@phosphor-icons/react'
import ArchitectureMapStatic from './ArchitectureMapStatic'
import SectionHeading from './SectionHeading'

const EASE = [0.16, 1, 0.3, 1] as const

const CALLOUTS = [
  { icon: CheckCircle, color: 'text-go-lit', ring: 'border-go-lit/30', label: 'Every service indexed', note: 'from source, not docs' },
  { icon: GitBranch, color: 'text-accent-via', ring: 'border-accent-via/30', label: 'Dependencies mapped', note: 'drawn as a live graph' },
  { icon: Users, color: 'text-accent-via', ring: 'border-accent-via/30', label: 'Ownership visible', note: 'who owns what, always' },
  { icon: Waveform, color: 'text-[#F59E0B]', ring: 'border-[#F59E0B]/30', label: 'Updated on every push', note: 'fresh from HEAD' },
]

export default function Solution() {
  return (
    <section id="the-map" className="relative scroll-mt-24 border-t border-black/5 bg-room">
      <div className="relative mx-auto max-w-[1280px] px-6 py-24 lg:px-10 lg:py-32">
        <SectionHeading
          eyebrow="The product"
          heading={<>One GitHub App. Instant clarity.</>}
          sub="Onramp parses your services, dependencies, and ownership straight from source. The map is the source of truth. It builds itself from HEAD and stays fresh on every push."
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
            style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(79,70,229,0.08), transparent 65%)' }}
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
              <ArchitectureMapStatic className="h-full w-full" />
            </div>

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
