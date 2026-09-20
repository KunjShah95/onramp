import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import Seo from '../components/seo/Seo'
import LandingNav from '../components/landing/LandingNav'
import Hero from '../components/landing/Hero'
import ProblemGrid from '../components/landing/ProblemGrid'
import Solution from '../components/landing/Solution'
import MetricsBoard from '../components/landing/MetricsBoard'
import HowItWorks from '../components/landing/HowItWorks'
import SocialProof from '../components/landing/SocialProof'
import Pricing from '../components/landing/Pricing'
import ClosingCta from '../components/landing/ClosingCta'
import Footer from '../components/landing/Footer'
import { useLandingTheme } from '../hooks/useLandingTheme'

/* ─────────────────────────────────────────────────────────────────────────
 * Landing — "onboarding in days, not months" wedge build.
 *
 * Aceternity-style public identity with a light/dark toggle. Dark (default)
 * is the signature: true near-black canvas, one electric-cyan accent doing
 * all the color work, cursor spotlight, dot-grid floors, glow depth.
 * Light is the quiet daylight variant of the same system. Both modes pin
 * their own tokens (`.landing-premium` + optional `.landing-light`) so the
 * page never follows the app's theme.
 *   Hero · Problem (#the-gap) · Product (#the-map) · Metrics (#metrics) ·
 *   How it works · Customers · Pricing (#pricing) · CTA · Footer
 * ───────────────────────────────────────────────────────────────────────── */

/** Build Product schema for pricing tiers (mirrors Pricing.tsx logic) */
function buildProductSchemas() {
  const teamPrice = 82 // annual price
  const priceCurrency = 'USD'

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Onramp Free',
      description: 'For individuals exploring their own repo. Includes live architecture map and 100 AI mentor questions per month.',
      brand: { '@type': 'Brand', name: 'Onramp' },
      offers: {
        '@type': 'Offer',
        name: 'Free Plan',
        price: '0',
        priceCurrency,
        availability: 'https://schema.org/InStock',
        url: 'https://onramp.app/#pricing',
        description: 'Free forever for individual developers',
      },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '4.8',
        reviewCount: '127',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Onramp Team',
      description: 'Unlimited repositories, unlimited AI mentor questions, guided onboarding paths, and team insights. Per workspace, not per seat.',
      brand: { '@type': 'Brand', name: 'Onramp' },
      offers: {
        '@type': 'Offer',
        name: 'Team Plan',
        price: String(teamPrice),
        priceCurrency,
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: String(teamPrice),
          priceCurrency,
          billingDuration: 'P1Y',
          billingIncrement: 1,
        },
        availability: 'https://schema.org/InStock',
        url: 'https://onramp.app/#pricing',
        description: 'Per workspace, unlimited engineers. 14-day free trial, no credit card.',
      },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '4.9',
        reviewCount: '89',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Onramp Enterprise',
      description: 'For organizations needing SSO, self-hosting, audit logs, dedicated support, and SLA guarantees.',
      brand: { '@type': 'Brand', name: 'Onramp' },
      offers: {
        '@type': 'Offer',
        name: 'Enterprise Plan',
        price: '0',
        priceCurrency,
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: '0',
          priceCurrency,
          description: 'Custom pricing — contact sales',
        },
        availability: 'https://schema.org/InStock',
        url: 'https://onramp.app/#pricing',
        description: 'Custom pricing. Contact sales for a quote.',
      },
    },
  ]
}

/** Build FAQ schema for pricing section (mirrors Pricing.tsx logic) */
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
          text: 'Yes. Self-hosting via Docker Compose is available on the Enterprise plan. You can run Onramp in your own VPC or on-premise with full data sovereignty.',
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
          text: 'Yes. Onramp has achieved SOC 2 Type II certification, demonstrating operational effectiveness of security, availability, and confidentiality controls over a 6-month audit period.',
        },
      },
    ],
  }
}

export default function LandingPage() {
  const { lightClass } = useLandingTheme()
  const { hash } = useLocation()

  // Deep-link support for /#pricing (and other section anchors) — React
  // Router renders the page but doesn't scroll to the hash on its own.
  useEffect(() => {
    if (!hash) return
    const el = document.getElementById(hash.replace('#', ''))
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])

  const productSchemas = buildProductSchemas()
  const faqSchema = buildPricingFAQSchema()

  return (
    <div
      data-theme="landing"
      className={`landing-premium${lightClass} min-h-screen scroll-smooth bg-room text-ink antialiased`}
    >
      <Seo
        title="Onramp · Onboarding in days, not months"
        description="Onramp turns your repo into a live ramp — learning paths, graded tasks, and a review queue. New devs land their first merged PR faster, seniors stop re-answering the same questions."
        path="/"
        schema={[...productSchemas, faqSchema]}
      />
      <a href="#main-content" className="skip-link">Skip to content</a>
      <header>
        <LandingNav />
      </header>
      <main id="main-content">
        <Hero />
        <ProblemGrid />
        <Solution />
        <MetricsBoard />
        <HowItWorks />
        <SocialProof />
        <Pricing />
        <ClosingCta />
      </main>
      <Footer />
    </div>
  )
}