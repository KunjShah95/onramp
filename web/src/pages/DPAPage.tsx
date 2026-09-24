import { FileText, Envelope, ShieldCheck, Circle } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import MarketingLayout from '../components/layout/MarketingLayout'
import type { NavLinkItem } from '../components/layout/MarketingNav'

const navLinks: NavLinkItem[] = [
  { label: 'Docs', href: '/docs' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'Changelog', href: '/changelog' },
]

const processingTopics = [
  {
    title: 'Repository context',
    description:
      'Registered repository content is processed to create tenant-scoped documents, symbols, and embeddings used for grounded product features. Temporary clones are removed after indexing.',
  },
  {
    title: 'Workspace data',
    description:
      'Workspace, task, onboarding, and audit metadata are stored to provide the service and support role-based collaboration. Retention and deletion controls are being expanded.',
  },
  {
    title: 'Providers and payments',
    description:
      'Configured infrastructure, model, email, and payment providers process data under their own terms. The final subprocessor list and contractual notices are part of the customer agreement process.',
  },
]

const currentStatus = [
  'A standard DPA template is in preparation; no public download is available yet.',
  'GDPR and CCPA control implementation is in progress, not a completed certification claim.',
  'Subprocessor and cross-border processing terms are being finalized with design partners.',
]

/** Build an honest status schema; this is not a published executed agreement. */
function buildDPAStatusSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Data processing status · Onramp',
    description:
      'Current Onramp data-processing program status, with a DPA and subprocessor terms still being finalized.',
    url: 'https://onramp.app/dpa',
    publisher: {
      '@type': 'Organization',
      name: 'Onramp',
      logo: 'https://onramp.app/icon-512.svg',
    },
  }
}

function buildDPABreadcrumbSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://onramp.app/' },
      { '@type': 'ListItem', position: 2, name: 'Data processing', item: 'https://onramp.app/dpa' },
    ],
  }
}

export default function DPAPage() {
  const dpaSchema = buildDPAStatusSchema()
  const breadcrumbSchema = buildDPABreadcrumbSchema()

  return (
    <MarketingLayout
      navLinks={navLinks}
      seo={{
        title: 'Data processing status · Onramp',
        description: 'Current Onramp data-processing program status and DPA roadmap.',
        path: '/dpa',
        schema: [dpaSchema, breadcrumbSchema],
      }}
    >
      <div className="max-w-4xl mx-auto px-6 pt-16 pb-24">
        <div className="mb-16">
          <div className="flex items-center gap-2 text-[hsl(var(--accent))] mb-4">
            <FileText size={16} weight="bold" />
            <span className="font-mono text-[11px] uppercase tracking-widest text-[hsl(var(--foreground))]">Data processing</span>
          </div>
          <h1 className="font-display text-4xl md:text-5xl mb-4 font-bold tracking-tight text-[hsl(var(--foreground))]">
            Data processing <span className="italic text-[hsl(var(--accent))]">status.</span>
          </h1>
          <p className="text-lg text-[hsl(var(--muted-foreground))] leading-relaxed max-w-2xl">
            Onramp is formalizing its Data Processing Agreement and subprocessor terms with early customers. This
            page describes the current product behavior; it is not a public executed DPA.
          </p>
        </div>

        <div className="p-6 rounded-lg border border-[hsl(var(--accent))]/30 bg-[hsl(var(--accent))]/5 mb-12 flex items-start gap-4">
          <ShieldCheck size={24} weight="duotone" className="text-[hsl(var(--accent))] shrink-0 mt-0.5" />
          <div>
            <h2 className="font-display font-semibold text-[hsl(var(--foreground))] mb-1">Current status</h2>
            <ul className="space-y-2 text-sm text-[hsl(var(--muted-foreground))]">
              {currentStatus.map((item) => (
                <li key={item} className="flex gap-2">
                  <Circle size={7} weight="fill" className="mt-1.5 shrink-0 text-[hsl(var(--accent))]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <section className="mb-12 space-y-6" aria-labelledby="processing-topics">
          <h2 id="processing-topics" className="font-display text-2xl font-bold text-[hsl(var(--foreground))]">
            What the product processes
          </h2>
          {processingTopics.map((topic) => (
            <div key={topic.title} className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/30 p-6">
              <h3 className="font-display text-lg font-semibold text-[hsl(var(--foreground))] mb-2">{topic.title}</h3>
              <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">{topic.description}</p>
            </div>
          ))}
        </section>

        <section className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/50 p-8 text-center">
          <Envelope size={24} weight="duotone" className="mx-auto mb-4 text-[hsl(var(--accent))]" />
          <h2 className="font-display text-xl font-bold text-[hsl(var(--foreground))] mb-3">Need a draft or review?</h2>
          <p className="mx-auto max-w-lg text-sm leading-relaxed text-[hsl(var(--muted-foreground))] mb-6">
            Tell us which jurisdictions, subprocessors, retention periods, and security review requirements matter
            to your organization. We will share the current draft and identify any items still under review.
          </p>
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-5 py-2.5 text-sm font-semibold text-[hsl(var(--primary-foreground))] transition-all hover:opacity-90"
          >
            Contact the team
          </Link>
        </section>
      </div>
    </MarketingLayout>
  )
}
