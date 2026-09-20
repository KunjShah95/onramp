import { Link } from 'react-router-dom'
import { ArrowRight, Check } from '@phosphor-icons/react'
import ArchitectureMapStatic from './ArchitectureMapStatic'

/* ─────────────────────────────────────────────────────────────────────────
 * Hero — calm composed rewrite (shadcn-style).
 * Removed: word-by-word masked reveal, cursor spotlight, dot-grid floor,
 * ambient glow blob, floating telemetry cards with spring delays,
 * gradient headline, glowing CTA shadow, animated scroll cue.
 * Kept: clear headline, one supporting paragraph, two quiet actions,
 * one bordered product preview with a static status row.
 * ───────────────────────────────────────────────────────────────────────── */

export default function Hero() {
  return (
    <section className="border-b border-seam bg-room pb-16 pt-24 sm:pt-28 lg:pb-20">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2 lg:gap-16">
          {/* copy */}
          <div className="pt-2">
            <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-5xl">
              Onboarding in days, not months.
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-ink-secondary">
              Onramp turns your repo into a live ramp — learning paths, graded tasks, and
              a review queue. New devs land their first merged PR faster, seniors stop
              re-answering the same questions.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                to="/register"
                className="inline-flex h-10 items-center gap-2 rounded-md bg-ink px-5 text-sm font-medium text-[var(--panel-raised)] transition-colors hover:opacity-90"
              >
                Try for free
                <ArrowRight size={15} weight="bold" />
              </Link>
              <Link
                to="/#pricing"
                className="inline-flex h-10 items-center rounded-md border border-seam bg-panel px-5 text-sm font-medium text-ink transition-colors hover:bg-well"
              >
                See pricing
              </Link>
            </div>
            <p className="mt-4 text-[13px] text-ink-tertiary">
              No credit card required · Read-only GitHub access
            </p>
          </div>

          {/* product preview — flat bordered panel, static */}
          <div>
            <div className="overflow-hidden rounded-md border border-seam bg-panel">
              <div className="flex items-center justify-between border-b border-seam px-4 py-2.5">
                <span className="font-code text-xs text-ink-tertiary">acme/platform · architecture</span>
                <span className="flex items-center gap-1.5 font-code text-xs text-ink-tertiary">
                  <span className="h-1.5 w-1.5 rounded-full bg-go" aria-hidden />
                  14 services
                </span>
              </div>
              <div className="h-[340px] sm:h-[400px]">
                <ArchitectureMapStatic className="h-full w-full" />
              </div>
              <div className="flex items-center gap-2 border-t border-seam px-4 py-2.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-go/10">
                  <Check size={11} weight="bold" className="text-go" />
                </span>
                <p className="text-[13px] text-ink-secondary">
                  Map updated 2m ago · First PR merged #147
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
