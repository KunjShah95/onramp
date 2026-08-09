import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, ArrowRight, Lightning, Users, ShieldCheck, Sparkle } from '@phosphor-icons/react'
import { cn } from '../lib/utils'
import MarketingLayout from '../components/layout/MarketingLayout'
import type { NavLinkItem } from '../components/layout/MarketingNav'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 90, damping: 20 } },
}

/* — Pricing mirrors the landing page: one flat per-workspace price, USD/INR. — */
type Currency = 'USD' | 'INR'
const PRICES: Record<Currency, { sym: string; monthly: number; annual: number; roi: string }> = {
  USD: { sym: '$', monthly: 99, annual: 82, roi: '$8,000' },
  INR: { sym: '\u20B9', monthly: 2999, annual: 2499, roi: '\u20B96,00,000' },
}

const STARTER_FEATURES = ['1 repository', 'Live architecture map', 'AI mentor - 100 questions / mo', 'Auto-generated docs', 'Community support']
const TEAM_FEATURES = ['Unlimited repositories', 'Unlimited AI mentor', 'Guided onboarding paths', 'Ramp-up & time-to-PR insights', 'GitHub, Slack & Linear sync', 'Priority support']
const ENTERPRISE_FEATURES = ['SSO / SAML & SCIM provisioning', 'Self-hosted or private cloud', 'Audit logs & SOC 2 Type II', 'Dedicated success engineer', 'Custom onboarding modules', '99.9% uptime SLA']

