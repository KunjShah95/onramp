import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { createSubscription, getSubscription, cancelSubscription, createCheckoutSession } from '../lib/api'
import { cn } from '../lib/utils'
import { PageHeader } from '../components/ui/page-header'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import PageTransition from '../components/ui/page-transition'

const TIERS = [
  {
    id: 'free',
    price: 0,
    label: 'Free',
    features: ['1 team member', '1 repository', '50 credits/month', 'Community support'],
  },
  {
    id: 'startup',
    price: 49,
    label: 'Startup',
    features: ['5 team members', '10 repositories', '5,000 credits/month', 'Email support'],
  },
  {
    id: 'professional',
    price: 299,
    label: 'Professional',
    popular: true,
    features: ['20 team members', '50 repositories', '50,000 credits/month', 'Priority support'],
  },
  {
    id: 'enterprise',
    price: 0,
    label: 'Enterprise',
    features: ['Unlimited members', 'Unlimited repos', 'Unlimited credits', 'Dedicated support', 'SSO', 'SLA'],
  },
]

export default function BillingPage() {
  const [teamId, setTeamId] = useState('')
  const [subscription, setSubscription] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedTier, setSelectedTier] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout') === 'success') {
      const tid = params.get('team_id')
      if (tid) {
        setTeamId(tid)
        window.history.replaceState({}, '', window.location.pathname)
        getSubscription(tid).then(setSubscription).catch(() => {
          setError('Subscription loaded but status may be delayed. Refresh to check.')
        })
      }
    }
  }, [])

  async function fetchSubscription() {
    if (!teamId.trim()) return
    setLoading(true); setError('')
    try {
      const data = await getSubscription(teamId.trim())
      setSubscription(data); setSelectedTier(data.tier)
    } catch { setSubscription(null) }
    setLoading(false)
  }

  async function handleCreateSubscription(tier: string) {
    if (!teamId.trim()) return
    try {
      if (tier === 'free') {
        await createSubscription({ team_id: teamId.trim(), tier, billing_cycle: 'monthly' })
        setSelectedTier(tier)
        await fetchSubscription()
      } else {
        const successUrl = `${window.location.origin}/billing?checkout=success&team_id=${teamId.trim()}`
        const cancelUrl = `${window.location.origin}/billing`
        const result = await createCheckoutSession({
          team_id: teamId.trim(),
          tier,
          success_url: successUrl,
          cancel_url: cancelUrl,
        })
        if (result.url) {
          window.location.href = result.url
        } else {
          setError('Payment system is not configured. Please try again later.')
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create subscription')
    }
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
  }
  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 },
  }

  async function handleCancel() {
    if (!teamId.trim() || !subscription) return
    try { await cancelSubscription(teamId.trim()); setSubscription(null); setSelectedTier(null) }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to cancel') }
  }

  return (
    <PageTransition>
    <div className="w-full min-h-[calc(100vh-4rem)] p-4 sm:p-6 font-body text-[#FDFBF8] max-w-full overflow-x-hidden">
      <PageHeader
        title="Billing & Plans"
        subtitle="Manage your subscription and team quota"
        pills={subscription ? [
          { label: 'plan', value: subscription.tier, color: 'text-[#FF8C00]' },
          { label: 'status', value: subscription.status, color: subscription.status === 'active' ? 'text-green-400' : 'text-[#FDFBF8]/40' },
        ] : undefined}
      />

      {error && (
        <div className="mb-5 px-4 py-3 rounded-lg bg-red-500/8 border border-red-500/20 text-red-400 text-sm">{error}</div>
      )}

      {/* Team lookup */}
      <div className="flex flex-col sm:flex-row gap-2 mb-8">
        <input
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && fetchSubscription()}
          placeholder="Enter Team ID to load subscription…"
          className="flex-1 bg-[#120D0A] border border-[#FDFBF8]/8 rounded-lg px-4 py-2.5 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/25 outline-none focus:border-[#FF8C00]/40 transition-colors"
        />
        <button onClick={fetchSubscription} disabled={loading || !teamId.trim()}
          className="bg-[#FDFBF8]/8 hover:bg-[#FDFBF8]/12 text-[#FDFBF8]/70 hover:text-[#FDFBF8] px-4 py-2.5 rounded-lg text-sm font-medium border border-[#FDFBF8]/8 transition-colors disabled:opacity-40">
          {loading ? 'Loading…' : 'Load'}
        </button>
        {subscription && (
          <button onClick={handleCancel}
            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-2.5 rounded-lg text-sm font-medium border border-red-500/20 transition-colors">
            Cancel Plan
          </button>
        )}
      </div>

      {/* Current plan banner */}
      {subscription && (
        <CardSpotlight color="rgba(255,140,0,0.15)" className="p-5 mb-8">
          <div className="text-[10px] uppercase tracking-widest mb-3"><GradientHeading as="h4" className="text-[10px] uppercase tracking-widest">Current Plan</GradientHeading></div>
          <div className="flex items-center gap-4">
            <span className="px-3 py-1 rounded-lg bg-[#FF8C00]/15 text-[#FF8C00] text-sm font-bold capitalize border border-[#FF8C00]/25">
              {subscription.tier}
            </span>
            <span className="text-sm text-[#FDFBF8]/60">${subscription.price}/mo</span>
            <span className="text-sm text-[#FDFBF8]/40 capitalize">{subscription.billing_cycle}</span>
            <span className={cn(
              'ml-auto text-xs px-2 py-0.5 rounded-full font-mono border',
              subscription.status === 'active'
                ? 'text-green-400 bg-green-500/10 border-green-500/20'
                : 'text-[#FDFBF8]/30 bg-[#FDFBF8]/5 border-[#FDFBF8]/10'
            )}>
              {subscription.status}
            </span>
          </div>
        </CardSpotlight>
      )}

      {/* Tier cards */}
      <GradientHeading as="h2" className="text-lg mb-4">Available Plans</GradientHeading>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-4 gap-4"
      >
        {TIERS.map((tier) => {
          const isCurrent = selectedTier === tier.id
          return (
            <motion.div key={tier.id} variants={itemVariants}>
              <CardSpotlight
                className={cn(
                  'relative p-5 flex flex-col',
                  isCurrent
                    ? 'border-[#FF8C00]/30 ring-1 ring-[#FF8C00]/15'
                    : tier.popular
                    ? 'border-[#FDFBF8]/12'
                    : ''
                )}>
                {tier.popular && (
                  <span className="text-[10px] uppercase tracking-widest text-[#FF8C00] font-bold mb-3">Most Popular</span>
                )}

                <h3 className="font-display text-base font-bold text-[#FDFBF8] capitalize mb-1">{tier.label}</h3>
              <div className="mb-4">
                {tier.price > 0 ? (
                  <span className="font-display text-2xl font-bold text-[#FDFBF8]">
                    ${tier.price}
                    <span className="text-sm text-[#FDFBF8]/35 font-normal">/mo</span>
                  </span>
                ) : (
                  <span className="font-display text-lg text-[#FDFBF8]/40">
                    {tier.id === 'enterprise' ? 'Custom' : 'Free'}
                  </span>
                )}
              </div>

              <ul className="space-y-2 text-xs text-[#FDFBF8]/50 flex-1 mb-5">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="text-[#FF8C00] mt-0.5 shrink-0">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleCreateSubscription(tier.id)}
                disabled={!teamId.trim() || isCurrent}
                className={cn(
                  'w-full py-2 rounded-lg text-xs font-bold transition-all',
                  isCurrent
                    ? 'bg-[#FF8C00]/10 text-[#FF8C00] border border-[#FF8C00]/20 cursor-default'
                    : tier.popular
                    ? 'bg-[#FFB347] hover:bg-[#FF8C00] text-[#3D1C00] disabled:opacity-40'
                    : 'bg-[#FDFBF8]/6 hover:bg-[#FDFBF8]/10 text-[#FDFBF8]/70 hover:text-[#FDFBF8] border border-[#FDFBF8]/8 disabled:opacity-40'
                )}>
                {isCurrent
                  ? 'Current Plan'
                  : tier.id === 'enterprise'
                  ? 'Contact Sales'
                  : `Choose ${tier.label}`}
              </button>
              </CardSpotlight>
            </motion.div>
          )
        })}
      </motion.div>
    </div>
    </PageTransition>
  )
}
