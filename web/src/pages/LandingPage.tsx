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

  return (
    <div
      data-theme="landing"
      className={`landing-premium${lightClass} min-h-screen scroll-smooth bg-room text-ink antialiased`}
    >
      <Seo
        title="Onramp · Onboarding in days, not months"
        description="Onramp turns your repo into a live ramp — learning paths, graded tasks, and a review queue. New devs land their first merged PR faster, seniors stop re-answering the same questions."
        path="/"
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
