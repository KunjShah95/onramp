import { motion } from 'framer-motion'
import { ArrowRight, Brain, Code, Lightning } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import MarketingLayout from '../components/layout/MarketingLayout'
import type { NavLinkItem } from '../components/layout/MarketingNav'

const navLinks: NavLinkItem[] = [
  { label: 'Docs', href: '/docs' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Why Onramp', href: '/why-onramp', active: true },
]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 90, damping: 20 } },
}

export default function WhyOnrampPage() {
  return (
    <MarketingLayout navLinks={navLinks}>
      {/* Hero */}
      <div className="relative pt-20 pb-12 px-6 text-center max-w-4xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
          <span className="designator text-ink-secondary">ENGINEERING · PHILOSOPHY</span>
          <h1 className="font-display text-5xl md:text-6xl mt-4 mb-6 font-bold tracking-tight text-[hsl(var(--foreground))]">
            Why Onramp, Not Terminals
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] text-lg mb-8 max-w-2xl mx-auto font-body">
            Onboarding isn't about running commands. It's about understanding context. We chose code analysis over terminals because developers learn by reading, not typing.
          </p>
        </motion.div>
      </div>

      {/* Core Philosophy */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative max-w-5xl mx-auto px-6 py-20 grid grid-cols-1 md:grid-cols-2 gap-8 mb-20"
      >
        {/* Why Not Terminals/Agents */}
        <motion.div variants={itemVariants} className="rounded-card border border-seam bg-panel p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-[3px] bg-abort/10 flex items-center justify-center">
              <Code size={20} weight="bold" className="text-abort" />
            </div>
            <h3 className="font-display text-xl font-bold text-[hsl(var(--foreground))]">Why NOT Terminals</h3>
          </div>
          <ul className="space-y-3 text-sm text-[hsl(var(--muted-foreground))] font-body">
            <li className="flex gap-3">
              <span className="text-abort font-bold mt-0.5">✗</span>
              <span><strong>Requires expertise.</strong> Running commands assumes git/docker/shell knowledge — not all devs have it.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-abort font-bold mt-0.5">✗</span>
              <span><strong>Error-prone.</strong> Commands fail silently. Typos halt progress. Debugging takes hours.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-abort font-bold mt-0.5">✗</span>
              <span><strong>Context-agnostic.</strong> Terminals show logs, not intent. You're debugging blind.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-abort font-bold mt-0.5">✗</span>
              <span><strong>Slow to onboard.</strong> Takes days to understand why commands matter.</span>
            </li>
          </ul>
        </motion.div>

        {/* Why Onramp */}
        <motion.div variants={itemVariants} className="rounded-card border border-go/30 bg-gradient-to-br from-bg-secondary via-bg-secondary to-bg-secondary/80 p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-[3px] bg-go/10 flex items-center justify-center">
              <Brain size={20} weight="bold" className="text-go" />
            </div>
            <h3 className="font-display text-xl font-bold text-[hsl(var(--foreground))]">Why Onramp</h3>
          </div>
          <ul className="space-y-3 text-sm text-[hsl(var(--muted-foreground))] font-body">
            <li className="flex gap-3">
              <span className="text-go font-bold mt-0.5">✓</span>
              <span><strong>Reads your actual code.</strong> We parse it, index it, understand architecture — then explain it.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-go font-bold mt-0.5">✓</span>
              <span><strong>Accessible to all levels.</strong> Senior engineer or first-time contributor — everyone gets context.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-go font-bold mt-0.5">✓</span>
              <span><strong>Grounded answers.</strong> Every response cites files and line numbers. Trust what you read.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-go font-bold mt-0.5">✓</span>
              <span><strong>Fast ramp-up.</strong> From zero to first PR in days, not weeks.</span>
            </li>
          </ul>
        </motion.div>
      </motion.div>

      {/* The Three Pillars */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative max-w-6xl mx-auto px-6 py-20"
      >
        <motion.div variants={itemVariants} className="text-center mb-12">
          <h2 className="font-display text-4xl font-bold text-[hsl(var(--foreground))] mb-4">Three Core Principles</h2>
          <p className="text-[hsl(var(--muted-foreground))] font-body max-w-2xl mx-auto">
            Our approach rests on three beliefs about how developers actually learn.
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {[
            {
              icon: Brain,
              title: 'Context Over Commands',
              desc: 'Understanding WHY a file exists matters more than running a setup script. We show you the intent behind code.',
              color: 'text-go',
              bg: 'bg-go/10',
            },
            {
              icon: Code,
              title: 'Code is Truth',
              desc: 'Docs rot. Comments lie. Code never does. We read your actual codebase to answer real questions.',
              color: 'text-go-lit',
              bg: 'bg-go-lit/10',
            },
            {
              icon: Lightning,
              title: 'Speed Builds Confidence',
              desc: 'Fast onboarding lets devs contribute quickly. First PR on day two beats "understanding" on day thirty.',
              color: 'text-accent-from',
              bg: 'bg-accent-from/10',
            },
          ].map((pillar, idx) => (
            <motion.div
              key={idx}
              variants={itemVariants}
              className="rounded-card border border-seam bg-panel p-7 hover:border-go/20 transition-all"
            >
              <div className={`w-12 h-12 rounded-[3px] ${pillar.bg} flex items-center justify-center mb-4`}>
                <pillar.icon size={24} weight="bold" className={pillar.color} />
              </div>
              <h3 className="font-display text-lg font-bold text-[hsl(var(--foreground))] mb-2">
                {pillar.title}
              </h3>
              <p className="text-[13.5px] text-[hsl(var(--muted-foreground))] leading-relaxed">
                {pillar.desc}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>

      {/* Comparison Table */}
      <motion.div
        variants={itemVariants}
        className="relative max-w-5xl mx-auto px-6 py-20"
      >
        <h2 className="font-display text-3xl font-bold text-center text-[hsl(var(--foreground))] mb-10">
          The Approach Breakdown
        </h2>
        <div className="rounded-card border border-seam bg-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-seam bg-panel-raised">
                  <th className="px-6 py-3 text-left font-semibold text-[hsl(var(--foreground))]">Aspect</th>
                  <th className="px-6 py-3 text-left font-semibold text-[hsl(var(--foreground))]">Terminals / Scripts</th>
                  <th className="px-6 py-3 text-left font-semibold text-[hsl(var(--foreground))]">Coding Agents</th>
                  <th className="px-6 py-3 text-left font-semibold text-[hsl(var(--foreground))]">Onramp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-seam">
                {[
                  ['Learning curve', 'Steep — shell knowledge needed', 'Medium — magic box problem', 'Gentle — read the code'],
                  ['Trust', 'Black box output', 'Agent decisions opaque', 'File + line citations'],
                  ['Speed to PR', 'Slow (debugging commands)', 'Fast but wrong sometimes', 'Fast + correct'],
                  ['Works offline', 'Yes', 'No (requires API)', 'Yes (local index)'],
                  ['Understand WHY', 'No, just WHAT', 'No, just HOW', 'Yes, full context'],
                ].map((row, idx) => (
                  <tr key={idx} className="hover:bg-panel-raised/50 transition-colors">
                    <td className="px-6 py-3 font-semibold text-[hsl(var(--foreground))]">{row[0]}</td>
                    <td className="px-6 py-3 text-[hsl(var(--muted-foreground))]">{row[1]}</td>
                    <td className="px-6 py-3 text-[hsl(var(--muted-foreground))]">{row[2]}</td>
                    <td className="px-6 py-3 text-go font-semibold">{row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>

      {/* CTA */}
      <motion.div
        variants={itemVariants}
        className="relative max-w-3xl mx-auto px-6 py-20 text-center"
      >
        <h2 className="font-display text-3xl font-bold text-[hsl(var(--foreground))] mb-4">
          Ready to onboard your way.
        </h2>
        <p className="text-[hsl(var(--muted-foreground))] font-body mb-8">
          Join teams shipping faster because developers understand code from day one.
        </p>
        <Link
          to="/pricing"
          className="inline-flex items-center justify-center gap-2 bg-go px-8 py-3 rounded-btn text-[15px] font-medium text-[hsl(var(--primary-foreground))] hover:bg-go-lit transition-colors"
        >
          Start 14-day trial
          <ArrowRight size={16} weight="bold" />
        </Link>
      </motion.div>
    </MarketingLayout>
  )
}
