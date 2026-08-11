import { motion } from 'framer-motion'
import { MagnifyingGlass, ArrowClockwise } from '@phosphor-icons/react'

const EASE = [0.16, 1, 0.3, 1] as const

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.3 },
  transition: { duration: 0.65, delay, ease: EASE },
})

/* ── Mini animated previews (auto-play, pause on hover via parent) ── */

function ConfusionLoop() {
  return (
    <div className="space-y-2">
      <div className="rounded-sm border border-white/10 bg-white/[0.03] p-3">
        <div className="font-code text-[10px] uppercase tracking-[0.14em] text-ink-tertiary">
          docs/architecture.md
        </div>
        <div className="mt-2 space-y-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-1.5 rounded-full bg-white/10"
              style={{ width: `${88 - i * 18}%` }}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-sm bg-white/[0.04] px-3 py-2">
        <MagnifyingGlass size={13} className="text-ink-tertiary" />
        <span className="font-code text-[11px] text-ink-secondary">where is billing?</span>
        <span className="ml-auto flex items-center gap-1 font-code text-[10px] text-[#F87171]">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#F87171]" />
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
        <div key={i} className="rounded-sm border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-via/20 font-code text-[9px] font-bold text-accent-primary-hover">
              {i === 0 ? 'S' : 'J'}
            </span>
            <span className="font-code text-[11px] text-ink-secondary">
              {i === 0 ? 'senior: "which service calls auth?"' : 'junior: "what calls auth?"'}
            </span>
          </div>
          <div className="mt-2 h-1 w-24 rounded-full bg-[#F59E0B]/40 motion-safe:animate-pulse" />
        </div>
      ))}
      <div className="rounded-sm border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-3 py-2">
        <span className="font-code text-[10px] uppercase tracking-[0.12em] text-[#FBBF24]">
          same question · day 5
        </span>
      </div>
    </div>
  )
}

function HealthLoop() {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-sm border border-white/10 bg-white/[0.03] p-3">
            <div className="font-code text-[10px] text-ink-tertiary">onboarding</div>
            <div className="mt-1 font-code text-lg font-semibold text-ink-tertiary">—</div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between rounded-sm bg-white/[0.04] px-3 py-2">
        <span className="font-code text-[10px] uppercase tracking-[0.12em] text-ink-tertiary">
          success rate
        </span>
        <span className="font-code text-[10px] text-ink-tertiary">n/a</span>
      </div>
    </div>
  )
}

function ReviewLoop() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-sm border border-white/10 bg-white/[0.03] p-3"
          style={{ opacity: 1 - i * 0.25 }}
        >
          <div className="flex items-center justify-between">
            <span className="font-code text-[11px] text-ink-secondary">PR #{180 - i}</span>
            <span className="font-code text-[10px] text-[#F87171]">waiting {2 + i}d</span>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-1.5 rounded-sm border border-[#F87171]/30 bg-[#F87171]/10 px-3 py-2">
        <ArrowClockwise size={12} className="animate-spin text-[#F87171]" />
        <span className="font-code text-[10px] uppercase tracking-[0.12em] text-[#F87171]">
          queue backed up
        </span>
      </div>
    </div>
  )
}

const TILES = [
  {
    key: 'new-hire',
    title: 'New Hire Day 1',
    body: 'Open the repo, scroll the docs, find nothing. The scavenger hunt begins.',
    metric: '72 hours',
    metricLabel: 'wasted searching',
    status: 'CONFUSED',
    statusClass: 'border-[#F87171]/40 bg-[#F87171]/10 text-[#F87171]',
    loop: ConfusionLoop,
  },
  {
    key: 'mentoring',
    title: 'Senior Dev Mentoring',
    body: 'The senior explains the same architecture for the fifth time this week.',
    metric: '18%',
    metricLabel: 'of senior dev time',
    status: 'BOTTLENECK',
    statusClass: 'border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#FBBF24]',
    loop: MentoringLoop,
  },
  {
    key: 'health',
    title: 'Invisible Team Health',
    body: 'Leadership has no signal between "hired" and "shipping".',
    metric: '0',
    metricLabel: 'visibility into onboarding',
    status: 'UNMEASURED',
    statusClass: 'border-white/15 bg-white/[0.06] text-ink-tertiary',
    loop: HealthLoop,
  },
  {
    key: 'reviews',
    title: 'Code Review Delays',
    body: 'PRs pile up while reviewers answer questions that a map would answer.',
    metric: '5.2 day',
    metricLabel: 'avg review wait',
    status: 'DELAYED',
    statusClass: 'border-[#F87171]/40 bg-[#F87171]/10 text-[#F87171]',
    loop: ReviewLoop,
  },
]

export default function ProblemGrid() {
  return (
    <section id="the-gap" className="relative border-t border-white/5 bg-base">
      <div className="mx-auto max-w-[1280px] px-6 py-24 lg:px-10 lg:py-32">
        <motion.div {...fadeUp(0)} className="max-w-2xl">
          <p className="font-code text-[11px] font-medium uppercase tracking-[0.16em] text-[#F59E0B]">
            The onboarding gap
          </p>
          <h2 className="mt-4 font-display text-[clamp(1.8rem,4vw,3rem)] font-bold leading-[1.06] tracking-[-0.02em] text-white">
            The hidden cost of lost time.
          </h2>
        </motion.div>

        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TILES.map((t, i) => (
            <motion.div
              key={t.key}
              {...fadeUp(0.1 + i * 0.08)}
              className="group relative flex flex-col overflow-hidden rounded-sm border border-white/10 bg-panel transition-colors duration-300 hover:border-white/20"
            >
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                <span className="font-code text-[10px] uppercase tracking-[0.14em] text-ink-tertiary">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className={`rounded-sm border px-2 py-0.5 font-code text-[10px] font-medium tracking-[0.1em] ${t.statusClass}`}>
                  {t.status}
                </span>
              </div>

              <div className="flex-1 px-5 pt-5">
                <div className="group-hover:[&_*]:!animate-none [&_*]:motion-safe:animate-none">
                  <t.loop />
                </div>
              </div>

              <div className="mt-auto px-5 pb-5 pt-6">
                <h3 className="font-display text-[15px] font-bold text-white">{t.title}</h3>
                <p className="mt-2 text-[13px] leading-[1.6] text-ink-tertiary">{t.body}</p>
                <div className="mt-4 flex items-baseline gap-2 border-t border-white/5 pt-4">
                  <span className="font-code text-2xl font-semibold tracking-tight text-white">
                    {t.metric}
                  </span>
                  <span className="font-code text-[11px] text-ink-tertiary">{t.metricLabel}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
