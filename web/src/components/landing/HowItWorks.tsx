import { motion } from 'framer-motion'
import { GithubLogo, MagnifyingGlass } from '@phosphor-icons/react'
import SectionHeading from './SectionHeading'
import { SpotlightCard } from '../ui/landing-motion'

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
          className="flex h-16 w-16 items-center justify-center rounded-xl border border-black/10 bg-slate-50 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
        >
          <GithubLogo size={28} weight="fill" className="text-ink" />
        </motion.div>
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: 64 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.6, delay: 0.3, ease: EASE }}
          className="h-px bg-gradient-to-r from-black/15 to-go"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.6 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.5, delay: 0.6, ease: EASE }}
          className="flex h-16 w-16 items-center justify-center rounded-xl border border-go/25 bg-go/[0.06]"
        >
          <span className="text-[24px] font-bold text-go">✓</span>
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
            className="h-9 w-9 rounded-md border border-black/10 bg-gradient-to-br from-accent-primary/15 to-accent-primary/5"
          />
        ))}
      </div>
      <div className="h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-black/10">
        <motion.div
          initial={{ width: '0%' }}
          whileInView={{ width: '100%' }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 1.4, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="h-full rounded-full bg-gradient-to-r from-accent-primary to-accent-via"
        />
      </div>
      <span className="font-code text-[11px] text-ink-tertiary">indexed</span>
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
        className="flex items-center gap-2 rounded-lg border border-black/10 bg-slate-50 px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
      >
        <MagnifyingGlass size={13} className="text-accent-primary" />
        <span className="font-code text-[11px] text-ink-secondary">how does billing work?</span>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, x: -12 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.5, delay: 0.6, ease: EASE }}
        className="rounded-lg border border-accent-primary/25 bg-accent-primary/[0.05] px-3 py-2"
      >
        <span className="font-code text-[11px] text-accent-primary-hover">
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
  },
  {
    n: '02',
    title: 'Index',
    time: '2–10 minutes',
    body: 'Onramp scans your repos, maps services, and indexes dependencies.',
    visual: IndexVisual,
  },
  {
    n: '03',
    title: 'Onboard',
    time: 'day one',
    body: 'New hires open Onramp, find the architecture, ask questions, ship.',
    visual: OnboardVisual,
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative scroll-mt-24 border-t border-black/5 bg-room">
      <div className="mx-auto max-w-[1280px] px-6 py-24 lg:px-10 lg:py-32">
        <SectionHeading
          eyebrow="How it works"
          heading={<>Three steps to a map that never goes stale.</>}
          sub="No onboarding deck, no wiki crawl. The map draws itself, and keeps drawing itself on every push."
        />
        <div className="mt-14 grid grid-cols-1 gap-5 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.7, delay: 0.1 + i * 0.1, ease: EASE }}
              className="h-full"
            >
              <SpotlightCard
                glow="rgba(79,70,229,0.07)"
                className="flex h-full flex-col rounded-2xl border border-black/10 bg-white p-7 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:border-accent-primary/25 hover:shadow-[0_12px_32px_rgba(15,23,42,0.08)]"
              >
                <div className="flex items-center justify-between">
                  <span className="font-body text-sm font-bold text-accent-primary">{s.n}</span>
                  <span className="flex items-center gap-1.5 rounded-full border border-go/20 bg-go/[0.06] px-2.5 py-0.5 text-[11px] font-semibold text-go">
                    {s.time}
                  </span>
                </div>
                <div className="mt-4 w-full">
                  <s.visual />
                </div>
                <h3 className="mt-4 font-body text-lg font-semibold text-ink">{s.title}</h3>
                <p className="mt-2 text-[14px] leading-[1.6] text-ink-tertiary">{s.body}</p>
              </SpotlightCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
