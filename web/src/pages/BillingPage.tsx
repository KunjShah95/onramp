import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { createSubscription, getSubscription, cancelSubscription, createCheckoutSession, listTeams, getCreditWallet, getCreditLedger, createCreditOrder, verifyCreditOrder, CREDIT_COSTS_LIST } from '../lib/api'
import type { CreditWallet, LedgerEntry } from '../lib/api'
import { cn } from '../lib/utils'
import ConsolePanel from '../components/ui/console-panel'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { useFeatureFlag } from '../context/FeatureFlagContext'
import { Check, CreditCard, Coins, ArrowDown, ArrowUp, CurrencyInr, Spinner } from '@phosphor-icons/react'

export default function BillingPage() {
  const toast = useToast()
  const { activeTeamId, role, switchTeam } = useAuth()
  const usageBasedEnabled = useFeatureFlag('usage_based_billing')
  const [teams, setTeams] = useState<any[]>([])
  const [teamId, setTeamId] = useState(activeTeamId || '')
  const [subscription, setSubscription] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedTier, setSelectedTier] = useState<string | null>(null)

  // Wallet state
  const [wallet, setWallet] = useState<CreditWallet | null>(null)
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [walletLoading, setWalletLoading] = useState(false)
  const [topUpAmount, setTopUpAmount] = useState(100)

  const tiers = [
    { id: 'free', price: 0, label: 'Free', features: ['1 team member', '1 repository', '50 credits/month', 'Community support'] },
    ...(usageBasedEnabled ? [{ id: 'usage_based', price: 499, label: 'Usage-Based', features: ['1 team member', '1 repository', 'Pay per query', 'Email support'] }] : []),
    { id: 'startup', price: 999, label: 'Startup', features: ['5 team members', '10 repositories', '5,000 credits/month', 'Email support'] },
    { id: 'professional', price: 2999, label: 'Professional', popular: true, features: ['20 team members', '50 repositories', '50,000 credits/month', 'Priority support'] },
    { id: 'enterprise', price: 0, label: 'Enterprise', features: ['Unlimited members', 'Unlimited repos', 'Unlimited credits', 'Dedicated support', 'SSO', 'SLA'] },
  ]

  useEffect(() => {
    async function loadTeams() {
      try { const data = await listTeams('current-user'); setTeams(data.teams || []) } catch (err: any) { setError(err.message || 'Failed to load teams') }
    }
    loadTeams()
  }, [])

  useEffect(() => { if (activeTeamId) setTeamId(activeTeamId) }, [activeTeamId])
  useEffect(() => {
    if (teamId) {
      fetchSubscription(teamId)
    } else {
      setSubscription(null); setSelectedTier(null); setWallet(null)
    }
  }, [teamId])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout') === 'success') { const tid = params.get('team_id'); if (tid) { setTeamId(tid); window.history.replaceState({}, '', window.location.pathname) } }
  }, [])

  async function fetchSubscription(id: string = teamId) {
    if (!id.trim()) return
    setLoading(true); setError('')
    try {
      const data = await getSubscription(id.trim())
      setSubscription(data)
      setSelectedTier(data.tier)
      if (data.tier === 'usage_based') {
        await fetchWallet()
      }
    } catch {
      setSubscription(null); setSelectedTier(null)
    }
    setLoading(false)
  }

  async function fetchWallet() {
    setWalletLoading(true)
    try {
      const [w, l] = await Promise.all([getCreditWallet(), getCreditLedger(20)])
      setWallet(w)
      setLedger(l.entries || [])
    } catch { /* wallet may not exist yet */ }
    setWalletLoading(false)
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

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.06 } } }
  const itemVariants = { hidden: { opacity: 0, y: 16, scale: 0.98 }, visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 80, damping: 18 } } }

  async function handleCancel() {
    if (!teamId.trim() || !subscription) return
    if (!confirm('Cancel your current subscription?')) return
    try { await cancelSubscription(teamId.trim()); setSubscription(null); setSelectedTier(null); setWallet(null); toast.info('Plan cancelled') }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to cancel'); toast.error('Failed to cancel plan') }
  }

  function loadRazorpayScript(): Promise<boolean> {
    return new Promise((resolve) => {
      if ((window as any).Razorpay) return resolve(true)
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
      document.body.appendChild(script)
    })
  }

  async function handleTopUp() {
    try {
      const ok = await loadRazorpayScript()
      if (!ok) { toast.error('Could not load payment gateway'); return }
      const order = await createCreditOrder({ amount_inr: topUpAmount })
      const rzp = new (window as any).Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: 'Onramp',
        description: `Credit top-up of ₹${topUpAmount}`,
        order_id: order.order_id,
        handler: async (response: any) => {
          try {
            const res = await verifyCreditOrder({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            })
            if (res.credited) {
              toast.success('Credits added', `${res.credits} credits added to wallet`)
              await fetchWallet()
            } else {
              toast.error('Payment verification failed')
            }
          } catch (e) {
            // API failures must not become unhandled rejections — the user
            // sees a clear error and can retry from the wallet section.
            toast.error('Payment verification failed', e instanceof Error ? e.message : 'Unknown error')
          }
        },
        modal: { ondismiss: () => { /* no-op; user cancelled */ } },
      })
      rzp.open()
    } catch (e) {
      toast.error('Top-up failed', e instanceof Error ? e.message : 'Unknown error')
    }
  }

  const isUsageBased = subscription?.tier === 'usage_based'
  const planStatus: 'go' | 'caution' | 'standby' = subscription?.status === 'active' ? 'go' : subscription ? 'caution' : 'standby'

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="relative w-full min-h-[calc(100vh-4rem)] p-4 sm:p-6 font-body text-ink"
    >
      {/* ── Mission header ── */}
      <motion.div variants={itemVariants} className="mb-6">
        <div className="flex items-center gap-2.5 mb-1.5">
          <span className="tile tile-go">Billing</span>
          <span className="designator opacity-50">STATION ENGINEER · FINANCE</span>
        </div>
        <h1 className="text-display-md md:text-display-lg text-ink">Billing &amp; Plans</h1>
        <p className="text-body-sm text-ink-secondary mt-1 font-code">Manage your subscription and team quota</p>
      </motion.div>

      {error && (<motion.div variants={itemVariants} className="mb-5 px-4 py-3 rounded-tile bg-abort/10 border border-abort/20 text-abort text-sm">{error}</motion.div>)}

      {/* Team Selection */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 bg-well p-4 rounded-card border border-seam">
        <div className="flex flex-col gap-1">
          <label className="overline text-ink-muted">Active Team Workspace</label>
          <div className="flex items-center gap-2">
            {teams.length > 0 ? (
              <select value={teamId} disabled={loading} onChange={async (e) => { const newTeamId = e.target.value; setTeamId(newTeamId); await switchTeam(newTeamId) }}
                className="bg-panel border border-seam rounded-input px-4 py-2.5 text-sm text-ink focus:border-go/40 outline-none min-w-[200px]">
                {teams.map((t) => (<option key={t.team_id} value={t.team_id}>{t.name || t.team_id}</option>))}
              </select>
            ) : (<div className="text-sm text-ink-muted">No teams found. <a href="/team" className="underline text-go hover:text-go/80">Create one</a>.</div>)}
          </div>
        </div>
        {subscription && (
          <button onClick={handleCancel} disabled={role !== 'admin'}
            className="btn btn-danger px-4 py-2.5 text-sm font-medium disabled:opacity-40"
            title={role !== 'admin' ? 'Only the team admin can cancel' : ''}>
            Cancel Subscription
          </button>
        )}
      </motion.div>

      {/* Current plan banner */}
      {subscription && (
        <motion.div variants={itemVariants}>
          <ConsolePanel rail="Current Plan" designator="SUBSCRIPTION" status={planStatus} className="p-5 mb-8">
            <div className="flex items-start gap-3">
              <CreditCard className="w-5 h-5 text-go shrink-0 mt-0.5" weight="fill" />
              <div className="flex-1">
                <div className="overline text-ink-muted mb-2">Plan Status</div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="px-3 py-1 rounded-tile bg-go/15 text-go text-sm font-bold capitalize border border-go/25">{subscription.tier}</span>
                  <span className="text-sm text-ink-secondary">₹{subscription.price}/mo</span>
                  <span className="text-sm text-ink-muted capitalize">{subscription.billing_cycle}</span>
                  <span className={cn('ml-auto text-xs px-2 py-0.5 rounded-pill font-mono border',
                    subscription.status === 'active' ? 'text-go bg-go/10 border-go/20' : 'text-ink-muted bg-well border-seam')}>
                    {subscription.status}
                  </span>
                </div>
              </div>
            </div>
          </ConsolePanel>
        </motion.div>
      )}

      {/* Usage-Based Wallet Section */}
      {isUsageBased && (
        <motion.div variants={itemVariants} className="mb-8">
          <ConsolePanel rail="Credit Wallet" designator="PREPAID" status="go" className="p-5">
            <div className="flex items-start gap-3 mb-4">
              <Coins className="w-5 h-5 text-go shrink-0 mt-0.5" weight="fill" />
              <div className="flex-1">
                <div className="overline text-ink-muted mb-2">Prepaid Credit Wallet</div>
                {walletLoading ? (
                  <div className="flex items-center gap-2 text-sm text-ink-muted">
                    <Spinner className="w-4 h-4 animate-spin" />
                    Loading wallet…
                  </div>
                ) : wallet ? (
                  <>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="font-display text-3xl font-bold text-go">{wallet.balance.toLocaleString()}</span>
                      <span className="text-sm text-ink-muted">credits available</span>
                    </div>
                    <div className="flex gap-4 text-xs text-ink-muted mb-4">
                      <span>Purchased: <span className="font-mono text-ink-secondary">{wallet.lifetime_purchased.toLocaleString()}</span></span>
                      <span>Spent: <span className="font-mono text-ink-secondary">{wallet.lifetime_spent.toLocaleString()}</span></span>
                    </div>

                    {/* Top-up */}
                    <div className="flex items-center gap-3 p-3 bg-well rounded-card border border-seam mb-4">
                      <CurrencyInr className="w-4 h-4 text-go" weight="fill" />
                      <input
                        type="number"
                        min={10}
                        max={100000}
                        value={topUpAmount}
                        onChange={(e) => setTopUpAmount(Math.max(10, parseInt(e.target.value) || 10))}
                        className="input w-24 font-mono"
                      />
                      <span className="text-xs text-ink-muted">INR</span>
                      <button
                        onClick={handleTopUp}
                        className="ml-auto btn btn-primary px-4 py-1.5 text-xs font-semibold"
                      >
                        <ArrowDown size={14} className="inline mr-1" weight="bold" />
                        Add Credits
                      </button>
                    </div>

                    {/* Cost breakdown */}
                    <h4 className="overline text-ink-muted mb-2">Credit Costs per Action</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                      {CREDIT_COSTS_LIST.map((item) => (
                        <div key={item.action} className="bg-well border border-seam rounded-card p-2.5">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-[10px] font-mono text-ink-secondary uppercase">{item.action}</span>
                            <span className="font-mono text-[11px] font-bold text-go">{item.cost}</span>
                          </div>
                          <p className="text-[9px] text-ink-muted leading-tight">{item.description}</p>
                        </div>
                      ))}
                    </div>

                    {/* Ledger */}
                    {ledger.length > 0 && (
                      <>
                        <h4 className="overline text-ink-muted mb-2">Recent Activity</h4>
                        <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                          {ledger.map((entry) => (
                            <div key={entry.entry_id} className="flex items-center gap-3 px-3 py-2 rounded-tile bg-well border border-seam text-xs">
                              {entry.delta > 0 ? (
                                <ArrowDown size={12} className="text-go shrink-0" weight="bold" />
                              ) : (
                                <ArrowUp size={12} className="text-abort shrink-0" weight="bold" />
                              )}
                              <span className="font-mono text-ink-secondary">{entry.delta > 0 ? '+' : ''}{entry.delta}</span>
                              <span className="text-ink-muted flex-1 capitalize">{entry.reason.replace('charge:', '')}</span>
                              <span className="text-[10px] text-ink-disabled/60">{new Date(entry.created_at).toLocaleDateString()}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-ink-muted">No wallet created yet. Usage will be tracked as you use the platform.</p>
                )}
              </div>
            </div>
          </ConsolePanel>
        </motion.div>
      )}

      {/* Tier cards */}
      <motion.div variants={itemVariants} className="mb-4">
        <div className="flex items-center gap-2.5 mb-1.5">
          <span className="tile tile-observe">Plans</span>
          <span className="designator opacity-50">TIER MATRIX</span>
        </div>
      </motion.div>
      <motion.div variants={containerVariants} className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {tiers.map((tier) => {
          const isCurrent = selectedTier === tier.id
          return (
            <motion.div key={tier.id} variants={itemVariants}>
              <div className={cn('relative rounded-card border bg-panel p-5 flex flex-col h-full group transition-colors',
                isCurrent ? 'border-go/30 ring-1 ring-go/15' : tier.popular ? 'hover:border-go/30' : 'border-seam hover:border-seam-strong')}>
                {tier.popular && <span className="overline text-go font-bold mb-3">Most Popular</span>}
                <h3 className="font-heading text-base font-bold text-ink capitalize mb-1">{tier.label}</h3>
                <div className="mb-4">
                  {tier.price > 0 ? (
                    <span className="font-display text-2xl font-bold text-ink">
                      <motion.span
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: 'spring', stiffness: 100, damping: 15 }}
                      >
                        ₹{tier.price}
                      </motion.span>
                      <span className="text-sm text-ink-muted font-normal">/mo</span>
                    </span>
                  ) : (
                    <span className="font-display text-lg text-ink-muted">{tier.id === 'enterprise' ? 'Custom' : 'Free'}</span>
                  )}
                </div>
                <ul className="space-y-2 text-xs text-ink-secondary flex-1 mb-5">
                  {tier.features.map((f) => (<li key={f} className="flex items-start gap-2"><Check className="w-3.5 h-3.5 text-go mt-0.5 shrink-0" weight="bold" /><span>{f}</span></li>))}
                </ul>
                <button onClick={() => handleCreateSubscription(tier.id)} disabled={!teamId.trim() || isCurrent || role !== 'admin'}
                  title={role !== 'admin' ? 'Only the team admin can change plans' : ''}
                  className={cn('w-full py-2 rounded-btn text-xs font-bold transition-all',
                    isCurrent ? 'bg-go/10 text-go border border-go/20 cursor-default' :
                    tier.popular ? 'bg-go hover:bg-go-lit text-white disabled:opacity-40' :
                    'bg-well hover:bg-well/80 text-ink-secondary hover:text-ink border border-seam disabled:opacity-40')}>
                  {isCurrent ? 'Current Plan' : tier.id === 'enterprise' ? 'Contact Sales' : `Choose ${tier.label}`}
                </button>
              </div>
            </motion.div>
          )
        })}
      </motion.div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 2px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
      `}</style>
    </motion.div>
  )
}
