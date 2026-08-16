import { motion } from 'framer-motion'
import { ShieldCheck, Lock, Eye, Cloud, FileLock } from '@phosphor-icons/react'
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

const categories = [
  {
    icon: Lock,
    title: 'Encryption',
    items: [
      { label: 'Data in transit', value: 'TLS 1.3 (min) — all traffic encrypted via HTTPS and WSS' },
      { label: 'Data at rest', value: 'AES-256 encryption for all stored data, including backups' },
      { label: 'Key management', value: 'Per-tenant encryption keys, rotated automatically every 90 days' },
    ],
  },
  {
    icon: Eye,
    title: 'Access control',
    items: [
      { label: 'Authentication', value: 'OAuth 2.0 / OIDC, SAML SSO, passwordless via magic link' },
      { label: 'Authorization', value: 'Role-based access control (RBAC) with granular permissions' },
      { label: 'MFA', value: 'Multi-factor authentication enforced for admin accounts' },
    ],
  },
  {
    icon: Cloud,
    title: 'Infrastructure',
    items: [
      { label: 'Hosting', value: 'SOC 2 audited cloud providers (AWS, GCP)' },
      { label: 'Isolation', value: 'Tenant data isolated at the application layer' },
      { label: 'Backups', value: 'Automated daily snapshots with 30-day retention' },
    ],
  },
  {
    icon: FileLock,
    title: 'Compliance',
    items: [
      { label: 'Certifications', value: 'SOC 2 Type II (in progress), GDPR compliant' },
      { label: 'Data processing', value: 'Standard DPA signed with all customers upon request' },
      { label: 'Audit log', value: 'Immutable audit trail of all admin and system actions' },
    ],
  },
]

const certifications = [
  { name: 'SOC 2 Type II', status: 'In progress', desc: 'Annual third-party audit for security, availability, and confidentiality.' },
  { name: 'GDPR', status: 'Compliant', desc: 'Full compliance with EU General Data Protection Regulation requirements.' },
  { name: 'DPA', status: 'Available', desc: 'Standard Data Processing Agreement available for all customers.' },
  { name: 'Data residency', status: 'US / EU', desc: 'Choose data storage region — US (Virginia) or EU (Frankfurt).' },
]

export default function SecurityPage() {
  return (
    <MarketingLayout
      navLinks={navLinks}
      seo={{ title: 'Security — Onramp', description: 'Onramp security practices: encryption, access controls, SOC 2 Type II, GDPR compliance, and a responsible disclosure program.', path: '/security' }}
    >
      <div className="max-w-4xl mx-auto px-6 pt-16 pb-24">
        {/* Hero */}
        <motion.div {...fadeUp(0)} className="mb-16">
          <div className="flex items-center gap-2 text-[hsl(var(--accent))] mb-4">
            <ShieldCheck className="w-4 h-4" weight="fill" />
            <span className="font-mono text-[11px] uppercase tracking-widest text-[hsl(var(--foreground))]">Security</span>
          </div>
          <h1 className="font-display text-4xl md:text-5xl mb-4 font-bold tracking-tight text-[hsl(var(--foreground))]">
            Security is <span className="italic text-[hsl(var(--accent))]">built in</span> at every layer.
          </h1>
          <p className="text-lg text-[hsl(var(--muted-foreground))] leading-relaxed max-w-2xl">
            We take the security of your code and data seriously. Onramp employs industry-standard encryption,
            access controls, and compliance practices to keep your information safe.
          </p>
        </motion.div>

        {/* Certifications */}
        <motion.div {...fadeUp(0.08)} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-16">
          {certifications.map((cert) => (
            <div
              key={cert.name}
              className="p-5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/50 transition-all duration-300 hover:-translate-y-0.5 hover:border-[hsl(var(--accent))]/30"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-display font-semibold text-[hsl(var(--foreground))]">{cert.name}</h3>
                <span className="px-2.5 py-0.5 rounded-full bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))] text-[11px] font-semibold">
                  {cert.status}
                </span>
              </div>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">{cert.desc}</p>
            </div>
          ))}
        </motion.div>

        {/* Security categories */}
        <div className="space-y-6">
          {categories.map((cat, i) => (
            <motion.div
              key={cat.title}
              {...fadeUp(0.16 + i * 0.08)}
              className="p-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/30 transition-all duration-300 hover:border-[hsl(var(--accent))]/30"
            >
              <div className="flex items-center gap-3 mb-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))]">
                  <cat.icon size={18} weight="duotone" />
                </span>
                <h2 className="font-display text-lg font-semibold text-[hsl(var(--foreground))]">{cat.title}</h2>
              </div>
              <ul className="space-y-3">
                {cat.items.map((item) => (
                  <li key={item.label} className="flex items-start gap-3 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent))]/40 mt-1.5 shrink-0" />
                    <div>
                      <span className="font-semibold text-[hsl(var(--foreground))]">{item.label}:</span>{' '}
                      <span className="text-[hsl(var(--muted-foreground))]">{item.value}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <motion.div {...fadeUp(0.6)} className="mt-12 text-center p-8 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/50">
          <h2 className="font-display text-xl font-bold text-[hsl(var(--foreground))] mb-3">Have security questions?</h2>
          <p className="text-[hsl(var(--muted-foreground))] mb-6 max-w-md mx-auto">
            We're happy to share our security documentation, fill out your vendor assessment, or schedule a call.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold hover:opacity-90 transition-all"
            >
              Contact security team
            </Link>
            <Link
              to="/dpa"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--foreground))] text-sm font-semibold hover:bg-[hsl(var(--card))]/50 transition-all"
            >
              View DPA
            </Link>
          </div>
        </motion.div>
      </div>
    </MarketingLayout>
  )
}
