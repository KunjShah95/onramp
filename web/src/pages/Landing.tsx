import { useState, useEffect } from 'react'
import AnimatedHero from '../components/landing/AnimatedHero'
import Features from '../components/landing/Features'
import HowItWorks from '../components/landing/HowItWorks'
import Footer from '../components/landing/Footer'
import { LandingSkeleton } from '../components/ui/Skeleton'

export default function Landing() {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 150)
    return () => clearTimeout(timer)
  }, [])

  if (loading) return <LandingSkeleton />

  return (
    <div className="animate-in bg-black min-h-screen text-white selection:bg-blue-500/30">
      <AnimatedHero />
      <Features />
      <HowItWorks />
      <Footer />
    </div>
  )
}
