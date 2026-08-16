import { motion } from 'framer-motion'
import { ShieldCheck, FileText, MagnifyingGlass, Certificate, ListChecks, Eye, CheckCircle } from '@phosphor-icons/react'
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

const trustPrinciples = [
  {
    icon: ShieldCheck,
    title: 'Security',
    desc: 'The system is protected against unauthorized access (physical and logical). This includes firewalls, access controls, encryption, and intrusion detection.',
  },
  {
    icon: Eye,
    title: 'Confidentiality',
    desc: 'Information designated as confidential is protected as committed. This covers encryption policies, data classification, and access restriction procedures.',
  },
  {
    icon: ListChecks,
    title: 'Availability',
    desc: 'The system is available for operation and use as committed. Our SLA targets 99.9% uptime with redundancy across multiple availability zones.',
  },
  {
    icon: MagnifyingGlass,
    title: 'Processing Integrity',
    desc: 'System processing is complete, valid, accurate, timely, and authorized. All data processing is logged and monitored for anomalies.',
  },
]

const controls = [
  { category: 'Access Control', items: ['MFA enforced for all admin accounts', 'Role-based access with least privilege', 'Quarterly access reviews', 'Automated de-provisioning'] },
  { category: 'Data Protection', items: ['AES-256 encryption at rest', 'TLS 1.3 for data in transit', 'Automated backup with DR testing', 'Data retention and deletion policies'] },
  { category: 'Monitoring & Logging', items: ['24/7 infrastructure monitoring', 'Immutable audit trail', 'SIEM integration', 'Anomaly detection and alerting'] },
  { category: 'Vulnerability Management', items: ['Monthly penetration tests', 'Dependency vulnerability scanning', 'Responsible disclosure program', 'Patch management within 30 days'] },
]

export default function SOC2Page() {
  return (
    <MarketingLayout
      navLinks={navLinks}
      seo={{ title: 'SOC 2 Type II — Onramp', description: 'Onramp is SOC 2 Type II certified. Learn how we protect customer data with industry-leading security controls.', path: '/soc-2' }}
    >
      <div className="max-w-4xl mx-auto px-6 pt-16 pb-24">
        {/* Hero */}
        <motion.div {...fadeUp(0)} className="mb-16">
          <div className="flex items-center gap-2 text-[hsl(var(--accent))] mb-4">
            <Certificate className="w-4 h-4" weight="fill" />
            <span className="font-mono text-[11px] uppercase tracking-widest text-[hsl(var(--foreground))]">SOC 2</span>
          </div>
          <h1 className="font-display text-4xl md:text-5xl mb-4 font-bold tracking-tight text-[hsl(var(--foreground))]">
            SOC 2{' '}
            <span className="italic text-[hsl(var(--accent))]">Type II</span>{' '}
            compliance.
          </h1>
          <p className="text-lg text-[hsl(var(--muted-foreground))] leading-relaxed max-w-2xl">
            Onramp is undergoing SOC 2 Type II certification — audited by an independent third party against
            the AICPA Trust Services Criteria for Security, Confidentiality, Availability, and Processing Integrity.
          </p>
        </motion.div>

        {/* Status banner */}
        <motion.div {...fadeUp(0.08)} className="p-6 rounded-lg border border-[hsl(var(--accent))]/30 bg-[hsl(var(--accent))]/5 mb-12 flex items-start gap-4">
          <FileText size={24} weight="duotone" className="text-[hsl(var(--accent))] shrink-0 mt-0.5" />
          <div>
            <h2 className="font-display font-semibold text-[hsl(var(--foreground))] mb-1">SOC 2 Type II — In progress</h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Our audit is currently underway with an independent AICPA-accredited auditor. We expect to complete the certification process by Q4 2026.
              In the meantime, we operate with controls that meet or exceed SOC 2 requirements.
            </p>
          </div>
        </motion.div>

        {/* Trust principles */}
        <motion.div {...fadeUp(0.16)} className="mb-16">
          <h2 className="font-display text-2xl font-bold text-[hsl(var(--foreground))] mb-6">Trust Services Criteria</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {trustPrinciples.map((p) => (
              <div
                key={p.title}
                className="p-5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/30 transition-all duration-300 hover:-translate-y-0.5 hover:border-[hsl(var(--accent))]/30"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))] mb-3">
                  <p.icon size={18} weight="duotone" />
                </span>
                <h3 className="font-display font-semibold text-[hsl(var(--foreground))] mb-2">{p.title}</h3>
                <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Controls by category */}
        <div className="space-y-6 mb-16">
          {controls.map((c, i) => (
            <motion.div
              key={c.category}
              {...fadeUp(0.24 + i * 0.08)}
              className="p-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/30"
            >
              <h3 className="font-display text-base font-semibold text-[hsl(var(--foreground))] mb-4">{c.category}</h3>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {c.items.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-[hsl(var(--muted-foreground))]">
                    <CheckCircle size={16} className="text-[hsl(var(--accent))] shrink-0 mt-0.5" weight="fill" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        {/* Additional docs */}
        <motion.div {...fadeUp(0.56)} className="p-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/50 mb-12">
          <h2 className="font-display text-lg font-semibold text-[hsl(var(--foreground))] mb-4">Related resources</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link to="/security" className="flex items-center gap-2.5 p-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))]/20 text-sm text-[hsl(var(--foreground))] hover:border-[hsl(var(--accent))]/30 transition-colors">
              <ShieldCheck size={16} className="text-[hsl(var(--accent))]" weight="duotone" />
              Security overview
            </Link>
            <Link to="/dpa" className="flex items-center gap-2.5 p-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))]/20 text-sm text-[hsl(var(--foreground))] hover:border-[hsl(var(--accent))]/30 transition-colors">
              <FileText size={16} className="text-[hsl(var(--accent))]" weight="duotone" />
              Data Processing Agreement
            </Link>
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div {...fadeUp(0.64)} className="text-center p-8 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/50">
          <h2 className="font-display text-xl font-bold text-[hsl(var(--foreground))] mb-3">Need our SOC 2 report?</h2>
          <p className="text-[hsl(var(--muted-foreground))] mb-6 max-w-md mx-auto">
            Current and prospective customers can request our SOC 2 report under NDA.
          </p>
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold hover:opacity-90 transition-all"
          >
            Request report
          </Link>
        </motion.div>
      </div>
    </MarketingLayout>
  )
}
