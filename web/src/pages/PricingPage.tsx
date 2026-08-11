import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, ArrowRight } from '@phosphor-icons/react'
import { cn } from '../lib/utils'
import MarketingLayout from '../components/layout/MarketingLayout'
import HeatmapGem from '../components/ui/heatmap-gem'
import type { NavLinkItem } from '../components/layout/MarketingNav'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 90, damping: 20 } },
}

type Currency = 'USD' | 'INR'
const PRICES: Record<Currency, { sym: string; monthly: number; annual: number }> = {
  USD: { sym: '$', monthly: 99, annual: 82 },
  INR: { sym: '₹', monthly: 2999, annual: 2499 },
}

const TEAM_FEATURES = [
  'Unlimited repositories',
  'Unlimited AI mentor questions',
  'Guided onboarding paths',
  'Ramp-up & time-to-PR insights',
  'GitHub, Slack & Linear sync',
  'Priority support',
]

const STARTER_FEATURES = ['1 repository', '100 AI mentor questions / mo', 'Live architecture map', 'Community support']
const ENTERPRISE_FEATURES = ['SSO / SAML & SCIM', 'Self-hosted or private cloud', 'Audit logs & SOC 2 Type II', 'Dedicated success engineer', '99.9% uptime SLA']

const faqs = [
  { question: 'How long does setup take?', answer: 'Under two minutes. Install the GitHub app, pick a repository, and Onramp indexes it in the background.' },
  { question: 'Is my source code stored anywhere?', answer: 'No. Onramp reads your code to build an analysis graph and metadata, then discards the raw source. Self-hosting is available on Enterprise.' },
  { question: 'How does the AI mentor stay accurate?', answer: 'Every answer is grounded in your indexed code with file and line references. The index refreshes on each push.' },
  { question: 'Is there a free trial?', answer: 'Yes. The Team plan includes a 14-day free trial with full access. No credit card required.' },
]

const navLinks: NavLinkItem[] = [
  { label: 'Docs', href: '/docs' },
  { label: 'Changelog', href: '/changelog' },
  { label: 'Pricing', href: '/pricing', active: true },
]

