import { useId, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { Check, Warning } from '@phosphor-icons/react'
import ArchitectureMapStatic from './ArchitectureMapStatic'
import { Label, PrimaryCta, SecondaryCta } from '../marketing/primitives'
import { cn } from '../../lib/utils'

/* Hero: the claim on the left, the product on the right. The product window
 * is a working artifact (four real surfaces behind tabs), framed by the site's
 * single signature effect, the beam border. Everything around it stays still. */

const rise = (i: number) => ({ '--i': i }) as CSSProperties

function MapPane() {
  return <ArchitectureMapStatic className="h-full w-full" />
}

function AskPane() {
  return (
    <div className="flex h-full flex-col gap-4 p-5 sm:p-6">
      <div className="ml-auto max-w-[85%] rounded-lg rounded-br-sm bg-well px-4 py-2.5 text-[14px] text-ink">
        Where does a refund actually get issued?
      </div>
      <div className="max-w-[92%] text-[14px] leading-[1.65] text-ink-secondary">
        <p>
          Refunds start in <code className="font-code text-[12.5px] text-ink">billing/refunds.py</code> at{' '}
          <code className="font-code text-[12.5px] text-ink">issue_refund()</code>. The{' '}
          <code className="font-code text-[12.5px] text-ink">POST /refunds</code> route in{' '}
          <code className="font-code text-[12.5px] text-ink">api/billing.py</code> calls it after an ownership check.
        </p>
        <p className="mt-3">
          It writes to <code className="font-code text-[12.5px] text-ink">payments.refunds</code>, then puts{' '}
          <code className="font-code text-[12.5px] text-ink">refund.issued</code> on the queue. Notify picks that up
          and emails the customer.
        </p>
      </div>
      <div className="mt-auto flex flex-wrap gap-1.5">
        {['billing/refunds.py', 'api/billing.py', 'notify/handlers.py'].map((f) => (
          <span key={f} className="rounded-md border border-seam px-2 py-1 font-code text-[11px] text-ink-tertiary">
            {f}
          </span>
        ))}
      </div>
    </div>
  )
}

const MODULES = [
  { name: 'Request lifecycle', state: 'done', note: 'quiz 5/5' },
  { name: 'Auth and sessions', state: 'done', note: 'quiz 4/5' },
  { name: 'Billing domain', state: 'now', note: '3 of 7 files' },
  { name: 'Background jobs', state: 'next', note: '' },
  { name: 'Deploys and on-call', state: 'next', note: '' },
] as const

function PathPane() {
  return (
    <div className="flex h-full flex-col p-5 sm:p-6">
      <div className="flex items-baseline justify-between">
        <p className="text-[14px] font-medium text-ink">Path for a backend new hire</p>
        <span className="font-code text-[11px] text-ink-tertiary">built from 214 files</span>
      </div>
      <ol className="mt-5 space-y-2">
        {MODULES.map((m, i) => (
          <li
            key={m.name}
            className={cn(
              'flex items-center gap-3 rounded-lg border px-3.5 py-2.5',
              m.state === 'now' ? 'border-go/40 bg-go/[0.06]' : 'border-seam',
            )}
          >
            <span
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-code text-[10px]',
                m.state === 'done' && 'bg-go text-[var(--room)]',
                m.state === 'now' && 'border border-go text-go',
                m.state === 'next' && 'border border-seam-strong text-ink-tertiary',
              )}
            >
              {m.state === 'done' ? <Check size={11} weight="bold" /> : i + 1}
            </span>
            <span className={cn('text-[14px]', m.state === 'next' ? 'text-ink-tertiary' : 'text-ink')}>{m.name}</span>
            <span className="ml-auto font-code text-[11px] text-ink-tertiary">{m.note}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

const PEOPLE = [
  { who: 'a.rao', day: 'day 4', status: 'First PR open', tone: 'go' },
  { who: 'j.kim', day: 'day 9', status: 'Review failed twice', tone: 'warn' },
  { who: 'm.osei', day: 'day 2', status: 'Path 40% done', tone: 'idle' },
] as const

function RampPane() {
  return (
    <div className="flex h-full flex-col p-5 sm:p-6">
      <div className="grid grid-cols-3 gap-3">
        {[
          ['3', 'ramping'],
          ['6.5 h', 'senior time, this week'],
          ['1', 'needs a nudge'],
        ].map(([v, l]) => (
          <div key={l} className="rounded-lg border border-seam px-3 py-3">
            <div className="font-display text-[22px] font-semibold tabular-nums text-ink">{v}</div>
            <div className="mt-0.5 text-[12px] leading-tight text-ink-tertiary">{l}</div>
          </div>
        ))}
      </div>
      <ul className="mt-4 divide-y divide-seam rounded-lg border border-seam">
        {PEOPLE.map((p) => (
          <li key={p.who} className="flex items-center gap-3 px-3.5 py-3">
            <span className="font-code text-[12.5px] text-ink">{p.who}</span>
            <span className="font-code text-[11px] text-ink-tertiary">{p.day}</span>
            <span
              className={cn(
                'ml-auto flex items-center gap-1.5 text-[13px]',
                p.tone === 'go' && 'text-go',
                p.tone === 'warn' && 'text-caution',
                p.tone === 'idle' && 'text-ink-secondary',
              )}
            >
              {p.tone === 'warn' && <Warning size={13} weight="bold" />}
              {p.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const TABS = [
  { id: 'map', label: 'Map', caption: 'acme/platform · 14 services', Pane: MapPane },
  { id: 'ask', label: 'Ask', caption: 'answered from the indexed repo', Pane: AskPane },
  { id: 'path', label: 'Path', caption: 'generated from real modules', Pane: PathPane },
  { id: 'ramp', label: 'Ramp', caption: 'what the lead sees', Pane: RampPane },
] as const

function ProductWindow() {
  const [active, setActive] = useState(0)
  const baseId = useId()
  const tab = TABS[active]

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = (active + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length
    setActive(next)
    document.getElementById(`${baseId}-tab-${next}`)?.focus()
  }

  return (
    <div className="relative">
      <div className="mk-glow" aria-hidden />
      <div className="mk-beam">
        <div className="overflow-hidden rounded-[13px] bg-panel">
          <div className="flex items-center justify-between gap-3 border-b border-seam px-3 py-2">
            <div role="tablist" aria-label="Product surfaces" onKeyDown={onKey} className="flex gap-1">
              {TABS.map((t, i) => (
                <button
                  key={t.id}
                  id={`${baseId}-tab-${i}`}
                  role="tab"
                  type="button"
                  aria-selected={i === active}
                  aria-controls={`${baseId}-panel`}
                  tabIndex={i === active ? 0 : -1}
                  onClick={() => setActive(i)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-[13px] transition-colors',
                    i === active ? 'bg-well text-ink' : 'text-ink-tertiary hover:text-ink',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <span className="hidden font-code text-[11px] text-ink-tertiary sm:block">{tab.caption}</span>
          </div>
          <div
            id={`${baseId}-panel`}
            role="tabpanel"
            aria-labelledby={`${baseId}-tab-${active}`}
            className="h-[360px] sm:h-[400px]"
          >
            <tab.Pane />
          </div>
          <div className="flex items-center justify-between border-t border-seam px-4 py-2">
            <span className="font-code text-[11px] text-ink-tertiary">sample workspace</span>
            <span className="font-code text-[11px] text-ink-tertiary">re-indexed on every push</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-room pb-20 pt-32 sm:pt-36 lg:pb-28">
      <div className="mk-dots pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          <div>
            <Label className="mk-rise">Developer onboarding, built from your repo</Label>
            <h1
              className="mk-rise mt-5 text-[clamp(2.6rem,5.6vw,4.1rem)] font-semibold leading-[0.98] tracking-[-0.04em] text-ink"
              style={rise(1)}
            >
              New engineers ship in week one. Not month three.
            </h1>
            <p className="mk-rise mt-6 max-w-[34rem] text-[17px] leading-[1.6] text-ink-secondary" style={rise(2)}>
              Onramp reads your codebase and turns it into a ramp: a live map of how it fits together, a
              learning path built from your real modules, and first issues sized for someone new. Leads see
              who is stuck before it costs a week. Seniors get their afternoons back.
            </p>
            <div className="mk-rise mt-8 flex flex-wrap items-center gap-3" style={rise(3)}>
              <PrimaryCta to="/register" placement="hero">Start free</PrimaryCta>
              <SecondaryCta to="#product" placement="hero">See how it works</SecondaryCta>
            </div>
            <p className="mk-rise mt-5 font-code text-[11.5px] text-ink-tertiary" style={rise(4)}>
              Free for one repo · No card · Indexed in minutes
            </p>
          </div>
          <div className="mk-rise" style={rise(3)}>
            <ProductWindow />
          </div>
        </div>
      </div>
    </section>
  )
}
