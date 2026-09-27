/* Public plan catalogue. Mirrors TIER_PRICING in
 * backend/app/services/billing_service.py and the tiers on BillingPage, so the
 * price a visitor reads here is the price checkout charges. Change them
 * together. Prices are INR; yearly is the backend's price_yearly. */

export interface Plan {
  id: 'free' | 'startup' | 'professional' | 'enterprise'
  name: string
  monthly: number | null
  yearly: number | null
  members: string
  pitch: string
  features: string[]
  cta: string
  href: string
  featured?: boolean
  note?: string
}

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    monthly: 0,
    yearly: 0,
    members: '1 member',
    pitch: 'Map your own repo and see if it clicks.',
    features: ['1 repository', '50 AI credits a month', 'Community support'],
    cta: 'Start free',
    href: '/register',
  },
  {
    id: 'startup',
    name: 'Startup',
    monthly: 999,
    yearly: 9999,
    members: 'Up to 5 members',
    pitch: 'For a small team hiring its next engineers.',
    features: ['10 repositories', '5,000 AI credits a month', 'Email support'],
    cta: 'Choose Startup',
    href: '/register',
  },
  {
    id: 'professional',
    name: 'Professional',
    monthly: 2999,
    yearly: 29999,
    members: 'Up to 20 members',
    pitch: 'For leads who need to see every ramp, not guess at it.',
    features: ['50 repositories', '50,000 AI credits a month', 'Priority support'],
    cta: 'Start 14-day trial',
    href: '/register',
    featured: true,
    note: '14-day trial on your first subscription',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthly: null,
    yearly: null,
    members: 'Unlimited members',
    pitch: 'For orgs with procurement, security review and scale.',
    features: ['Unlimited repositories and credits', 'Dedicated support', 'SSO and SLA, scoped with you'],
    cta: 'Talk to us',
    href: '/contact',
  },
]

export const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`

/** Every plan gets the whole product. Tiers differ only by team size and volume. */
export const INCLUDED_EVERYWHERE = [
  'Live architecture map',
  'Ask, answered from your code',
  'Learning paths with quizzes',
  'First issues sized for a new hire',
  'Task and review queue',
  'Ramp dashboard for leads',
  'Slack, Linear, Jira, GitLab',
  'Tenant-isolated data, encrypted tokens',
]
