import { Section, SectionHeader } from '../marketing/primitives'

/* Three people feel onboarding. One ruled table, before and after, so each
 * reader finds their own row. */

const ROWS = [
  {
    who: 'The new engineer',
    before: 'Reads a two-year-old wiki, guesses, and waits for someone to be free.',
    after: 'Learns the system from the system, asks without feeling like a burden, ships in week one.',
  },
  {
    who: 'The senior engineer',
    before: 'Answers "where does this live?" for the fifth time this month and loses the afternoon.',
    after: 'Reviews one queue with context attached. The map handles the tour.',
  },
  {
    who: 'The engineering lead',
    before: 'Finds out someone was stuck at the one-on-one, two weeks late.',
    after: 'Sees every ramp, gets an alert when one stalls, and can show what onboarding costs.',
  },
]

export default function Roles() {
  return (
    <Section id="who">
      <SectionHeader
        label="Who it's for"
        title="Three people get their week back."
      />
      <div className="mt-12 overflow-hidden rounded-lg border border-seam">
        <div className="hidden grid-cols-[0.8fr_1fr_1fr] border-b border-seam bg-base md:grid">
          <span className="mk-label px-6 py-3">Role</span>
          <span className="mk-label px-6 py-3">Without Onramp</span>
          <span className="mk-label px-6 py-3 text-go">With Onramp</span>
        </div>
        {ROWS.map((r) => (
          <div
            key={r.who}
            className="grid grid-cols-1 border-b border-seam last:border-b-0 md:grid-cols-[0.8fr_1fr_1fr]"
          >
            <div className="px-6 pb-2 pt-6 text-[16px] font-semibold text-ink md:py-6">{r.who}</div>
            <p className="px-6 py-2 text-[14.5px] leading-[1.6] text-ink-tertiary md:py-6">
              <span className="mk-label mb-1 block md:hidden">Without</span>
              {r.before}
            </p>
            <p className="px-6 pb-6 pt-2 text-[14.5px] leading-[1.6] text-ink md:py-6">
              <span className="mk-label mb-1 block text-go md:hidden">With Onramp</span>
              {r.after}
            </p>
          </div>
        ))}
      </div>
    </Section>
  )
}
