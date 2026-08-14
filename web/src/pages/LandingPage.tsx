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

/* ─────────────────────────────────────────────────────────────────────────
 * Landing — "your codebase is a map", the premium light build.
 *
 * A clean light surface (`.landing-light`, overrides `.landing-premium`)
 * pins its own identity so it never follows the app's theme. Stripe-grade
 * restraint: white & slate surfaces, Inter type, a single cyan accent, and
 * the 3D architecture map framed as a dark product window.
 *   Hero · Problem (#the-gap) · Product (#the-map) · Metrics (#metrics) ·
 *   How it works · Customers · Pricing (#pricing) · CTA · Footer
 * ───────────────────────────────────────────────────────────────────────── */

export default function LandingPage() {
  return (
    <div
      data-theme="landing"
      className="landing-premium landing-light min-h-screen scroll-smooth bg-room text-ink antialiased"
    >
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
