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

        <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className={CARD}>
            <span className="text-xs font-medium uppercase tracking-wider text-ink-tertiary">
              Time saved
            </span>
            <div className="mt-4 flex items-baseline gap-2">
              <CountUp
                to={14.2}
                className="text-4xl font-semibold leading-none tracking-tight text-ink tabular-nums"
              />
              <span className="text-sm text-ink-tertiary">hours</span>
            </div>
            <p className="mt-1.5 text-sm text-ink-tertiary">per new hire, first month</p>
            <div className="mt-4 border-t border-seam pt-4">
              <p className="text-sm font-medium text-ink">72% reduction in ramp-up time</p>
            </div>
          </div>

          <div className={CARD}>
            <span className="text-xs font-medium uppercase tracking-wider text-ink-tertiary">
              Onboarding lift
            </span>
            <div className="mt-4 flex items-baseline gap-2">
              <CountUp
                to={34}
                className="text-4xl font-semibold leading-none tracking-tight text-ink tabular-nums"
              />
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
              </p>
            </div>
          </div>

          <div className={CARD}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-tertiary">
                Team health
              </span>
              <span className="text-xs font-medium text-ink-secondary">
                Stable
              </span>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <CountUp
                to={98}
                className="text-4xl font-semibold leading-none tracking-tight text-ink tabular-nums"
              />
              <span className="text-sm text-ink-tertiary">%</span>
            </div>
            <p className="mt-1.5 text-sm text-ink-tertiary">onboarding success rate</p>
            <div className="mt-4 border-t border-seam pt-4">
              <p className="text-sm font-medium text-ink">Confidence score up 42%</p>
            </div>
          </div>
        </div>

        <p className="mt-5 font-code text-[11px] text-ink-tertiary">
          Illustrative demo readings · the first index replaces them with your repository&apos;s numbers.
        </p>
      </div>
    </section>
  )
}