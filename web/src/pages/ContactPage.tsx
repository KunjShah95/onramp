import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  GithubLogo,
  MapPin,
  ArrowUpRight,
  BookOpenText,
} from '@phosphor-icons/react'
import MarketingLayout from '../components/layout/MarketingLayout'
import EditorialHero from '../components/marketing/EditorialHero'
import { MetricStrip, MetricCell } from '../components/ui/metric-strip'
import type { NavLinkItem } from '../components/layout/MarketingNav'
import { SITE_URL } from '../lib/site'
import { createLead } from '../lib/api'

const navLinks: NavLinkItem[] = [
  { label: 'Docs', href: '/docs' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'Changelog', href: '/changelog' },
]

interface Channel {
  label: string
  value: string
  href: string
  external?: boolean
}

const REPO_URL = 'https://github.com/KunjShah95/onramp'

// Only channels we actually own and read. The form above is the primary
// route; it lands in the team's lead inbox (POST /api/v1/leads).
const GITHUB_CHANNELS: Channel[] = [
  { label: 'Source', value: 'KunjShah95/onramp', href: REPO_URL, external: true },
  { label: 'Bugs', value: 'Open an issue', href: `${REPO_URL}/issues/new`, external: true },
]

type IconComponent = React.ComponentType<{ size?: number; weight?: 'bold' | 'duotone'; className?: string }>

