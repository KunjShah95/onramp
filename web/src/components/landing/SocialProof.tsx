import { motion } from 'framer-motion'
import SectionHeading from './SectionHeading'

const EASE = [0.16, 1, 0.3, 1] as const

/* Proof strip — honest by design: no fake logos, no fabricated quotes.
 * Integrates with the tools teams already use; outcomes are what Onramp
 * tracks, not customer claims. Real testimonials replace these cards when
 * available. */
const INTEGRATIONS = ['GitHub', 'Slack', 'Linear']

const OUTCOMES = [
  {
    metric: 'First merged PR',
    detail:
      'New hires work graded tasks against your real repo and land a reviewed PR in their first week.',
  },
  {
    metric: 'Fewer repeat questions',
    detail:
      'The live architecture map answers "where do I start?" so seniors stop re-answering it.',
  },
  {
    metric: 'Fresh on every push',
    detail:
      'The map, paths, and review queue update with the codebase — never stale docs.',
  },
]

export default function SocialProof() {
  return (
    <section className="relative scroll-mt-24 border-t border-seam bg-base">
      <div className="mx-auto max-w-[1280px] px-6 py-24 lg:px-10 lg:py-32">
        <SectionHeading
          eyebrow="Why teams try it"
          heading={<>What changes in the first week.</>}
          sub="Not promises — the workflow your team gets: a live map, graded tasks, and a review queue."
        />

        {/* integration strip — real tools, not fake logos */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.8 }}
          className="mt-14 flex flex-wrap items-center justify-center gap-x-12 gap-y-4 border-y border-seam py-6"
        >
          {INTEGRATIONS.map((c) => (
            <span
              key={c}
              className="font-body text-[15px] font-semibold tracking-tight text-ink-secondary"
            >
              {c}
            </span>
          ))}
        </motion.div>

        {/* outcomes — what Onramp tracks, not fabricated quotes */}
        <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
          {OUTCOMES.map((t, i) => (
            <motion.div
              key={t.metric}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.65, delay: 0.1 + i * 0.1, ease: EASE }}
              className="flex flex-col rounded-card border border-seam bg-panel p-7 shadow-seam"
            >
              <div className="flex-1">
                <div className="text-[15px] font-semibold text-ink">{t.metric}</div>
                <p className="mt-2 text-[15px] leading-[1.65] text-ink-secondary">
                  {t.detail}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
