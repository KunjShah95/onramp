import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { cn } from '../lib/utils'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import PageTransition from '../components/ui/page-transition'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
}

export default function PricingPage() {
  const [isAnnual, setIsAnnual] = useState(false)

  const faqs = [
    { question: 'How do credits work?', answer: 'Credits are consumed when you generate learning paths, query your codebase, or perform deep architectural analysis. 1 credit roughly equals 1 query.' },
    { question: 'Can I switch plans later?', answer: 'Yes, you can upgrade or downgrade your plan at any time. Prorated charges will be applied automatically.' },
    { question: 'Do you offer a discount for open-source projects?', answer: 'We love open-source! Contact us for a special open-source license that grants you Enterprise features for free.' },
  ]

  return (
    <PageTransition>
      <div className="min-h-screen bg-[#110D0A] text-[#FDFBF8] font-body selection:bg-accent-from/30 max-w-full overflow-x-hidden">
        {/* Navigation */}
        <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FF8C00] to-[#FF6B35] flex items-center justify-center shadow-glow">
                <span className="material-symbols-outlined text-white text-lg">code_blocks</span>
              </div>
              <span className="font-display font-bold text-xl tracking-tight text-white">CodeFlow <span className="text-accent-from">2.0</span></span>
            </Link>
            <div className="hidden md:flex items-center gap-6 text-sm text-[#FDFBF8]/70">
              <a href="#" className="hover:text-white transition-colors">Docs</a>
              <a href="#" className="text-white font-medium">Pricing</a>
              <a href="#" className="hover:text-white transition-colors">Changelog</a>
              <a href="#" className="hover:text-white transition-colors">Community</a>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link to="/login" className="text-[#FDFBF8]/70 hover:text-white transition-colors">Login</Link>
            <Link to="/register" className="px-4 py-2 rounded-full bg-[#FDFBF8] text-[#110D0A] font-medium hover:bg-white transition-colors">Get Started</Link>
          </div>
        </nav>

        {/* Hero Section */}
        <div className="pt-24 pb-16 px-6 text-center max-w-3xl mx-auto">
          <GradientHeading as="h1" className="text-4xl md:text-5xl mb-6 font-bold tracking-tight">
            Standardized pricing for engineering teams
          </GradientHeading>
          <p className="text-[#FDFBF8]/60 text-lg mb-10">Deploy for free, scale when your infrastructure demands it.</p>
          
          {/* Toggle */}
          <div className="inline-flex items-center gap-3 p-1 rounded-full bg-[#1A1512] border border-[#FDFBF8]/5">
            <button 
              onClick={() => setIsAnnual(false)}
              className={cn("px-4 py-2 rounded-full text-sm font-medium transition-all", !isAnnual ? "bg-[#33281f] text-white shadow-sm" : "text-[#FDFBF8]/60 hover:text-white")}
            >
              Monthly
            </button>
            <button 
              onClick={() => setIsAnnual(true)}
              className={cn("px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2", isAnnual ? "bg-[#33281f] text-white shadow-sm" : "text-[#FDFBF8]/60 hover:text-white")}
            >
              Annually <span className="text-[10px] uppercase tracking-wider text-accent-from font-bold bg-accent-from/10 px-2 py-0.5 rounded-full">Save 20%</span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-6 pb-24">
          {/* Free */}
          <motion.div variants={itemVariants}>
            <CardSpotlight className="p-8 flex flex-col">
              <h3 className="font-display text-xl font-bold mb-2">Free</h3>
              <p className="text-[#FDFBF8]/60 text-sm mb-6 h-10">For individuals and small teams exploring CodeFlow.</p>
              <div className="mb-8">
                <span className="text-4xl font-bold">$0</span>
                <span className="text-[#FDFBF8]/60 text-sm">/mo</span>
              </div>
              <Link to="/register" className="w-full py-2.5 rounded-lg border border-[#FDFBF8]/10 text-center font-medium hover:bg-[#FDFBF8]/5 transition-colors mb-8">Get Started</Link>
              <ul className="space-y-4 text-sm text-[#FDFBF8]/80 flex-1">
                <li className="flex items-center gap-3"><span className="material-symbols-outlined text-accent-from text-lg">check</span> 1 team member</li>
                <li className="flex items-center gap-3"><span className="material-symbols-outlined text-accent-from text-lg">check</span> 1 repository</li>
                <li className="flex items-center gap-3"><span className="material-symbols-outlined text-accent-from text-lg">check</span> 50 credits/month</li>
                <li className="flex items-center gap-3"><span className="material-symbols-outlined text-accent-from text-lg">check</span> Community support</li>
              </ul>
            </CardSpotlight>
          </motion.div>

          {/* Startup */}
          <motion.div variants={itemVariants}>
            <CardSpotlight className="p-8 flex flex-col bg-gradient-to-b from-[#1f1915] to-[#1A1512] border-accent-from/40 shadow-[0_0_40px_rgba(255,140,0,0.1)]">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent-from text-[#3D1C00] text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">Most Popular</div>
              <h3 className="font-display text-xl font-bold mb-2">Startup</h3>
              <p className="text-[#FDFBF8]/60 text-sm mb-6 h-10">For scaling engineering teams.</p>
              <div className="mb-8">
                <span className="text-4xl font-bold">${isAnnual ? '39' : '49'}</span>
                <span className="text-[#FDFBF8]/60 text-sm">/mo</span>
              </div>
              <Link to="/register" className="w-full py-2.5 rounded-lg bg-accent-from text-[#3D1C00] text-center font-bold hover:brightness-110 transition-all mb-8 shadow-glow">Start 14-day free trial</Link>
              <ul className="space-y-4 text-sm text-[#FDFBF8]/80 flex-1">
                <li className="flex items-center gap-3"><span className="material-symbols-outlined text-accent-from text-lg">check</span> 5 team members</li>
                <li className="flex items-center gap-3"><span className="material-symbols-outlined text-accent-from text-lg">check</span> 10 repositories</li>
                <li className="flex items-center gap-3"><span className="material-symbols-outlined text-accent-from text-lg">check</span> 5,000 credits/month</li>
                <li className="flex items-center gap-3"><span className="material-symbols-outlined text-accent-from text-lg">check</span> Email support</li>
              </ul>
            </CardSpotlight>
          </motion.div>

          {/* Enterprise */}
          <motion.div variants={itemVariants}>
            <CardSpotlight className="p-8 flex flex-col">
              <h3 className="font-display text-xl font-bold mb-2">Enterprise</h3>
              <p className="text-[#FDFBF8]/60 text-sm mb-6 h-10">For enterprise environments requiring SOC2 compliance and SSO.</p>
              <div className="mb-8">
                <span className="text-4xl font-bold">Custom</span>
              </div>
              <button className="w-full py-2.5 rounded-lg border border-[#FDFBF8]/10 text-center font-medium hover:bg-[#FDFBF8]/5 transition-colors mb-8">Contact Sales</button>
              <ul className="space-y-4 text-sm text-[#FDFBF8]/80 flex-1">
                <li className="flex items-center gap-3"><span className="material-symbols-outlined text-accent-from text-lg">check</span> Unlimited members</li>
                <li className="flex items-center gap-3"><span className="material-symbols-outlined text-accent-from text-lg">check</span> Unlimited repos</li>
                <li className="flex items-center gap-3"><span className="material-symbols-outlined text-accent-from text-lg">check</span> Unlimited credits</li>
                <li className="flex items-center gap-3"><span className="material-symbols-outlined text-accent-from text-lg">check</span> Dedicated support, SSO, SLA</li>
              </ul>
            </CardSpotlight>
          </motion.div>
        </motion.div>

        {/* FAQs */}
        <div className="max-w-3xl mx-auto px-6 pb-32">
          <h2 className="font-display text-2xl font-bold mb-8 text-center">Frequently asked questions</h2>
          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-[#1A1512] border border-[#FDFBF8]/5 rounded-xl p-6">
                <h4 className="font-bold mb-2">{faq.question}</h4>
                <p className="text-sm text-[#FDFBF8]/60 leading-relaxed">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageTransition>
  )
}
