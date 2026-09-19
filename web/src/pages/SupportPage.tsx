import { Link } from 'react-router-dom'
import {
  BookOpenText,
  Envelope,
  ChatCircle,
  ArrowUpRight,
  ShieldCheck,
  ClockCounterClockwise,
} from '@phosphor-icons/react'
import { cn } from '../lib/utils'
import MarketingLayout from '../components/layout/MarketingLayout'
import EditorialHero from '../components/marketing/EditorialHero'
import type { NavLinkItem } from '../components/layout/MarketingNav'

const navLinks: NavLinkItem[] = [
  { label: 'Docs', href: '/docs' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'Changelog', href: '/changelog' },
]

interface Channel {
  title: string
  description: string
  href: string
  cta: string
  Icon: React.ComponentType<{ size?: number; weight?: 'bold' | 'duotone'; className?: string }>
}

const channels: Channel[] = [
  {
    title: 'Documentation',
    description: 'Guides, API references, and setup walkthroughs for the whole platform.',
    href: '/docs',
    cta: 'Browse docs',
    Icon: BookOpenText,
  },
  {
    title: 'Talk to the team',
    description: 'Send a message and we will get back to you within one business day.',
    href: '/contact',
    cta: 'Contact us',
    Icon: ChatCircle,
  },
  {
    title: 'Email support',
    description: 'Prefer email? Write to us directly with as much detail as you can.',
    href: 'mailto:support@onramp.ai',
    cta: 'support@onramp.ai',
    Icon: Envelope,
  },
]

const QUICK_PATHS = [
  { label: 'Security & trust', href: '/security', Icon: ShieldCheck },
  { label: 'Changelog', href: '/changelog', Icon: ClockCounterClockwise },
]

export default function SupportPage() {
  return (
    <MarketingLayout
      navLinks={navLinks}
      seo={{ title: 'Support · Onramp', description: 'How can we help? Pick a channel and we usually respond within one business day.', path: '/support' }}
    >
      <div className="mx-auto max-w-6xl px-6 pb-24 pt-12 lg:px-10">
        <EditorialHero
          index="Support — 02"
          title="How can we help?"
          lede="Pick the channel that fits. Docs answer most questions instantly; a person answers the rest within one business day."
        />

        {/* Channels — one ruled panel, split by hairlines (no floating cards) */}
        <div className="mt-10 grid grid-cols-1 overflow-hidden rounded-card border border-seam bg-panel md:grid-cols-3">
          {channels.map(({ title, description, href, cta, Icon }, i) => {
            const body = (
              <>
                <span className="flex h-9 w-9 items-center justify-center rounded-tile border border-seam bg-well text-ink">
                  <Icon size={17} weight="bold" />
                </span>
                <h2 className="mt-4 text-heading font-semibold text-ink">{title}</h2>
                <p className="mt-1.5 flex-1 text-body-sm leading-relaxed text-ink-tertiary">
                  {description}
                </p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-body-sm font-semibold text-go">
                  {cta}
                  <ArrowUpRight size={13} weight="bold" />
                </span>
              </>
            )

            const cls = cn(
              'group flex flex-col p-6 transition-colors hover:bg-well',
              i > 0 && 'border-t border-seam md:border-l md:border-t-0',
            )

            const isInternal = href.startsWith('/')
            if (isInternal) {
              return (
                <Link key={title} to={href} className={cls}>
                  {body}
                </Link>
              )
            }
            const isHttp = href.startsWith('http')
            return (
              <a
                key={title}
                href={href}
                {...(isHttp ? { target: '_blank', rel: 'noreferrer' } : {})}
                className={cls}
              >
                {body}
              </a>
            )
          })}
        </div>

        {/* Footer note + quick paths */}
        <div className="mt-8 flex flex-col gap-5 border-t border-seam pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body-sm text-ink-tertiary">
            Something urgent?{' '}
            <Link to="/docs" className="font-semibold text-go hover:underline underline-offset-4">
              Check the docs first
            </Link>{' '}
            — most answers are already there.
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {QUICK_PATHS.map(({ label, href, Icon }) => (
              <Link
                key={href}
                to={href}
                className="inline-flex items-center gap-2 text-body-sm text-ink-secondary transition-colors hover:text-ink"
              >
                <Icon size={14} weight="bold" className="text-ink-tertiary" />
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </MarketingLayout>
  )
}
