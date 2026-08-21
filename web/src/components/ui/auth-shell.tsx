import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import { TreeStructure, Check, Clock, ShieldCheck } from '@phosphor-icons/react'

interface AuthShellProps {
  /** Console rail call-sign (e.g. "Access"). */
  rail: string
  /** Mono designator (e.g. "STEP 1 OF 2"). */
  designator: string
  /** Status LED colour. */
  status?: 'go' | 'standby' | 'caution' | 'abort' | 'idle'
  title: string
  subtitle?: ReactNode
  children: ReactNode
  /** Content rendered below the panel (links, cross-links). */
  footer?: ReactNode
}

/**
 * AuthShell — Premium split auth frame.
 *
 * Senior-design-engineer polish: editorial split (left = brand story on
 * landing-light surface, right = seated form). Left rail carries the same
 * indigo→cyan→violet mark + aurora mesh + dot-grid as the landing Hero —
 * so auth feels like landing, not a detached sub-product. Right rail is a
 * quiet, seated ConsolePanel derivative with hairline borders and 5px radius.
 *
 * Keeps the public prop contract (rail/designator/status/title/subtitle)
 * so every consumer (Login, Register, Forgot, Reset, Verify, Callback, Join)
 * stays wired without changes.
 */
export default function AuthShell({
  rail, designator, status = 'standby', title, subtitle, children, footer,
}: AuthShellProps) {
  const shouldReduce = useReducedMotion()
  const dot =
    status === 'go' ? 'bg-go' :
    status === 'abort' ? 'bg-abort' :
    status === 'caution' ? 'bg-caution' :
    status === 'idle' ? 'bg-ink-disabled' : 'bg-mission'

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-room text-ink antialiased font-body">
      {/* ── Left · brand editorial (hidden on mobile) ───────────────── */}
      <div className="relative hidden lg:flex lg:w-[46%] xl:w-[44%] shrink-0 flex-col justify-between overflow-hidden border-r border-black/5 bg-[#F8FAFC]">
        {/* aurora + dot grid — same language as Hero; hidden/reduced when prefers-reduced-motion */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className={`absolute -top-32 -left-20 h-[520px] w-[600px] rounded-full bg-accent-primary/[0.06] blur-[110px] ${shouldReduce ? 'opacity-0' : ''}`} />
          <div className={`absolute right-0 top-[28%] h-[380px] w-[420px] rounded-full bg-accent-via/[0.05] blur-[100px] ${shouldReduce ? 'opacity-0' : ''}`} />
          <div
            className={`absolute inset-0 ${shouldReduce ? 'opacity-[0.18]' : 'opacity-[0.45]'}`}
            style={{
              backgroundImage: 'radial-gradient(rgba(15,23,42,0.08) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
              maskImage: 'radial-gradient(ellipse 90% 70% at 30% 0%, black 30%, transparent 70%)',
              WebkitMaskImage: 'radial-gradient(ellipse 90% 70% at 30% 0%, black 30%, transparent 70%)',
            }}
          />
        </div>

        <div className="relative z-10 flex flex-col gap-10 p-10 xl:p-12">
          <Link to="/" className="group inline-flex items-center gap-2.5 self-start" aria-label="Onramp home">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent-primary via-accent-via to-accent-to text-white shadow-[0_6px_20px_rgba(79,70,229,0.28)] transition-transform duration-200 group-hover:scale-[1.03]">
              <TreeStructure size={17} weight="bold" />
            </span>
            <span className="font-body text-sm font-bold tracking-tight text-ink">ONRAMP</span>
            <span className="font-code text-[10px] tracking-[0.14em] text-ink-tertiary">2.0</span>
          </Link>

          <div className="mt-6 max-w-[420px]">
            <p className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
              <span className="font-code text-[10px] font-medium uppercase tracking-[0.14em] text-ink-secondary">{rail} · {designator}</span>
            </p>
            <h2 className="mt-6 font-body text-[28px] font-bold leading-[1.08] tracking-[-0.02em] text-ink">
              Where code<br />
              <span className="text-gradient">becomes a map.</span>
            </h2>
            <p className="mt-3 text-[15px] leading-[1.65] text-ink-secondary">
              Index your repo once. Answer every new-hire question from source — with file + line citations, not stale docs.
            </p>
          </div>

          {/* mini feature strip — editorial, not SaaS checklist */}
          <div className="mt-2 grid grid-cols-1 gap-3 max-w-[380px]">
            {[
              { icon: Check, label: 'Live architecture graph', meta: 'services · deps · ownership' },
              { icon: Clock, label: 'First PR in days', meta: 'ranked guides + review queue' },
              { icon: ShieldCheck, label: 'Read-only by default', meta: 'no code writes without your PR' },
            ].map((r) => (
              <div key={r.label} className="flex items-center gap-3 rounded-xl border border-black/5 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 bg-white text-ink-tertiary">
                  <r.icon size={15} weight="bold" />
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-ink leading-none">{r.label}</div>
                  <div className="font-code text-[11px] text-ink-tertiary">{r.meta}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 p-10 xl:p-12">
          <div className="rounded-xl border border-black/5 bg-white px-5 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <p className="text-[13px] leading-[1.6] text-ink-secondary">
              “Onramp cut our ramp time from 4 weeks to 5 days. New engineers ship to production in their first week.”
            </p>
            <p className="mt-2 font-code text-[11px] text-ink-tertiary">VP Engineering · Linear-style team · 14 services mapped</p>
          </div>
          <p className="mt-4 font-code text-[11px] text-ink-tertiary">Indexed from source · not from docs · free-first routing</p>
        </div>
      </div>

      {/* ── Right · form rail ───────────────────────────────────────── */}
      <div className="flex flex-1 flex-col bg-white lg:bg-room">
        {/* mobile brand bar */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-black/5 bg-white px-6 lg:hidden">
          <Link to="/" className="inline-flex items-center gap-2.5" aria-label="Onramp home">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent-primary to-accent-via text-white">
              <TreeStructure size={16} weight="bold" />
            </span>
            <span className="font-body text-sm font-bold tracking-tight text-ink">ONRAMP</span>
          </Link>
          <span className="inline-flex items-center gap-1.5 font-code text-[10px] uppercase tracking-[0.14em] text-ink-tertiary">
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
            {designator}
          </span>
        </header>

        <main className="flex flex-1 items-center justify-center p-6 sm:p-8 lg:p-10">
          <div className="w-full max-w-[420px]">
            {/* seated panel — 5px radius, hairline, no heavy shadow */}
            <div className="rounded-[5px] border border-black/10 bg-white p-7 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_40px_rgba(15,23,42,0.04)] sm:p-8">
              <div className="mb-7">
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                  <span className="font-code text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-tertiary">{rail} · {designator}</span>
                </div>
                <h1 className="mt-3 font-body text-[22px] font-bold tracking-[-0.015em] text-ink">{title}</h1>
                {subtitle && <div className="mt-2 text-[13.5px] leading-[1.6] text-ink-secondary">{subtitle}</div>}
              </div>
              {children}
            </div>
            {footer && (
              <div className="mt-6 text-center font-code text-[13px] text-ink-tertiary">
                {footer}
              </div>
            )}
            <p className="mt-4 text-center font-code text-[11px] text-ink-tertiary/70">
              Protected by Onramp · <Link to="/privacy" className="underline decoration-black/15 underline-offset-4 hover:text-ink">Privacy</Link> · <Link to="/terms" className="underline decoration-black/15 underline-offset-4 hover:text-ink">Terms</Link>
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}
