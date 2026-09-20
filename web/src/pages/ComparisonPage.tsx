import { ArrowRight, Code } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import MarketingLayout from '../components/layout/MarketingLayout'
import { Table, THead, TBody, TR, TH, TD } from '../components/ui/table'
import type { NavLinkItem } from '../components/layout/MarketingNav'

const navLinks: NavLinkItem[] = [
  { label: 'Docs', href: '/docs' },
  { label: 'Why Onramp', href: '/why-onramp', active: true },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'Changelog', href: '/changelog' },
]

/** Comparison data - update with real competitor data */
const COMPETITORS = {
  'GitHub Copilot': {
    pricing: 'Per seat ($10-19/mo)',
    context: 'Re-reads whole codebase per query',
    costAtScale: 'Grows with team × queries',
    tokenEfficiency: 'Full re-read every session',
    understandsWhy: 'No, just HOW',
    selfHosted: false,
    sso: true,
    groundedAnswers: false,
    flatPricing: false,
  },
  'Cursor': {
    pricing: 'Per seat ($20/mo)',
    context: 'Re-reads files into context',
    costAtScale: 'Grows with team × queries',
    tokenEfficiency: 'Full re-read per session',
    understandsWhy: 'Limited',
    selfHosted: false,
    sso: true,
    groundedAnswers: false,
    flatPricing: false,
  },
  'Sourcegraph Cody': {
    pricing: 'Per seat ($19/mo)',
    context: 'Code search + LLM',
    costAtScale: 'Grows with team',
    tokenEfficiency: 'Better search, still token-heavy',
    understandsWhy: 'Partial',
    selfHosted: true,
    sso: true,
    groundedAnswers: 'Code search results',
    flatPricing: false,
  },
}

/** Build comparison FAQ schema */
function buildComparisonFAQSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How does Onramp differ from GitHub Copilot?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'GitHub Copilot is a coding assistant that generates code. Onramp is an onboarding platform that indexes your entire codebase once and answers questions with grounded, cited responses. Copilot re-reads your code on every query (per-seat + token costs). Onramp charges a flat $99/mo per workspace for unlimited engineers.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I use Onramp alongside Copilot or Cursor?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes! They serve different purposes. Use Copilot/Cursor for writing code. Use Onramp for understanding code — onboarding new hires, exploring architecture, finding files, and answering "where is X?" questions. Onramp\'s persistent knowledge graph actually makes coding agents more effective by providing better context.',
        },
      },
      {
        '@type': 'Question',
        name: 'Why is Onramp flat-priced instead of per-seat?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Because Onramp indexes your codebase once and updates incrementally on each push. The cost to serve answers doesn\'t scale with team size — it scales with codebase size. Per-seat pricing for AI tools creates misaligned incentives where growing your team exponentially increases AI costs.',
        },
      },
      {
        '@type': 'Question',
        name: 'Does Onramp work with private repositories?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. Provide a GitHub personal access token with repo scope. The token is encrypted at rest and only used for cloning during analysis. Onramp never stores your raw source code — only the indexed knowledge graph.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I self-host Onramp?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes, self-hosting via Docker Compose is available on the Enterprise plan. You can run Onramp in your own VPC or on-premise with full data sovereignty. Requires Docker 24+, 4GB RAM minimum, and PostgreSQL.',
        },
      },
      {
        '@type': 'Question',
        name: 'What LLM providers does Onramp use?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Onramp uses a free-first multi-provider router: OpenRouter, Gemini, Groq, NVIDIA, Mistral (free tiers), then OpenAI, Anthropic, Hugging Face (paid fallbacks), and local Ollama. Providers without API keys are skipped automatically.',
        },
      },
    ],
  }
}

