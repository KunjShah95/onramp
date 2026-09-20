import type { ComponentType } from 'react'
import { MagnifyingGlass } from '@phosphor-icons/react'
import SectionHeading from './SectionHeading'

/* Calm problem grid — static panels, no spotlight, no staggered
 * motion, no bounce/pulse/spin loops. Quiet type, hairline borders. */

function ConfusionLoop() {
  return (
    <div className="space-y-2">
      <div className="rounded-md border border-seam bg-well p-3">
        <div className="font-code text-[11px] text-ink-tertiary">docs/architecture.md</div>
        <div className="mt-2 space-y-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-1.5 rounded-full bg-seam" style={{ width: `${88 - i * 18}%` }} />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-md border border-seam bg-panel px-3 py-2">
        <MagnifyingGlass size={13} className="text-ink-tertiary" />
        <span className="font-code text-xs text-ink-secondary">where is billing?</span>
        <span className="ml-auto font-code text-[11px] text-ink-tertiary">0 results</span>
      </div>
    </div>
  )
}

function MentoringLoop() {
  return (
    <div className="space-y-2">
      {['senior: "which service calls auth?"', 'junior: "what calls auth?"'].map((q) => (
        <div key={q} className="rounded-md border border-seam bg-well px-3 py-2">
          <span className="font-code text-xs text-ink-secondary">{q}</span>
        </div>
      ))}
      <div className="rounded-md border border-seam bg-panel px-3 py-2">
        <span className="font-code text-[11px] text-ink-tertiary">same question · day 5</span>
      </div>
    </div>
  )
}

function HealthLoop() {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-md border border-seam bg-well p-3">
            <div className="font-code text-[11px] text-ink-tertiary">onboarding</div>
            <div className="mt-1 text-lg font-semibold text-ink-tertiary">N/A</div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between rounded-md border border-seam bg-panel px-3 py-2">
        <span className="font-code text-[11px] text-ink-tertiary">success rate</span>
        <span className="font-code text-[11px] text-ink-tertiary">n/a</span>
      </div>
    </div>
  )
}

function ReviewLoop() {
  return (
    <div className="space-y-2">
      {[180, 179, 178].map((n) => (
        <div key={n} className="rounded-md border border-seam bg-well px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="font-code text-xs text-ink-secondary">PR #{n}</span>
            <span className="font-code text-[11px] text-ink-tertiary">waiting</span>
          </div>
        </div>
      ))}
      <div className="rounded-md border border-seam bg-panel px-3 py-2">
        <span className="font-code text-[11px] text-ink-tertiary">queue backed up</span>
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
}

const TILES: Tile[] = [
  {
    key: 'new-hire',
    title: 'New hires get lost',
    body: 'Open the repo, scroll the docs, find nothing. The scavenger hunt starts on day one.',
    metric: '72 hours',
    metricLabel: 'wasted per new hire',
    loop: ConfusionLoop,
  },
  {
    key: 'mentoring',
    title: 'Seniors become a search engine',
    body: 'The same architecture questions get answered for the fifth time this week.',
    metric: '18%',
    metricLabel: 'of senior dev time',
    loop: MentoringLoop,
  },
  {
    key: 'health',
    title: 'Leadership flies blind',
    body: 'No signal between "hired" and "shipping". Onboarding is a black box.',
    metric: '0',
    metricLabel: 'visibility into onboarding',
    loop: HealthLoop,
  },
  {
    key: 'reviews',
    title: 'Reviews stall',
    body: 'PRs pile up while reviewers answer questions a map would answer instantly.',
    metric: '5.2 day',
    metricLabel: 'average review wait',
    loop: ReviewLoop,
  },
]

export default function ProblemGrid() {
  return (
    <section id="the-gap" className="scroll-mt-20 border-t border-seam bg-base">
      <div className="mx-auto max-w-6xl px-6 py-16 lg:px-8 lg:py-20">
        <SectionHeading
          eyebrow="The problem"
          heading={<>Onboarding takes weeks. It shouldn&apos;t.</>}
          sub="Before the map exists, every team pays the same tax. Four ways the missing architecture costs you, week after week."
        />
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TILES.map((t) => (
            <div key={t.key} className="h-full rounded-md border border-seam bg-panel">
              <div className="flex h-full flex-col p-5">
                <t.loop />
                <h3 className="mt-5 text-[15px] font-semibold text-ink">{t.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-tertiary">{t.body}</p>
                <div className="mt-auto flex items-baseline gap-2 border-t border-seam pt-4">
                  <span className="text-xl font-semibold tracking-tight text-ink">{t.metric}</span>
                  <span className="font-code text-[11px] text-ink-tertiary">{t.metricLabel}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}