import { Link } from 'react-router-dom'
import MarketingLayout from '../components/layout/MarketingLayout'
import type { NavLinkItem } from '../components/layout/MarketingNav'

const navLinks: NavLinkItem[] = [
  { label: 'Docs', href: '/docs' },
  { label: 'Security', href: '/security' },
  { label: 'Changelog', href: '/changelog' },
]

const sections = [
  {
    title: 'Architecture & data flow',
    body: 'Repositories connect via GitHub App or URL, are cloned into an isolated environment, parsed into a dependency graph, and embedded into a workspace-scoped index. Raw clones are discarded after indexing. Retained data: derived code excerpts, embedding chunks, and graph symbols scoped to your workspace. Export and deletion controls are being expanded.',
  },
  {
    title: 'Retention',
    body: 'Context caches carry a TTL (default 24h). Embedding rows persist until the repository is removed or re-indexed. Agent events are retained for audit; legacy unscoped rows are never broadcast to user WebSockets. Backup and restore verification status is tracked per deployment.',
  },
  {
    title: 'Encryption',
    body: 'TLS 1.3 minimum in transit. AES-256 at rest with platform-managed keys. Per-tenant BYOK and custom rotation intervals are on the Enterprise roadmap — not yet available.',
  },
  {
    title: 'Access control',
    body: 'Cookie-based JWT auth. Repository indexes, agent sessions, and event streams are team-scoped with membership checks on every read, write, and publish. SSO/SAML/OIDC, SCIM provisioning, and admin MFA are on the roadmap.',
  },
  {
    title: 'Compliance',
    body: 'SOC 2 Type II is in progress — not certified. GDPR controls are in progress. A DPA template and subprocessor terms are being finalized; request a draft from the team. Data residency is single-region today; US/EU residency is on the Enterprise roadmap.',
  },
  {
    title: 'Subprocessors & status',
    body: 'Hosting and infrastructure vary by deployment (see deployment docs). No public uptime SLA is promised; contractual commitments are being defined. No published incident history yet — contact the security team for vendor assessments.',
  },
]

export default function TrustCenterPage() {
  return (
    <MarketingLayout
      navLinks={navLinks}
      seo={{
        title: 'Trust Center · Onramp',
        description: 'Current security, retention, encryption, and compliance status for Onramp. Verified scope only — roadmap items are labeled.',
        path: '/trust',
      }}
    >
      <div className="max-w-4xl mx-auto px-6 pt-16 pb-24">
        <p className="font-mono text-[11px] uppercase tracking-widest">Trust Center</p>
        <h1 className="font-display text-4xl md:text-5xl mb-4 font-bold tracking-tight">
          Verified scope, <span className="italic">not aspirations</span>.
        </h1>
        <p className="text-lg text-[hsl(var(--muted-foreground))] leading-relaxed max-w-2xl mb-4">
          Last updated Sep 2026 · DRAFT. Items marked roadmap are not implemented.
          Do not rely on roadmap items in procurement until this page shows an audit artifact and date.
        </p>
        <div className="space-y-6 mt-10">
          {sections.map((s) => (
            <div key={s.title} className="p-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/30">
              <h2 className="font-display text-lg font-semibold mb-2">{s.title}</h2>
              <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 text-center p-8 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/50">
          <h2 className="font-display text-xl font-bold mb-3">Need the full picture?</h2>
          <p className="text-[hsl(var(--muted-foreground))] mb-6 max-w-md mx-auto">
            Read the security overview, request a DPA, or talk to the team.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link to="/security" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-[hsl(var(--border))] text-sm font-semibold">Security overview</Link>
            <Link to="/dpa" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-[hsl(var(--border))] text-sm font-semibold">View DPA</Link>
            <Link to="/contact" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold">Contact security team</Link>
          </div>
        </div>
      </div>
    </MarketingLayout>
  )
}
