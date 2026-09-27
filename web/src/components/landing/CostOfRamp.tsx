import { useState } from 'react'
import { Section, SectionHeader } from '../marketing/primitives'
import { track } from '../../lib/track'

/* The problem, told as a receipt the visitor fills in. No invented industry
 * stats: three inputs they already know, one total they rarely add up. */

function Stepper({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string
  hint: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
}) {
  const id = label.replace(/\s+/g, '-').toLowerCase()
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div>
        <label htmlFor={id} className="text-[14.5px] text-ink">
          {label}
        </label>
        <p className="mt-0.5 text-[12.5px] text-ink-tertiary">{hint}</p>
      </div>
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            onChange(Number(e.target.value))
            track('calculator_adjusted', { control: id })
          }}
          className="h-4 w-28 cursor-pointer appearance-none rounded-full bg-seam-strong accent-[var(--go)] sm:w-36"
        />
        <output htmlFor={id} className="w-10 text-right font-code text-[15px] tabular-nums text-ink">
          {value}
        </output>
      </div>
    </div>
  )
}

export default function CostOfRamp() {
  const [hires, setHires] = useState(6)
  const [hoursPerWeek, setHoursPerWeek] = useState(4)
  const [weeks, setWeeks] = useState(8)

  const total = hires * hoursPerWeek * weeks
  const workWeeks = total / 40

  return (
    <Section id="the-cost" band>
      <div className="grid grid-cols-1 gap-14 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
        <div>
          <SectionHeader
            label="The hidden cost"
            title="Every new hire quietly borrows a senior engineer."
          />
          <div className="mt-6 max-w-lg space-y-4 text-[16px] leading-[1.65] text-ink-secondary">
            <p>
              Nobody budgets for it. Your best people spend hours each week pointing at folders, redrawing
              the same service boundaries on a whiteboard, and unblocking a local setup that worked for
              them three years ago.
            </p>
            <p>
              The wiki doesn't help, because it describes the system as it was. The new hire won't ask a
              fourth time, so they guess. That guess becomes the PR that needs three review rounds.
            </p>
            <p className="text-ink">Add it up for your own team. These are your numbers, not ours.</p>
          </div>
        </div>

        <div className="mk-card p-6 sm:p-8">
          <div className="flex items-baseline justify-between border-b border-dashed border-seam-strong pb-4">
            <span className="mk-label">Onboarding receipt</span>
            <span className="font-code text-[11px] text-ink-tertiary">this year</span>
          </div>
          <div className="divide-y divide-seam">
            <Stepper label="Engineers you'll hire" hint="Backfills count too" value={hires} min={1} max={40} onChange={setHires} />
            <Stepper
              label="Senior hours per hire, per week"
              hint="Questions, pairing, setup, reviews"
              value={hoursPerWeek}
              min={1}
              max={12}
              onChange={setHoursPerWeek}
            />
            <Stepper label="Weeks until they're independent" hint="First real PR, not first commit" value={weeks} min={2} max={24} onChange={setWeeks} />
          </div>
          <div className="mt-2 border-t border-dashed border-seam-strong pt-5">
            <div className="flex items-baseline justify-between">
              <span className="text-[14.5px] text-ink-secondary">Senior engineering time</span>
              <span className="font-display text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink">
                {total.toLocaleString()} h
              </span>
            </div>
            <p className="mt-3 text-right text-[13.5px] text-ink-tertiary">
              That's <span className="text-ink">{workWeeks.toFixed(workWeeks < 10 ? 1 : 0)} full work weeks</span>{' '}
              of your strongest people, not building.
            </p>
          </div>
          <p className="mt-6 border-t border-seam pt-4 text-[13px] leading-relaxed text-ink-tertiary">
            Once a repo is connected, the Ramp dashboard tracks this from real review cycles and stalled
            tasks, so you stop estimating.
          </p>
        </div>
      </div>
    </Section>
  )
}
