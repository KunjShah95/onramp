import type { ComponentType } from 'react'
import { motion } from 'framer-motion'
import { MagnifyingGlass, ArrowClockwise } from '@phosphor-icons/react'
import SectionHeading from './SectionHeading'
import { SpotlightCard } from '../ui/landing-motion'

const EASE = [0.16, 1, 0.3, 1] as const

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.3 },
  transition: { duration: 0.65, delay, ease: EASE },
})

function ConfusionLoop() {
  return (
    <div className="space-y-2">
      <div className="rounded-md border border-seam bg-well p-3">
        <div className="font-code text-[10px] uppercase tracking-[0.14em] text-ink-secondary">
          docs/architecture.md
        </div>
        <div className="mt-2 space-y-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-1.5 rounded-full bg-seam" style={{ width: `${88 - i * 18}%` }} />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-md border border-seam bg-panel px-3 py-2">
        <MagnifyingGlass size={13} className="text-ink-tertiary" />
        <span className="font-code text-[11px] text-ink-secondary">where is billing?</span>
        <span className="ml-auto flex items-center gap-1 font-code text-[10px] text-abort">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-abort" />
          0 results
        </span>
      </div>
    </div>
  )
}

function MentoringLoop() {
  return (
    <div className="space-y-2">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-md border border-seam bg-well p-3">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-primary/10 font-code text-[9px] font-bold text-accent-primary">
              {i === 0 ? 'S' : 'J'}
            </span>
            <span className="truncate font-code text-[11px] text-ink-secondary">
              {i === 0 ? 'senior: "which service calls auth?"' : 'junior: "what calls auth?"'}
            </span>
          </div>
          <div className="mt-2 h-1 w-24 rounded-full bg-seam motion-safe:animate-pulse" />
        </div>
      ))}
      <div className="rounded-md border border-caution/25 bg-caution/[0.06] px-3 py-2">
        <span className="font-code text-[10px] uppercase tracking-[0.12em] text-caution">
          same question · day 5
        </span>
      </div>
    </div>
  )
}

function HealthLoop() {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-md border border-seam bg-well p-3">
            <div className="font-code text-[10px] text-ink-secondary">onboarding</div>
            <div className="mt-1 font-body text-lg font-semibold text-ink-secondary">N/A</div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between rounded-md border border-seam bg-panel px-3 py-2">
        <span className="font-code text-[10px] uppercase tracking-[0.12em] text-ink-secondary">
          success rate
        </span>
        <span className="font-code text-[10px] text-ink-secondary">n/a</span>
      </div>
    </div>
  )
}

function ReviewLoop() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-md border border-seam bg-well p-3" style={{ opacity: 1 - i * 0.25 }}>
          <div className="flex items-center justify-between">
            <span className="font-code text-[11px] text-ink-secondary">PR #{180 - i}</span>
            <span className="font-code text-[10px] text-abort">waiting {2 + i}d</span>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-1.5 rounded-md border border-abort/25 bg-abort/[0.05] px-3 py-2">
        <ArrowClockwise size={12} className="animate-spin text-abort" />
        <span className="font-code text-[10px] uppercase tracking-[0.12em] text-abort">
          queue backed up
        </span>
      </div>
    </div>
  )
}

interface Tile {
  key: string
  title: string
  body: string
  metric: string
  metricLabel: string
  loop: ComponentType
  delay: number
}

const TILES: Tile[] = [
  {
    key: 'new-hire',
    title: 'New hires get lost',
    body: 'Open the repo, scroll the docs, find nothing. The scavenger hunt starts on day one.',
    metric: '72 hours',
    metricLabel: 'wasted per new hire',
    loop: ConfusionLoop,
    delay: 0.05,
  },
  {
    key: 'mentoring',
    title: 'Seniors become a search engine',
    body: 'The same architecture questions get answered for the fifth time this week.',
    metric: '18%',
    metricLabel: 'of senior dev time',
    loop: MentoringLoop,
    delay: 0.12,
  },
  {
    key: 'health',
    title: 'Leadership flies blind',
    body: 'No signal between "hired" and "shipping". Onboarding is a black box.',
    metric: '0',
    metricLabel: 'visibility into onboarding',
    loop: HealthLoop,
    delay: 0.18,
  },
  {
    key: 'reviews',
    title: 'Reviews stall',
    body: 'PRs pile up while reviewers answer questions a map would answer instantly.',
    metric: '5.2 day',
    metricLabel: 'average review wait',
    loop: ReviewLoop,
    delay: 0.24,
  },
]

export default function ProblemGrid() {
  return (
    <section id="the-gap" className="relative scroll-mt-24 border-t border-seam bg-base">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{ background: 'radial-gradient(ellipse 60% 40% at 20% 0%, rgb(var(--accent-primary) / 0.06), transparent 60%)' }}
      />
      <div className="relative mx-auto max-w-[1280px] px-6 py-24 lg:px-10 lg:py-32">
        <SectionHeading
          eyebrow="The problem"
          heading={<>Onboarding takes weeks. It shouldn't.</>}
          sub="Before the map exists, every team pays the same tax. Four ways the missing architecture costs you, week after week."
        />
        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {TILES.map((t) => (
            <motion.div key={t.key} {...fadeUp(t.delay)} className="h-full">
              <SpotlightCard
                className="h-full rounded-card border border-seam bg-panel shadow-seam"
                spotClassName="rounded-card"
              >
                <div className="flex h-full flex-col p-6">
                  <div className="group-hover:[&_*]:!animate-none [&_*]:motion-safe:animate-none">
                    <t.loop />
                  </div>
                  <h3 className="mt-6 font-body text-[16px] font-semibold text-ink">{t.title}</h3>
                  <p className="mt-2 text-[13.5px] leading-[1.6] text-ink-tertiary">{t.body}</p>
                  <div className="mt-auto flex items-baseline gap-2 border-t border-seam pt-6">
                    <span className="font-body text-2xl font-bold tracking-tight text-accent-primary">
                      {t.metric}
                    </span>
                    <span className="font-code text-[11px] text-ink-tertiary">{t.metricLabel}</span>
                  </div>
                </div>
              </SpotlightCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
