
import { ArrowRight, Brain, Code, Lightning } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import MarketingLayout from '../components/layout/MarketingLayout'
import { Table, THead, TBody, TR, TH, TD } from '../components/ui/table'
import PhilosophyHero from '../components/landing/PhilosophyHero'
import CostAtScaleCalculator from '../components/landing/CostAtScaleCalculator'
import type { NavLinkItem } from '../components/layout/MarketingNav'

const navLinks: NavLinkItem[] = [
  { label: 'Docs', href: '/docs' },
  { label: 'Why Onramp', href: '/why-onramp', active: true },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'Changelog', href: '/changelog' },
]



export default function WhyOnrampPage() {
  return (
    <MarketingLayout
      navLinks={navLinks}
      seo={{
        title: 'Why Onramp, Not Coding Agents | Onramp',
        description: 'Coding agents burn tokens re-reading your codebase on every change. Onramp indexes it once and answers from real context, a fraction of the cost at any team size.',
        path: '/why-onramp',
      }}
    >
      {/* Hero — same language as landing Hero */}
      <div className="relative pt-12 pb-12 px-6 text-center max-w-3xl mx-auto">
        <div>
          <h1 className="mb-5 text-4xl font-semibold leading-[1.08] tracking-[-0.02em] text-ink sm:text-5xl">
            Why Onramp, not coding agents.
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-base leading-relaxed text-ink-secondary sm:text-[17px]">
            Agents re-read the whole codebase on every change. Onramp indexes it once, updates the graph on the diff, and answers from real context — flat-priced, at any team size.
          </p>
        </div>
      </div>

      {/* Philosophy Hero — split panel visual */}
      <PhilosophyHero />

      {/* Core Philosophy — two ruled panels, muted vs. accent */}
      <div className="relative max-w-6xl mx-auto px-6 lg:px-8 grid grid-cols-1 md:grid-cols-12 gap-4 mb-10">
        {/* Why NOT Coding Agents — muted, ruled */}
        <div className="md:col-span-5 rounded-card border border-seam bg-panel p-6">
          <div className="flex items-center gap-3 mb-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-card border border-seam bg-well text-ink-tertiary">
              <Code size={18} weight="bold" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-ink">Why NOT coding agents</h2>
              <p className="font-code text-[10px] uppercase tracking-[0.12em] text-ink-muted">The token-burn loop</p>
            </div>
          </div>
          <ul className="space-y-3.5 text-[13.5px] leading-[1.6] text-ink-secondary">
            <li className="flex gap-3">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-abort" />
              <span><strong className="font-semibold text-ink">Burns tokens on every change.</strong> Each agent re-reads the whole codebase into context — multiplied by every dev and every product.</span>
            </li>
            <li className="flex gap-3">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-abort" />
              <span><strong className="font-semibold text-ink">Cost scales with headcount.</strong> Per-seat subscriptions AND per-context token burn.</span>
            </li>
            <li className="flex gap-3">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-abort" />
              <span><strong className="font-semibold text-ink">No lasting context.</strong> Every session starts from scratch. No graph persists.</span>
            </li>
            <li className="flex gap-3">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-abort" />
              <span><strong className="font-semibold text-ink">Paid keys for everything.</strong> Agents hit paid APIs constantly.</span>
            </li>
          </ul>
        </div>

        {/* Why Onramp — featured, accent rule, wider */}
        <div className="md:col-span-7 rounded-card border border-seam bg-panel p-6">
          <div className="flex items-center gap-3 mb-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-card bg-go text-accent-foreground">
              <Brain size={18} weight="bold" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-ink">Why Onramp</h2>
              <p className="font-code text-[10px] uppercase tracking-[0.12em] text-go">Parse once · answer from source</p>
            </div>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5 text-[13.5px] leading-[1.6] text-ink-secondary">
            <li className="flex gap-3">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-go" />
              <span><strong className="font-semibold text-ink">Reads your actual code.</strong> Parse → graph → answer.</span>
            </li>
            <li className="flex gap-3">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-go" />
              <span><strong className="font-semibold text-ink">Grounded answers.</strong> Every response cites files + lines.</span>
            </li>
            <li className="flex gap-3">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-go" />
              <span><strong className="font-semibold text-ink">Accessible to all levels.</strong> Senior or first PR.</span>
            </li>
            <li className="flex gap-3">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-go" />
              <span><strong className="font-semibold text-ink">Fast ramp.</strong> Zero to first PR in days.</span>
            </li>
          </ul>
          <div className="mt-6 rounded-card border border-seam bg-well px-4 py-3">
            <p className="font-code text-[11px] leading-[1.5] text-ink-secondary">Free-first LLM router + Redis semantic cache + incremental graph refresh — so most questions hit free tiers and only the diff is re-indexed on push.</p>
          </div>
        </div>
      </div>

      {/* The Three Pillars — three equal ruled panels */}
      <div className="relative max-w-6xl mx-auto px-6 lg:px-8 py-16">
        <div className="max-w-2xl mb-10">
          <p className="font-code text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">Principles</p>
          <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-[-0.02em] text-ink">Three beliefs about how devs actually learn.</h2>
          <p className="mt-3 text-[15px] leading-[1.6] text-ink-secondary">The philosophy is the product. Every wedge feature traces to one of these.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            {
              icon: Brain,
              kicker: '01 · Context',
              title: 'Context over commands',
              desc: 'Understanding WHY a file exists matters more than running a setup script. We show intent behind code, not just steps.',
            },
            {
              icon: Code,
              kicker: '02 · Truth',
              title: 'Code is truth',
              desc: 'Docs rot. Comments lie. Code never does. We read source and cite files + lines.',
            },
            {
              icon: Lightning,
              kicker: '03 · Speed',
              title: 'Speed builds confidence',
              desc: 'Fast onboarding lets devs contribute. First PR on day two beats “understanding” on day thirty.',
            },
          ].map((pillar) => (
            <div key={pillar.kicker} className="rounded-card border border-seam bg-panel p-6">
              <div className="flex items-start justify-between gap-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-card border border-seam bg-well text-ink-tertiary">
                  <pillar.icon size={18} weight="bold" />
                </span>
                <span className="font-code text-[10px] uppercase tracking-[0.14em] text-ink-muted">{pillar.kicker}</span>
              </div>
              <h3 className="mt-5 text-[15px] font-semibold text-ink">
                {pillar.title}
              </h3>
              <p className="mt-2 text-[13.5px] leading-[1.6] text-ink-secondary">
                {pillar.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Comparison Table — ruled panel, tabular */}
      <div className="relative max-w-6xl mx-auto px-6 lg:px-8 py-16">
        <div className="max-w-2xl mb-8">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">The breakdown.</h2>
          <p className="mt-2 text-[15px] leading-[1.6] text-ink-secondary">Side-by-side, same team size, same codebase churn.</p>
        </div>
        <div className="overflow-hidden rounded-card border border-seam bg-panel">
          <div className="overflow-x-auto">
            <Table className="text-[13.5px]">
              <THead>
                <TR className="bg-well">
                  <TH className="px-6 py-3 font-code text-[11px] font-medium uppercase tracking-[0.08em]">Aspect</TH>
                  <TH className="px-6 py-3 font-code text-[11px] font-medium uppercase tracking-[0.08em]">Coding agents</TH>
                  <TH className="px-6 py-3 font-code text-[11px] font-medium uppercase tracking-[0.08em] text-go">Onramp</TH>
                </TR>
              </THead>
              <TBody>
                {[
                  ['Context', 'Re-reads the whole codebase per change', 'Indexed once · graph updates on change'],
                  ['Cost model', 'Per-seat subs + per-dev token burn', 'Flat per-workspace price'],
                  ['Cost at scale', 'Grows with devs × products × changes', 'Flat · never moves'],
                  ['Token efficiency', 'Full re-read every session', 'Free-first routing + incremental refresh'],
                  ['Understand WHY', 'No, just HOW', 'Yes, full context'],
                ].map((row, idx) => (
                  <TR key={idx} hoverable>
                    <TD className="px-6 py-3.5 font-medium text-ink">{row[0]}</TD>
                    <TD className="px-6 py-3.5 text-ink-tertiary">{row[1]}</TD>
                    <TD className="px-6 py-3.5 font-medium text-ink">{row[2]}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Cost at scale — multiple devs × multiple products */}
      <div className="relative max-w-6xl mx-auto px-6 lg:px-8 py-16">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <p className="font-code text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">Calculator</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
            The cost at scale.
          </h2>
          <p className="mt-3 text-[15px] leading-[1.6] text-ink-secondary">
            Agents multiply devs × products × changes. Onramp stays flat. Move the sliders.
          </p>
        </div>
        <div className="rounded-card border border-seam bg-panel p-4 sm:p-6">
          <CostAtScaleCalculator />
        </div>
        <p className="text-center font-code text-[11px] text-ink-tertiary mt-6">
          Modeled on public agent pricing (Aug 2026) + Onramp $99/mo workspace · benchmark on <Link to="/ramp" className="text-ink underline underline-offset-2">Ramp →</Link>
        </p>
      </div>

      {/* CTA — ruled panel, same language as ClosingCta */}
      <div className="relative max-w-3xl mx-auto px-6 lg:px-8 py-16 text-center">
        <div className="rounded-card border border-seam bg-panel px-8 py-12">
          <p className="font-code text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">Get started</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Ready to onboard your way.
          </h2>
          <p className="mt-3 text-[15px] leading-[1.6] text-ink-secondary max-w-xl mx-auto">
            Join teams shipping faster because developers understand code from day one.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/#pricing"
              className="inline-flex h-11 items-center gap-2 rounded-md bg-ink px-6 text-[15px] font-medium text-[var(--panel-raised)] transition-opacity hover:opacity-90"
            >
              Start 14-day trial
              <ArrowRight size={16} weight="bold" />
            </Link>
            <Link to="/docs" className="inline-flex h-11 items-center rounded-md border border-seam bg-panel px-6 text-[15px] font-medium text-ink transition-colors hover:bg-well">
              Read the docs
            </Link>
          </div>
        </div>
      </div>
    </MarketingLayout>
  )
}
