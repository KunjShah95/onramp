import { motion } from 'framer-motion'
import { ArrowRight, Brain, Code, Lightning } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import MarketingLayout from '../components/layout/MarketingLayout'
import PhilosophyHero from '../components/landing/PhilosophyHero'
import CostAtScaleCalculator from '../components/landing/CostAtScaleCalculator'
import type { NavLinkItem } from '../components/layout/MarketingNav'

const navLinks: NavLinkItem[] = [
  { label: 'Docs', href: '/docs' },
  { label: 'Why Onramp', href: '/why-onramp', active: true },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Changelog', href: '/changelog' },
]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 90, damping: 20 } },
}

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
      <div className="relative pt-10 pb-12 px-6 text-center max-w-4xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.52, ease: [0.16, 1, 0.3, 1] }}>
          <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3.5 py-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-primary" />
            <span className="font-code text-[10px] font-medium uppercase tracking-[0.16em] text-ink-secondary">Engineering · Philosophy</span>
          </span>
          <h1 className="font-body text-[clamp(2.4rem,5.2vw,3.75rem)] mt-6 mb-5 font-bold leading-[1.02] tracking-[-0.03em] text-ink">
            Why Onramp, <span className="text-gradient">not coding agents.</span>
          </h1>
          <p className="text-ink-secondary text-[clamp(1.05rem,1.6vw,1.2rem)] leading-[1.5] mb-8 max-w-2xl mx-auto font-medium">
            Agents re-read the whole codebase on every change. Onramp indexes it once, updates the graph on the diff, and answers from real context — flat-priced, at any team size.
          </p>
        </motion.div>
      </div>

      {/* Philosophy Hero — split panel visual */}
      <PhilosophyHero />

      {/* Core Philosophy — bento: burn vs graph, editorial asymmetry */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative max-w-[1280px] mx-auto px-6 lg:px-10 grid grid-cols-1 md:grid-cols-12 gap-5 mb-10"
      >
        {/* Why NOT Coding Agents — muted, ruled */}
        <motion.div variants={itemVariants} className="md:col-span-5 rounded-2xl border border-black/10 bg-white p-7 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex items-center gap-3 mb-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-black/10 bg-slate-50 text-ink-tertiary">
              <Code size={18} weight="bold" />
            </span>
            <div>
              <h2 className="font-body text-[15px] font-semibold tracking-tight text-ink">Why NOT coding agents</h2>
              <p className="font-code text-[10px] uppercase tracking-[0.12em] text-ink-tertiary">The token-burn loop</p>
            </div>
          </div>
          <ul className="space-y-3.5 text-[13.5px] leading-[1.6] text-ink-secondary">
            <li className="flex gap-3">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#DC2626]" />
              <span><strong className="font-semibold text-ink">Burns tokens on every change.</strong> Each agent re-reads the whole codebase into context — multiplied by every dev and every product.</span>
            </li>
            <li className="flex gap-3">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#DC2626]" />
              <span><strong className="font-semibold text-ink">Cost scales with headcount.</strong> Per-seat subscriptions AND per-context token burn.</span>
            </li>
            <li className="flex gap-3">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#DC2626]" />
              <span><strong className="font-semibold text-ink">No lasting context.</strong> Every session starts from scratch. No graph persists.</span>
            </li>
            <li className="flex gap-3">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#DC2626]" />
              <span><strong className="font-semibold text-ink">Paid keys for everything.</strong> Agents hit paid APIs constantly.</span>
            </li>
          </ul>
        </motion.div>

        {/* Why Onramp — featured, indigo accent, 7 cols */}
        <motion.div variants={itemVariants} className="md:col-span-7 rounded-2xl border border-accent-primary/15 bg-white p-7 shadow-[0_8px_32px_rgba(79,70,229,0.08)]">
          <div className="flex items-center gap-3 mb-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-primary text-white shadow-[0_4px_14px_rgba(79,70,229,0.25)]">
              <Brain size={18} weight="bold" />
            </span>
            <div>
              <h2 className="font-body text-[15px] font-semibold tracking-tight text-ink">Why Onramp</h2>
              <p className="font-code text-[10px] uppercase tracking-[0.12em] text-accent-primary">Parse once · answer from source</p>
            </div>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5 text-[13.5px] leading-[1.6] text-ink-secondary">
            <li className="flex gap-3">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-primary" />
              <span><strong className="font-semibold text-ink">Reads your actual code.</strong> Parse → graph → answer.</span>
            </li>
            <li className="flex gap-3">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-primary" />
              <span><strong className="font-semibold text-ink">Grounded answers.</strong> Every response cites files + lines.</span>
            </li>
            <li className="flex gap-3">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-primary" />
              <span><strong className="font-semibold text-ink">Accessible to all levels.</strong> Senior or first PR.</span>
            </li>
            <li className="flex gap-3">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-primary" />
              <span><strong className="font-semibold text-ink">Fast ramp.</strong> Zero to first PR in days.</span>
            </li>
          </ul>
          <div className="mt-6 rounded-xl border border-black/5 bg-[#F8FAFC] px-4 py-3">
            <p className="font-code text-[11px] leading-[1.5] text-ink-tertiary">Free-first LLM router + Redis semantic cache + incremental graph refresh — so most questions hit free tiers and only the diff is re-indexed on push.</p>
          </div>
        </motion.div>
      </motion.div>

      {/* The Three Pillars — editorial, not 3 equal cards */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        className="relative max-w-[1280px] mx-auto px-6 lg:px-10 py-16"
      >
        <motion.div variants={itemVariants} className="max-w-2xl mb-10">
          <p className="font-code text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-primary">Principles</p>
          <h2 className="mt-2 font-body text-[clamp(1.8rem,3.4vw,2.4rem)] font-bold leading-[1.1] tracking-[-0.02em] text-ink">Three beliefs about how devs actually learn.</h2>
          <p className="mt-3 text-[15px] leading-[1.6] text-ink-secondary">The philosophy is the product. Every wedge feature traces to one of these.</p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          className="grid grid-cols-1 md:grid-cols-12 gap-5"
        >
          {[
            {
              icon: Brain,
              kicker: '01 · Context',
              title: 'Context over commands',
              desc: 'Understanding WHY a file exists matters more than running a setup script. We show intent behind code, not just steps.',
              span: 'md:col-span-7',
            },
            {
              icon: Code,
              kicker: '02 · Truth',
              title: 'Code is truth',
              desc: 'Docs rot. Comments lie. Code never does. We read source and cite files + lines.',
              span: 'md:col-span-5',
            },
            {
              icon: Lightning,
              kicker: '03 · Speed',
              title: 'Speed builds confidence',
              desc: 'Fast onboarding lets devs contribute. First PR on day two beats “understanding” on day thirty.',
              span: 'md:col-span-5',
            },
          ].map((pillar, idx) => (
            <motion.div
              key={idx}
              variants={itemVariants}
              className={`${pillar.span} rounded-2xl border border-black/10 bg-white p-7 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(15,23,42,0.06)]`}
            >
              <div className="flex items-start justify-between gap-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 bg-white text-accent-primary">
                  <pillar.icon size={20} weight="bold" />
                </span>
                <span className="font-code text-[10px] uppercase tracking-[0.14em] text-ink-tertiary">{pillar.kicker}</span>
              </div>
              <h3 className="mt-5 font-body text-[16px] font-semibold text-ink">
                {pillar.title}
              </h3>
              <p className="mt-2 text-[13.5px] leading-[1.6] text-ink-tertiary">
                {pillar.desc}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>

      {/* Comparison Table — ruled panel, tabular */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="relative max-w-[1280px] mx-auto px-6 lg:px-10 py-16"
      >
        <motion.div variants={itemVariants} className="max-w-2xl mb-8">
          <h2 className="font-body text-2xl font-bold tracking-tight text-ink">The breakdown.</h2>
          <p className="mt-2 text-[15px] leading-[1.6] text-ink-secondary">Side-by-side, same team size, same codebase churn.</p>
        </motion.div>
        <motion.div variants={itemVariants} className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-black/10 bg-[#F8FAFC]">
                  <th className="px-6 py-3 text-left font-code text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-tertiary">Aspect</th>
                  <th className="px-6 py-3 text-left font-code text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-tertiary">Coding agents</th>
                  <th className="px-6 py-3 text-left font-code text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-primary">Onramp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {[
                  ['Context', 'Re-reads the whole codebase per change', 'Indexed once · graph updates on change'],
                  ['Cost model', 'Per-seat subs + per-dev token burn', 'Flat per-workspace price'],
                  ['Cost at scale', 'Grows with devs × products × changes', 'Flat · never moves'],
                  ['Token efficiency', 'Full re-read every session', 'Free-first routing + incremental refresh'],
                  ['Understand WHY', 'No, just HOW', 'Yes, full context'],
                ].map((row, idx) => (
                  <tr key={idx} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="px-6 py-3.5 font-semibold text-ink">{row[0]}</td>
                    <td className="px-6 py-3.5 text-ink-tertiary">{row[1]}</td>
                    <td className="px-6 py-3.5 font-medium text-accent-primary">{row[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </motion.div>

      {/* Cost at scale — multiple devs × multiple products */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="relative max-w-[1280px] mx-auto px-6 lg:px-10 py-16"
      >
        <motion.div variants={itemVariants} className="text-center max-w-2xl mx-auto mb-10">
          <p className="font-code text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-primary">Calculator</p>
          <h2 className="mt-2 font-body text-3xl font-bold tracking-tight text-ink">
            The cost at scale.
          </h2>
          <p className="mt-3 text-[15px] leading-[1.6] text-ink-secondary">
            Agents multiply devs × products × changes. Onramp stays flat. Move the sliders.
          </p>
        </motion.div>
        <motion.div variants={itemVariants} className="rounded-2xl border border-black/10 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-8">
          <CostAtScaleCalculator />
        </motion.div>
        <motion.p variants={itemVariants} className="text-center font-code text-[11px] text-ink-tertiary mt-6">
          Modeled on public agent pricing (Aug 2026) + Onramp $99/mo workspace · benchmark on <Link to="/ramp" className="text-accent-primary hover:underline">Ramp →</Link>
        </motion.p>
      </motion.div>

      {/* CTA — ruled, premium, same language as ClosingCta */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="relative max-w-[880px] mx-auto px-6 lg:px-10 py-16 text-center"
      >
        <motion.div variants={itemVariants} className="rounded-2xl border border-black/10 bg-white px-8 py-12 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <p className="font-code text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-primary">Get started</p>
          <h2 className="mt-3 font-body text-3xl font-bold tracking-tight text-ink">
            Ready to onboard your way.
          </h2>
          <p className="mt-3 text-[15px] leading-[1.6] text-ink-secondary max-w-xl mx-auto">
            Join teams shipping faster because developers understand code from day one.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/pricing"
              className="inline-flex h-11 items-center gap-2 rounded-md bg-accent-primary px-6 text-[15px] font-semibold text-white shadow-[0_6px_20px_rgba(79,70,229,0.28)] transition-all hover:bg-accent-primary-hover active:translate-y-px"
            >
              Start 14-day trial
              <ArrowRight size={16} weight="bold" />
            </Link>
            <Link to="/docs" className="inline-flex h-11 items-center rounded-md border border-black/10 bg-white px-6 text-[15px] font-semibold text-ink transition-colors hover:border-black/15">
              Read the docs
            </Link>
          </div>
        </motion.div>
      </motion.div>
    </MarketingLayout>
  )
}
