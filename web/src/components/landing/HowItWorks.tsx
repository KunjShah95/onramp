import { motion } from 'framer-motion'
import { GithubLogo, MagnifyingGlass } from '@phosphor-icons/react'

const EASE = [0.16, 1, 0.3, 1] as const

function InstallVisual() {
  return (
    <div className="relative flex h-40 items-center justify-center">
      <div className="flex items-center gap-3">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="flex h-16 w-16 items-center justify-center rounded-sm border border-white/10 bg-panel-raised"
        >
          <GithubLogo size={28} weight="fill" className="text-white" />
        </motion.div>
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: 64 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.6, delay: 0.3, ease: EASE }}
          className="h-px bg-gradient-to-r from-white/20 to-[#10B981]"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.6 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.5, delay: 0.6, ease: EASE }}
          className="flex h-16 w-16 items-center justify-center rounded-sm border border-[#10B981]/40 bg-[#10B981]/10"
        >
          <span className="font-code text-[26px] font-bold text-[#10B981]">✓</span>
        </motion.div>
      </div>
    </div>
  )
}

function IndexVisual() {
  return (
    <div className="relative flex h-40 flex-col items-center justify-center gap-4 px-6">
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.7 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.45, delay: 0.2 + i * 0.15, ease: EASE }}
            className="h-9 w-9 rounded-sm border border-white/10 bg-gradient-to-br from-[#06B6D4]/60 to-[#00D9FF]/30"
          />
        ))}
      </div>
      <div className="h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-white/10">
        <motion.div
          initial={{ width: '0%' }}
          whileInView={{ width: '100%' }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 1.4, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="h-full rounded-full bg-gradient-to-r from-[#06B6D4] to-[#00D9FF]"
        />
      </div>
      <span className="font-code text-[11px] text-ink-tertiary">indexing… mapped</span>
    </div>
  )
}

function OnboardVisual() {
  return (
    <div className="relative flex h-40 flex-col justify-center gap-3 px-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.5, delay: 0.2, ease: EASE }}
        className="flex items-center gap-2 rounded-sm border border-white/10 bg-panel-raised px-3 py-2"
      >
        <MagnifyingGlass size={13} className="text-[#06B6D4]" />
        <span className="font-code text-[11px] text-ink-secondary">how does billing work?</span>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, x: -12 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.5, delay: 0.6, ease: EASE }}
        className="rounded-sm border border-[#06B6D4]/30 bg-[#06B6D4]/10 px-3 py-2"
      >
        <span className="font-code text-[11px] text-[#22D3EE]">
          Billing → payments/billing · owner @payments
        </span>
      </motion.div>
      <motion.span
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.4, delay: 1 }}
        className="font-code text-[11px] text-ink-tertiary"
      >
        ship on day one
      </motion.span>
    </div>
  )
}

const STEPS = [
  {
    n: '01',
    title: 'Install',
    time: '30 seconds',
    body: 'Connect Onramp to your GitHub. Read-only access, no code changes.',
    visual: InstallVisual,
    align: 'lg:items-start',
  },
  {
    n: '02',
    title: 'Index',
    time: '2–10 minutes',
    body: 'Onramp scans your repos, maps services, and indexes dependencies.',
    visual: IndexVisual,
    align: 'lg:items-center',
  },
  {
    n: '03',
    title: 'Onboard',
    time: 'day one',
    body: 'New hires open Onramp, find the architecture, ask questions, ship.',
    visual: OnboardVisual,
    align: 'lg:items-end',
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative border-t border-white/5 bg-panel">
      <div className="mx-auto max-w-[1280px] px-6 py-24 lg:px-10 lg:py-32">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.65, ease: EASE }}
          className="max-w-2xl"
        >
          <p className="font-code text-[11px] font-medium uppercase tracking-[0.16em] text-[#10B981]">
            How it works
          </p>
          <h2 className="mt-4 font-display text-[clamp(1.8rem,4vw,3rem)] font-bold leading-[1.06] tracking-[-0.02em] text-white">
            Three steps to a map that never goes stale.
          </h2>
        </motion.div>

        <div className="mt-14 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, x: i === 0 ? -32 : i === 2 ? 32 : 0, y: 24 }}
              whileInView={{ opacity: 1, x: 0, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.7, delay: 0.1 + i * 0.1, ease: EASE }}
              className={`group relative flex flex-col overflow-hidden rounded-sm border border-white/10 bg-panel-raised p-6 transition-colors duration-300 hover:border-white/20 ${s.align}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-[13px] font-bold text-ink-tertiary">
                  STEP {s.n}
                </span>
                <span className="flex items-center gap-1.5 rounded-sm border border-[#10B981]/30 bg-[#10B981]/10 px-2 py-0.5 font-code text-[10px] text-[#34D399]">
                  {s.time}
                </span>
              </div>
              <div className="mt-6 w-full">
                <s.visual />
              </div>
              <h3 className="mt-6 font-display text-xl font-bold text-white">{s.title}</h3>
              <p className="mt-2 text-[13px] leading-[1.6] text-ink-tertiary">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
