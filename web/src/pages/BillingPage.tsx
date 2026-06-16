import { useState } from 'react'
import {
  createSubscription,
  getSubscription,
  cancelSubscription,
} from '../lib/api'
import { cn } from '../lib/utils'

const TIER_FEATURES: Record<string, { price: number; features: string[] }> = {
  free: { price: 0, features: ['1 team member', '1 repository', '50 credits/month', 'Community support'] },
  startup: { price: 49, features: ['5 team members', '10 repositories', '5,000 credits/month', 'Email support'] },
  professional: { price: 299, features: ['20 team members', '50 repositories', '50,000 credits/month', 'Priority support'] },
  enterprise: { price: 0, features: ['Unlimited members', 'Unlimited repos', 'Unlimited credits', 'Dedicated support', 'SSO', 'SLA'] },
}

export default function BillingPage() {
  const [teamId, setTeamId] = useState('')
  const [subscription, setSubscription] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedTier, setSelectedTier] = useState<string | null>(null)

  async function fetchSubscription() {
    if (!teamId.trim()) return
    setLoading(true)
    setError('')
    try {
      const data = await getSubscription(teamId.trim())
      setSubscription(data)
      setSelectedTier(data.tier)
    } catch {
      setSubscription(null)
    }
    setLoading(false)
  }

  async function handleCreateSubscription(tier: string) {
    if (!teamId.trim()) return
    try {
      await createSubscription({
        team_id: teamId.trim(),
        tier,
        billing_cycle: 'monthly',
      })
      setSelectedTier(tier)
      await fetchSubscription()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create subscription')
    }
  }

  async function handleCancel() {
    if (!teamId.trim() || !subscription) return
    try {
      await cancelSubscription(teamId.trim())
      setSubscription(null)
      setSelectedTier(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to cancel')
    }
  }

  return (
    <div className="animate-in max-w-6xl">
      <h1 className="font-display text-2xl font-bold text-text-primary mb-1">Billing & Plans</h1>
      <p className="text-text-secondary text-sm mb-6">Manage your subscription and view pricing</p>

      {error && (
        <div className="bg-red-500/10 text-red-400 rounded-card p-4 mb-6 text-sm border border-red-500/20">{error}</div>
      )}

      <div className="flex gap-3 mb-8">
        <input
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          placeholder="Team ID"
          className="input flex-1"
        />
        <button onClick={fetchSubscription} disabled={loading || !teamId.trim()} className="btn disabled:opacity-50">
          {loading ? 'Loading...' : 'Load Subscription'}
        </button>
        {subscription && (
          <button onClick={handleCancel} className="btn !bg-red-500/20 !text-red-400 hover:!bg-red-500/30">
            Cancel
          </button>
        )}
      </div>

      {subscription && (
        <div className="card mb-8">
          <h2 className="font-display text-base font-semibold text-text-primary mb-4">Current Plan</h2>
          <div className="flex items-center gap-4">
            <span className="badge badge-success capitalize text-sm px-4 py-1.5">{subscription.tier}</span>
            <span className="text-sm text-text-secondary">${subscription.price}/mo</span>
            <span className="text-sm text-text-muted">{subscription.billing_cycle}</span>
            <span className="text-xs text-text-muted ml-auto">Status: {subscription.status}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Object.entries(TIER_FEATURES).map(([tier, info]) => (
          <div
            key={tier}
            className={cn(
              'card flex flex-col transition-all duration-200',
              selectedTier === tier && 'ring-2 ring-accent-from',
              tier === 'professional' && 'scale-105 md:scale-105'
            )}
          >
            {tier === 'professional' && (
              <span className="text-[10px] uppercase tracking-widest text-accent-from font-bold mb-2">Popular</span>
            )}
            <h3 className="font-display text-lg font-bold text-text-primary capitalize">{tier}</h3>
            <div className="mt-2 mb-4">
              {info.price > 0 ? (
                <span className="text-2xl font-bold text-text-primary">${info.price}<span className="text-sm text-text-muted font-normal">/mo</span></span>
              ) : (
                <span className="text-lg text-text-muted">{tier === 'enterprise' ? 'Custom' : 'Free'}</span>
              )}
            </div>
            <ul className="space-y-2 text-xs text-text-secondary flex-1">
              {info.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="text-accent-from mt-0.5">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => handleCreateSubscription(tier)}
              disabled={!teamId.trim() || selectedTier === tier}
              className={cn(
                'btn mt-4 w-full text-xs disabled:opacity-50',
                selectedTier === tier ? '!bg-accent-from/10 !text-accent-from' : ''
              )}
            >
              {selectedTier === tier ? 'Current Plan' : tier === 'enterprise' ? 'Contact Sales' : `Choose ${tier.charAt(0).toUpperCase() + tier.slice(1)}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
