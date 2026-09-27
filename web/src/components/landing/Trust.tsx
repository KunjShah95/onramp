import { Link } from 'react-router-dom'
import { ArrowRight } from '@phosphor-icons/react'
import { Section, SectionHeader } from '../marketing/primitives'

/* Security, stated plainly, including what isn't done yet. Engineers buy
 * from vendors who don't overclaim. */

const FACTS = [
  { k: 'Clones are temporary', v: 'Repos are cloned to index, then the clone is deleted.' },
  { k: 'Your data stays yours', v: 'Derived documents and embeddings are scoped to your workspace. We do not train models on customer code.' },
  { k: 'Secrets are encrypted', v: 'Repository tokens and personal data are encrypted at rest. API keys are stored as HMAC hashes.' },
  { k: 'Straight about compliance', v: 'SOC 2 Type II is in progress, not certified. A DPA is available today.' },
]

export default function Trust() {
  return (
    <Section id="security">
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div>
          <SectionHeader label="Security" title="Your code is the product. We treat it that way." />
          <Link
            to="/security"
            className="mt-6 inline-flex items-center gap-1.5 text-[14px] text-ink underline decoration-seam-strong underline-offset-4 transition-colors hover:decoration-ink"
          >
            Read the security overview
            <ArrowRight size={13} weight="bold" />
          </Link>
        </div>
        <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-seam bg-seam sm:grid-cols-2">
          {FACTS.map((f) => (
            <div key={f.k} className="bg-room p-6">
              <dt className="text-[15px] font-semibold text-ink">{f.k}</dt>
              <dd className="mt-2 text-[14px] leading-[1.6] text-ink-secondary">{f.v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  )
}
