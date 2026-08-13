import { motion } from 'framer-motion'
import SectionHeading from './SectionHeading'

const EASE = [0.16, 1, 0.3, 1] as const

/* Fictional customer wordmarks — shown as neutral text so they never read as
 * real trademarks or as placeholder logos. */
const CUSTOMERS = ['Northwind', 'Lattice', 'Kite & Co', 'Harbor', 'Bramble', 'Vertex Labs']

const TESTIMONIALS = [
  {
    quote:
      "Onramp cut our onboarding time from two weeks to three days. Juniors are shipping real PRs in their first week.",
    name: 'Sarah Chen',
    role: 'CTO, Northwind',
    initial: 'SC',
  },
  {
    quote:
      "Finally, an onboarding tool built for the way engineering actually works. The map answers what the docs can't.",
    name: 'Marcus Williams',
    role: 'VP Engineering, Lattice',
    initial: 'MW',
  },
  {
    quote:
      "Our senior engineers stopped answering the same 'where do I start?' questions. That alone paid for the tool.",
    name: 'Priya Patel',
    role: 'Engineering Lead, Harbor',
    initial: 'PP',
  },
]

export default function SocialProof() {
  return (
    <section className="relative scroll-mt-24 border-t border-black/5 bg-base">
      <div className="mx-auto max-w-[1280px] px-6 py-24 lg:px-10 lg:py-32">
        <SectionHeading
          eyebrow="Customers"
          heading={<>Teams that stopped searching start shipping.</>}
          sub="Engineering leaders use Onramp to make their architecture visible — and to get out of the way."
        />

        {/* wordmark strip */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.8 }}
          className="mt-14 flex flex-wrap items-center justify-center gap-x-12 gap-y-4 border-y border-black/5 py-6"
        >
          {CUSTOMERS.map((c) => (
            <span
              key={c}
              className="font-body text-[15px] font-semibold tracking-tight text-ink-tertiary"
            >
              {c}
            </span>
          ))}
        </motion.div>

        {/* testimonials */}
        <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <motion.figure
              key={t.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.65, delay: 0.1 + i * 0.1, ease: EASE }}
              className="flex flex-col rounded-xl border border-black/10 bg-white p-7 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
            >
              <blockquote className="flex-1 text-[15px] leading-[1.65] text-ink-secondary">
                “{t.quote}”
              </blockquote>
              <figcaption className="mt-6 flex items-center gap-3 border-t border-black/5 pt-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-accent-primary/20 to-accent-via/10 font-body text-[12px] font-semibold text-accent-primary-hover">
                  {t.initial}
                </span>
                <div>
                  <div className="text-[13.5px] font-semibold text-ink">{t.name}</div>
                  <div className="text-[12px] text-ink-tertiary">{t.role}</div>
                </div>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </div>
    </section>
  )
}
