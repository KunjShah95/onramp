import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, ArrowRight, Star, Lightning, Users, ShieldCheck } from '@phosphor-icons/react'
import { cn } from '../lib/utils'
import CardSpotlight from '../components/ui/card-spotlight'
import MarketingLayout from '../components/layout/MarketingLayout'
import type { NavLinkItem } from '../components/layout/MarketingNav'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 80, damping: 20 } },
}

const plans = [
  {
    name: 'Free',
    desc: 'For individuals and small teams exploring Nexora.',
    price: { monthly: 0, annual: 0 },
    cta: 'Get Started',
    href: '/register',
    popular: false,
    features: [
      { text: '1 team member', included: true },
      { text: '1 repository', included: true },
      { text: '50 credits/month', included: true },
      { text: 'Community support', included: true },
      { text: 'AI codebase Q&A', included: false },
      { text: 'Auto PR descriptions', included: false },
      { text: 'Priority analysis', included: false },
    ],
  },
  {
    name: 'Startup',
    desc: 'For scaling engineering teams.',
    price: { monthly: 49, annual: 39 },
    cta: 'Start 14-day trial',
    href: '/register',
    popular: true,
    features: [
      { text: '5 team members', included: true },
      { text: '10 repositories', included: true },
      { text: '5,000 credits/month', included: true },
      { text: 'Email support', included: true },
      { text: 'AI codebase Q&A', included: true },
      { text: 'Auto PR descriptions', included: true },
      { text: 'Priority analysis', included: true },
    ],
  },
  {
    name: 'Enterprise',
    desc: 'For enterprise environments requiring SOC2 compliance and SSO.',
    price: { monthly: null, annual: null },
    priceLabel: 'Custom',
    cta: 'Contact Sales',
    href: '#contact',
    popular: false,
    features: [
      { text: 'Unlimited members', included: true },
      { text: 'Unlimited repos', included: true },
      { text: 'Unlimited credits', included: true },
      { text: 'Dedicated support', included: true },
      { text: 'SSO / SAML', included: true },
      { text: 'SLA guarantee', included: true },
      { text: 'Custom integrations', included: true },
    ],
  },
]

const faqs = [
  { question: 'How do credits work?', answer: 'Credits are consumed when you generate learning paths, query your codebase, or perform deep architectural analysis. 1 credit roughly equals 1 query.' },
  { question: 'Can I switch plans later?', answer: 'Yes, you can upgrade or downgrade your plan at any time. Prorated charges will be applied automatically.' },
  { question: 'Do you offer a discount for open-source projects?', answer: 'We love open-source! Contact us for a special open-source license that grants you Enterprise features for free.' },
  { question: 'Is there a free trial?', answer: 'Yes! The Startup plan includes a 14-day free trial with full access to all features. No credit card required.' },
]

const navLinks: NavLinkItem[] = [
  { label: 'Docs', href: '/docs' },
  { label: 'Pricing', href: '/pricing', active: true },
  { label: 'Changelog', href: '/changelog' },
]

