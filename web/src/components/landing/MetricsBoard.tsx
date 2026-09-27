import SectionHeading from './SectionHeading'

/* Instrumentation, not outcomes.
 *
 * This section deliberately does NOT show outcome numbers. We do not have
 * customers with published results, so any "72% faster" style figure here
 * would be invented — and /customers states plainly that we do not publish
 * outcome numbers we have not earned. See CustomersPage.tsx.
 *
 * What is true and worth selling: Onramp computes real onboarding metrics
 * per team (see backend/app/services/hr_metrics_service.py — ramp_time,
 * avg_days_to_first_pr, cohort_retention, review_analytics, attrition_risk).
 * The pitch is the instrument, not a claimed reading. These numbers are the
 * buyer's own, available on day one.
 *
 * Removed: hardcoded "14.2 hours" / "34 developers" / "98%" / "72% reduction",
 * the animated counters, and the synthetic bar chart that implied a customer
 * base. No gradient bars, no ping dot, no count-up. */

const CARD = 'rounded-md border border-seam bg-panel p-6'

interface Metric {
  key: string
  label: string
  name: string
  definition: string
  readsFrom: string
}

const METRICS: Metric[] = [
  {
    key: 'first-pr',
    label: 'Delivery',
    name: 'Days to first PR',
    definition:
      'Days between a new engineer’s first push and their first approved pull request, averaged across the cohort.',
    readsFrom: 'pushes · pull request reviews',
  },
  {
    key: 'ramp',
    label: 'Independence',
    name: 'Ramp time',
    definition:
      'How long before a new hire owns a service end to end, measured against the tasks they actually completed.',
    readsFrom: 'task completion · service ownership',
  },
  {
    key: 'retention',
    label: 'Retention',
    name: 'Cohort retention',
    definition:
      'Whether new hires are still shipping at 30, 60, and 90 days — the number that attrition hides until it is too late.',
    readsFrom: 'cohort membership · commit activity',
  },
]

export default function MetricsBoard() {
  return (
    <section id="metrics" className="landing-section scroll-mt-20 border-t border-seam bg-base">
      <div className="mx-auto max-w-6xl px-6 py-16 lg:px-8 lg:py-20">
        <SectionHeading
          eyebrow="Instrumentation"
          heading={<>Onboarding stops being a black box.</>}
          sub="Onramp computes these per team from the GitHub activity you already generate. They are readings of your repository, not a benchmark of ours."
        />

        <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {METRICS.map((m) => (
            <div key={m.key} className={CARD}>
              <span className="text-xs font-medium uppercase tracking-wider text-ink-tertiary">
                {m.label}
              </span>
              <h3 className="mt-4 text-2xl font-semibold leading-tight tracking-tight text-ink">
                {m.name}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-ink-tertiary">{m.definition}</p>
              <div className="mt-5 border-t border-seam pt-4">
                <p className="font-code text-[11px] text-ink-tertiary">
                  reads from · {m.readsFrom}
                </p>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-5 font-code text-[11px] text-ink-tertiary">
          We publish what we measure. We do not publish outcome numbers we have not earned yet.
        </p>
      </div>
    </section>
  )
}
