import { motion } from 'framer-motion'
import { Star, Quotes, ArrowRight, Buildings, Rocket, ChartLineUp, Users } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
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

const logos = [
  'Vercel', 'Linear', 'Supabase', 'Cal.com', 'Trigger.dev', 'Railway',
]

interface Testimonial {
  quote: string
  author: string
  role: string
  company: string
  stars: number
}

const testimonials: Testimonial[] = [
  {
    quote: "Onramp cut our new-hire ramp time from 4 weeks to 5 days. New engineers ship to production in their first week — it's changed how we think about onboarding entirely.",
    author: 'Sarah Chen',
    role: 'VP of Engineering',
    company: 'Linear',
    stars: 5,
  },
  {
    quote: "The architecture map alone saved us hours of documentation time. Every PR now comes with automatic context — our code reviews are faster and more meaningful.",
    author: 'Marcus Rivera',
    role: 'CTO',
    company: 'Supabase',
    stars: 5,
  },
  {
    quote: "We scaled from 5 to 40 engineers in 18 months. Onramp made that possible without our senior team becoming bottlenecks. It's our secret weapon for growth.",
    author: 'Alex Thompson',
    role: 'Head of Developer Experience',
    company: 'Vercel',
    stars: 5,
  },
]

const stats = [
  { icon: Rocket, value: '3×', label: 'Faster onboarding' },
  { icon: ChartLineUp, value: '87%', label: 'First PR within week 1' },
  { icon: Users, value: '10K+', label: 'Repositories indexed' },
  { icon: Buildings, value: '500+', label: 'Teams onboarded' },
]

const caseStudies = [
  {
    company: 'Fintech startup',
    description: 'Reduced senior engineer OOO time by 60% using AI-powered codebase explanations and guided learning paths.',
    result: '60% less context-switching',
  },
  {
    company: 'E-commerce platform',
    description: 'Onboarded 12 new engineers across 3 time zones in a single quarter without slowing down the release cycle.',
    result: '12 hires shipped in Q1',
  },
  {
    company: 'Dev tools company',
    description: 'Turned their monorepo into a navigable knowledge graph, eliminating the 2-week "just read the code" phase.',
    result: '80% fewer onboarding questions',
  },
]

export default function CustomersPage() {
  return (
    <MarketingLayout navLinks={navLinks}>
      <div className="max-w-5xl mx-auto px-6 pt-16 pb-24">
        {/* Hero */}
        <motion.div {...fadeUp(0)} className="mb-20 text-center">
          <div className="flex items-center justify-center gap-2 text-[hsl(var(--accent))] mb-4">
            <Users className="w-4 h-4" weight="fill" />
            <span className="font-mono text-[11px] uppercase tracking-widest text-[hsl(var(--foreground))]">Customers</span>
          </div>
          <h1 className="font-display text-4xl md:text-5xl mb-4 font-bold tracking-tight text-[hsl(var(--foreground))]">
            Trusted by <span className="italic text-[hsl(var(--accent))]">engineering teams</span> worldwide.
          </h1>
          <p className="text-lg text-[hsl(var(--muted-foreground))] leading-relaxed max-w-2xl mx-auto">
            From fast-growing startups to established engineering organizations — Onramp helps teams ship faster, onboard smoother, and stay in flow.
          </p>
        </motion.div>

        {/* Logo cloud */}
        <motion.div {...fadeUp(0.08)} className="mb-20">
          <p className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))] text-center mb-8">
            Trusted by leading engineering teams
          </p>
          <div className="flex flex-wrap items-center justify-center gap-12">
            {logos.map((name) => (
              <span
                key={name}
                className="text-xl font-display font-semibold tracking-tight text-[hsl(var(--muted-foreground))]/40 hover:text-[hsl(var(--muted-foreground))]/60 transition-colors"
              >
                {name}
              </span>
            ))}
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div {...fadeUp(0.16)} className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-20">
          {stats.map((s) => (
            <div
              key={s.label}
              className="p-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/30 text-center transition-all duration-300 hover:-translate-y-0.5 hover:border-[hsl(var(--accent))]/30"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))] mx-auto mb-3">
                <s.icon size={20} weight="duotone" />
              </span>
              <div className="font-display text-3xl font-bold text-[hsl(var(--foreground))]">{s.value}</div>
              <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{s.label}</div>
            </div>
          ))}
        </motion.div>

        {/* Testimonials */}
        <motion.div {...fadeUp(0.24)} className="mb-20">
          <h2 className="font-display text-2xl font-bold text-[hsl(var(--foreground))] mb-8 text-center">What our customers say</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div
                key={t.author}
                className="p-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/30 transition-all duration-300 hover:-translate-y-0.5 hover:border-[hsl(var(--accent))]/30 hover:shadow-md flex flex-col"
              >
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: t.stars }).map((_, si) => (
                    <Star key={si} size={14} weight="fill" className="text-[hsl(var(--accent))]" />
                  ))}
                </div>
                <Quotes size={20} weight="fill" className="text-[hsl(var(--accent))]/20 mb-3" />
                <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed flex-1 mb-4 italic">"{t.quote}"</p>
                <div>
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{t.author}</div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">{t.role}, {t.company}</div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Case studies */}
        <motion.div {...fadeUp(0.32)} className="mb-16">
          <h2 className="font-display text-2xl font-bold text-[hsl(var(--foreground))] mb-8 text-center">Case studies</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {caseStudies.map((cs) => (
              <div
                key={cs.company}
                className="p-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/50 transition-all duration-300 hover:-translate-y-0.5 hover:border-[hsl(var(--accent))]/30"
              >
                <h3 className="font-display text-lg font-semibold text-[hsl(var(--foreground))] mb-2 capitalize">{cs.company}</h3>
                <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed mb-4">{cs.description}</p>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))] text-xs font-semibold">
                  <ArrowRight size={12} weight="bold" />
                  {cs.result}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div {...fadeUp(0.4)} className="text-center p-8 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/50">
          <h2 className="font-display text-2xl font-bold text-[hsl(var(--foreground))] mb-3">Ready to transform your onboarding?</h2>
          <p className="text-[hsl(var(--muted-foreground))] mb-6 max-w-lg mx-auto">
            Join hundreds of engineering teams already using Onramp to ship faster.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold hover:opacity-90 transition-all"
            >
              Talk to sales <ArrowRight size={16} />
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--foreground))] text-sm font-semibold hover:bg-[hsl(var(--card))]/50 transition-all"
            >
              View pricing
            </Link>
          </div>
        </motion.div>
      </div>
    </MarketingLayout>
  )
}
