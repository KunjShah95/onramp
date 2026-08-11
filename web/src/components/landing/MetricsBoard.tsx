import { motion } from 'framer-motion'
import { CountUp } from '../ui/landing-motion'

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
          className="w-full origin-bottom rounded-sm bg-gradient-to-t from-[#06B6D4]/40 to-[#00D9FF]"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  )
}

export default function MetricsBoard() {
  return (
    <section id="metrics" className="relative border-t border-white/5 bg-base">
      {/* gradient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 45% at 50% 0%, rgba(6,182,212,0.10), transparent 65%)',
        }}
      />
      <div className="relative mx-auto max-w-[1280px] px-6 py-24 lg:px-10 lg:py-32">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.65, ease: EASE }}
          className="max-w-2xl"
        >
          <p className="font-code text-[11px] font-medium uppercase tracking-[0.16em] text-[#00D9FF]">
            The status board
          </p>
          <h2 className="mt-4 font-display text-[clamp(1.8rem,4vw,3rem)] font-bold leading-[1.06] tracking-[-0.02em] text-white">
            See your team's real progress.
          </h2>
        </motion.div>

        <div className="mt-14 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Time saved */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.65, delay: 0.05, ease: EASE }}
            className="group relative overflow-hidden rounded-sm border border-white/10 bg-panel p-7 transition-colors duration-300 hover:border-white/20"
          >
            <div className="flex items-center justify-between">
              <span className="font-code text-[10px] uppercase tracking-[0.14em] text-ink-tertiary">
                TIME SAVED
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-[#00D9FF] motion-safe:animate-pulse-glow" />
            </div>
            <div className="mt-6 flex items-baseline gap-2">
              <CountUp
                to={14.2}
                duration={1.2}
                className="font-code text-[clamp(2.6rem,5vw,3.4rem)] font-bold leading-none tracking-tight text-[#00D9FF] tabular-nums"
              />
              <span className="font-code text-[13px] text-ink-tertiary">hours</span>
            </div>
            <p className="mt-2 font-code text-[12px] text-ink-tertiary">per new hire</p>
            <div className="mt-5 border-t border-white/5 pt-4">
              <p className="font-code text-[13px] text-[#10B981]">72% reduction in ramp-up time</p>
            </div>
          </motion.div>

          {/* Onboarding lift */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.65, delay: 0.12, ease: EASE }}
            className="group relative overflow-hidden rounded-sm border border-white/10 bg-panel p-7 transition-colors duration-300 hover:border-white/20"
          >
            <div className="flex items-center justify-between">
              <span className="font-code text-[10px] uppercase tracking-[0.14em] text-ink-tertiary">
                ONBOARDING LIFT
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-[#06B6D4]" />
            </div>
            <div className="mt-6 flex items-baseline gap-2">
              <CountUp
                to={34}
                duration={1.2}
                className="font-code text-[clamp(2.6rem,5vw,3.4rem)] font-bold leading-none tracking-tight text-[#00D9FF] tabular-nums"
              />
              <span className="font-code text-[13px] text-ink-tertiary">developers</span>
            </div>
            <p className="mt-2 font-code text-[12px] text-ink-tertiary">onboarded last month</p>
            <MiniBars />
            <div className="mt-4 border-t border-white/5 pt-4">
              <p className="font-code text-[13px] text-ink-secondary">
                1st PR in <span className="text-[#10B981]">2.3 days</span> <span className="text-ink-tertiary">(was 8.1)</span>
              </p>
            </div>
          </motion.div>

          {/* Team health */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.65, delay: 0.19, ease: EASE }}
            className="group relative overflow-hidden rounded-sm border border-white/10 bg-panel p-7 transition-colors duration-300 hover:border-white/20"
          >
            <div className="flex items-center justify-between">
              <span className="font-code text-[10px] uppercase tracking-[0.14em] text-ink-tertiary">
                TEAM HEALTH
              </span>
              <span className="flex items-center gap-1.5 rounded-sm border border-[#10B981]/30 bg-[#10B981]/10 px-2 py-0.5 font-code text-[10px] text-[#34D399]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] motion-safe:animate-pulse-glow" />
                STABLE
              </span>
            </div>
            <div className="mt-6 flex items-baseline gap-2">
              <CountUp
                to={98}
                duration={1.2}
                className="font-code text-[clamp(2.6rem,5vw,3.4rem)] font-bold leading-none tracking-tight text-[#10B981] tabular-nums"
              />
              <span className="font-code text-[13px] text-ink-tertiary">%</span>
            </div>
            <p className="mt-2 font-code text-[12px] text-ink-tertiary">onboarding success rate</p>
            <div className="mt-5 flex items-center gap-3 border-t border-white/5 pt-4">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#10B981]/50" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-[#10B981]" />
              </span>
              <p className="font-code text-[13px] text-ink-secondary">
                Confidence score up <span className="text-[#10B981]">42%</span>
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
          Illustrative demo readings — the first index replaces them with your repo's numbers.
        </motion.p>
      </div>
    </section>
  )
}
