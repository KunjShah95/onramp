import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { SuitcaseSimple, MapPin, Clock, ArrowRight, Sparkle, UsersThree, ChatCircleDots } from '@phosphor-icons/react'
import MarketingLayout from '../components/layout/MarketingLayout'
import type { NavLinkItem } from '../components/layout/MarketingNav'
import { openRoles } from '../data/careers'

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

const perks = [
  { icon: Sparkle, title: 'Competitive salary & equity', desc: 'We believe in sharing the upside. Every full-time employee gets meaningful equity.' },
  { icon: UsersThree, title: 'Remote-first culture', desc: 'Work from anywhere in the world. We asynchronous-communicate and gather as a team quarterly.' },
  { icon: ChatCircleDots, title: 'Learning budget', desc: '$5,000 annual budget for conferences, courses, books, or whatever helps you grow.' },
  { icon: Clock, title: 'Flexible PTO', desc: 'Take the time you need. We focus on outcomes, not hours logged.' },
]

export default function CareersPage() {
  return (
    <MarketingLayout navLinks={navLinks}>
      <div className="max-w-4xl mx-auto px-6 pt-16 pb-24">
        {/* Hero */}
        <motion.div {...fadeUp(0)} className="mb-16">
          <div className="flex items-center gap-2 text-[hsl(var(--accent))] mb-4">
            <SuitcaseSimple className="w-4 h-4" weight="fill" />
            <span className="font-mono text-[11px] uppercase tracking-widest text-[hsl(var(--foreground))]">Careers</span>
          </div>
          <h1 className="font-display text-4xl md:text-5xl mb-4 font-bold tracking-tight text-[hsl(var(--foreground))]">
            Help us <span className="italic text-[hsl(var(--accent))]">redefine</span> how developers onboard.
          </h1>
          <p className="text-lg text-[hsl(var(--muted-foreground))] leading-relaxed max-w-2xl">
            We're a small, fast-moving team building developer tools that actually make a difference.
            If you care deeply about developer experience, we'd love to hear from you.
          </p>
        </motion.div>

        {/* Why join us */}
        <motion.div {...fadeUp(0.08)} className="mb-16">
          <h2 className="font-display text-2xl font-bold text-[hsl(var(--foreground))] mb-6">Why join Onramp?</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {perks.map((p) => (
              <div
                key={p.title}
                className="p-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/30 transition-all duration-300 hover:-translate-y-0.5 hover:border-[hsl(var(--accent))]/30 hover:shadow-md"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))] mb-4">
                  <p.icon size={20} weight="duotone" />
                </span>
                <h3 className="font-display text-base font-semibold text-[hsl(var(--foreground))] mb-2">{p.title}</h3>
                <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Open roles */}
        <motion.div {...fadeUp(0.16)}>
          <h2 className="font-display text-2xl font-bold text-[hsl(var(--foreground))] mb-6">Open positions</h2>
          <div className="space-y-4">
            {openRoles.map((role, i) => (
              <Link key={role.slug} to={`/careers/${role.slug}`} className="block group">
                <motion.div
                  {...fadeUp(0.04 * i)}
                  className="p-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/30 transition-all duration-300 hover:-translate-y-0.5 hover:border-[hsl(var(--accent))]/30 hover:shadow-md"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
                    <div>
                      <h3 className="font-display text-lg font-bold text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--accent))] transition-colors">
                        {role.title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={12} weight="fill" />
                          {role.location}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock size={12} weight="fill" />
                          {role.type}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))] text-[10px] font-semibold uppercase tracking-wider">
                          {role.department}
                        </span>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-[hsl(var(--accent))] opacity-0 group-hover:opacity-100 transition-all translate-x-[-4px] group-hover:translate-x-0 shrink-0">
                      Apply <ArrowRight size={12} weight="bold" />
                    </span>
                  </div>
                  <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
                    {role.description}
                  </p>
                </motion.div>
              </Link>
            ))}
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div {...fadeUp(0.4)} className="mt-12 p-8 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/50 text-center">
          <h3 className="font-display text-lg font-bold text-[hsl(var(--foreground))] mb-2">Don't see the right role?</h3>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mb-5 max-w-md mx-auto">
            We're always looking for talented people. Send us your resume and we'll keep you in mind for future openings.
          </p>
          <a
            href="mailto:careers@onramp.ai"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold hover:opacity-90 transition-all"
          >
            careers@onramp.ai <ArrowRight size={14} weight="bold" />
          </a>
        </motion.div>
      </div>
    </MarketingLayout>
  )
}
