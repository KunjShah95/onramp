import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check } from '@phosphor-icons/react'
import { Section, SectionHeader } from '../marketing/primitives'
import { PLANS, INCLUDED_EVERYWHERE, inr } from '../marketing/plans'
import { cn } from '../../lib/utils'

/* Pricing mirrors checkout exactly (see marketing/plans.ts). The pitch: every
 * plan gets the whole product; you pay for team size, not features. */

export default function Pricing() {
  const [yearly, setYearly] = useState(false)

  return (
    <Section id="pricing" band>
      <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <SectionHeader
          label="Pricing"
          title="Every feature on every plan. Pay for team size."
          lede="No feature gates, no per-seat maths. Pick the plan that fits how many people you're onboarding."
        />
        <div
          role="group"
          aria-label="Billing period"
          className="flex w-fit shrink-0 items-center gap-1 rounded-lg border border-seam bg-panel p-1"
        >
          {[
            { label: 'Monthly', value: false },
            { label: 'Yearly', value: true },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              aria-pressed={yearly === o.value}
              onClick={() => setYearly(o.value)}
              className={cn(
                'rounded-md px-3.5 py-1.5 text-[13px] transition-colors',
                yearly === o.value ? 'bg-ink text-[var(--room)]' : 'text-ink-secondary hover:text-ink',
              )}
            >
              {o.label}
              {o.value && <span className="ml-1.5 opacity-70">2 months free</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((p) => {
          const price = yearly ? p.yearly : p.monthly
          const perSeat =
            p.monthly && p.id === 'professional' ? Math.round(p.monthly / 20) : p.monthly && p.id === 'startup' ? Math.round(p.monthly / 5) : null
          return (
            <div
              key={p.id}
              className={cn(
                'mk-card relative flex flex-col p-6',
                p.featured && 'border-go/50 shadow-[0_0_0_1px_rgb(var(--go-rgb)/0.25),0_20px_60px_-30px_rgb(var(--go-rgb)/0.5)]',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-semibold text-ink">{p.name}</span>
                {p.featured && <span className="mk-label text-go">Most teams</span>}
              </div>
              <p className="mt-2 min-h-[42px] text-[13.5px] leading-snug text-ink-tertiary">{p.pitch}</p>

              <div className="mt-6 flex items-baseline gap-1.5">
                <span className="font-display text-[34px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink">
                  {price === null ? 'Custom' : inr(price)}
                </span>
                {price !== null && price > 0 && (
                  <span className="text-[13px] text-ink-tertiary">{yearly ? '/year' : '/month'}</span>
                )}
              </div>
              <p className="mt-2 h-4 font-code text-[11px] text-ink-tertiary">
                {perSeat && !yearly ? `about ${inr(perSeat)} per engineer` : p.id === 'free' ? 'free for good' : ''}
              </p>

              <div className="mt-5 border-t border-seam pt-5">
                <p className="text-[14px] font-medium text-ink">{p.members}</p>
                <ul className="mt-3 space-y-2">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13.5px] leading-snug text-ink-secondary">
                      <Check size={13} weight="bold" className="mt-0.5 shrink-0 text-go" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-auto pt-7">
                <Link
                  to={p.href}
                  className={cn(
                    'flex h-10 items-center justify-center rounded-lg text-[14px] font-medium transition-[opacity,background-color]',
                    p.featured
                      ? 'bg-ink text-[var(--room)] hover:opacity-90'
                      : 'border border-seam-strong text-ink hover:bg-well',
                  )}
                >
                  {p.cta}
                </Link>
                <p className="mt-2 h-4 text-center font-code text-[10.5px] text-ink-tertiary">{p.note ?? ''}</p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-6 rounded-lg border border-seam px-6 py-5">
        <p className="mk-label">Included on every plan, Free too</p>
        <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {INCLUDED_EVERYWHERE.map((f) => (
            <li key={f} className="flex items-center gap-2 text-[13.5px] text-ink-secondary">
              <Check size={12} weight="bold" className="shrink-0 text-ink-tertiary" />
              {f}
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-4 font-code text-[11px] text-ink-tertiary">
        Prices in INR, billed through Razorpay. Cancel any time; access runs to the end of the period.
      </p>
    </Section>
  )
}
