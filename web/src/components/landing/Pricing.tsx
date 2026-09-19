import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ArrowRight } from '@phosphor-icons/react'
import SectionHeading from './SectionHeading'

/* Calm pricing — three equal bordered cards, one quiet featured card
 * (ink border + small label, no conic glow). No motion, no spotlight,
 * no glow CTA shadows. Simple monthly/annual toggle. */

const STARTER_FEATURES = [
  '1 repository',
  '100 AI mentor questions / mo',
  'Live architecture map',
  'Community support',
]
const TEAM_FEATURES = [
  'Unlimited repositories',
  'Unlimited AI mentor questions',
  'Guided onboarding paths',
  'Ramp-up & time-to-PR insights',
  'GitHub, Slack & Linear sync',
  'Priority support',
]
const ENTERPRISE_FEATURES = [
  'SSO / SAML & SCIM',
  'Self-hosted or private cloud',
  'Audit logs & SOC 2 Type II',
  'Dedicated success engineer',
  '99.9% uptime SLA',
]

const SIDE_CARD = 'h-full rounded-md border border-seam bg-panel'

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 flex-1 space-y-2.5 border-t border-seam pt-5">
      {items.map((f) => (
        <li key={f} className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-secondary">
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-well">
            <Check size={10} weight="bold" className="text-ink-secondary" />
          </span>
          {f}
        </li>
      ))}
    </ul>
  )
}

