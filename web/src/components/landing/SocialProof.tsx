import { motion } from 'framer-motion'

const EASE = [0.16, 1, 0.3, 1] as const

/* Fictional wordmarks — monogram marks so they don't read as text-only. */
const LOGOS = [
  { name: 'Stripe', mark: 'S', color: 'text-[#00D9FF]' },
  { name: 'Figma', mark: 'F', color: 'text-[#06B6D4]' },
  { name: 'Vercel', mark: '▲', color: 'text-[#10B981]' },
]

const QUOTES = [
  {
    quote:
      "Onramp cut our onboarding time from 2 weeks to 3 days. Our juniors are productive immediately.",
    name: 'Sarah Chen',
    role: 'CTO, TechCorp',
    initial: 'SC',
  },
  {
    quote:
      "Finally, an onboarding tool built for the way we actually work. Not another generic tool.",
    name: 'Marcus Williams',
    role: 'VP Engineering, StartupAI',
    initial: 'MW',
  },
  {
    quote:
      "Our senior devs spend 10x less time answering 'where do I start?' questions. Huge win.",
    name: 'Priya Patel',
    role: 'Engineering Lead, DataFlow',
    initial: 'PP',
  },
]

export default function SocialProof() {
  return (
    <section className="relative border-t border-white/5 bg-base">
      <div className="mx-auto max-w-[1280px] px-6 py-24 lg:px-10 lg:py-32">
        {/* logo row */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.8 }}
          className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6"
        >
          <span className="font-code text-[11px] uppercase tracking-[0.18em] text-ink-tertiary">
            Trusted by
          </span>
          {LOGOS.map((l, i) => (
            <motion.div
              key={l.name}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.5, delay: 0.15 + i * 0.1, ease: EASE }}
              className="flex items-center gap-2"
            >
              <span className={`flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 bg-white/[0.04] font-display text-[13px] font-bold ${l.color}`}>
                {l.mark}
              </span>
              <span className="font-display text-[15px] font-bold text-ink-secondary">{l.name}</span>
            </motion.div>
          ))}
        </motion.div>

        {/* quotes */}
        <div className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-3">
          {QUOTES.map((q, i) => (
            <motion.figure
              key={q.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.65, delay: 0.1 + i * 0.1, ease: EASE }}
              className="group flex flex-col rounded-sm border border-white/10 bg-panel p-7 transition-colors duration-300 hover:border-white/20"
            >
              <span className="font-display text-[28px] leading-none text-[#06B6D4]">“</span>
              <blockquote className="mt-3 flex-1 text-[15px] leading-[1.65] text-ink-secondary">
                {q.quote}
              </blockquote>
              <figcaption className="mt-6 flex items-center gap-3 border-t border-white/5 pt-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#00D9FF]/40 to-[#06B6D4]/20 font-code text-[11px] font-bold text-white">
                  {q.initial}
                </span>
                <div>
                  <div className="text-[13px] font-semibold text-white">{q.name}</div>
                  <div className="font-code text-[11px] text-ink-tertiary">{q.role}</div>
                </div>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </div>
    </section>
  )
}