const faqs = [
  { question: 'How long does setup take?', answer: 'Under two minutes. Install the GitHub app, pick a repository, and Onramp indexes it in the background. You get a live architecture map and docs while your coffee cools.' },
  { question: 'Is my source code stored anywhere?', answer: 'No. Onramp reads your code to build an analysis graph and metadata, then discards the raw source. Nothing is used to train shared models. Self-hosting is available on Enterprise.' },
  { question: 'How does the AI mentor stay accurate?', answer: 'Every answer is grounded in your indexed code with file and line references, and the index refreshes on each push, so answers track the codebase instead of a stale wiki.' },
  { question: 'Is there a free trial?', answer: 'Yes. The Team plan includes a 14-day free trial with full access to every feature. No credit card required to start.' },
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

  const plans = [
    {
      name: 'Free',
      blurb: 'For a solo dev getting the lay of the land.',
      price: (
        <div className="flex items-baseline gap-1">
          <span className="mt-1 self-start font-display text-[22px] text-[hsl(var(--foreground))]">{c.sym}</span>
          <span className="font-display text-[52px] leading-none tracking-tight text-[hsl(var(--foreground))]">0</span>
          <span className="ml-1 text-[13px] text-[hsl(var(--muted-foreground))]">forever</span>
        </div>
      ),
      sub: 'No card required.',
      cta: 'Start free',
      href: '/register',
      featured: false,
      features: STARTER_FEATURES,
    },
    {
      name: 'Team',
      blurb: 'Everything your team needs to onboard fast.',
      price: (
        <div className="flex items-baseline gap-1">
          <span className="mt-1 self-start font-display text-[22px] text-[hsl(var(--foreground))]">{c.sym}</span>
          <span className="relative inline-flex h-[52px] items-end overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={`${currency}-${teamPrice}`}
                initial={{ y: '60%', opacity: 0 }}
                animate={{ y: '0%', opacity: 1 }}
                exit={{ y: '-60%', opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="font-display text-[52px] leading-none tracking-tight text-[hsl(var(--foreground))] tabular-nums"
              >
                {fmt(teamPrice)}
              </motion.span>
            </AnimatePresence>
          </span>
          <span className="ml-1 text-[13px] text-[hsl(var(--muted-foreground))]">/ mo</span>
        </div>
      ),
      sub: isAnnual
        ? (<><span className="text-[hsl(var(--muted-foreground))] line-through">{c.sym}{fmt(c.monthly)}</span> billed annually · unlimited engineers</>)
        : 'per workspace · unlimited engineers',
      cta: 'Start 14-day trial',
      href: '/register',
      featured: true,
      features: TEAM_FEATURES,
    },
    {
      name: 'Enterprise',
      blurb: 'For orgs that need control, security, and scale.',
      price: <span className="font-display text-[52px] leading-none tracking-tight text-[hsl(var(--foreground))]">Custom</span>,
      sub: 'Volume & fresher-batch pricing.',
      cta: 'Contact sales',
      href: '#contact',
      featured: false,
      features: ENTERPRISE_FEATURES,
    },
  ]

  return (
    <MarketingLayout navLinks={navLinks}>
      {/* Hero */}
      <div className="relative pt-16 pb-12 px-6 text-center max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-go/25 bg-success-muted px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-go">
            <Sparkle size={12} weight="fill" /> Pricing
          </span>
          <h1 className="font-display text-4xl md:text-5xl mt-5 mb-4 font-bold tracking-tight text-[hsl(var(--foreground))]">
            One flat price. Your <span className="italic text-go">whole team.</span>
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] text-base mb-6 max-w-xl mx-auto font-body">
            No per-seat math. Every engineer can ask, explore, and onboard. You pay one price per workspace.
          </p>
          <p className="mx-auto flex max-w-xl items-center justify-center gap-2 rounded-full border border-go/20 bg-success-muted px-4 py-2 text-center text-[13.5px] text-[hsl(var(--muted-foreground))]">
            <Sparkle size={14} weight="fill" className="shrink-0 text-go" />
            <span>
              One slow onboarding costs <span className="font-semibold text-[hsl(var(--foreground))]">~{c.roi}</span>. Onramp starts at {c.sym}{fmt(c.annual)}/mo.
            </span>
          </p>

          {/* Toggles */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Segmented
              options={['Monthly', 'Annual']}
              value={isAnnual ? 'Annual' : 'Monthly'}
              onChange={(v) => setIsAnnual(v === 'Annual')}
              pillId="billpill"
            />
            <span className="inline-flex items-center gap-1 rounded-full bg-well px-2.5 py-1 text-[12px] font-semibold text-go">
              <Sparkle size={11} weight="fill" /> 2 months free
            </span>
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

      {/* Pricing cards */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-6 items-start pb-20"
      >
        {plans.map((plan) => (
          <motion.div key={plan.name} variants={itemVariants} className={cn(plan.featured && 'md:-mt-4')}>
            <div
              className={cn(
                'relative flex h-full flex-col overflow-hidden rounded-card p-8 transition-all duration-300',
                plan.featured
                  ? 'border border-go/35 bg-bg-secondary shadow-overhead hover:-translate-y-0.5'
                  : 'border border-border bg-bg-secondary/60 shadow-card hover:-translate-y-0.5 hover:bg-bg-secondary'
              )}
            >
              {plan.featured && (
                <>
                  <span className="absolute inset-x-0 top-0 h-1 bg-gradient-accent" />
                  <span className="absolute right-6 top-6 inline-flex items-center gap-1 rounded-full bg-go/10 px-2.5 py-1 text-[11px] font-semibold text-go">
                    <Sparkle size={11} weight="fill" /> Recommended
                  </span>
                </>
              )}

              <div className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">{plan.name}</div>
              <p className="mt-1.5 min-h-[38px] max-w-[220px] text-[13.5px] leading-[1.5] text-[hsl(var(--muted-foreground))]">{plan.blurb}</p>
              <div className="mt-5">{plan.price}</div>
              <p className="mt-3 h-[18px] text-[13px] text-[hsl(var(--muted-foreground))]">{plan.sub}</p>

              <Link
                to={plan.href}
                className={cn(
                  'mt-6 inline-flex w-full items-center justify-center gap-1.5 rounded-btn px-6 py-3 text-[15px] font-medium transition-all active:scale-[0.98]',
                  plan.featured
                    ? 'bg-go text-[hsl(var(--primary-foreground))] shadow-[0_2px_8px_rgba(24,27,24,0.18)] hover:bg-go-lit'
                    : 'border border-seam bg-panel-raised text-[hsl(var(--foreground))] hover:border-go/30'
                )}
              >
                {plan.cta}
                <ArrowRight size={15} weight="bold" />
              </Link>

              <ul className="mt-7 space-y-3 border-t border-border pt-6 text-sm flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[14px] leading-[1.4] text-[hsl(var(--muted-foreground))] font-body">
                    <span className={cn(
                      'mt-px flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full',
                      plan.featured ? 'bg-go text-white' : 'bg-well text-go'
                    )}>
                      <Check size={10} weight="bold" />
                    </span>
                    <span className={plan.featured ? 'text-[hsl(var(--foreground))]' : undefined}>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Everything included */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="max-w-4xl mx-auto px-6 pb-20"
      >
        <div className="text-center mb-10">
          <h2 className="font-display text-2xl mb-2 text-[hsl(var(--foreground))]">Everything included</h2>
          <p className="text-[hsl(var(--muted-foreground))] text-sm font-body">All plans come with these features out of the box.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { icon: Users, title: 'Team Collaboration', desc: 'Invite members, assign roles, manage permissions.' },
            { icon: ShieldCheck, title: 'SOC2 Compliant', desc: 'Enterprise-grade security for your code.' },
            { icon: Lightning, title: 'Fast Analysis', desc: 'Sub-minute analysis for most repositories.' },
          ].map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.5 }}
              className="rounded-card border border-border bg-bg-secondary/60 p-5 hover:border-go/25 transition-all"
            >
              <div className="w-9 h-9 rounded-tile bg-go/10 flex items-center justify-center mb-3">
                <feature.icon className="w-4 h-4 text-go" weight="fill" />
              </div>
              <h3 className="font-display font-bold text-sm text-[hsl(var(--foreground))] mb-1">{feature.title}</h3>
              <p className="text-[hsl(var(--muted-foreground))] text-xs font-body">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* FAQs */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="max-w-3xl mx-auto px-6 pb-24"
      >
        <h2 className="font-display text-2xl mb-8 text-center text-[hsl(var(--foreground))]">
          Frequently asked questions
        </h2>
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <motion.div
              key={faq.question}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06, duration: 0.4 }}
              className="rounded-card border border-border bg-bg-secondary/60 p-5 hover:border-go/20 transition-all"
            >
              <h3 className="font-semibold text-sm text-[hsl(var(--foreground))] mb-1.5 font-body">{faq.question}</h3>
              <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed font-body">{faq.answer}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </MarketingLayout>
  )
}
