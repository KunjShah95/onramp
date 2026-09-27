import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Check, Minus } from '@phosphor-icons/react'
import MarketingLayout from '../components/layout/MarketingLayout'
import {
  CtaBand,
  FaqList,
  PageHero,
  PrimaryCta,
  SecondaryCta,
  Section,
  SectionHeader,
  faqSchema,
  type Faq,
} from '../components/marketing/primitives'
import { cn } from '../lib/utils'

/* Why Onramp, and the comparison (#compare). The honest competitor for
 * onboarding is not another AI tool; it's the wiki plus a senior's calendar.
 * No claims about other vendors' internals or prices. */

type Cell = { text: string; good?: boolean }

const COLUMNS = ['Wiki and docs', 'Senior shadowing', 'Coding assistant', 'Onramp'] as const

const ROWS: { k: string; cells: Cell[] }[] = [
  {
    k: 'Stays current',
    cells: [
      { text: 'Drifts from the code after it is written' },
      { text: 'Current, but lives in one person’s head' },
      { text: 'Not its job' },
      { text: 'Re-indexed on every push', good: true },
    ],
  },
  {
    k: 'Shows the whole system',
    cells: [
      { text: 'If someone drew the diagram' },
      { text: 'Once, on a whiteboard' },
      { text: 'Works file by file' },
      { text: 'Live architecture map from source', good: true },
    ],
  },
  {
    k: 'Structured learning',
    cells: [
      { text: 'If someone wrote a guide' },
      { text: 'Ad hoc, depends on the week' },
      { text: 'No' },
      { text: 'Paths from your modules, with quizzes', good: true },
    ],
  },
  {
    k: 'Handles five hires at once',
    cells: [
      { text: 'Yes', good: true },
      { text: 'No, senior time runs out' },
      { text: 'Yes', good: true },
      { text: 'Yes', good: true },
    ],
  },
  {
    k: 'Lead sees who is stuck',
    cells: [
      { text: 'No' },
      { text: 'At the next one-on-one' },
      { text: 'No' },
      { text: 'Ramp dashboard with alerts', good: true },
    ],
  },
  {
    k: 'What it costs',
    cells: [
      { text: 'Writing time, then silent drift' },
      { text: 'Senior hours for every hire' },
      { text: 'Per seat' },
      { text: 'Per team, from ₹999 a month', good: true },
    ],
  },
]

const BELIEFS = [
  {
    n: '01',
    title: 'Code is the only document that is never out of date.',
    body: 'So Onramp reads source, not your wiki. The map, the paths and the answers all come from what is actually in the repository today.',
  },
  {
    n: '02',
    title: 'Understanding comes before output.',
    body: 'A new engineer who knows why a service exists writes a better first PR than one who was handed a setup script and a ticket.',
  },
  {
    n: '03',
    title: 'Confidence comes from shipping early.',
    body: 'A small merged PR on day five does more for a new hire than a month of reading. Onramp is built to get them there.',
  },
]

const FAQ: Faq[] = [
  {
    q: 'Does Onramp replace Copilot or Cursor?',
    a: 'No. They help people write code. Onramp helps people understand a codebase they did not write, and helps leads see how that is going. They are separate products and most teams use both.',
  },
  {
    q: 'Why not just keep the wiki up to date?',
    a: 'Because nobody does, and the wiki has no way of knowing it is wrong. Onramp builds from the code on every push, so there is nothing to keep up to date.',
  },
  {
    q: 'How is it priced?',
    a: 'Per team, not per seat. Free covers one member and one repository. Startup is ₹999 a month for up to 5 members, Professional is ₹2,999 a month for up to 20. Every plan includes every feature.',
  },
  {
    q: 'Can we self-host?',
    a: 'Not as a supported product yet. Docker deployment artifacts exist for controlled environments, and supported self-hosting is on the Enterprise roadmap. Talk to us about your constraints.',
  },
  {
    q: 'Which languages are supported?',
    a: 'Python, JavaScript, TypeScript, Go, Rust and Java get full parsing. Other languages are indexed as text with basic symbol extraction.',
  },
]

function CompareCell({ cell, highlight }: { cell: Cell; highlight: boolean }) {
  return (
    <span className={cn('flex items-start gap-2', highlight ? 'text-ink' : 'text-ink-tertiary')}>
      {cell.good ? (
        <Check size={13} weight="bold" className={cn('mt-[3px] shrink-0', highlight ? 'text-go' : 'text-ink-tertiary')} />
      ) : (
        <Minus size={13} weight="bold" className="mt-[3px] shrink-0 text-ink-muted" />
      )}
      {cell.text}
    </span>
  )
}

