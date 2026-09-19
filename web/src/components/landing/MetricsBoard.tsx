import { CountUp } from '../ui/landing-motion'
import SectionHeading from './SectionHeading'

/* Calm metrics — three plain panels, static values, one quiet bar row.
 * Removed: radial glow, staggered rise, animated scaleY bars,
 * gradient bars, ping dot. */

const BARS = [28, 44, 39, 58, 52, 74, 69, 91, 84, 100]

const CARD = 'rounded-md border border-seam bg-panel p-6'

export default function MetricsBoard() {
  return (
    <section id="metrics" className="scroll-mt-20 border-t border-seam bg-base">
      <div className="mx-auto max-w-6xl px-6 py-16 lg:px-8 lg:py-20">
        <SectionHeading
          eyebrow="Results"
          heading={<>Onboarding stops being a bet.</>}
          sub="Once the map exists, teams see real movement in their first month, and the readings keep improving from there."
        />

<<<<<<< HEAD
        <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className={CARD}>
            <span className="text-xs font-medium uppercase tracking-wider text-ink-tertiary">
              Time saved
            </span>
            <div className="mt-4 flex items-baseline gap-2">
=======
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
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-secondary">
                Time saved
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-accent-primary" />
            </div>
            <div className="mt-6 flex items-baseline gap-2">
>>>>>>> cae272328a35776c20cb7e65ca99143addd641e7
              <CountUp
                to={14.2}
                className="text-4xl font-semibold leading-none tracking-tight text-ink tabular-nums"
              />
<<<<<<< HEAD
              <span className="text-sm text-ink-tertiary">hours</span>
            </div>
            <p className="mt-1.5 text-sm text-ink-tertiary">per new hire, first month</p>
            <div className="mt-4 border-t border-seam pt-4">
              <p className="text-sm font-medium text-ink">72% reduction in ramp-up time</p>
=======
              <span className="text-[13px] font-medium text-ink-secondary">hours</span>
            </div>
            <p className="mt-2 text-[13px] text-ink-secondary">per new hire, first month</p>
            <div className="mt-5 border-t border-seam pt-4">
              <p className="text-[13px] font-medium text-ink">72% reduction in ramp-up time</p>
>>>>>>> cae272328a35776c20cb7e65ca99143addd641e7
            </div>
          </div>

<<<<<<< HEAD
          <div className={CARD}>
            <span className="text-xs font-medium uppercase tracking-wider text-ink-tertiary">
              Onboarding lift
            </span>
            <div className="mt-4 flex items-baseline gap-2">
=======
          {/* Onboarding lift */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.65, delay: 0.12, ease: EASE }}
            className={CARD}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-secondary">
                Onboarding lift
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-accent-via" />
            </div>
            <div className="mt-6 flex items-baseline gap-2">
>>>>>>> cae272328a35776c20cb7e65ca99143addd641e7
              <CountUp
                to={34}
                className="text-4xl font-semibold leading-none tracking-tight text-ink tabular-nums"
              />
<<<<<<< HEAD
              <span className="text-sm text-ink-tertiary">developers</span>
            </div>
            <p className="mt-1.5 text-sm text-ink-tertiary">onboarded last month</p>
            <div className="mt-4 flex h-16 items-end gap-1.5" aria-hidden>
              {BARS.map((h, i) => (
                <div
                  key={i}
                  className="w-full rounded-sm bg-seam-strong"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
            <div className="mt-4 border-t border-seam pt-4">
              <p className="text-sm font-medium text-ink">
                1st PR in 2.3 days <span className="font-normal text-ink-tertiary">(was 8.1)</span>
=======
              <span className="text-[13px] font-medium text-ink-secondary">developers</span>
            </div>
            <p className="mt-2 text-[13px] text-ink-secondary">onboarded last month</p>
            <MiniBars />
            <div className="mt-4 border-t border-seam pt-4">
              <p className="text-[13px] font-medium text-ink">
                1st PR in <span className="text-accent-primary">2.3 days</span>{' '}
                <span className="text-ink-secondary">(was 8.1)</span>
>>>>>>> cae272328a35776c20cb7e65ca99143addd641e7
              </p>
            </div>
          </div>

          <div className={CARD}>
            <div className="flex items-center justify-between">
<<<<<<< HEAD
              <span className="text-xs font-medium uppercase tracking-wider text-ink-tertiary">
=======
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-secondary">
>>>>>>> cae272328a35776c20cb7e65ca99143addd641e7
                Team health
              </span>
              <span className="rounded-full border border-seam bg-well px-2 py-0.5 text-xs font-medium text-ink-secondary">
                Stable
              </span>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <CountUp
                to={98}
                className="text-4xl font-semibold leading-none tracking-tight text-ink tabular-nums"
              />
<<<<<<< HEAD
              <span className="text-sm text-ink-tertiary">%</span>
            </div>
            <p className="mt-1.5 text-sm text-ink-tertiary">onboarding success rate</p>
            <div className="mt-4 border-t border-seam pt-4">
              <p className="text-sm font-medium text-ink">Confidence score up 42%</p>
=======
              <span className="text-[13px] font-medium text-ink-secondary">%</span>
            </div>
            <p className="mt-2 text-[13px] text-ink-secondary">onboarding success rate</p>
            <div className="mt-5 flex items-center gap-3 border-t border-seam pt-4">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-go/40" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-go" />
              </span>
              <p className="text-[13px] font-medium text-ink">
                Confidence score up <span className="text-go">42%</span>
              </p>
>>>>>>> cae272328a35776c20cb7e65ca99143addd641e7
            </div>
          </div>
        </div>

<<<<<<< HEAD
        <p className="mt-5 font-code text-[11px] text-ink-tertiary">
          Illustrative demo readings · the first index replaces them with your repository&apos;s numbers.
        </p>
=======
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-6 font-code text-[11px] text-ink-secondary"
        >
          Illustrative demo readings · the first index replaces them with your repository's numbers.
        </motion.p>
>>>>>>> cae272328a35776c20cb7e65ca99143addd641e7
      </div>
    </section>
  )
}
