import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import Seo from '../components/seo/Seo'
import MarketingNav from '../components/layout/MarketingNav'
import MarketingFooter from '../components/layout/MarketingFooter'
import Hero from '../components/landing/Hero'
import CostOfRamp from '../components/landing/CostOfRamp'
import ProductBento from '../components/landing/ProductBento'
import WeekOne from '../components/landing/WeekOne'
import Roles from '../components/landing/Roles'
import Trust from '../components/landing/Trust'
import Pricing from '../components/landing/Pricing'
import { CtaBand, FaqList, Section, SectionHeader, faqSchema, type Faq } from '../components/marketing/primitives'
import { PLANS } from '../components/marketing/plans'
import { useLandingTheme } from '../hooks/useLandingTheme'
import { useTrackedPath } from '../lib/track'
import { SITE_URL } from '../lib/site'

/* Landing, told as one story:
 *   Hero (the promise, with the product in hand)
 *   The cost (what onboarding costs you today, in your own numbers)
 *   The product (what Onramp builds from one repo)
 *   Week one (the new hire's first five days)
 *   Who it's for (three people, before and after)
 *   Security (plain facts, including what isn't done)
 *   Pricing (matches checkout), FAQ, one closing CTA. */

const FAQ: Faq[] = [
  {
    q: 'How long does setup take?',
    a: 'Connect GitHub, pick a repository, and Onramp indexes it. Most codebases take 2 to 10 minutes. After that the map and paths update on every push without anyone maintaining them.',
  },
  {
    q: 'Is this another coding assistant?',
    a: 'No. Copilot and Cursor help people write code. Onramp helps people understand a codebase they did not write, and helps leads see how that is going. Most teams use both.',
  },
  {
    q: 'Do the plans lock features?',
    a: 'No. Every plan, Free included, gets the whole product. Plans differ by team members, repositories, and monthly AI credits.',
  },
  {
    q: 'Is there a trial?',
    a: 'Free is free for good on one repository. Professional includes a 14-day trial on your first subscription. No card is needed to start on Free.',
  },
  {
    q: 'What happens to our source code?',
    a: 'Onramp clones a repository to index it and deletes the clone afterwards. It keeps the derived documents and embeddings needed to answer questions, scoped to your workspace. We do not train models on customer code.',
  },
  {
    q: 'Which languages are supported?',
    a: 'Python, JavaScript, TypeScript, Go, Rust and Java get full parsing. Other languages are indexed as text with basic symbol extraction.',
  },
  {
    q: 'Are you SOC 2 certified?',
    a: 'No. SOC 2 Type II is on the roadmap and no audit report exists yet. A Data Processing Agreement is available now, and the security page lists exactly what is and is not in place.',
  },
]

function productSchema() {
  return PLANS.filter((p) => p.monthly !== null).map((p) => ({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `Onramp ${p.name}`,
    description: `${p.pitch} ${p.members}. ${p.features.join(', ')}.`,
    brand: { '@type': 'Brand', name: 'Onramp' },
    offers: {
      '@type': 'Offer',
      price: String(p.monthly),
      priceCurrency: 'INR',
      availability: 'https://schema.org/InStock',
      url: `${SITE_URL}/#pricing`,
    },
  }))
}

export default function LandingPage() {
  const { lightClass } = useLandingTheme()
  const { hash } = useLocation()
  // The landing renders its own shell rather than MarketingLayout, so the
  // path tracker is mounted here instead.
  useTrackedPath()

  // React Router renders the page but doesn't scroll to a hash on its own.
  useEffect(() => {
    if (!hash) return
    const el = document.getElementById(hash.slice(1))
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])

  return (
    <div
      data-theme="landing"
      className={`landing-premium${lightClass} min-h-screen scroll-smooth bg-room text-ink antialiased`}
    >
      <Seo
        title="Onramp · New engineers ship in week one"
        description="Onramp turns your repository into a ramp for new engineers: a live architecture map, learning paths from real code, first issues, and a dashboard that shows leads who is stuck."
        path="/"
        schema={[...productSchema(), faqSchema(FAQ)]}
      />
      <a href="#main-content" className="skip-link">Skip to content</a>
      <header>
        <MarketingNav />
      </header>
      <main id="main-content">
        <Hero />
        <CostOfRamp />
        <ProductBento />
        <WeekOne />
        <Roles />
        <Trust />
        <Pricing />
        <Section id="faq">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <SectionHeader label="Questions" title="What teams ask before they connect a repo." />
            <FaqList items={FAQ} />
          </div>
        </Section>
        <CtaBand />
      </main>
      <MarketingFooter />
    </div>
  )
}
