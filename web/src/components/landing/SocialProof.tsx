import SectionHeading from './SectionHeading'

/* Calm proof strip — honest by design: no fake logos, no fabricated
 * quotes. Plain integration row + three quiet outcome cards.
 * Removed: motion fades and rises. */

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
    <section className="scroll-mt-20 border-t border-seam bg-base">
      <div className="mx-auto max-w-6xl px-6 py-16 lg:px-8 lg:py-20">
        <SectionHeading
          eyebrow="Why teams try it"
          heading={<>What changes in the first week.</>}
          sub="Not promises — the workflow your team gets: a live map, graded tasks, and a review queue."
        />

        <div className="mt-10 flex flex-wrap items-center gap-x-10 gap-y-3 border-y border-seam py-5">
          {INTEGRATIONS.map((c) => (
            <span key={c} className="text-[15px] font-medium text-ink-tertiary">
              {c}
            </span>
          ))}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {OUTCOMES.map((t) => (
            <div key={t.metric} className="rounded-md border border-seam bg-panel p-6">
              <div className="text-[15px] font-semibold text-ink">{t.metric}</div>
              <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{t.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}