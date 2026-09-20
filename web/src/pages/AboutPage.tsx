import { UsersThree, Sparkle, Globe, ShieldCheck } from '@phosphor-icons/react'
import MarketingLayout from '../components/layout/MarketingLayout'
import type { NavLinkItem } from '../components/layout/MarketingNav'

const navLinks: NavLinkItem[] = [
  { label: 'Docs', href: '/docs' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'Changelog', href: '/changelog' },
]

const values = [
  {
    icon: UsersThree,
    title: 'Developer-first',
    desc: 'Every feature starts with the question: does this make an engineer more effective? We build for the people who build.',
  },
  {
    icon: Sparkle,
    title: 'Radical transparency',
    desc: 'We show our work. Our AI attributes every answer to specific files and lines, so you can verify everything.',
  },
  {
    icon: Globe,
    title: 'Open ecosystems',
    desc: 'We integrate with the tools you already use: GitHub, GitLab, Slack, Linear · and never lock you in.',
  },
  {
    icon: ShieldCheck,
    title: 'Privacy by design',
    desc: 'Your code stays yours. We process source to build an analysis graph, then discard raw content. No training on customer data.',
  },
]

/** Build AboutPage schema */
function buildAboutSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: 'About Onramp',
    description: 'The team and mission behind Onramp — AI-powered developer onboarding for modern engineering teams.',
    url: 'https://onramp.app/about',
    mainEntity: {
      '@type': 'Organization',
      name: 'Onramp',
      description: 'Onramp indexes your codebase into a live architecture map and guides developers through their first PR.',
      url: 'https://onramp.app/',
      logo: 'https://onramp.app/icon-512.svg',
      sameAs: [
        'https://twitter.com/onramp_ai',
        'https://linkedin.com/company/onramp-ai',
        'https://github.com/onramp-ai',
      ],
      foundingDate: '2025',
      knowsAbout: [
        'Developer onboarding',
        'Codebase analysis',
        'AI-powered developer tools',
        'Architecture visualization',
        'Engineering velocity',
      ],
    },
  }
}

/** Build BreadcrumbList schema for About page */
function buildAboutBreadcrumbSchema() {
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
        name: 'About',
        item: 'https://onramp.app/about',
      },
    ],
  }
}

export default function AboutPage() {
  const aboutSchema = buildAboutSchema()
  const breadcrumbSchema = buildAboutBreadcrumbSchema()

  return (
    <MarketingLayout
      navLinks={navLinks}
      seo={{
        title: 'About · Onramp',
        description: 'The team and mission behind Onramp · AI-powered developer onboarding for modern engineering teams.',
        path: '/about',
        schema: [aboutSchema, breadcrumbSchema],
      }}
    >
      <div className="max-w-4xl mx-auto px-6 pt-10 pb-24">
        {/* Hero */}
        <div className="mb-16">
          <h1 className="font-body text-[clamp(2rem,4.2vw,3rem)] mb-4 font-bold leading-[1.05] tracking-[-0.02em] text-ink">
            We're on a mission to <span className="text-gradient">eliminate onboarding friction</span> for every developer.
          </h1>
          <p className="text-[17px] leading-[1.6] text-ink-secondary max-w-2xl">
            Onramp was founded in 2025 by engineers tired of watching new hires spend weeks lost in unfamiliar codebases.
            Context shouldn't be tribal knowledge. It should be a living map.
          </p>
        </div>

        {/* Story — ruled panel, editorial */}
        <div className="mb-16 rounded-card border border-seam bg-panel p-8 shadow-seam">
          <p className="font-code text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-primary">Our story</p>
          <h2 className="mt-2 font-body text-2xl font-bold tracking-tight text-ink">From scattered READMEs to one live map.</h2>
          <div className="mt-4 space-y-4 text-[15px] leading-[1.7] text-ink-secondary">
            <p>
              Every developer knows the feeling: you join a new team, get handed a laptop, and spend the next three weeks
              piecing together how the codebase works from scattered READMEs, senior office hours, and trial by fire.
            </p>
            <p>
              We built Onramp to change that. By mapping architecture, ownership, and data flows straight from source,
              Onramp turns an unfamiliar repository into a guided ramp — so new hires ship their first PR in days, not weeks.
            </p>
            <p className="font-code text-[13px] text-ink-tertiary">Today the graph powers onboarding, review, and org health for teams running their real repositories. The map stays fresh on every push.</p>
          </div>
        </div>

        {/* Values */}
        <div>
          <h2 className="font-display text-2xl font-bold text-[hsl(var(--foreground))] mb-8 text-center">What we believe</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {values.map((v) => (
              <div
                key={v.title}
                className="rounded-card border border-seam bg-panel p-6 shadow-seam transition-colors hover:border-accent-primary/20 "
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-seam bg-well text-accent-primary mb-4">
                  <v.icon size={20} weight="bold" />
                </span>
                <h3 className="font-body text-[16px] font-semibold text-ink mb-2">{v.title}</h3>
                <p className="text-[13.5px] leading-[1.6] text-ink-tertiary">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Team */}
      </div>
    </MarketingLayout>
  )
}