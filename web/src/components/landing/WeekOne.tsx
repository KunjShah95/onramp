import { Section, SectionHeader } from '../marketing/primitives'

/* The story in five days: what a new engineer's first week looks like when the
 * repo has a ramp. Sticky claim on the left, a day rail on the right. */

const DAYS = [
  {
    day: 'Monday',
    title: 'Opens the map instead of the wiki.',
    body: 'Laptop set up by lunch. By the afternoon they can name every service and what it talks to, because they watched it drawn from source.',
  },
  {
    day: 'Tuesday',
    title: 'Starts a path built for their role.',
    body: 'Five modules from your actual code, each ending in a short quiz. No stale onboarding doc, no "ask Sam, he wrote that".',
  },
  {
    day: 'Wednesday',
    title: 'Asks the question they would have sat on.',
    body: 'Where does a refund get issued? Ask answers from the index and names the files. Nobody on the team gets pinged.',
  },
  {
    day: 'Thursday',
    title: 'Picks up an issue sized for them.',
    body: 'A real ticket, small enough to finish, with a walkthrough of the files it touches.',
  },
  {
    day: 'Friday',
    title: 'Their first PR lands in the review queue.',
    body: 'The lead sees it on the Ramp dashboard next to everyone else ramping, with the context a reviewer needs.',
  },
]

export default function WeekOne() {
  return (
    <Section id="week-one" band>
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionHeader
            label="Week one"
            title="Monday: new laptop. Friday: first pull request."
            lede="This is the week Onramp is built around. Not a demo script, just what the product does once a repo is connected."
          />
        </div>
        <ol className="relative border-l border-seam-strong">
          {DAYS.map((d, i) => (
            <li key={d.day} className="relative pb-10 pl-8 last:pb-0">
              <span
                className={
                  i === DAYS.length - 1
                    ? 'absolute -left-[5px] top-1.5 h-[9px] w-[9px] rounded-full bg-go ring-4 ring-go/15'
                    : 'absolute -left-[4.5px] top-1.5 h-2 w-2 rounded-full border border-seam-strong bg-base'
                }
                aria-hidden
              />
              <span className="mk-label">{d.day}</span>
              <h3 className="mt-2 text-[19px] font-semibold tracking-[-0.015em] text-ink">{d.title}</h3>
              <p className="mt-2 max-w-lg text-[15px] leading-[1.65] text-ink-secondary">{d.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  )
}