export default function WhyOnrampPage() {
  const { hash } = useLocation()

  // /compare redirects here with #compare; scroll once the page mounts.
  useEffect(() => {
    if (!hash) return
    const el = document.getElementById(hash.slice(1))
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [hash])

  return (
    <MarketingLayout
      seo={{
        title: 'Why Onramp · Onboarding that doesn’t run on a senior’s calendar',
        description:
          'How Onramp compares with wikis, senior shadowing and coding assistants for onboarding engineers, and why teams use it alongside Copilot and Cursor.',
        path: '/why-onramp',
        schema: faqSchema(FAQ),
      }}
    >
      <div className="mx-auto max-w-6xl px-6 pb-20 pt-16 lg:px-8 lg:pb-24 lg:pt-20">
        <PageHero
          label="Why Onramp"
          title="Your real onboarding tool is a wiki and a senior’s calendar."
          lede="Every team already has an onboarding process. It is a doc that stopped being true last year, and the one engineer who still remembers why the queue exists. Onramp replaces both with something that reads the code."
          actions={
            <>
              <PrimaryCta to="/register">Start free</PrimaryCta>
              <SecondaryCta to="#compare">See the comparison</SecondaryCta>
            </>
          }
        />
      </div>

      <Section id="compare" band>
        <SectionHeader
          label="The comparison"
          title="Four ways to onboard an engineer."
          lede="Onramp against what teams actually use today. Coding assistants are in here because people ask, not because they compete for the same job."
        />
        {/* Phones: one card per criterion, Onramp first. */}
        <div className="mt-10 space-y-3 md:hidden">
          {ROWS.map((r) => (
            <div key={r.k} className="mk-card p-5">
              <p className="text-[15px] font-semibold text-ink">{r.k}</p>
              <dl className="mt-3 space-y-2.5 text-[14px] leading-[1.5]">
                {[3, 0, 1, 2].map((i) => (
                  <div key={i}>
                    <dt className={cn('mk-label', i === 3 && 'text-go')}>{COLUMNS[i]}</dt>
                    <dd className="mt-1">
                      <CompareCell cell={r.cells[i]} highlight={i === 3} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
        <div className="mt-12 hidden overflow-x-auto rounded-xl border border-seam bg-room md:block">
          <table className="w-full min-w-[760px] border-collapse text-left text-[14px] leading-[1.5]">
            <thead>
              <tr className="border-b border-seam">
                <th className="mk-label w-[18%] px-5 py-4 font-medium" scope="col">
                  <span className="sr-only">Criterion</span>
                </th>
                {COLUMNS.map((c) => (
                  <th
                    key={c}
                    scope="col"
                    className={cn(
                      'mk-label px-5 py-4 font-medium',
                      c === 'Onramp' && 'bg-go/[0.06] text-go',
                    )}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.k} className="border-b border-seam last:border-b-0">
                  <th scope="row" className="px-5 py-4 align-top text-[14px] font-medium text-ink">
                    {r.k}
                  </th>
                  {r.cells.map((cell, i) => (
                    <td key={i} className={cn('px-5 py-4 align-top', i === 3 && 'bg-go/[0.06]')}>
                      <CompareCell cell={cell} highlight={i === 3} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-20">
          <SectionHeader
            label="Coding assistants"
            title="They write code. Onramp explains it."
          />
          <div className="space-y-4 text-[16px] leading-[1.65] text-ink-secondary">
            <p>
              Copilot and Cursor are very good at producing the next function. They are not built to take
              someone who joined on Monday and give them a working model of your system by Friday, or to tell
              their lead that they have been stuck since Tuesday.
            </p>
            <p>
              That is the job Onramp does. Keep your assistant. Give the person using it a map, a path and a
              first issue, so the code it helps them write lands in the right place.
            </p>
          </div>
        </div>
      </Section>

      <Section band>
        <SectionHeader label="What we believe" title="Three ideas the product is built on." />
        <ol className="mt-12 grid grid-cols-1 border-t border-seam md:grid-cols-3">
          {BELIEFS.map((b, i) => (
            <li
              key={b.n}
              className={cn('border-b border-seam py-8 md:border-b-0 md:py-10', i > 0 && 'md:border-l md:pl-8', i < 2 && 'md:pr-8')}
            >
              <span className="mk-label">{b.n}</span>
              <h3 className="mt-3 text-[19px] font-semibold leading-snug tracking-[-0.015em] text-ink">{b.title}</h3>
              <p className="mt-3 text-[15px] leading-[1.65] text-ink-secondary">{b.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="faq">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <SectionHeader label="Questions" title="Before you switch anything." />
          <FaqList items={FAQ} />
        </div>
      </Section>

      <CtaBand title="Stop spending senior time on the tour." />
    </MarketingLayout>
  )
}