export default function PricingPage() {
  const [isAnnual, setIsAnnual] = useState(false)

  return (
    <MarketingLayout navLinks={navLinks}>
      {/* Hero Section */}
      <div className="relative pt-20 pb-14 px-6 text-center max-w-3xl mx-auto">
        <svg className="absolute top-10 right-0 w-64 h-64 opacity-[0.04] pointer-events-none" viewBox="0 0 200 200" fill="none">
          <circle cx="100" cy="100" r="80" stroke="currentColor" strokeWidth="0.5" />
          <circle cx="100" cy="100" r="60" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 6" />
          <circle cx="100" cy="100" r="40" stroke="currentColor" strokeWidth="0.5" />
          <path d="M100 20 A80 80 0 0 1 180 100" stroke="currentColor" strokeWidth="1.5" className="text-[hsl(var(--accent))]" />
        </svg>
        <svg className="absolute bottom-0 left-0 w-48 h-48 opacity-[0.03] pointer-events-none" viewBox="0 0 200 200" fill="none">
          <circle cx="100" cy="100" r="90" stroke="currentColor" strokeWidth="0.3" />
          <circle cx="100" cy="100" r="70" stroke="currentColor" strokeWidth="0.3" />
          <circle cx="100" cy="100" r="50" stroke="currentColor" strokeWidth="0.3" strokeDasharray="3 5" />
        </svg>
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <div className="flex items-center justify-center gap-2 text-[hsl(var(--accent))] mb-4">
            <Lightning className="w-4 h-4" weight="fill" />
            <span className="font-mono text-[11px] uppercase tracking-widest font-bold text-[hsl(var(--foreground))]">Pricing</span>
          </div>
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="font-display text-4xl md:text-5xl mb-4 font-bold tracking-tight text-[hsl(var(--foreground))]"
        >
          Simple, transparent pricing
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-[hsl(var(--muted-foreground))] text-base mb-8 max-w-xl mx-auto font-body"
        >
          Deploy for free, scale when your infrastructure demands it. All plans include core features.
        </motion.p>

        {/* Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="inline-flex items-center gap-3 p-1 rounded-xl bg-[hsl(var(--secondary))] border border-[hsl(var(--border))]"
        >
          <button
            onClick={() => setIsAnnual(false)}
            className={cn(
              "px-5 py-2 rounded-lg text-sm font-medium transition-all font-body",
              !isAnnual ? "bg-bg-secondary text-[hsl(var(--foreground))] shadow-sm" : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            )}
          >
            Monthly
          </button>
          <button
            onClick={() => setIsAnnual(true)}
            className={cn(
              "px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 font-body",
              isAnnual ? "bg-bg-secondary text-[hsl(var(--foreground))] shadow-sm" : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            )}
          >
            Annually
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, delay: 0.4 }}
              className="text-[10px] uppercase tracking-wider text-[hsl(var(--accent))] font-bold bg-[hsl(var(--accent))]/10 px-2 py-0.5 rounded-full"
            >
              Save 20%
            </motion.span>
          </button>
        </motion.div>
      </div>

      {/* Pricing Cards */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-6 pb-20"
      >
        {plans.map((plan) => (
          <motion.div key={plan.name} variants={itemVariants} className="relative">
            <CardSpotlight
              className={cn(
                "p-8 flex flex-col h-full border",
                plan.popular
                  ? "border-[hsl(var(--accent))]/30 bg-bg-secondary shadow-[0_0_30px_rgba(99,102,241,0.08)]"
                  : "border-[hsl(var(--border))] bg-bg-secondary"
              )}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] text-[10px] font-bold uppercase tracking-widest px-4 py-1 rounded-full flex items-center gap-1">
                  <Star className="w-3 h-3" weight="fill" />
                  Most Popular
                </div>
              )}

              <h2 className="font-display text-xl font-bold text-[hsl(var(--foreground))] mb-1.5">{plan.name}</h2>
              <p className="text-[hsl(var(--muted-foreground))] text-sm mb-6 font-body">{plan.desc}</p>

              <div className="mb-6">
                {plan.price.monthly !== null ? (
                  <>
                    <span className="text-4xl font-bold font-display text-[hsl(var(--foreground))]">
                      ${isAnnual ? plan.price.annual : plan.price.monthly}
                    </span>
                    <span className="text-[hsl(var(--muted-foreground))] text-sm font-body">/mo</span>
                  </>
                ) : (
                  <span className="text-4xl font-bold font-display text-[hsl(var(--foreground))]">{plan.priceLabel}</span>
                )}
              </div>

              <Link
                to={plan.href}
                className={cn(
                  "w-full py-2.5 rounded-xl text-center text-sm font-semibold mb-8 flex items-center justify-center gap-2 transition-all font-body",
                  plan.popular
                    ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
                    : "border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]"
                )}
              >
                {plan.cta}
                {plan.popular && <ArrowRight className="w-4 h-4" weight="bold" />}
              </Link>

              <ul className="space-y-3.5 text-sm flex-1">
                {plan.features.map((feat) => (
                  <li key={feat.text} className="flex items-center gap-3 font-body">
                    {feat.included ? (
                      <Check className="w-4 h-4 text-[hsl(var(--accent))] shrink-0" weight="bold" />
                    ) : (
                      <Check className="w-4 h-4 text-[hsl(var(--muted-foreground))]/20 shrink-0" weight="bold" />
                    )}
                    <span className={feat.included ? "text-[hsl(var(--foreground))]" : "text-[hsl(var(--muted-foreground))]"}>
                      {feat.text}
                    </span>
                  </li>
                ))}
              </ul>
            </CardSpotlight>
          </motion.div>
        ))}
      </motion.div>

      {/* Feature comparison */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
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
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className="bg-bg-secondary border border-[hsl(var(--border))] rounded-xl p-5 hover:border-[hsl(var(--accent))]/20 hover:shadow-[0_0_20px_rgba(99,102,241,0.04)] transition-all"
            >
              <div className="w-9 h-9 rounded-lg bg-[hsl(var(--accent))]/10 flex items-center justify-center mb-3">
                <feature.icon className="w-4 h-4 text-[hsl(var(--accent))]" weight="fill" />
              </div>
              <h3 className="font-display font-bold text-sm text-[hsl(var(--foreground))] mb-1">{feature.title}</h3>
              <p className="text-[hsl(var(--muted-foreground))] text-xs font-body">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* FAQs */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
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
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
              className="bg-bg-secondary border border-[hsl(var(--border))] rounded-xl p-5 hover:border-[hsl(var(--accent))]/15 transition-all"
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
