import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, ArrowRight } from '@phosphor-icons/react'

const EASE = [0.16, 1, 0.3, 1] as const

const TEAM_FEATURES = [
  'Unlimited repositories',
  'Unlimited AI mentor questions',
  'Guided onboarding paths',
  'Ramp-up & time-to-PR insights',
  'GitHub, Slack & Linear sync',
  'Priority support',
]

const STARTER_FEATURES = [
  '1 repository',
  '100 AI mentor questions / mo',
  'Live architecture map',
  'Community support',
]

const ENTERPRISE_FEATURES = [
  'SSO / SAML & SCIM',
  'Self-hosted or private cloud',
  'Audit logs & SOC 2 Type II',
  'Dedicated success engineer',
  '99.9% uptime SLA',
]

export default function Pricing() {
  const [annual, setAnnual] = useState(true)
  const teamPrice = annual ? 82 : 99

  return (
    <section id="pricing" className="relative border-t border-white/5 bg-base">
      <div className="mx-auto max-w-[1280px] px-6 py-24 lg:px-10 lg:py-32">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.65, ease: EASE }}
          className="max-w-2xl"
        >
          <p className="font-code text-[11px] font-medium uppercase tracking-[0.16em] text-go">
            Pricing
          </p>
          <h2 className="mt-4 font-display text-[clamp(1.8rem,4vw,3rem)] font-bold leading-[1.06] tracking-[-0.02em] text-white">
            One flat price. Your whole team.
          </h2>
          <p className="mt-4 max-w-xl text-[15px] leading-[1.65] text-ink-tertiary">
            No per-seat math. Every engineer can ask, explore, and onboard — you pay one price per workspace.
          </p>
        </motion.div>

        {/* billing toggle */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.55, delay: 0.1, ease: EASE }}
          className="mt-10 inline-flex items-center gap-1 rounded-sm border border-white/10 bg-panel p-1"
        >
          {(['Monthly', 'Annual'] as const).map((label) => {
            const active = annual === (label === 'Annual')
            return (
              <button
                key={label}
                type="button"
                onClick={() => setAnnual(label === 'Annual')}
                className={`relative rounded-sm px-4 py-1.5 font-code text-[12px] font-medium transition-colors ${
                  active ? 'bg-accent-primary text-[#0F1419]' : 'text-ink-secondary hover:text-white'
                }`}
              >
                {label}
                {label === 'Annual' && (
                  <span className="ml-1.5 font-code text-[10px] text-go-lit">−17%</span>
                )}
              </button>
            )
          })}
        </motion.div>

        <div className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Free */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.65, delay: 0.05, ease: EASE }}
            className="flex flex-col rounded-sm border border-white/10 bg-panel p-7 transition-colors duration-300 hover:border-white/20"
          >
            <span className="font-code text-[10px] uppercase tracking-[0.14em] text-ink-tertiary">
              Free
            </span>
            <div className="mt-5 flex items-baseline gap-1">
              <span className="font-display text-[40px] font-bold leading-none tracking-tight text-white">$0</span>
              <span className="ml-1 font-code text-[12px] text-ink-tertiary">forever</span>
            </div>
            <p className="mt-3 font-code text-[12px] text-ink-tertiary">
              For a solo dev getting the lay of the land.
            </p>
            <ul className="mt-7 flex-1 space-y-2.5 border-t border-white/5 pt-5">
              {STARTER_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[13px] leading-[1.5] text-ink-secondary">
                  <Check size={13} weight="bold" className="mt-0.5 shrink-0 text-go" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              to="/register"
              className="mt-7 inline-flex items-center justify-center gap-1.5 rounded-sm border border-white/10 bg-panel-raised px-6 py-3 text-[14px] font-semibold text-white transition-all hover:border-go/40 active:translate-y-px"
            >
              Start free
              <ArrowRight size={14} weight="bold" />
            </Link>
          </motion.div>

          {/* Team — highlighted */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.65, delay: 0.12, ease: EASE }}
            className="relative flex flex-col rounded-sm border border-accent-primary/40 bg-panel-raised p-7 shadow-[0_0_0_1px_rgba(0,217,255,0.12),0_24px_64px_rgba(0,0,0,0.45)]"
          >
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-accent-primary via-accent-via to-go" />
            <div className="flex items-center justify-between">
              <span className="font-code text-[10px] uppercase tracking-[0.14em] text-accent-primary-hover">
                Team
              </span>
              <span className="rounded-sm border border-accent-primary/40 bg-accent-primary/10 px-2 py-0.5 font-code text-[10px] font-medium uppercase tracking-[0.1em] text-accent-primary-hover">
                Recommended
              </span>
            </div>
            <div className="mt-5 flex items-baseline gap-1">
              <span className="font-display text-[40px] font-bold leading-none tracking-tight text-white">
                ${teamPrice}
              </span>
              <span className="ml-1 font-code text-[12px] text-ink-tertiary">/mo</span>
            </div>
            <p className="mt-3 font-code text-[12px] text-ink-tertiary">
              per workspace · unlimited engineers
            </p>
            <ul className="mt-7 flex-1 space-y-2.5 border-t border-white/5 pt-5">
              {TEAM_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[13px] leading-[1.5] text-ink-secondary">
                  <span className="mt-0.5 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full bg-accent-primary/20">
                    <Check size={10} weight="bold" className="text-accent-primary-hover" />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            <Link
              to="/register"
              className="mt-7 inline-flex items-center justify-center gap-1.5 rounded-sm bg-accent-primary px-6 py-3 text-[14px] font-bold text-[#0F1419] shadow-[0_0_28px_rgba(0,217,255,0.4)] transition-all hover:bg-accent-primary-hover active:translate-y-px"
            >
              Start 14-day trial
              <ArrowRight size={14} weight="bold" />
            </Link>
          </motion.div>

          {/* Enterprise */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.65, delay: 0.19, ease: EASE }}
            className="flex flex-col rounded-sm border border-white/10 bg-panel p-7 transition-colors duration-300 hover:border-white/20"
          >
            <span className="font-code text-[10px] uppercase tracking-[0.14em] text-ink-tertiary">
              Enterprise
            </span>
            <div className="mt-5 flex items-baseline gap-1">
              <span className="font-display text-[40px] font-bold leading-none tracking-tight text-white">Custom</span>
            </div>
            <p className="mt-3 font-code text-[12px] text-ink-tertiary">
              For orgs that need control, security, and scale.
            </p>
            <ul className="mt-7 flex-1 space-y-2.5 border-t border-white/5 pt-5">
              {ENTERPRISE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[13px] leading-[1.5] text-ink-secondary">
                  <Check size={13} weight="bold" className="mt-0.5 shrink-0 text-go" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              to="/register"
              className="mt-7 inline-flex items-center justify-center gap-1.5 rounded-sm border border-white/10 bg-panel-raised px-6 py-3 text-[14px] font-semibold text-white transition-all hover:border-go/40 active:translate-y-px"
            >
              Contact sales
              <ArrowRight size={14} weight="bold" />
            </Link>
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
