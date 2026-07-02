import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import GradientHeading from '../ui/gradient-heading'
import PageTransition from '../ui/page-transition'

export interface LegalSection {
  heading: string
  paragraphs: string[]
  bullets?: string[]
}

interface LegalLayoutProps {
  label: string
  title: string
  lastUpdated: string
  intro: string
  sections: LegalSection[]
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
}

export default function LegalLayout({ label, title, lastUpdated, intro, sections }: LegalLayoutProps) {
  return (
    <PageTransition>
      <div className="min-h-screen bg-[#050505] text-[#FDFBF8] font-body max-w-full overflow-x-hidden">
        {/* Nav */}
        <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex justify-between items-center px-8 py-4 w-[95%] max-w-5xl bg-[#0A0705]/80 backdrop-blur-xl border border-[#FDFBF8]/10 rounded-full">
          <Link to="/" className="font-display text-xl font-bold tracking-tight">CodeFlow</Link>
          <div className="hidden md:flex items-center gap-8">
            <Link to="/docs" className="text-[#FDFBF8]/60 text-sm hover:text-[#FDFBF8] transition-colors">Docs</Link>
            <Link to="/changelog" className="text-[#FDFBF8]/60 text-sm hover:text-[#FDFBF8] transition-colors">Changelog</Link>
            <Link to="/pricing" className="text-[#FDFBF8]/60 text-sm hover:text-[#FDFBF8] transition-colors">Pricing</Link>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/login" className="hidden md:block text-[#FDFBF8]/60 text-sm hover:text-[#FDFBF8] transition-colors">Log in</Link>
            <Link to="/register" className="bg-[#FFB347] text-[#3D1C00] px-5 py-2.5 rounded-full text-sm font-bold hover:bg-[#FF8C00] transition-colors">Get Started</Link>
          </div>
        </nav>

        <div className="max-w-2xl mx-auto px-6 pt-40 pb-32">
          {/* Header */}
          <div className="mb-16">
            <p className="font-mono text-[11px] text-[#FF8C00] uppercase tracking-widest mb-4">{label}</p>
            <GradientHeading as="h1" className="text-4xl md:text-5xl mb-4">{title}</GradientHeading>
            <p className="font-mono text-xs text-[#FDFBF8]/30 mb-6">Last updated: {lastUpdated}</p>
            <p className="text-[#FDFBF8]/50 text-base leading-relaxed">{intro}</p>
          </div>

          {/* Sections */}
          <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-12">
            {sections.map((section, idx) => (
              <motion.section key={section.heading} variants={itemVariants} className="relative pl-8 border-l border-[#FDFBF8]/6">
                <div className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-[#FF8C00] bg-[#050505]" />
                <h2 className="font-display text-xl font-bold text-[#FDFBF8] mb-4">
                  <span className="font-mono text-sm text-[#FDFBF8]/30 mr-3">{String(idx + 1).padStart(2, '0')}</span>
                  {section.heading}
                </h2>
                {section.paragraphs.map((p, i) => (
                  <p key={i} className="text-sm text-[#FDFBF8]/55 leading-relaxed mb-3">{p}</p>
                ))}
                {section.bullets && (
                  <ul className="space-y-2.5 mt-2">
                    {section.bullets.map((item, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm text-[#FDFBF8]/55 leading-relaxed">
                        <span className="text-[#FF8C00] mt-0.5 shrink-0">→</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </motion.section>
            ))}
          </motion.div>

          {/* Footer cross-link */}
          <div className="mt-20 pt-8 border-t border-[#FDFBF8]/6 flex flex-wrap gap-6 text-sm">
            <Link to="/privacy" className="text-[#FDFBF8]/40 hover:text-[#FF8C00] transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="text-[#FDFBF8]/40 hover:text-[#FF8C00] transition-colors">Terms of Service</Link>
            <a href="mailto:legal@codeflow.ai" className="text-[#FDFBF8]/40 hover:text-[#FF8C00] transition-colors">legal@codeflow.ai</a>
          </div>
        </div>
      </div>
    </PageTransition>
  )
}
