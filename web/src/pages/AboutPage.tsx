import { motion } from 'framer-motion'
import { UsersThree, Sparkle, Globe, ShieldCheck } from '@phosphor-icons/react'
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
    desc: 'We integrate with the tools you already use: GitHub, GitLab, Slack, Linear · and never lock you in.',
  },
  {
    icon: ShieldCheck,
    title: 'Privacy by design',
    desc: 'Your code stays yours. We process source to build an analysis graph, then discard raw content. No training on customer data.',
  },
]

export default function AboutPage() {
  return (
    <MarketingLayout
      navLinks={navLinks}
      seo={{ title: 'About · Onramp', description: 'The team and mission behind Onramp · AI-powered developer onboarding for modern engineering teams.', path: '/about' }}
    >
      <div className="max-w-4xl mx-auto px-6 pt-10 pb-24">
        {/* Hero — same pill language as landing/Why */}
        <motion.div {...fadeUp(0)} className="mb-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3.5 py-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-primary" />
            <span className="font-code text-[10px] font-medium uppercase tracking-[0.16em] text-ink-secondary">About</span>
          </span>
          <h1 className="font-body text-[clamp(2rem,4.2vw,3rem)] mt-5 mb-4 font-bold leading-[1.05] tracking-[-0.02em] text-ink">
            We're on a mission to <span className="text-gradient">eliminate onboarding friction</span> for every developer.
          </h1>
          <p className="text-[17px] leading-[1.6] text-ink-secondary max-w-2xl">
            Onramp was founded in 2025 by engineers tired of watching new hires spend weeks lost in unfamiliar codebases.
            Context shouldn't be tribal knowledge. It should be a living map.
          </p>
        </motion.div>

        {/* Story — ruled panel, editorial */}
        <motion.div {...fadeUp(0.08)} className="mb-16 rounded-2xl border border-black/10 bg-white p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <p className="font-code text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-primary">Our story</p>
          <h2 className="mt-2 font-body text-2xl font-bold tracking-tight text-ink">From scattered READMEs to one live map.</h2>
          <div className="mt-4 space-y-4 text-[15px] leading-[1.7] text-ink-secondary">
            <p>
              Every developer knows the feeling: you join a new team, get handed a laptop, and spend the next three weeks
              piecing together how the codebase works from scattered READMEs, senior office hours, and trial by fire.
            </p>
            <p>
              We built Onramp to change that. By mapping architecture, ownership, and data flows straight from source,
              Onramp turns an unfamiliar repository into a guided ramp — so new hires ship their first PR in days, not weeks.
            </p>
            <p className="font-code text-[13px] text-ink-tertiary">Today the graph powers onboarding, review, and org health for teams running their real repositories. The map stays fresh on every push.</p>
          </div>
        </motion.div>

        {/* Values */}
        <motion.div {...fadeUp(0.16)}>
          <h2 className="font-display text-2xl font-bold text-[hsl(var(--foreground))] mb-8 text-center">What we believe</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {values.map((v) => (
              <div
                key={v.title}
                className="rounded-2xl border border-black/10 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:border-accent-primary/20 hover:shadow-[0_12px_32px_rgba(15,23,42,0.06)]"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 bg-white text-accent-primary mb-4">
                  <v.icon size={20} weight="bold" />
                </span>
                <h3 className="font-body text-[16px] font-semibold text-ink mb-2">{v.title}</h3>
                <p className="text-[13.5px] leading-[1.6] text-ink-tertiary">{v.desc}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Team */}
      </div>
    </MarketingLayout>
  )
}