function Segmented({ options, value, onChange, pillId }: {
  options: readonly string[]
  value: string
  onChange: (v: string) => void
  pillId: string
}) {
  return (
    <div className="relative flex items-center rounded-btn border border-seam bg-panel-raised p-1 shadow-card">
      {options.map((label) => {
        const active = value === label
        return (
          <button
            key={label}
            type="button"
            onClick={() => onChange(label)}
            className={cn(
              'relative z-10 rounded-[3px] px-5 py-1.5 text-[13.5px] font-medium transition-colors',
              active ? 'text-[hsl(var(--primary-foreground))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
            )}
          >
            {active && (
              <motion.span
                layoutId={pillId}
                className="absolute inset-0 -z-10 rounded-[3px] bg-accent-from shadow-lit"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            {label}
          </button>
        )
      })}
    </div>
  )
}

function PriceDisplay({ sym, value }: { sym: string; value: number | string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="mt-1 self-start font-display text-[22px] text-[hsl(var(--foreground))]">{sym}</span>
      <span className="font-display text-[52px] leading-none tracking-tight text-[hsl(var(--foreground))] tabular-nums">
        {value}
      </span>
    </div>
  )
}

function TeamPrice({ sym, value, fmt }: { sym: string; value: number; fmt: (n: number) => string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="mt-1 self-start font-display text-[22px] text-[hsl(var(--foreground))]">{sym}</span>
      <span className="relative inline-flex h-[60px] items-end overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={value}
            initial={{ y: '60%', opacity: 0 }}
            animate={{ y: '0%', opacity: 1 }}
            exit={{ y: '-60%', opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="font-display text-[64px] leading-none tracking-tight text-[hsl(var(--foreground))] tabular-nums"
          >
            {fmt(value)}
          </motion.span>
        </AnimatePresence>
      </span>
    </div>
  )
}

export default function PricingPage() {
  const [isAnnual, setIsAnnual] = useState(true)
  const [currency, setCurrency] = useState<Currency>(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone === 'Asia/Kolkata' ? 'INR' : 'USD'
    } catch {
      return 'USD'
    }
  })

  const c = PRICES[currency]
  const teamPrice = isAnnual ? c.annual : c.monthly
  const fmt = (n: number) => n.toLocaleString(currency === 'INR' ? 'en-IN' : 'en-US')

  return (
    <MarketingLayout navLinks={navLinks}>
      {/* Hero — one line, one anchor */}
      <div className="relative pt-16 pb-10 px-6 text-center max-w-3xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
          <span className="designator text-ink-secondary">FLIGHT · PRICING</span>
          <h1 className="font-display text-4xl md:text-5xl mt-3 mb-4 font-bold tracking-tight text-[hsl(var(--foreground))]">
            One flat price. Your whole team.
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] text-base mb-8 max-w-xl mx-auto font-body">
            No per-seat math. Every engineer can ask, explore, and onboard. You pay one price per workspace.
          </p>

          {/* Toggles */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Segmented
              options={['Monthly', 'Annual']}
              value={isAnnual ? 'Annual' : 'Monthly'}
              onChange={(v) => setIsAnnual(v === 'Annual')}
              pillId="billpill"
            />
            <span className="hidden h-5 w-px bg-border sm:block" />
            <Segmented
              options={['USD', 'INR']}
              value={currency}
              onChange={(v) => setCurrency(v as Currency)}
              pillId="curpill"
            />
          </div>
        </motion.div>
      </div>

      {/* 3-tier pricing — equal width, Team featured */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-5 pb-20"
      >
        {/* Free — left */}
        <motion.div variants={itemVariants} className="md:col-span-1">
          <div className="relative flex h-full flex-col rounded-card border border-seam bg-panel p-7 transition-all hover:border-go/20 hover:shadow-lg backdrop-blur-sm">
            <div className="callsign opacity-60">FREE</div>
            <p className="mt-1.5 text-[13.5px] text-[hsl(var(--muted-foreground))] font-body min-h-[38px]">
              For a solo dev getting the lay of the land.
            </p>
            <div className="mt-5"><PriceDisplay sym={c.sym} value={0} /></div>
            <p className="mt-3 text-[13px] text-[hsl(var(--muted-foreground))]">forever</p>

            <Link
              to="/register"
              className="mt-6 inline-flex w-full items-center justify-center gap-1.5 rounded-btn border border-seam bg-panel-raised px-6 py-3 text-[15px] font-medium text-[hsl(var(--foreground))] hover:border-go/30 transition-colors"
            >
              Start free
              <ArrowRight size={15} weight="bold" />
            </Link>

            <ul className="mt-7 space-y-2.5 border-t border-seam pt-5 text-sm flex-1">
              {STARTER_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[13.5px] leading-[1.4] text-[hsl(var(--muted-foreground))] font-body">
                  <span className="mt-px flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full bg-well text-go">
                    <Check size={10} weight="bold" />
                  </span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>

        {/* Team — center, featured with gem */}
        <motion.div variants={itemVariants} className="md:col-span-1">
          <div className="relative flex h-full flex-col rounded-card border border-go/30 bg-gradient-to-br from-bg-secondary via-bg-secondary to-bg-secondary/80 shadow-overhead p-8 md:p-10 transition-all hover:border-go/50 overflow-hidden">
            {/* Heatmap gem — positioned top right, part of card design */}
            <div className="absolute -top-24 -right-24 w-80 h-80 pointer-events-none opacity-50 md:opacity-60 blur-sm">
              <HeatmapGem size={320} autoRotate={true} />
            </div>

            {/* Gem glow effect */}
            <div className="absolute -top-16 -right-16 w-72 h-72 bg-go/5 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-go-lit motion-safe:animate-pulse-glow" />
                <span className="callsign text-go">TEAM · RECOMMENDED</span>
              </div>
              <span className="designator text-ink-secondary">{isAnnual ? 'ANNUAL · 17% OFF' : 'MONTHLY'}</span>
            </div>

            <h2 className="mt-3 font-display text-2xl md:text-3xl text-[hsl(var(--foreground))] font-bold tracking-tight">
              Everything your team needs to onboard fast.
            </h2>

            <div className="mt-6 flex items-end gap-6 flex-wrap">
              <TeamPrice sym={c.sym} value={teamPrice} fmt={fmt} />
              <div className="pb-2 text-[13px] text-[hsl(var(--muted-foreground))] font-body">
                {isAnnual ? (
                  <>per workspace, billed annually · <span className="line-through opacity-70">{c.sym}{fmt(c.monthly)}/mo</span></>
                ) : (
                  <>per workspace · unlimited engineers</>
                )}
              </div>
            </div>

            <Link
              to="/register"
              className="mt-7 inline-flex w-full md:w-auto md:self-start items-center justify-center gap-1.5 rounded-btn bg-go px-8 py-3 text-[15px] font-medium text-[hsl(var(--primary-foreground))] shadow-[0_2px_8px_rgba(24,27,24,0.18)] hover:bg-go-lit transition-colors active:scale-[0.98]"
            >
              Start 14-day trial
              <ArrowRight size={15} weight="bold" />
            </Link>

            <ul className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 border-t border-seam pt-7 text-sm flex-1">
              {TEAM_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[14px] leading-[1.4] text-[hsl(var(--foreground))] font-body">
                  <span className="mt-px flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full bg-go text-white">
                    <Check size={10} weight="bold" />
                  </span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>

        {/* Enterprise — right */}
        <motion.div variants={itemVariants} className="md:col-span-1">
          <div className="relative flex h-full flex-col rounded-card border border-seam bg-panel p-7 transition-all hover:border-go/20 hover:shadow-lg backdrop-blur-sm">
            <div className="callsign opacity-60">ENTERPRISE</div>
            <p className="mt-1.5 text-[13.5px] text-[hsl(var(--muted-foreground))] font-body min-h-[38px]">
              For orgs that need control, security, and scale.
            </p>
            <div className="mt-5">
              <PriceDisplay sym="" value="Custom" />
            </div>

            <Link
              to="#contact"
              className="mt-6 inline-flex w-full items-center justify-center gap-1.5 rounded-btn bg-go px-6 py-3 text-[15px] font-medium text-[hsl(var(--primary-foreground))] shadow-[0_2px_8px_rgba(24,27,24,0.18)] hover:bg-go-lit transition-colors active:scale-[0.98]"
            >
              Contact sales
              <ArrowRight size={15} weight="bold" />
            </Link>

            <ul className="mt-7 space-y-2.5 border-t border-seam pt-5 text-sm flex-1">
              {ENTERPRISE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[13.5px] leading-[1.4] text-[hsl(var(--muted-foreground))] font-body">
                  <span className="mt-px flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full bg-well text-go">
                    <Check size={10} weight="bold" />
                  </span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      </motion.div>

      {/* FAQs — native details, no animation */}
      <div className="max-w-3xl mx-auto px-6 pb-24">
        <h2 className="font-display text-2xl mb-6 text-center text-[hsl(var(--foreground))]">
          Frequently asked questions
        </h2>
        <div className="rounded-card border border-seam bg-panel overflow-hidden divide-y divide-seam">
          {faqs.map((faq) => (
            <details key={faq.question} className="group p-5 cursor-pointer">
              <summary className="flex items-center justify-between gap-4 list-none font-semibold text-sm text-[hsl(var(--foreground))] font-body">
                <span>{faq.question}</span>
                <ArrowRight size={14} weight="bold" className="text-text-muted/50 transition-transform group-open:rotate-90 shrink-0" />
              </summary>
              <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))] leading-relaxed font-body">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </MarketingLayout>
  )
}
