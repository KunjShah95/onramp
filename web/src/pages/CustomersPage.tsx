import { ArrowRight, ChartLineUp, Compass, Flag, Gauge, Users } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import MarketingLayout from '../components/layout/MarketingLayout'
import type { NavLinkItem } from '../components/layout/MarketingNav'

const navLinks: NavLinkItem[] = [
  { label: 'Docs', href: '/docs' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'Changelog', href: '/changelog' },
]

const validationSignals = [
  {
    icon: Gauge,
    value: 'TBD',
    label: 'Median time to first merged PR',
    detail: 'Measured with participating teams, not projected.',
  },
  {
    icon: ChartLineUp,
    value: 'TBD',
    label: 'Repository context adoption',
    detail: 'Tracking repeated questions and time-to-answer.',
  },
  {
    icon: Users,
    value: 'Pilot',
    label: 'Design-partner cohort',
    detail: 'A small validation group is onboarding now.',
  },
]

const learningTracks = [
  {
    icon: Compass,
    title: 'Repository context',
    description: 'Does grounding answers in the team\'s real code reduce repeated searching and stale guidance?',
  },
  {
    icon: Flag,
    title: 'First contribution',
    description: 'Can guided learning, task context, and review gates shorten the path to a safe first change?',
  },
  {
    icon: ChartLineUp,
    title: 'Team visibility',
    description: 'Can leaders see ramp signals and review load without adding another status meeting?',
  },
]

/** Build an honest, non-testimonial validation-page schema. */
function buildValidationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Validation program · Onramp',
    description:
      'Onramp is validating repository-grounded developer onboarding with a small design-partner cohort. No customer logos or outcome claims are published before they are measured.',
    url: 'https://onramp.app/customers',
    publisher: {
      '@type': 'Organization',
      name: 'Onramp',
      logo: 'https://onramp.app/icon-512.svg',
    },
  }
}

/** Build BreadcrumbList schema for the validation page. */
function buildCustomersBreadcrumbSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://onramp.app/' },
      { '@type': 'ListItem', position: 2, name: 'Validation', item: 'https://onramp.app/customers' },
    ],
  }
}

export default function CustomersPage() {
  const validationSchema = buildValidationSchema()
  const breadcrumbSchema = buildCustomersBreadcrumbSchema()

  return (
    <MarketingLayout
      navLinks={navLinks}
      seo={{
        title: 'Validation program · Onramp',
        description:
          'See how Onramp is validating repository-grounded onboarding with a small design-partner cohort.',
        path: '/customers',
        schema: [validationSchema, breadcrumbSchema],
      }}
    >
      <div className="max-w-[1280px] mx-auto px-6 lg:px-10 pt-10 pb-24">
        <div className="mb-20 text-center max-w-4xl mx-auto">
          <p className="font-code text-[11px] uppercase tracking-[0.16em] text-ink-tertiary mb-5">
            Validation program
          </p>
          <h1 className="font-body text-[clamp(2rem,4.2vw,3rem)] mb-5 font-bold leading-[1.05] tracking-[-0.02em] text-ink">
            Building the onboarding layer with <span className="text-gradient">real teams</span>.
          </h1>
          <p className="text-[17px] leading-[1.6] text-ink-secondary max-w-2xl mx-auto">
            Onramp is in an early validation phase with a small design-partner cohort. We publish what we
            measure — not logos, testimonials, or outcome numbers we have not earned yet.
          </p>
        </div>

        <section className="mb-20" aria-labelledby="validation-signals">
          <div className="mb-8 text-center">
            <h2 id="validation-signals" className="font-display text-2xl font-bold text-[hsl(var(--foreground))]">
              Signals we are measuring
            </h2>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              These values remain TBD until the validation study is complete.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {validationSignals.map((signal) => (
              <div
                key={signal.label}
                className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/30 p-6 text-center"
              >
                <span className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))]">
                  <signal.icon size={20} weight="duotone" />
                </span>
                <div className="font-display text-3xl font-bold text-[hsl(var(--foreground))]">{signal.value}</div>
                <div className="mt-1 text-sm font-semibold text-[hsl(var(--foreground))]">{signal.label}</div>
                <p className="mt-3 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{signal.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-20" aria-labelledby="learning-tracks">
          <div className="mb-8 text-center">
            <h2 id="learning-tracks" className="font-display text-2xl font-bold text-[hsl(var(--foreground))]">
              What the cohort is helping us learn
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {learningTracks.map((track) => (
              <div key={track.title} className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/30 p-6">
                <track.icon size={22} className="mb-4 text-[hsl(var(--accent))]" weight="duotone" />
                <h3 className="font-display text-lg font-semibold text-[hsl(var(--foreground))]">{track.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">{track.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/40 p-8 text-center">
          <h2 className="font-display text-2xl font-bold text-[hsl(var(--foreground))]">Help us validate the product</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
            If your team is onboarding developers into a real repository, we would value a conversation about
            your current workflow and the evidence we should collect.
          </p>
          <div className="mt-6 flex items-center justify-center gap-4">
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-5 py-2.5 text-sm font-semibold text-[hsl(var(--primary-foreground))] transition-all hover:opacity-90"
            >
              Join the validation cohort <ArrowRight size={16} />
            </Link>
            <Link
              to="/docs"
              className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] px-5 py-2.5 text-sm font-semibold text-[hsl(var(--foreground))] transition-all hover:bg-[hsl(var(--card))]/50"
            >
              Read the product docs
            </Link>
          </div>
        </section>
      </div>
    </MarketingLayout>
  )
}
