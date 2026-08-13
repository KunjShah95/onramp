import { motion } from 'framer-motion'
import { TreeStructure, UsersThree, Sparkle, Globe, ShieldCheck } from '@phosphor-icons/react'
import MarketingLayout from '../components/layout/MarketingLayout'
import type { NavLinkItem } from '../components/layout/MarketingNav'

const navLinks: NavLinkItem[] = [
  { label: 'Docs', href: '/docs' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Changelog', href: '/changelog' },
]

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.35 },
  transition: { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] as const },
})

const values = [
  {
    icon: UsersThree,
    title: 'Developer-first',
    desc: 'Every feature starts with the question: does this make an engineer more effective? We build for the people who build.',
  },
  {
    icon: Sparkle,
    title: 'Radical transparency',
    desc: 'We show our work. Our AI attributes every answer to specific files and lines, so you can verify everything.',
  },
  {
    icon: Globe,
    title: 'Open ecosystems',
    desc: 'We integrate with the tools you already use — GitHub, GitLab, Slack, Linear — and never lock you in.',
  },
  {
    icon: ShieldCheck,
    title: 'Privacy by design',
    desc: 'Your code stays yours. We process source to build an analysis graph, then discard raw content. No training on customer data.',
  },
]

export default function AboutPage() {
  return (
    <MarketingLayout navLinks={navLinks}>
      <div className="max-w-4xl mx-auto px-6 pt-16 pb-24">
        {/* Hero */}
        <motion.div {...fadeUp(0)} className="mb-16">
          <div className="flex items-center gap-2 text-[hsl(var(--accent))] mb-4">
            <TreeStructure className="w-4 h-4" weight="fill" />
            <span className="font-mono text-[11px] uppercase tracking-widest text-[hsl(var(--foreground))]">About</span>
          </div>
          <h1 className="font-display text-4xl md:text-5xl mb-4 font-bold tracking-tight text-[hsl(var(--foreground))]">
            We're on a mission to <span className="italic text-[hsl(var(--accent))]">eliminate onboarding friction</span> for every developer.
          </h1>
          <p className="text-lg text-[hsl(var(--muted-foreground))] leading-relaxed max-w-2xl">
            Onramp was founded in 2025 by engineers who were tired of watching new hires spend weeks lost in unfamiliar codebases.
            We believe that context shouldn't be tribal knowledge — it should be a living map that every engineer can explore.
          </p>
        </motion.div>

        {/* Story */}
        <motion.div {...fadeUp(0.08)} className="mb-16 p-8 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/50">
          <h2 className="font-display text-2xl font-bold text-[hsl(var(--foreground))] mb-4">Our story</h2>
          <div className="space-y-4 text-[hsl(var(--muted-foreground))] leading-relaxed">
            <p>
              Every developer knows the feeling: you join a new team, get handed a laptop, and spend the next three weeks
              piecing together how the codebase works from scattered READMEs, senior engineer office hours, and trial by fire.
            </p>
            <p>
              We built Onramp to change that. By automatically mapping architecture, ownership, and data flows, Onramp turns
              an unfamiliar repository into a guided learning path — so new hires ship their first PR in days, not weeks.
            </p>
            <p>
              Today, Onramp indexes tens of thousands of repositories for engineering teams around the world. We're backed
              by top-tier investors and growing fast. And we're just getting started.
            </p>
          </div>
        </motion.div>

        {/* Values */}
        <motion.div {...fadeUp(0.16)}>
          <h2 className="font-display text-2xl font-bold text-[hsl(var(--foreground))] mb-8 text-center">What we believe</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {values.map((v) => (
              <div
                key={v.title}
                className="p-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/30 transition-all duration-300 hover:-translate-y-0.5 hover:border-[hsl(var(--accent))]/30 hover:shadow-md"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))] mb-4">
                  <v.icon size={20} weight="duotone" />
                </span>
                <h3 className="font-display text-lg font-semibold text-[hsl(var(--foreground))] mb-2">{v.title}</h3>
                <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Team */}
      </div>
    </MarketingLayout>
  )
}