export default function Pricing() {
  const [annual, setAnnual] = useState(true)
  const teamPrice = annual ? 82 : 99

  return (
    <section id="pricing" className="scroll-mt-20 border-t border-seam bg-room">
      <div className="mx-auto max-w-6xl px-6 py-16 lg:px-8 lg:py-20">
        <SectionHeading
          eyebrow="Pricing"
          align="center"
          heading={<>One flat price. Your whole team.</>}
          sub="No per-seat math. Every engineer can ask, explore, and onboard; you pay one price per workspace."
        />

        <div className="mt-8 flex justify-center">
          {(['Monthly', 'Annual'] as const).map((label) => {
            const active = annual === (label === 'Annual')
            return (
              <button
                key={label}
                type="button"
                onClick={() => setAnnual(label === 'Annual')}
<<<<<<< HEAD
                className={`rounded px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
 active ? 'bg-ink text-[var(--panel-raised)]' : 'text-ink-secondary hover:text-ink'
 }`}
=======
                className={`relative rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${
                  active ? 'bg-accent-primary text-accent-foreground' : 'text-ink-secondary hover:text-ink'
                }`}
>>>>>>> cae272328a35776c20cb7e65ca99143addd641e7
              >
                {label}
                {label === 'Annual' && (
                  <span className={`ml-1.5 text-xs ${active ? 'opacity-80' : 'text-ink-tertiary'}`}>
                    −17%
                  </span>
                )}
              </button>
            )
          })}
<<<<<<< HEAD
=======
        </motion.div>

        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Free */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.65, delay: 0.05, ease: EASE }}
            className="h-full"
          >
            <SpotlightCard className={SIDE_CARD}>
              <div className="flex h-full flex-col p-7">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-secondary">
                  Free
                </span>
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="font-body text-[40px] font-bold leading-none tracking-tight text-ink">$0</span>
                  <span className="ml-1 text-[13px] text-ink-secondary">forever</span>
                </div>
                <p className="mt-3 text-[13px] text-ink-secondary">
                  For individuals exploring their own repo.
                </p>
                <ul className="mt-7 flex-1 space-y-2.5 border-t border-seam pt-5">
                  {STARTER_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[13px] leading-[1.5] text-ink-secondary">
                      <span className="mt-0.5 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full bg-accent-primary/10">
                        <Check size={10} weight="bold" className="text-accent-primary" />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/register"
                  className="mt-7 inline-flex items-center justify-center gap-1.5 rounded-md border border-seam bg-panel px-6 py-3 text-[14px] font-semibold text-ink transition-all hover:border-accent-primary/40 active:translate-y-px"
                >
                  Get started
                  <ArrowRight size={14} weight="bold" />
                </Link>
              </div>
            </SpotlightCard>
          </motion.div>

          {/* Team — featured */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.65, delay: 0.12, ease: EASE }}
            className="relative"
          >
            <MovingBorder speed={9} className="shadow-overhead">
              <div className="relative flex h-full flex-col overflow-hidden rounded-[23px] bg-panel p-7">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent-primary">
                    Team
                  </span>
                  <span className="rounded-full border border-accent-primary/25 bg-accent-primary/[0.06] px-2.5 py-0.5 text-[11px] font-semibold text-accent-primary-hover">
                    Recommended
                  </span>
                </div>
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="font-body text-[40px] font-bold leading-none tracking-tight text-ink">
                    ${teamPrice}
                  </span>
                  <span className="ml-1 text-[13px] text-ink-secondary">/mo</span>
                </div>
                <p className="mt-3 text-[13px] text-ink-secondary">per workspace · unlimited engineers</p>
                <ul className="mt-7 flex-1 space-y-2.5 border-t border-seam pt-5">
                  {TEAM_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[13px] leading-[1.5] text-ink-secondary">
                      <span className="mt-0.5 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full bg-accent-primary/10">
                        <Check size={10} weight="bold" className="text-accent-primary" />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/register"
                  className="mt-7 inline-flex items-center justify-center gap-1.5 rounded-md bg-accent-primary px-6 py-3 text-[14px] font-semibold text-accent-foreground shadow-[0_0_28px_rgb(var(--accent-primary)/0.35)] transition-all hover:bg-accent-primary-hover active:translate-y-px"
                >
                  Start 14-day trial
                  <ArrowRight size={14} weight="bold" />
                </Link>
              </div>
            </MovingBorder>
          </motion.div>

          {/* Enterprise */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.65, delay: 0.19, ease: EASE }}
            className="h-full"
          >
            <SpotlightCard className={SIDE_CARD}>
              <div className="flex h-full flex-col p-7">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-secondary">
                  Enterprise
                </span>
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="font-body text-[40px] font-bold leading-none tracking-tight text-ink">
                    Custom
                  </span>
                </div>
                <p className="mt-3 text-[13px] text-ink-secondary">
                  For orgs that need control, security, and scale.
                </p>
                <ul className="mt-7 flex-1 space-y-2.5 border-t border-seam pt-5">
                  {ENTERPRISE_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[13px] leading-[1.5] text-ink-secondary">
                      <Check size={13} weight="bold" className="mt-0.5 shrink-0 text-go" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/register"
                  className="mt-7 inline-flex items-center justify-center gap-1.5 rounded-md border border-seam bg-panel px-6 py-3 text-[14px] font-semibold text-ink transition-all hover:border-go/40 active:translate-y-px"
                >
                  Contact sales
                  <ArrowRight size={14} weight="bold" />
                </Link>
              </div>
            </SpotlightCard>
          </motion.div>
>>>>>>> cae272328a35776c20cb7e65ca99143addd641e7
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className={SIDE_CARD}>
            <div className="flex h-full flex-col p-6">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-tertiary">Free</span>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-semibold leading-none tracking-tight text-ink">$0</span>
                <span className="ml-1 text-sm text-ink-tertiary">forever</span>
              </div>
              <p className="mt-2 text-sm text-ink-tertiary">For individuals exploring their own repo.</p>
              <FeatureList items={STARTER_FEATURES} />
              <Link
                to="/register"
                className="mt-6 inline-flex items-center justify-center gap-1.5 rounded-md border border-seam bg-panel px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-well"
              >
                Get started
                <ArrowRight size={14} weight="bold" />
              </Link>
            </div>
          </div>

          <div className="h-full rounded-md border-2 border-ink bg-panel">
            <div className="flex h-full flex-col p-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-ink">Team</span>
                <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-medium text-[var(--panel-raised)]">
                  Recommended
                </span>
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-semibold leading-none tracking-tight text-ink">${teamPrice}</span>
                <span className="ml-1 text-sm text-ink-tertiary">/mo</span>
              </div>
              <p className="mt-2 text-sm text-ink-tertiary">per workspace · unlimited engineers</p>
              <FeatureList items={TEAM_FEATURES} />
              <Link
                to="/register"
                className="mt-6 inline-flex items-center justify-center gap-1.5 rounded-md bg-ink px-5 py-2.5 text-sm font-medium text-[var(--panel-raised)] transition-opacity hover:opacity-90"
              >
                Start 14-day trial
                <ArrowRight size={14} weight="bold" />
              </Link>
            </div>
          </div>

          <div className={SIDE_CARD}>
            <div className="flex h-full flex-col p-6">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-tertiary">Enterprise</span>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-semibold leading-none tracking-tight text-ink">Custom</span>
              </div>
              <p className="mt-2 text-sm text-ink-tertiary">For orgs that need control, security, and scale.</p>
              <FeatureList items={ENTERPRISE_FEATURES} />
              <Link
                to="/register"
                className="mt-6 inline-flex items-center justify-center gap-1.5 rounded-md border border-seam bg-panel px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-well"
              >
                Contact sales
                <ArrowRight size={14} weight="bold" />
              </Link>
            </div>
          </div>
        </div>

        <p className="mt-5 text-center font-code text-[11px] text-ink-tertiary">
          Free plan includes the live architecture map. Team starts with a 14-day trial, no credit card.
        </p>
      </div>
    </section>
  )
}
