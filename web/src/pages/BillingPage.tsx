import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { createSubscription, getSubscription, cancelSubscription, createCheckoutSession, listTeams } from '../lib/api'
import { cn } from '../lib/utils'
import { PageHeader } from '../components/ui/page-header'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import PageTransition from '../components/ui/page-transition'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { Check, CreditCard } from '@phosphor-icons/react'

const TIERS = [
  { id: 'free', price: 0, label: 'Free', features: ['1 team member', '1 repository', '50 credits/month', 'Community support'] },
  { id: 'startup', price: 49, label: 'Startup', features: ['5 team members', '10 repositories', '5,000 credits/month', 'Email support'] },
  { id: 'professional', price: 299, label: 'Professional', popular: true, features: ['20 team members', '50 repositories', '50,000 credits/month', 'Priority support'] },
  { id: 'enterprise', price: 0, label: 'Enterprise', features: ['Unlimited members', 'Unlimited repos', 'Unlimited credits', 'Dedicated support', 'SSO', 'SLA'] },
]

export default function BillingPage() {
  const toast = useToast()
  const { activeTeamId, role, switchTeam } = useAuth()
  const [teams, setTeams] = useState<any[]>([])
  const [teamId, setTeamId] = useState(activeTeamId || '')
  const [subscription, setSubscription] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedTier, setSelectedTier] = useState<string | null>(null)

  useEffect(() => {
    async function loadTeams() {
      try { const data = await listTeams('current-user'); setTeams(data.teams || []) } catch (err: any) { setError(err.message || 'Failed to load teams') }
    }
    loadTeams()
  }, [])

  useEffect(() => { if (activeTeamId) setTeamId(activeTeamId) }, [activeTeamId])
  useEffect(() => { if (teamId) fetchSubscription(teamId); else { setSubscription(null); setSelectedTier(null) } }, [teamId])
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout') === 'success') { const tid = params.get('team_id'); if (tid) { setTeamId(tid); window.history.replaceState({}, '', window.location.pathname) } }
  }, [])

  async function fetchSubscription(id: string = teamId) {
    if (!id.trim()) return
    setLoading(true); setError('')
    try { const data = await getSubscription(id.trim()); setSubscription(data); setSelectedTier(data.tier) }
    catch { setSubscription(null); setSelectedTier(null) }
    setLoading(false)
  }

  async function handleCreateSubscription(tier: string) {
    if (!teamId.trim()) return
    try {
      if (tier === 'free') {
        await createSubscription({ team_id: teamId.trim(), tier, billing_cycle: 'monthly' })
        setSelectedTier(tier); await fetchSubscription(); toast.success('Subscribed', `${tier} plan activated`)
      } else {
        const successUrl = `${window.location.origin}/billing?checkout=success&team_id=${teamId.trim()}`
        const cancelUrl = `${window.location.origin}/billing`
        const result = await createCheckoutSession({ team_id: teamId.trim(), tier, success_url: successUrl, cancel_url: cancelUrl })
        if (result.url) { window.location.href = result.url } else { setError('Payment system is not configured.') }
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create subscription') }
  }

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.05 } } }
  const itemVariants = { hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }

  async function handleCancel() {
    if (!teamId.trim() || !subscription) return
    if (!confirm('Cancel your current subscription?')) return
    try { await cancelSubscription(teamId.trim()); setSubscription(null); setSelectedTier(null); toast.info('Plan cancelled') }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to cancel'); toast.error('Failed to cancel plan') }
  }

  return (
    <PageTransition>
      <div className="w-full min-h-[calc(100vh-4rem)] p-4 sm:p-6 font-body text-text-primary">
        <PageHeader
          title="Billing & Plans"
          subtitle="Manage your subscription and team quota"
          pills={subscription ? [
            { label: 'plan', value: subscription.tier, color: 'text-accent-primary' },
            { label: 'status', value: subscription.status, color: subscription.status === 'active' ? 'text-green-400' : 'text-text-tertiary' },
          ] : undefined}
        />

        {error && (<div className="mb-5 px-4 py-3 rounded-xl bg-red-500/8 border border-red-500/20 text-red-400 text-sm">{error}</div>)}

        {/* Team Selection */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 bg-bg-secondary p-4 rounded-xl border border-border">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-text-tertiary font-semibold">Active Team Workspace</label>
            <div className="flex items-center gap-2">
              {teams.length > 0 ? (
                <select value={teamId} disabled={loading} onChange={async (e) => { const newTeamId = e.target.value; setTeamId(newTeamId); await switchTeam(newTeamId) }}
                  className="bg-bg-primary border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:border-accent-primary/40 outline-none min-w-[200px]">
                  {teams.map((t) => (<option key={t.team_id} value={t.team_id}>{t.name || t.team_id}</option>))}
                </select>
              ) : (<div className="text-sm text-text-tertiary">No teams found. <a href="/team" className="underline text-accent-primary hover:text-accent-primary/80">Create one</a>.</div>)}
            </div>
          </div>
          {subscription && (
            <button onClick={handleCancel} disabled={role !== 'owner'}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-2.5 rounded-xl text-sm font-medium border border-red-500/20 transition-colors disabled:opacity-40"
              title={role !== 'owner' ? 'Only the team owner can cancel' : ''}>
              Cancel Subscription
            </button>
          )}
        </div>

        {/* Current plan banner */}
        {subscription && (
          <CardSpotlight className="p-5 mb-8">
            <div className="flex items-start gap-3">
              <CreditCard className="w-5 h-5 text-accent-primary shrink-0 mt-0.5" weight="fill" />
              <div className="flex-1">
                <div className="text-[10px] uppercase tracking-widest text-text-tertiary font-semibold mb-2">Current Plan</div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="px-3 py-1 rounded-lg bg-accent-primary/15 text-accent-primary text-sm font-bold capitalize border border-accent-primary/25">{subscription.tier}</span>
                  <span className="text-sm text-text-secondary">${subscription.price}/mo</span>
                  <span className="text-sm text-text-tertiary capitalize">{subscription.billing_cycle}</span>
                  <span className={cn('ml-auto text-xs px-2 py-0.5 rounded-full font-mono border',
                    subscription.status === 'active' ? 'text-green-400 bg-green-500/10 border-green-500/20' : 'text-text-tertiary bg-bg-tertiary border-border')}>
                    {subscription.status}
                  </span>
                </div>
              </div>
            </div>
          </CardSpotlight>
        )}

        {/* Tier cards */}
        <GradientHeading as="h2" className="text-lg mb-4">Available Plans</GradientHeading>
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {TIERS.map((tier) => {
            const isCurrent = selectedTier === tier.id
            return (
              <motion.div key={tier.id} variants={itemVariants}>
                <CardSpotlight className={cn('relative p-5 flex flex-col h-full',
                  isCurrent ? 'border-accent-primary/30 ring-1 ring-accent-primary/15' : tier.popular ? '' : '')}>
                  {tier.popular && <span className="text-[10px] uppercase tracking-widest text-accent-primary font-bold mb-3">Most Popular</span>}
                  <h3 className="font-display text-base font-bold text-text-primary capitalize mb-1">{tier.label}</h3>
                  <div className="mb-4">
                    {tier.price > 0 ? (
                      <span className="font-display text-2xl font-bold text-text-primary">${tier.price}<span className="text-sm text-text-tertiary font-normal">/mo</span></span>
                    ) : (
                      <span className="font-display text-lg text-text-tertiary">{tier.id === 'enterprise' ? 'Custom' : 'Free'}</span>
                    )}
                  </div>
                  <ul className="space-y-2 text-xs text-text-secondary flex-1 mb-5">
                    {tier.features.map((f) => (<li key={f} className="flex items-start gap-2"><Check className="w-3.5 h-3.5 text-accent-primary mt-0.5 shrink-0" weight="bold" /><span>{f}</span></li>))}
                  </ul>
                  <button onClick={() => handleCreateSubscription(tier.id)} disabled={!teamId.trim() || isCurrent || role !== 'owner'}
                    title={role !== 'owner' ? 'Only the team owner can change plans' : ''}
                    className={cn('w-full py-2 rounded-xl text-xs font-bold transition-all',
                      isCurrent ? 'bg-accent-primary/10 text-accent-primary border border-accent-primary/20 cursor-default' :
                      tier.popular ? 'bg-accent-primary hover:bg-accent-primary/90 text-white disabled:opacity-40' :
                      'bg-bg-tertiary hover:bg-bg-tertiary/80 text-text-secondary hover:text-text-primary border border-border disabled:opacity-40')}>
                    {isCurrent ? 'Current Plan' : tier.id === 'enterprise' ? 'Contact Sales' : `Choose ${tier.label}`}
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
