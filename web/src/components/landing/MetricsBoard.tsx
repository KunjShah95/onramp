import { motion } from 'framer-motion'
import { CountUp } from '../ui/landing-motion'
import SectionHeading from './SectionHeading'

const EASE = [0.16, 1, 0.3, 1] as const

const BARS = [28, 44, 39, 58, 52, 74, 69, 91, 84, 100]

function MiniBars() {
  return (
    <div className="mt-4 flex h-20 items-end gap-1.5">
      {BARS.map((h, i) => (
        <motion.div
          key={i}
          initial={{ scaleY: 0 }}
          whileInView={{ scaleY: 1 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, delay: 0.3 + i * 0.05, ease: EASE }}
          className="w-full origin-bottom rounded-sm bg-gradient-to-t from-accent-primary/35 to-accent-primary"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  )
}

const CARD =
  'relative overflow-hidden rounded-2xl border border-black/10 bg-white p-7 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(15,23,42,0.08)]'

export default function MetricsBoard() {
  return (
    <section id="metrics" className="relative scroll-mt-24 border-t border-black/5 bg-base">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 60% 45% at 50% 0%, rgba(79,70,229,0.05), transparent 65%)' }}
      />
      <div className="relative mx-auto max-w-[1280px] px-6 py-24 lg:px-10 lg:py-32">
        <SectionHeading
          eyebrow="Results"
          heading={<>Onboarding stops being a bet.</>}
          sub="Once the map exists, teams see real movement in their first month, and the readings keep improving from there."
        />

        <div className="mt-14 grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Time saved */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.65, delay: 0.05, ease: EASE }}
            className={CARD}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-tertiary">
                Time saved
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-accent-primary" />
            </div>
            <div className="mt-6 flex items-baseline gap-2">
              <CountUp
                to={14.2}
                duration={1.2}
                className="font-body text-[clamp(2.6rem,5vw,3.4rem)] font-bold leading-none tracking-tight text-ink tabular-nums"
              />
              <span className="text-[13px] font-medium text-ink-tertiary">hours</span>
            </div>
            <p className="mt-2 text-[13px] text-ink-tertiary">per new hire, first month</p>
            <div className="mt-5 border-t border-black/5 pt-4">
              <p className="text-[13px] font-medium text-ink">72% reduction in ramp-up time</p>
            </div>
          </motion.div>

          {/* Onboarding lift */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.65, delay: 0.12, ease: EASE }}
            className={CARD}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-tertiary">
                Onboarding lift
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-accent-via" />
            </div>
            <div className="mt-6 flex items-baseline gap-2">
              <CountUp
                to={34}
                duration={1.2}
                className="font-body text-[clamp(2.6rem,5vw,3.4rem)] font-bold leading-none tracking-tight text-ink tabular-nums"
              />
              <span className="text-[13px] font-medium text-ink-tertiary">developers</span>
            </div>
            <p className="mt-2 text-[13px] text-ink-tertiary">onboarded last month</p>
            <MiniBars />
            <div className="mt-4 border-t border-black/5 pt-4">
              <p className="text-[13px] font-medium text-ink">
                1st PR in <span className="text-accent-primary">2.3 days</span>{' '}
                <span className="text-ink-tertiary">(was 8.1)</span>
              </p>
            </div>
          </motion.div>

          {/* Team health */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.65, delay: 0.19, ease: EASE }}
            className={CARD}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-tertiary">
                Team health
              </span>
              <span className="flex items-center gap-1.5 rounded-full border border-go/20 bg-go/[0.06] px-2 py-0.5 text-[11px] font-semibold text-go">
                <span className="h-1.5 w-1.5 rounded-full bg-go" />
                Stable
              </span>
            </div>
            <div className="mt-6 flex items-baseline gap-2">
              <CountUp
                to={98}
                duration={1.2}
                className="font-body text-[clamp(2.6rem,5vw,3.4rem)] font-bold leading-none tracking-tight text-ink tabular-nums"
              />
              <span className="text-[13px] font-medium text-ink-tertiary">%</span>
            </div>
            <p className="mt-2 text-[13px] text-ink-tertiary">onboarding success rate</p>
            <div className="mt-5 flex items-center gap-3 border-t border-black/5 pt-4">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-go/40" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-go" />
              </span>
              <p className="text-[13px] font-medium text-ink">
                Confidence score up <span className="text-go">42%</span>
              </p>
            </div>
          </motion.div>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-6 font-code text-[11px] text-ink-tertiary"
        >
          Illustrative demo readings · the first index replaces them with your repository's numbers.
        </motion.p>
      </div>
    </section>
  )
}
