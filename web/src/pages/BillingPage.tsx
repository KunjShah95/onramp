import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

import { createSubscription, getSubscription, cancelSubscription, createCheckoutSession, listTeams, getCreditWallet, getCreditLedger, createCreditOrder, verifyCreditOrder, CREDIT_COSTS_LIST } from '../lib/api'
import type { CreditWallet, LedgerEntry } from '../lib/api'
import { cn } from '../lib/utils'
import { getPlanIntent } from '../lib/plan-intent'
import { PageHeader } from '../components/ui/page-header'
import ConsolePanel from '../components/ui/console-panel'
import { EmptyState } from '../components/ui/empty-state'
import { Modal } from '../components/ui/modal'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { useFeatureFlag } from '../context/FeatureFlagContext'
import { Check, CreditCard, Coins, ArrowDown, ArrowUp, CurrencyInr, Spinner, Receipt, ShieldCheck, Lightning, Buildings } from '@phosphor-icons/react'

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
  const [subscribingTier, setSubscribingTier] = useState<string | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  // Wallet state
  const [wallet, setWallet] = useState<CreditWallet | null>(null)
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [walletLoading, setWalletLoading] = useState(false)
  const [topUpAmount, setTopUpAmount] = useState(100)

  // Plan intent carried from landing #pricing → /register|/login → here. The matching
  // tier card is highlighted and scrolled into view so the Razorpay checkout
  // funnel has a clear landing target.
  const [searchParams] = useSearchParams()
  const planIntent = getPlanIntent(searchParams)
  const tierRefs = useRef<Record<string, HTMLElement | null>>({})

  useEffect(() => {
    if (!planIntent || loading || !teamId) return
    const el = tierRefs.current[planIntent]
    if (el) {
      const t = window.setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350)
      return () => window.clearTimeout(t)
    }
  }, [planIntent, loading, teamId])

  const tiers = [
    { id: 'free', price: 0, label: 'Free', tagline: 'For side projects', cta: 'Downgrade to Free', features: ['1 team member', '1 repository', '50 credits/month', 'Community support'] },
    ...(usageBasedEnabled ? [{ id: 'usage_based', price: 499, label: 'Usage-Based', tagline: 'Pay for what you run', cta: 'Choose Usage-Based', features: ['1 team member', '1 repository', 'Pay per query', 'Email support'] }] : []),
    { id: 'startup', price: 999, label: 'Startup', tagline: 'For small teams shipping', cta: 'Choose Startup', features: ['5 team members', '10 repositories', '5,000 credits/month', 'Email support'] },
    { id: 'professional', price: 2999, label: 'Professional', tagline: 'For teams scaling onboarding', cta: 'Choose Professional', popular: true, blurb: '14-day trial on first subscribe', features: ['20 team members', '50 repositories', '50,000 credits/month', 'Priority support'] },
    { id: 'enterprise', price: 0, label: 'Enterprise', tagline: 'Security & scale', cta: 'Contact Sales', features: ['Unlimited members', 'Unlimited repos', 'Unlimited credits', 'Dedicated support', 'SSO', 'SLA'] },
  ]

  useEffect(() => {
    let cancelled = false
    async function loadTeams() {
      try {
        const data = await listTeams('current-user')
        if (!cancelled) setTeams(data.teams || [])
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load teams')
      }
    }
    loadTeams()
    return () => { cancelled = true }
  }, [])

  useEffect(() => { if (activeTeamId) setTeamId(activeTeamId) }, [activeTeamId])
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (teamId) {
        setLoading(true); setError('')
        try {
          const data = await getSubscription(teamId.trim())
          if (cancelled) return
          setSubscription(data)
          setSelectedTier(data.tier)
          if (data.tier === 'usage_based') fetchWallet()
        } catch {
          if (!cancelled) { setSubscription(null); setSelectedTier(null) }
        }
        if (!cancelled) setLoading(false)
      } else {
        setSubscription(null); setSelectedTier(null); setWallet(null)
      }
    }
    load()
    return () => { cancelled = true }
  }, [teamId])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout') === 'success') {
      const tid = params.get('team_id')
      if (tid) {
        setTeamId(tid)
        toast.success('Payment successful', 'Your plan is activating — refresh in a moment if it still shows the old tier.')
        window.history.replaceState({}, '', window.location.pathname)
        fetchSubscription(tid)
      } else {
        toast.success('Payment successful', 'Your plan is activating.')
        window.history.replaceState({}, '', window.location.pathname)
      }
    }
    if (params.get('checkout') === 'cancelled') {
      toast.info('Checkout cancelled', 'No charge was made — pick a plan when ready.')
      window.history.replaceState({}, '', window.location.pathname)
    }
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
    if (!teamId.trim() || subscribingTier) return
    if (tier === 'enterprise') {
      window.location.href = '/contact?plan=enterprise'
      return
    }
    setSubscribingTier(tier)
    try {
      if (tier === 'free') {
        await createSubscription({ team_id: teamId.trim(), tier, billing_cycle: 'monthly' })
        setSelectedTier(tier); await fetchSubscription(); toast.success('Subscribed', `${tier} plan activated`)
      } else {
        const successUrl = `${window.location.origin}/billing?checkout=success&team_id=${teamId.trim()}`
        const cancelUrl = `${window.location.origin}/billing?checkout=cancelled`
        const result = await createCheckoutSession({ team_id: teamId.trim(), tier, success_url: successUrl, cancel_url: cancelUrl })
        if (result.url) { window.location.href = result.url } else { setError('Payment system is not configured. Contact support or try again later.') }
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create subscription') }
    finally { setSubscribingTier(null) }
  }


  async function handleCancel() {
    if (!teamId.trim() || !subscription || cancelling) return
    setCancelling(true)
    try {
      await cancelSubscription(teamId.trim())
      setSubscription(null); setSelectedTier(null); setWallet(null)
      setShowCancelConfirm(false)
      toast.info('Plan cancelled', 'Access continues until period ends.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to cancel'); toast.error('Failed to cancel plan') }
    finally { setCancelling(false) }
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
    const amount = Math.min(100000, Math.max(10, Math.floor(topUpAmount) || 10))
    setTopUpAmount(amount)
    try {
      const ok = await loadRazorpayScript()
      if (!ok) { toast.error('Could not load payment gateway', 'Check your connection and retry from the wallet section.'); return }
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
  const activeTeamName = teams.find((t) => t.team_id === teamId)?.name || 'Select a team'
  const canManage = role === 'admin' || role === 'ceo' || role === 'cto'
  const currentTier = tiers.find((t) => t.id === selectedTier)
  const spentPct = wallet && wallet.lifetime_purchased > 0
    ? Math.min(100, Math.round((wallet.lifetime_spent / wallet.lifetime_purchased) * 100))
    : 0

  return (
    <div className="relative w-full max-w-6xl mx-auto min-h-[calc(100vh-4rem)] font-body text-ink">
      {/* ── Header: title + workspace context in actions ── */}
      <div>
        <PageHeader
          eyebrow="Folio · Billing"
          title="Billing & plans"
          subtitle="One subscription per team workspace. Prices in INR, billed monthly. Cancel anytime — access continues to period end."
          pills={subscription ? [
            { label: 'plan', value: subscription.tier },
            { label: 'per month', value: `₹${subscription.price}` },
            { label: 'status', value: subscription.status },
          ] : undefined}
          actions={
            <div className="flex items-center gap-2">
              <Buildings className="w-4 h-4 text-ink-tertiary" aria-hidden />
              {teams.length > 0 ? (
                <>
                  <label htmlFor="billing-team" className="sr-only">Billing team workspace</label>
                  <select
                    id="billing-team"
                    value={teamId}
                    disabled={loading}
                    onChange={async (e) => { const newTeamId = e.target.value; setTeamId(newTeamId); await switchTeam(newTeamId) }}
                    className="bg-panel border border-seam rounded-input pl-3 pr-8 py-2 text-body-sm text-ink focus:border-go/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-go/40 min-w-[190px] disabled:opacity-50"
                  >
                    {teams.map((t) => (<option key={t.team_id} value={t.team_id}>{t.name || 'Untitled team'}</option>))}
                  </select>
                </>
              ) : (
                <a href="/team" className="text-body-sm text-go hover:text-go-lit underline underline-offset-2">Create a team</a>
              )}
            </div>
          }
        />
      </div>

      {error && (
        <div role="alert" className="mb-5 flex items-start gap-3 px-4 py-3 rounded-card bg-abort/10 border border-abort/25 text-abort text-body-sm">
          <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-abort-lit shrink-0" aria-hidden />
          <span className="flex-1">{error}</span>
          <button onClick={() => fetchSubscription()} className="underline underline-offset-2 text-caption shrink-0 hover:opacity-80">Retry</button>
        </div>
      )}

      {!teamId && (
        <div className="mb-8">
          <EmptyState
            icon={<Buildings className="w-10 h-10 text-ink-tertiary/40" weight="duotone" />}
            title="No team workspace selected"
            description="Billing lives on a team. Create one to compare plans and subscribe."
            action={<a href="/team" className="btn btn-primary text-caption px-4 py-2">Go to Teams</a>}
          />
        </div>
      )}

      {/* ── Current subscription overview ── */}
      {teamId && (
        <div className="mb-8">
          <ConsolePanel
            rail="Current subscription"
            designator={activeTeamName.toUpperCase().slice(0, 24)}
            status={planStatus}
            live={loading}
            action={subscription && canManage ? (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="text-caption font-medium text-abort/80 hover:text-abort underline underline-offset-2 decoration-abort/30 hover:decoration-abort transition-colors"
              >
                Cancel plan
              </button>
            ) : undefined}
          >
            {loading ? (
              <div className="flex items-center gap-2.5 text-body-sm text-ink-muted py-2" role="status" aria-live="polite">
                <Spinner className="w-4 h-4 animate-spin" aria-hidden />
                Loading subscription…
              </div>
            ) : subscription ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[rgb(var(--border-rgb)/0.6)] rounded-tile overflow-hidden border border-[rgb(var(--border-rgb)/0.6)]">
                <div className="bg-panel p-4">
                  <div className="overline text-ink-muted mb-1.5 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5" aria-hidden /> Plan
                  </div>
                  <div className="font-display text-display-sm text-ink capitalize">{subscription.tier.replace('_', ' ')}</div>
                  <div className="text-caption text-ink-tertiary mt-0.5 capitalize">{subscription.billing_cycle} billing</div>
                </div>
                <div className="bg-panel p-4">
                  <div className="overline text-ink-muted mb-1.5">Monthly price</div>
                  <div className="font-display text-display-sm text-ink tabular-nums">₹{Number(subscription.price).toLocaleString('en-IN')}</div>
                  <div className="text-caption text-ink-tertiary mt-0.5">excl. taxes</div>
                </div>
                <div className="bg-panel p-4">
                  <div className="overline text-ink-muted mb-1.5 flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5" aria-hidden /> Credit balance
                  </div>
                  <div className="font-display text-display-sm text-ink tabular-nums">
                    {wallet ? wallet.balance.toLocaleString('en-IN') : '—'}
                  </div>
                  <div className="text-caption text-ink-tertiary mt-0.5">{isUsageBased ? 'prepaid wallet' : currentTier ? `${currentTier.features.find((f) => f.includes('credit')) ?? 'included credits'}` : 'included credits'}</div>
                </div>
                <div className="bg-panel p-4">
                  <div className="overline text-ink-muted mb-1.5">Status</div>
                  <span className={cn(
                    'inline-flex items-center gap-1.5 text-caption font-semibold px-2.5 py-1 rounded-pill border font-mono capitalize',
                    subscription.status === 'active' ? 'text-go bg-go/10 border-go/25' : 'text-caution bg-caution/10 border-caution/25'
                  )}>
                    <span className={cn('w-1.5 h-1.5 rounded-full', subscription.status === 'active' ? 'bg-go-lit' : 'bg-caution-lit')} aria-hidden />
                    {subscription.status}
                  </span>
                  {!canManage && (
                    <div className="text-caption text-ink-tertiary mt-1.5">Only admins can change plans.</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 py-1">
                <div className="flex items-start gap-3 flex-1">
                  <Lightning className="w-5 h-5 text-go shrink-0 mt-0.5" weight="fill" aria-hidden />
                  <div>
                    <p className="text-body-sm font-semibold text-ink">No active subscription for {activeTeamName}</p>
                    <p className="text-caption text-ink-tertiary mt-0.5">Pick a plan below — Free is instant, paid plans go through secure checkout.</p>
                  </div>
                </div>
              </div>
            )}
          </ConsolePanel>
        </div>
      )}

      {/* ── Usage wallet (usage-based plans) ── */}
      {isUsageBased && (
        <div className="mb-10">
          <ConsolePanel rail="Credit wallet" designator="PREPAID" status="go">
            {walletLoading ? (
              <div className="flex items-center gap-2 text-body-sm text-ink-muted py-2" role="status" aria-live="polite">
                <Spinner className="w-4 h-4 animate-spin" aria-hidden />
                Loading wallet…
              </div>
            ) : wallet ? (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Balance + top-up */}
                <div className="lg:col-span-2 space-y-4">
                  <div>
                    <div className="overline text-ink-muted mb-1">Available balance</div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-display-xl text-go tabular-nums">{wallet.balance.toLocaleString('en-IN')}</span>
                      <span className="text-caption text-ink-tertiary">credits</span>
                    </div>
                    {/* spend meter */}
                    <div className="mt-3">
                      <div className="h-1.5 rounded-pill bg-well overflow-hidden" role="progressbar" aria-valuenow={spentPct} aria-valuemin={0} aria-valuemax={100} aria-label="Lifetime credits spent">
                        <div className="h-full rounded-pill bg-go transition-all" style={{ width: `${spentPct}%` }} />
                      </div>
                      <div className="flex justify-between mt-1.5 text-caption text-ink-muted font-mono tabular-nums">
                        <span>spent {wallet.lifetime_spent.toLocaleString('en-IN')}</span>
                        <span>of {wallet.lifetime_purchased.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 bg-well/60 rounded-card border border-seam">
                    <label htmlFor="topup-amount" className="overline text-ink-muted block mb-2">Top up wallet</label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <CurrencyInr className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-tertiary" weight="bold" aria-hidden />
                        <input
                          id="topup-amount"
                          type="number"
                          min={10}
                          max={100000}
                          value={topUpAmount}
                          onChange={(e) => setTopUpAmount(parseInt(e.target.value) || 0)}
                          onBlur={(e) => {
                            const v = parseInt(e.target.value) || 10
                            setTopUpAmount(Math.min(100000, Math.max(10, v)))
                          }}
                          aria-label="Top-up amount in INR, minimum 10"
                          className="input w-full pl-8 font-mono tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-go/50"
                        />
                      </div>
                      <button onClick={handleTopUp} className="btn btn-primary px-4 py-2 text-caption font-semibold inline-flex items-center gap-1.5 shrink-0">
                        <ArrowDown size={14} aria-hidden weight="bold" />
                        Add credits
                      </button>
                    </div>
                    <p className="text-caption text-ink-tertiary mt-2">₹10 – ₹1,00,000 per top-up · via Razorpay</p>
                  </div>
                </div>

                {/* Costs + ledger */}
                <div className="lg:col-span-3 space-y-5 min-w-0">
                  <div>
                    <h4 className="overline text-ink-muted mb-2">Cost per action</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {CREDIT_COSTS_LIST.map((item) => (
                        <div key={item.action} className="bg-well/60 border border-seam rounded-card p-2.5">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className="text-[10px] font-mono text-ink-secondary uppercase truncate">{item.action}</span>
                            <span className="font-mono text-[11px] font-bold text-go tabular-nums shrink-0">{item.cost}</span>
                          </div>
                          <p className="text-[11px] text-ink-muted leading-snug">{item.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {ledger.length > 0 && (
                    <div>
                      <h4 className="overline text-ink-muted mb-2">Recent activity</h4>
                      <ol className="divide-y divide-[rgb(var(--border-rgb)/0.6)] border border-[rgb(var(--border-rgb)/0.6)] rounded-card overflow-hidden">
                        {ledger.map((entry) => (
                          <li key={entry.entry_id} className="flex items-center gap-3 px-3.5 py-2.5 bg-panel text-body-sm">
                            <span className={cn('w-6 h-6 rounded-tile flex items-center justify-center shrink-0', entry.delta > 0 ? 'bg-go/10 text-go' : 'bg-abort/10 text-abort')}>
                              {entry.delta > 0 ? <ArrowDown size={12} weight="bold" aria-hidden /> : <ArrowUp size={12} weight="bold" aria-hidden />}
                            </span>
                            <span className="font-mono tabular-nums text-ink-secondary text-caption min-w-[52px]">{entry.delta > 0 ? '+' : ''}{entry.delta}</span>
                            <span className="text-caption text-ink-tertiary flex-1 capitalize truncate">{entry.reason.replace('charge:', '').replace(/_/g, ' ')}</span>
                            <time className="text-caption text-ink-muted font-mono shrink-0" dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</time>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-body-sm text-ink-muted py-1">No wallet yet — it is created automatically with your first usage-based charge.</p>
            )}
          </ConsolePanel>
        </div>
      )}

      {/* ── Plan matrix ── */}
      {teamId && (
        <>
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <div className="index-kicker mb-1.5">Tier matrix</div>
              <h2 className="font-display text-display-sm text-ink tracking-tight">Choose the plan that fits this team</h2>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1.5 text-caption text-ink-tertiary shrink-0">
              <Receipt className="w-3.5 h-3.5" aria-hidden /> Invoices over email
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-stretch">
            {tiers.map((tier) => {
              const isCurrent = selectedTier === tier.id
              const isIntent = planIntent === tier.id && !isCurrent
              const busy = subscribingTier === tier.id
              const disabled = !teamId.trim() || isCurrent || !canManage || subscribingTier !== null
              return (
                <div key={tier.id} className="h-full">
                  <article
                    aria-label={`${tier.label} plan`}
                    ref={(el) => { tierRefs.current[tier.id] = el }}
                    className={cn(
                      'relative rounded-card border bg-panel p-5 flex flex-col h-full transition-colors duration-150',
                      isCurrent
                        ? 'border-go/40 ring-1 ring-go/20 shadow-lift'
                        : isIntent
                          ? 'border-go/50 ring-2 ring-go/25 shadow-lift'
                          : tier.popular
                          ? 'border-seam-strong shadow-card hover:border-go/40  '
                          : 'border-seam shadow-seam hover:border-seam-strong hover:shadow-card '
                    )}
                  >
                    {/* top row: badge state */}
                    <div className="flex items-center justify-between mb-3 min-h-[20px]">
                      {isCurrent ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-go bg-go/10 border border-go/25 rounded-pill px-2 py-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-go-lit" aria-hidden /> Current
                        </span>
                      ) : isIntent ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[hsl(var(--primary-foreground))] bg-mission rounded-pill px-2 py-0.5">Picked for you</span>
                      ) : tier.popular ? (
                        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[hsl(var(--primary-foreground))] bg-go rounded-pill px-2 py-0.5">Most popular</span>
                      ) : <span />}
                      {tier.id === 'enterprise' && (
                        <ShieldCheck className="w-4 h-4 text-ink-tertiary" aria-label="Enterprise grade" />
                      )}
                    </div>

                    <h3 className="font-display text-display-xs text-ink">{tier.label}</h3>
                    <p className="text-caption text-ink-tertiary mt-0.5 mb-3">{tier.tagline}{(tier as any).blurb ? ` · ${(tier as any).blurb}` : ''}</p>

                    <div className="mb-4 min-h-[44px]">
                      {tier.price > 0 ? (
                        <p className="flex items-baseline gap-1">
                          <span className="font-display text-[30px] leading-none font-bold text-ink tabular-nums">₹{tier.price.toLocaleString('en-IN')}</span>
                          <span className="text-caption text-ink-muted">/mo</span>
                        </p>
                      ) : (
                        <p className="font-display text-[22px] leading-[44px] text-ink-secondary">{tier.id === 'enterprise' ? 'Custom' : '₹0'}</p>
                      )}
                    </div>

                    <ul className="space-y-2 text-body-sm text-ink-secondary flex-1 mb-5">
                      {tier.features.map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <span className={cn('mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0', isCurrent || tier.popular ? 'bg-go/12 text-go' : 'bg-well text-ink-tertiary')}>
                            <Check className="w-2.5 h-2.5" weight="bold" aria-hidden />
                          </span>
                          <span className="leading-snug">{f}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => handleCreateSubscription(tier.id)}
                      disabled={disabled}
                      title={!teamId.trim() ? 'Select a team first' : !canManage ? 'Only a team admin can change plans' : ''}
                      aria-busy={busy}
                      className={cn(
                        'w-full py-2.5 rounded-btn text-body-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-go/50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2',
                        isCurrent
                          ? 'bg-go/10 text-go border border-go/25 cursor-default'
                          : tier.popular
                            ? 'bg-go hover:bg-go-lit text-white shadow-seam disabled:opacity-40'
                            : 'bg-well hover:bg-inset text-ink border border-seam disabled:opacity-40'
                      )}
                    >
                      {busy && <Spinner className="w-4 h-4 animate-spin" aria-hidden />}
                      {isCurrent ? 'Current plan' : busy ? 'Redirecting…' : tier.cta}
                    </button>
                  </article>
                </div>
              )
            })}
          </div>

          {/* ── Assurance strip ── */}
          <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-3 text-caption text-ink-tertiary">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" aria-hidden /> Secure checkout via Razorpay</span>
            <span className="hidden sm:inline text-seam-strong" aria-hidden>·</span>
            <span className="inline-flex items-center gap-1.5"><Receipt className="w-3.5 h-3.5" aria-hidden /> GST invoices on every payment</span>
            <span className="hidden sm:inline text-seam-strong" aria-hidden>·</span>
            <span>Questions? <a href="/support" className="underline underline-offset-2 text-ink-secondary hover:text-ink">Talk to support</a></span>
          </div>
        </>
      )}

      {/* ── Cancel-plan confirmation (designed modal, not window.confirm) ── */}
      <Modal open={showCancelConfirm} onClose={() => !cancelling && setShowCancelConfirm(false)} title="Cancel plan" maxWidth="max-w-md">
        <div className="p-5">
          <p className="text-body-sm text-ink-secondary leading-relaxed">
            Cancel the <span className="font-semibold text-ink capitalize">{subscription?.tier?.replace('_', ' ')}</span> plan
            for <span className="font-semibold text-ink">{activeTeamName}</span>? Your team keeps
            access until the end of the billing period.
          </p>
          <div className="flex justify-end gap-2.5 mt-5">
            <button onClick={() => setShowCancelConfirm(false)} disabled={cancelling} className="btn-secondary">
              Keep plan
            </button>
            <button onClick={handleCancel} disabled={cancelling} aria-busy={cancelling} className="btn-danger inline-flex items-center gap-2">
              {cancelling && <Spinner className="w-3.5 h-3.5 animate-spin" aria-hidden />}
              {cancelling ? 'Cancelling…' : 'Yes, cancel'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
