import { Link } from 'react-router-dom'
import { ArrowRight } from '@phosphor-icons/react'

/* Calm closing CTA — plain bordered panel, centered quiet type,
 * two flat buttons. Removed: spotlight card, ambient blur blob,
 * magnetic wrapper, scroll rise, glow shadows. */
export default function ClosingCta() {
  return (
<<<<<<< HEAD
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
=======
    <section
      id="the-open-door"
      className="relative scroll-mt-24 border-t border-seam bg-base py-24 lg:py-32"
    >
      <div className="mx-auto max-w-[1280px] px-6 lg:px-10">
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.8, ease: EASE }}
          className="relative overflow-hidden rounded-xl border border-seam px-6 py-20 text-center shadow-seam sm:px-14 lg:py-28"
        >
          <SpotlightCard className="h-full w-full rounded-xl bg-panel">
            {/* soft ambient tint */}
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div className="absolute left-1/2 top-0 h-[280px] w-[600px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-accent-primary/[0.07] blur-[100px]" />
            </div>

          <div className="relative">
            <p className="font-code text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-primary">
              Get started
            </p>
            <h2 className="mx-auto mt-4 max-w-2xl font-body text-[clamp(1.9rem,5vw,3.2rem)] font-bold leading-[1.06] tracking-[-0.02em] text-ink">
              Onboarding in days, not months.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-[16px] leading-[1.65] text-ink-secondary">
              Install the GitHub App, pick a repository, and watch your ramp turn into a
              live workflow · fresh on every push.
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Magnetic strength={0.2}>
                <Link
                  to="/register"
                  className="group inline-flex h-12 items-center gap-2 rounded-md bg-accent-primary px-8 text-[15px] font-semibold text-accent-foreground shadow-[0_0_28px_rgb(var(--accent-primary)/0.4)] transition-all hover:bg-accent-primary-hover hover:shadow-[0_0_36px_rgb(var(--accent-primary)/0.55)] active:translate-y-px"
                >
                  Try for free
                  <ArrowRight size={16} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Magnetic>
              <Link
                to="/pricing"
                className="inline-flex h-12 items-center rounded-md border border-seam bg-panel px-8 text-[15px] font-semibold text-ink transition-all hover:border-accent-primary/40 active:translate-y-px"
              >
                See pricing
              </Link>
            </div>
            <p className="mt-5 font-code text-[11px] text-ink-tertiary">
              No credit card required · Read-only GitHub access · Cancel anytime
            </p>
>>>>>>> cae272328a35776c20cb7e65ca99143addd641e7
          </div>
          <p className="mt-4 font-code text-[11px] text-ink-tertiary">
            No credit card required · Read-only GitHub access · Cancel anytime
          </p>
        </div>
      </div>
    </section>
  )
}
