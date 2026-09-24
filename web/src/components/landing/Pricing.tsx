import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ArrowRight } from '@phosphor-icons/react'
import SectionHeading from './SectionHeading'

/* Calm pricing — three equal bordered cards, one quiet featured card
 * (ink border + small label, no conic glow). No motion, no spotlight,
 * no glow CTA shadows. Simple monthly/annual toggle. */

const STARTER_FEATURES = [
  '1 repository',
  '100 AI mentor questions / mo',
  'Live architecture map',
  'Community support',
]
const TEAM_FEATURES = [
  'Unlimited repositories',
  'Unlimited AI mentor questions',
  'Guided onboarding paths',
  'Ramp-up & time-to-PR insights',
  'GitHub, Slack & Linear sync',
  'Priority support',
]
const ENTERPRISE_FEATURES = [
  'SSO / SAML & SCIM (roadmap)',
  'Self-hosted or private cloud (roadmap)',
  'Audit logs; SOC 2 Type II in progress',
  'Dedicated success engineer (planned)',
  'Uptime commitment: to be finalized',
]

const SIDE_CARD = 'h-full rounded-md border border-seam bg-panel'

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 flex-1 space-y-2.5 border-t border-seam pt-5">
      {items.map((f) => (
        <li key={f} className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-secondary">
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-well">
            <Check size={10} weight="bold" className="text-ink-secondary" />
          </span>
          {f}
        </li>
      ))}
    </ul>
  )
}

/** Build FAQ schema for pricing section */
function buildPricingFAQSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What is included in the Free plan?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'The Free plan includes 1 repository, 100 AI mentor questions per month, the live architecture map, and community support. It is free forever for individual developers.',
        },
      },
      {
        '@type': 'Question',
        name: 'Is the Team plan per user or per workspace?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'The Team plan is a flat $99/month per workspace (or $82/month billed annually). It includes unlimited engineers — no per-seat pricing.',
        },
      },
      {
        '@type': 'Question',
        name: 'Does the Team plan require a credit card for the trial?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'No. The 14-day trial on the Team plan does not require a credit card. You can start exploring with your full team immediately.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I self-host Onramp?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Docker-based deployment artifacts are available for controlled environments. Production self-hosting, private-cloud operations, upgrades, backups, and support are an Enterprise roadmap item; contact us for the current scope.',
        },
      },
      {
        '@type': 'Question',
        name: 'What LLM providers does Onramp support?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Onramp uses a free-first multi-provider router supporting OpenRouter, Gemini, Groq, NVIDIA, Mistral, OpenAI, Anthropic, Hugging Face, and local Ollama. Providers without API keys are skipped automatically.',
        },
      },
      {
        '@type': 'Question',
        name: 'Is Onramp SOC 2 compliant?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'SOC 2 Type II is in progress, not yet certified. See /security for current scope.',
        },
      },
    ],
  }
}

export default function Pricing() {
  const [annual, setAnnual] = useState(true)
  const teamPrice = annual ? 82 : 99

  const faqSchema = buildPricingFAQSchema()

  return (
    <section id="pricing" className="landing-section scroll-mt-20 border-t border-seam bg-room">
      <div className="mx-auto max-w-6xl px-6 py-16 lg:px-8 lg:py-20">
        <SectionHeading
          eyebrow="Pricing"
          heading={<>One flat price. Your whole team.</>}
          sub="No per-seat math. Every engineer can ask, explore, and onboard; you pay one price per workspace."
        />

        <div className="mx-auto mt-8 flex w-fit items-center gap-1 rounded-md border border-seam bg-panel p-1">
          {(['Monthly', 'Annual'] as const).map((label) => {
            const active = annual === (label === 'Annual')
            return (
              <button
                key={label}
                type="button"
                onClick={() => setAnnual(label === 'Annual')}
                className={`rounded px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                  active ? 'bg-ink text-[var(--panel-raised)]' : 'text-ink-secondary hover:text-ink'
                }`}
              >
                {label}
                {label === 'Annual' && (
                  <span className={`ml-1.5 text-xs ${active ? 'opacity-80' : 'text-ink-tertiary'}`}>
                    −17%
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className={SIDE_CARD}>
            <div className="flex h-full flex-col p-6">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-tertiary">Free</span>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-semibold leading-none tracking-tight text-ink">$0</span>
                <span className="ml-1 text-sm text-ink-tertiary">forever</span>
              </div>
              <p className="mt-2 text-sm text-ink-tertiary">For individuals exploring their own repo.</p>
              <FeatureList items={STARTER_FEATURES} />
              <Link
                to="/register"
                className="mt-6 inline-flex items-center justify-center gap-1.5 rounded-md border border-seam bg-panel px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-well"
              >
                Get started
                <ArrowRight size={14} weight="bold" />
              </Link>
            </div>
          </div>

          <div className="h-full rounded-md border-2 border-ink bg-panel">
            <div className="flex h-full flex-col p-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-ink">Team</span>
                <span className="text-xs font-medium text-ink">
                  Recommended
                </span>
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-semibold leading-none tracking-tight text-ink">${teamPrice}</span>
                <span className="ml-1 text-sm text-ink-tertiary">/mo</span>
              </div>
              <p className="mt-2 text-sm text-ink-tertiary">per workspace · unlimited engineers</p>
              <FeatureList items={TEAM_FEATURES} />
              <Link
                to="/register"
                className="mt-6 inline-flex items-center justify-center gap-1.5 rounded-md bg-ink px-5 py-2.5 text-sm font-medium text-[var(--panel-raised)] transition-opacity hover:opacity-90"
              >
                Start 14-day trial
                <ArrowRight size={14} weight="bold" />
              </Link>
            </div>
          </div>

          <div className={SIDE_CARD}>
            <div className="flex h-full flex-col p-6">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-tertiary">Enterprise</span>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-semibold leading-none tracking-tight text-ink">Custom</span>
              </div>
              <p className="mt-2 text-sm text-ink-tertiary">For orgs that need control, security, and scale.</p>
              <FeatureList items={ENTERPRISE_FEATURES} />
              <Link
                to="/register"
                className="mt-6 inline-flex items-center justify-center gap-1.5 rounded-md border border-seam bg-panel px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-well"
              >
                Contact sales
                <ArrowRight size={14} weight="bold" />
              </Link>
            </div>
          </div>
        </div>

        {/* FAQ Section for AEO/SEO */}
        <div className="mt-12 max-w-3xl mx-auto" itemScope itemType="https://schema.org/FAQPage">
          <h2 className="text-center font-display text-2xl font-semibold tracking-tight text-ink mb-8">
            Frequently Asked Questions
          </h2>
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

        <p className="mt-5 text-center font-code text-[11px] text-ink-tertiary">
          Free plan includes the live architecture map. Team starts with a 14-day trial, no credit card.
        </p>
      </div>
    </section>
  )
}