/** A ruled block of contact lines — mono label left, value right. */
function ChannelGroup({
  icon: Icon,
  title,
  channels,
}: {
  icon: IconComponent
  title: string
  channels: Channel[]
}) {
  return (
    <div>
      <div className="flex items-center gap-2 px-5 pb-2 pt-5">
        <Icon size={13} weight="bold" className="text-ink-tertiary" />
        <span className="overline">{title}</span>
      </div>
      <ul className="divide-y divide-seam border-t border-seam">
        {channels.map((c) => (
          <li key={c.label}>
            <a
              href={c.href}
              {...(c.external ? { target: '_blank', rel: 'noreferrer' } : {})}
              className="group flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-well"
            >
              <span className="font-code text-[11px] uppercase tracking-[0.12em] text-ink-tertiary">
                {c.label}
              </span>
              <span className="inline-flex min-w-0 items-center gap-1.5 text-body-sm font-medium text-ink transition-colors group-hover:text-go">
                <span className="truncate">{c.value}</span>
                <ArrowUpRight
                  size={12}
                  weight="bold"
                  className="shrink-0 text-ink-tertiary opacity-0 transition-opacity group-hover:opacity-100"
                />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

function TextField({
  label,
  id,
  ...rest
}: { label: string; id: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input id={id} name={id} className="input mt-2" {...rest} />
    </div>
  )
}

/** Build ContactPage schema */
function buildContactSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    name: 'Contact · Onramp',
    description: 'Talk to the Onramp team. We get back to you within one business day.',
    url: `${SITE_URL}/contact`,
    mainEntity: {
      '@type': 'Organization',
      name: 'Onramp',
      url: `${SITE_URL}/`,
      contactPoint: [
        {
          '@type': 'ContactPoint',
          contactType: 'sales',
          availableLanguage: 'English',
          url: `${SITE_URL}/contact`,
        },
      ],
      sameAs: [REPO_URL],
    },
  }
}

/** Build BreadcrumbList schema for Contact page */
function buildContactBreadcrumbSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `${SITE_URL}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Contact',
        item: `${SITE_URL}/contact`,
      },
    ],
  }
}

type SendState = 'idle' | 'sending' | 'sent' | 'error'

export default function ContactPage() {
  const contactSchema = buildContactSchema()
  const breadcrumbSchema = buildContactBreadcrumbSchema()
  const [state, setState] = useState<SendState>('idle')
  const [errorText, setErrorText] = useState('')

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const field = (name: string) => String(new FormData(form).get(name) ?? '').trim()
    setState('sending')
    setErrorText('')
    try {
      await createLead({
        name: field('name'),
        email: field('email'),
        company: field('company') || undefined,
        subject: field('subject') || undefined,
        message: field('message'),
        website: field('website') || undefined,
      })
      form.reset()
      setState('sent')
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Something went wrong.')
      setState('error')
    }
  }

  return (
    <MarketingLayout
      navLinks={navLinks}
      seo={{
        title: 'Contact · Onramp',
        description: 'Talk to the Onramp team. We get back to you within one business day.',
        path: '/contact',
        schema: [contactSchema, breadcrumbSchema],
      }}
    >
      <div className="mx-auto max-w-6xl px-6 pb-24 pt-12 lg:px-10">
        <EditorialHero
          index="Contact — 01"
          title="Get in touch."
          lede="A question, a demo, a security review, or just a hello. Every message reaches a person on the team — not a ticket queue."
        />

        {/* Service readout */}
        <MetricStrip className="mt-10 grid-cols-2 lg:grid-cols-4">
          <MetricCell label="First reply" value="1 day" sub="Monday to Friday" />
          <MetricCell label="Uptime SLA" value="None yet" sub="Being defined with partners" />
          <MetricCell label="Channels" value="2" sub="This form · GitHub" />
          <MetricCell label="Based in" value="India" sub="IST (UTC+5:30)" />
        </MetricStrip>

        <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
          {/* ── Message form ─────────────────────────────────────── */}
          <section id="message" className="lg:col-span-7" aria-labelledby="contact-form-title">
            <form
              onSubmit={onSubmit}
              className="rounded-card border border-seam bg-panel"
            >
              <div className="border-b border-seam px-6 py-5">
                <h2
                  id="contact-form-title"
                  className="text-heading font-semibold text-ink"
                >
                  Send a message
                </h2>
                <p className="mt-1 text-body-sm text-ink-tertiary">
                  Tell us what you're working on and we'll route it to the right person.
                </p>
              </div>

              <div className="space-y-5 px-6 py-6">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <TextField
                    label="Name"
                    id="name"
                    type="text"
                    autoComplete="name"
                    placeholder="Ada Lovelace"
                    required
                  />
                  <TextField
                    label="Email"
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="ada@company.com"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <TextField
                    label="Company"
                    id="company"
                    type="text"
                    autoComplete="organization"
                    placeholder="Optional"
                  />
                  <TextField
                    label="Subject"
                    id="subject"
                    type="text"
                    placeholder="What can we help with?"
                  />
                </div>

                {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
                <div aria-hidden="true" className="hidden">
                  <label htmlFor="website">Website</label>
                  <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
                </div>

                <div>
                  <label htmlFor="message-body" className="field-label">
                    Message
                  </label>
                  <textarea
                    id="message-body"
                    name="message"
                    rows={6}
                    required
                    placeholder="Your team, your repo, and the outcome you're after."
                    className="input mt-2 resize-y"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-seam px-6 py-4">
                <p className="text-caption text-ink-tertiary" role="status" aria-live="polite">
                  {state === 'sent'
                    ? 'Thanks. Your message reached the team; we reply within one business day.'
                    : state === 'error'
                      ? `Not sent: ${errorText} You can also open a GitHub issue.`
                      : "We'll only use your details to reply."}
                </p>
                <button type="submit" className="btn" disabled={state === 'sending'}>
                  {state === 'sending' ? 'Sending…' : 'Send message'}
                </button>
              </div>
            </form>
          </section>

          {/* ── Direct channels ──────────────────────────────────── */}
          <aside id="channels" className="lg:col-span-5" aria-label="Direct contact channels">
            <div className="overflow-hidden rounded-card border border-seam bg-panel">
              <ChannelGroup icon={GithubLogo} title="GitHub" channels={GITHUB_CHANNELS} />

              <div className="border-t border-seam px-5 py-5" id="office">
                <div className="flex items-center gap-2">
                  <MapPin size={13} weight="bold" className="text-ink-tertiary" />
                  <span className="overline">Office</span>
                </div>
                <dl className="mt-3 space-y-2">
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-body-sm text-ink-tertiary">Location</dt>
                    <dd className="text-body-sm font-medium text-ink">India (remote team)</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-body-sm text-ink-tertiary">Time zone</dt>
                    <dd className="text-body-sm font-medium text-ink">IST (UTC+5:30)</dd>
                  </div>
                </dl>
              </div>
            </div>

            <Link
              to="/support"
              className="group mt-4 flex items-center justify-between gap-4 rounded-card border border-seam bg-panel px-5 py-4 transition-colors hover:bg-well"
            >
              <span className="flex items-center gap-3">
                <BookOpenText size={16} weight="bold" className="text-ink-tertiary" />
                <span className="text-body-sm font-medium text-ink">
                  Looking for self-serve help?
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5 text-body-sm font-semibold text-go">
                Support
                <ArrowUpRight size={12} weight="bold" />
              </span>
            </Link>
          </aside>
        </div>
      </div>
    </MarketingLayout>
  )
}