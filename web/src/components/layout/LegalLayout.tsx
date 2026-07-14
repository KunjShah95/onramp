import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, ShieldCheck } from '@phosphor-icons/react'
import MarketingLayout from './MarketingLayout'
import type { NavLinkItem } from './MarketingNav'

export interface LegalSection {
  heading: string
  paragraphs: string[]
  bullets?: string[]
}

interface LegalLayoutProps {
  label: string
  title: string
  lastUpdated: string
  intro: string
  sections: LegalSection[]
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
}

const navLinks: NavLinkItem[] = [
  { label: 'Docs', href: '/docs' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Changelog', href: '/changelog' },
]

export default function LegalLayout({ label, title, lastUpdated, intro, sections }: LegalLayoutProps) {
  return (
    <MarketingLayout navLinks={navLinks}>
      <div className="max-w-2xl mx-auto px-6 pt-16 pb-24">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-2 text-[hsl(var(--accent))] mb-4">
            <ShieldCheck className="w-4 h-4" weight="fill" />
            <span className="font-mono text-[11px] uppercase tracking-widest">{label}</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl mb-3 font-bold tracking-tight text-[hsl(var(--foreground))]">{title}</h1>
          <p className="font-mono text-xs text-[hsl(var(--muted-foreground))]/50 mb-4">Last updated: {lastUpdated}</p>
          <p className="text-[hsl(var(--muted-foreground))] text-sm leading-relaxed font-body">{intro}</p>
        </div>

        {/* Sections */}
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-10">
          {sections.map((section, idx) => (
            <motion.section key={section.heading} variants={itemVariants} className="relative pl-6 border-l border-[hsl(var(--border))]">
              <div className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-[hsl(var(--accent))] bg-[hsl(var(--background))]" />
              <h2 className="font-display text-lg font-bold text-[hsl(var(--foreground))] mb-3">
                <span className="font-mono text-xs text-[hsl(var(--muted-foreground))]/50 mr-2">{String(idx + 1).padStart(2, '0')}</span>
                {section.heading}
              </h2>
              {section.paragraphs.map((p, i) => (
                <p key={i} className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed mb-2.5 font-body">{p}</p>
              ))}
              {section.bullets && (
                <ul className="space-y-2 mt-2">
                  {section.bullets.map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-[hsl(var(--muted-foreground))] leading-relaxed font-body">
                      <ArrowRight className="w-3.5 h-3.5 text-[hsl(var(--accent))] mt-0.5 shrink-0" weight="bold" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </motion.section>
          ))}
        </motion.div>

        {/* Footer cross-link */}
        <div className="mt-16 pt-6 border-t border-[hsl(var(--border))] flex flex-wrap gap-6 text-sm">
          <Link to="/privacy" className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--accent))] transition-colors">Privacy Policy</Link>
          <Link to="/terms" className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--accent))] transition-colors">Terms of Service</Link>
          <a href="mailto:legal@onramp.ai" className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--accent))] transition-colors">legal@onramp.ai</a>
        </div>
      </div>
    </MarketingLayout>
  )
}
