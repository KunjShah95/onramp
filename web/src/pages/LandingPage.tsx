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
 * Landing — "your codebase is a map", the premium build.
 *
 * A single dark surface (`.landing-premium`) pins its own identity so it
 * never follows the app's theme. Sections:
 *   Hero (3D chaos → clarity) · ProblemGrid (#the-gap) · Solution (#the-map,
 *   interactive Babylon map) · MetricsBoard (#metrics) · HowItWorks ·
 *   SocialProof · Pricing (#pricing) · ClosingCta · Footer
 * ───────────────────────────────────────────────────────────────────────── */

export default function LandingPage() {
  return (
    <div data-theme="landing" className="landing-premium min-h-screen bg-room text-ink antialiased">
      <LandingNav />
      <main>
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
