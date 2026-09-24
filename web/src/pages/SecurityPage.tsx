import { ShieldCheck, Lock, Eye, Cloud, FileLock } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import MarketingLayout from '../components/layout/MarketingLayout'
import type { NavLinkItem } from '../components/layout/MarketingNav'

const navLinks: NavLinkItem[] = [
  { label: 'Docs', href: '/docs' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'Changelog', href: '/changelog' },
]

const categories = [
  {
    icon: Lock,
    title: 'Encryption',
    items: [
      { label: 'Data in transit', value: 'TLS 1.3 (min) · all traffic encrypted via HTTPS and WSS' },
      { label: 'Data at rest', value: 'AES-256 encryption for stored data, including backups (platform-managed keys; per-tenant BYOK on Enterprise roadmap)' },
      { label: 'Key management', value: 'Platform-managed rotation; per-tenant rotation interval on Enterprise roadmap' },
    ],
  },
  {
    icon: Eye,
    title: 'Access control',
    items: [
      { label: 'Authentication', value: 'Cookie-based JWT auth; OAuth 2.0 / OIDC and SAML SSO on Enterprise roadmap' },
      { label: 'Authorization', value: 'Team-scoped RBAC with workspace roles (granular permissions roadmap)' },
      { label: 'MFA', value: 'MFA on roadmap; enforced admin MFA not yet implemented' },
    ],
  },
  {
    icon: Cloud,
    title: 'Infrastructure',
    items: [
      { label: 'Hosting', value: 'Hosted on audited cloud providers (provider SOC reports available on request)' },
      { label: 'Isolation', value: 'Tenant data isolated at the application layer; row-level enforcement in progress' },
      { label: 'Backups', value: 'Automated snapshots (verify retention/restore per deployment; see Trust Center)' },
    ],
  },
  {
    icon: FileLock,
    title: 'Compliance',
    items: [
      { label: 'Certifications', value: 'SOC 2 Type II in progress (not certified); GDPR controls in progress' },
      { label: 'Data processing', value: 'DPA template and subprocessor terms in progress; request a draft' },
      { label: 'Audit log', value: 'Audit events retained; immutable export on Enterprise roadmap' },
    ],
  },
]

const certifications = [
  { name: 'SOC 2 Type II', status: 'In progress — not certified', desc: 'Third-party audit in progress; certification not yet achieved.' },
  { name: 'GDPR', status: 'In progress', desc: 'GDPR controls in progress; DPA available on request.' },
  { name: 'DPA', status: 'Available', desc: 'Standard Data Processing Agreement available for all customers.' },
  { name: 'Data residency', status: 'Roadmap', desc: 'Single-region deployment today; US/EU residency on Enterprise roadmap.' },
]

/** Build SecurityPage schema */
function buildSecuritySchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Security · Onramp',
    description: 'Onramp security practices: encryption, access controls, SOC 2 Type II audit status, GDPR control progress, and a responsible disclosure program.',
    url: 'https://onramp.app/security',
    publisher: {
      '@type': 'Organization',
      name: 'Onramp',
      logo: 'https://onramp.app/icon-512.svg',
    },
    mainEntity: {
      '@type': 'SecurityScheme',
      name: 'Onramp Security Program',
      description: 'Comprehensive security practices including encryption, access control, infrastructure security, and compliance.',
      encryption: {
        inTransit: 'TLS 1.3 minimum',
        atRest: 'AES-256',
        keyManagement: 'Platform-managed rotation; per-tenant rotation on Enterprise roadmap',
      },
      accessControl: {
        authentication: 'Cookie-based JWT auth; OAuth/OIDC and SAML SSO on Enterprise roadmap',
        authorization: 'Team-scoped RBAC; granular permissions roadmap',
        mfa: 'Not enforced for admin accounts',
      },
      compliance: {
        soc2: 'SOC 2 Type II in progress — not certified',
        gdpr: 'Controls in progress',
        dpa: 'Available on request',
        dataResidency: 'Single-region today; US/EU residency on Enterprise roadmap',
      },
    },
  }
}

/** Build BreadcrumbList schema for Security page */
function buildSecurityBreadcrumbSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://onramp.app/',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Security',
        item: 'https://onramp.app/security',
      },
    ],
  }
}

export default function SecurityPage() {
  const securitySchema = buildSecuritySchema()
  const breadcrumbSchema = buildSecurityBreadcrumbSchema()

  return (
    <MarketingLayout
      navLinks={navLinks}
      seo={{
        title: 'Security · Onramp',
        description: 'Onramp security practices: encryption, access controls, SOC 2 Type II audit status, GDPR control progress, and a responsible disclosure program.',
        path: '/security',
        schema: [securitySchema, breadcrumbSchema],
      }}
    >
      <div className="max-w-4xl mx-auto px-6 pt-16 pb-24">
        {/* Hero */}
        <div className="mb-16">
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
        </div>

        {/* Certifications */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-16">
          {certifications.map((cert) => (
            <div
              key={cert.name}
              className="p-5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/50 transition-colors hover:border-[hsl(var(--accent))]/30"
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
        </div>

        {/* Security categories */}
        <div className="space-y-6">
          {categories.map((cat) => (
            <div key={cat.title} className="p-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/30 transition-colors hover:border-[hsl(var(--accent))]/30">
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
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 text-center p-8 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/50">
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
        </div>
      </div>
    </MarketingLayout>
  )
}