export default function ComparisonPage() {
  const faqSchema = buildComparisonFAQSchema()

  return (
    <MarketingLayout
      navLinks={navLinks}
      seo={{
        title: 'Onramp vs Coding Agents · Compare AI Developer Tools',
        description: 'Compare Onramp with GitHub Copilot, Cursor, and Sourcegraph Cody. See pricing, architecture, and why flat-priced onboarding beats per-seat token burn.',
        path: '/compare',
        schema: faqSchema,
      }}
    >
      {/* Hero */}
      <div className="relative pt-12 pb-12 px-6 text-center max-w-3xl mx-auto">
        <div>
          <h1 className="mb-5 text-4xl font-semibold leading-[1.08] tracking-[-0.02em] text-ink sm:text-5xl">
            Onramp vs Coding Agents.
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-base leading-relaxed text-ink-secondary sm:text-[17px]">
            Compare flat-priced onboarding against per-seat token burn. See why teams choose Onramp for understanding code, not just writing it.
          </p>
        </div>
      </div>

      {/* Quick Comparison Table */}
      <div className="relative max-w-6xl mx-auto px-6 lg:px-8 py-16">
        <div className="max-w-2xl mb-8">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Quick comparison.</h2>
          <p className="mt-2 text-[15px] leading-[1.6] text-ink-secondary">Onramp vs the most popular AI developer tools.</p>
        </div>
        <div className="overflow-hidden rounded-card border border-seam bg-panel">
          <div className="overflow-x-auto">
            <Table className="text-[13.5px]">
              <THead>
                <TR className="bg-well">
                  <TH className="px-6 py-3 font-code text-[11px] font-medium uppercase tracking-[0.08em]">Feature</TH>
                  <TH className="px-6 py-3 font-code text-[11px] font-medium uppercase tracking-[0.08em] text-go">Onramp</TH>
                  <TH className="px-6 py-3 font-code text-[11px] font-medium uppercase tracking-[0.08em]">GitHub Copilot</TH>
                  <TH className="px-6 py-3 font-code text-[11px] font-medium uppercase tracking-[0.08em]">Cursor</TH>
                  <TH className="px-6 py-3 font-code text-[11px] font-medium uppercase tracking-[0.08em]">Sourcegraph Cody</TH>
                </TR>
              </THead>
              <TBody>
                {[
                  ['Primary use case', 'Onboarding & code understanding', 'Code generation', 'Code generation', 'Code search + generation'],
                  ['Pricing model', 'Flat $99/mo per workspace', '$10-19/mo per seat', '$20/mo per seat', '$19/mo per seat'],
                  ['Cost at scale (50 devs)', '$99/mo total', '$500-950/mo', '$1,000/mo', '$950/mo'],
                  ['Context model', 'Index once · graph updates on push', 'Re-reads codebase per query', 'Re-reads files per query', 'Code search + context'],
                  ['Grounded answers', 'Yes — files + line numbers', 'No', 'No', 'Search results only'],
                  ['Understands WHY', 'Yes — full architecture context', 'No', 'Limited', 'Partial'],
                  ['Self-hosted option', 'Yes (Enterprise)', 'No', 'No', 'Yes'],
                  ['SSO/SAML', 'Yes (Enterprise)', 'Yes', 'Yes', 'Yes'],
                  ['Token efficiency', 'Free-first router + semantic cache', 'Full re-read', 'Full re-read', 'Search-optimized'],
                ].map((row, idx) => (
                  <TR key={idx} hoverable>
                    <TD className="px-6 py-3.5 font-medium text-ink">{row[0]}</TD>
                    <TD className="px-6 py-3.5 font-medium text-ink">{row[1]}</TD>
                    <TD className="px-6 py-3.5 text-ink-tertiary">{row[2]}</TD>
                    <TD className="px-6 py-3.5 text-ink-tertiary">{row[3]}</TD>
                    <TD className="px-6 py-3.5 text-ink-tertiary">{row[4]}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Detailed Comparison Cards */}
      <div className="relative max-w-6xl mx-auto px-6 lg:px-8 py-16">
        <div className="max-w-2xl mb-10">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Head-to-head.</h2>
          <p className="mt-2 text-[15px] leading-[1.6] text-ink-secondary">Detailed breakdown of how Onramp compares to each tool.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Object.entries(COMPETITORS).map(([name, data]) => (
            <div key={name} className="rounded-card border border-seam bg-panel p-6">
              <div className="flex items-start justify-between gap-4 mb-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-card bg-well text-ink-tertiary">
                  <Code size={18} weight="bold" />
                </span>
                <span className="font-code text-[10px] uppercase tracking-[0.12em] text-ink-muted">vs Onramp</span>
              </div>
              <h3 className="text-[15px] font-semibold text-ink mb-4">{name}</h3>
              <ul className="space-y-3 text-[13.5px] leading-[1.6] text-ink-secondary">
                <li className="flex gap-3">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-abort" />
                  <span><strong className="font-semibold text-ink">Pricing:</strong> {data.pricing} vs Onramp\'s flat $99/mo workspace</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-abort" />
                  <span><strong className="font-semibold text-ink">Context:</strong> {data.context}</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-abort" />
                  <span><strong className="font-semibold text-ink">Cost at scale:</strong> {data.costAtScale}</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-abort" />
                  <span><strong className="font-semibold text-ink">Grounded answers:</strong> {data.groundedAnswers}</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-abort" />
                  <span><strong className="font-semibold text-ink">Understands WHY:</strong> {data.understandsWhy}</span>
                </li>
              </ul>
              <div className="mt-6 rounded-card border border-seam bg-well px-4 py-3">
                <p className="font-code text-[11px] leading-[1.5] text-ink-secondary">
                  Onramp indexes once, answers from source. {name} re-reads on every query.
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ Section */}
      <div className="relative max-w-3xl mx-auto px-6 lg:px-8 py-16" itemScope itemType="https://schema.org/FAQPage">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Frequently Asked Questions
          </h2>
        </div>
        <div className="space-y-4">
          {faqSchema.mainEntity.map((faq: any, i: number) => (
            <details key={i} className="group border border-seam rounded-lg bg-panel p-6" itemProp="mainEntity" itemScope itemType="https://schema.org/Question">
              <summary className="flex items-center justify-between cursor-pointer list-none text-left font-medium text-ink" itemProp="name">
                {faq.name}
                <span className="text-ink-tertiary transition-transform group-open:rotate-180">▼</span>
              </summary>
              <div className="mt-4 text-ink-secondary leading-relaxed" itemProp="acceptedAnswer" itemScope itemType="https://schema.org/Answer">
                <p itemProp="text">{faq.acceptedAnswer.text}</p>
              </div>
            </details>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="relative max-w-3xl mx-auto px-6 lg:px-8 py-16 text-center">
        <div className="rounded-card border border-seam bg-panel px-8 py-12">
          <p className="font-code text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">Get started</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Ready to onboard your way.
          </h2>
          <p className="mt-3 text-[15px] leading-[1.6] text-ink-secondary max-w-xl mx-auto">
            Join teams shipping faster because developers understand code from day one.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/#pricing"
              className="inline-flex h-11 items-center gap-2 rounded-md bg-ink px-6 text-[15px] font-medium text-[var(--panel-raised)] transition-opacity hover:opacity-90"
            >
              Start 14-day trial
              <ArrowRight size={16} weight="bold" />
            </Link>
            <Link to="/docs" className="inline-flex h-11 items-center rounded-md border border-seam bg-panel px-6 text-[15px] font-medium text-ink transition-colors hover:bg-well">
              Read the docs
            </Link>
          </div>
        </div>
      </div>
    </MarketingLayout>
  )
}