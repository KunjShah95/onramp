import { GithubLogo, MagnifyingGlass, Check } from '@phosphor-icons/react'
import SectionHeading from './SectionHeading'

/* Calm how-it-works — three plain cards with static visuals.
 * Removed: SpotlightCard glow, staggered springs, animated width /
 * scale / progress-bar choreography, gradient fills. */

function InstallVisual() {
  return (
    <div className="flex h-32 items-center justify-center gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-md border border-seam bg-well">
        <GithubLogo size={22} weight="fill" className="text-ink" />
      </div>
      <div className="h-px w-12 bg-seam-strong" aria-hidden />
      <div className="flex h-12 w-12 items-center justify-center rounded-md border border-seam bg-well">
        <Check size={20} weight="bold" aria-hidden className="shrink-0 text-go" />
      </div>
    </div>
  )
}

function IndexVisual() {
  return (
    <div className="flex h-32 flex-col items-center justify-center gap-3 px-6">
      <div className="grid grid-cols-4 gap-2" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-8 w-8 rounded-md border border-seam bg-well" />
        ))}
      </div>
      <div className="h-1.5 w-full max-w-[200px] rounded-full bg-well">
        <div className="h-full w-full rounded-full bg-go" aria-hidden />
      </div>
      <span className="font-code text-[11px] text-ink-tertiary">indexed</span>
    </div>
  )
}

function OnboardVisual() {
  return (
    <div className="flex h-32 flex-col justify-center gap-2 px-6">
      <div className="flex items-center gap-2 rounded-md border border-seam bg-well px-3 py-2">
        <MagnifyingGlass size={13} className="text-ink-tertiary" />
        <span className="font-code text-[11px] text-ink-secondary">how does billing work?</span>
      </div>
      <div className="rounded-md border border-seam bg-panel px-3 py-2">
        <span className="font-code text-[11px] text-ink-secondary">
          Billing → payments/billing · owner @payments
        </span>
      </div>
      <span className="font-code text-[11px] text-ink-tertiary">ship on day one</span>
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
    <section id="how-it-works" className="scroll-mt-20 border-t border-seam bg-room">
      <div className="mx-auto max-w-6xl px-6 py-16 lg:px-8 lg:py-20">
        <SectionHeading
          eyebrow="How it works"
          heading={<>Three steps to a map that never goes stale.</>}
          sub="No onboarding deck, no wiki crawl. The map draws itself, and keeps drawing itself on every push."
        />
        <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="flex h-full flex-col rounded-md border border-seam bg-panel p-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink-tertiary">{s.n}</span>
                <span className="text-xs text-ink-secondary">
                  {s.time}
                </span>
              </div>
              <div className="mt-2 w-full">
                <s.visual />
              </div>
              <h3 className="mt-2 text-base font-semibold text-ink">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-tertiary">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
