import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, ArrowRight } from '@phosphor-icons/react'
import SectionHeading from './SectionHeading'
import { MovingBorder, SpotlightCard } from '../ui/landing-motion'

const EASE = [0.16, 1, 0.3, 1] as const

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

const SIDE_CARD =
  'h-full rounded-2xl border border-black/10 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(15,23,42,0.08)]'

export default function Pricing() {
  const [annual, setAnnual] = useState(true)
  const teamPrice = annual ? 82 : 99

  return (
    <section id="pricing" className="relative scroll-mt-24 border-t border-black/5 bg-room">
      <div className="mx-auto max-w-[1280px] px-6 py-24 lg:px-10 lg:py-32">
        <SectionHeading
          eyebrow="Pricing"
          heading={<>One flat price. Your whole team.</>}
          sub="No per-seat math. Every engineer can ask, explore, and onboard — you pay one price per workspace."
        />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.55, delay: 0.1, ease: EASE }}
          className="mt-10 inline-flex items-center gap-1 rounded-full border border-black/10 bg-white p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
        >
          {(['Monthly', 'Annual'] as const).map((label) => {
            const active = annual === (label === 'Annual')
            return (
              <button
                key={label}
                type="button"
                onClick={() => setAnnual(label === 'Annual')}
                className={`relative rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${
                  active ? 'bg-accent-primary text-white' : 'text-ink-secondary hover:text-ink'
                }`}
              >
                {label}
                {label === 'Annual' && (
                  <span className={`ml-1.5 text-[11px] font-semibold ${active ? 'text-white/90' : 'text-go'}`}>
                    −17%
                  </span>
                )}
              </button>
            )
          })}
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
            <SpotlightCard glow="rgba(8,145,178,0.05)" className={SIDE_CARD}>
              <div className="flex h-full flex-col p-7">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-tertiary">
                  Free
                </span>
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="font-body text-[40px] font-bold leading-none tracking-tight text-ink">$0</span>
                  <span className="ml-1 text-[13px] text-ink-tertiary">forever</span>
                </div>
                <p className="mt-3 text-[13px] text-ink-tertiary">
                  For individuals exploring their own repo.
                </p>
                <ul className="mt-7 flex-1 space-y-2.5 border-t border-black/5 pt-5">
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
                  className="mt-7 inline-flex items-center justify-center gap-1.5 rounded-md border border-black/10 bg-white px-6 py-3 text-[14px] font-semibold text-ink transition-all hover:border-accent-primary/40 active:translate-y-px"
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
            <MovingBorder speed={9} className="shadow-[0_24px_64px_rgba(8,145,178,0.15)]">
              <div className="relative flex h-full flex-col overflow-hidden rounded-[23px] bg-white p-7">
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
                  <span className="ml-1 text-[13px] text-ink-tertiary">/mo</span>
                </div>
                <p className="mt-3 text-[13px] text-ink-tertiary">per workspace · unlimited engineers</p>
                <ul className="mt-7 flex-1 space-y-2.5 border-t border-black/5 pt-5">
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
                  className="mt-7 inline-flex items-center justify-center gap-1.5 rounded-md bg-accent-primary px-6 py-3 text-[14px] font-semibold text-white shadow-[0_8px_24px_rgba(8,145,178,0.28)] transition-all hover:bg-accent-primary-hover active:translate-y-px"
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
            <SpotlightCard glow="rgba(8,145,178,0.05)" className={SIDE_CARD}>
              <div className="flex h-full flex-col p-7">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-tertiary">
                  Enterprise
                </span>
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="font-body text-[40px] font-bold leading-none tracking-tight text-ink">
                    Custom
                  </span>
                </div>
                <p className="mt-3 text-[13px] text-ink-tertiary">
                  For orgs that need control, security, and scale.
                </p>
                <ul className="mt-7 flex-1 space-y-2.5 border-t border-black/5 pt-5">
                  {ENTERPRISE_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[13px] leading-[1.5] text-ink-secondary">
                      <Check size={13} weight="bold" className="mt-0.5 shrink-0 text-go" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/register"
                  className="mt-7 inline-flex items-center justify-center gap-1.5 rounded-md border border-black/10 bg-white px-6 py-3 text-[14px] font-semibold text-ink transition-all hover:border-go/40 active:translate-y-px"
                >
                  Contact sales
                  <ArrowRight size={14} weight="bold" />
                </Link>
              </div>
            </SpotlightCard>
          </motion.div>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-6 text-center font-code text-[11px] text-ink-tertiary"
        >
          Free plan includes the live architecture map. Team starts with a 14-day trial, no credit card.
        </motion.p>
      </div>
    </section>
  )
}
