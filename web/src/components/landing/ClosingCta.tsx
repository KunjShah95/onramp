import { Link } from 'react-router-dom'
import { ArrowRight } from '@phosphor-icons/react'

/* Calm closing CTA — plain bordered panel, centered quiet type,
 * two flat buttons. Removed: spotlight card, ambient blur blob,
 * magnetic wrapper, scroll rise, glow shadows. */
export default function ClosingCta() {
  return (
    <section id="the-open-door" className="scroll-mt-20 border-t border-seam bg-base py-16 lg:py-20">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="rounded-md border border-seam bg-panel px-6 py-14 text-center sm:px-12">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-tertiary">Get started</p>
          <h2 className="mx-auto mt-3 max-w-xl text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">
            Onboarding in days, not months.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-ink-secondary">
            Install the GitHub App, pick a repository, and watch your ramp turn into a
            live workflow · fresh on every push.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/register"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-ink px-6 text-sm font-medium text-[var(--panel-raised)] transition-opacity hover:opacity-90"
            >
              Try for free
              <ArrowRight size={15} weight="bold" />
            </Link>
            <Link
              to="/#pricing"
              className="inline-flex h-10 items-center rounded-md border border-seam bg-panel px-6 text-sm font-medium text-ink transition-colors hover:bg-well"
            >
              See pricing
            </Link>
          </div>
          <p className="mt-4 font-code text-[11px] text-ink-tertiary">
            No credit card required · Read-only GitHub access · Cancel anytime
          </p>
        </div>
      </div>
    </section>
  )
}
