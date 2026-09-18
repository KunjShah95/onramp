/**
 * Plan intent — carries a paid-plan choice across the public → auth → billing
 * funnel so every entry point lands in the single Razorpay checkout flow.
 *
 * Flow: /pricing (CTA appends ?plan=) → /register or /login (preserved) →
 * /billing?plan= (tier highlighted + scrolled into view) → createCheckoutSession
 * → Razorpay → back to /billing?checkout=success.
 */

/** Tier ids that may be carried as intent. Must stay in sync with BillingPage tiers. */
export const PLAN_INTENT_IDS = ['free', 'usage_based', 'startup', 'professional', 'enterprise'] as const
export type PlanIntent = (typeof PLAN_INTENT_IDS)[number]

/** Extract a validated ?plan= value from a URLSearchParams-like source. */
export function getPlanIntent(params: URLSearchParams): PlanIntent | null {
  const raw = params.get('plan')
  return raw && (PLAN_INTENT_IDS as readonly string[]).includes(raw) ? (raw as PlanIntent) : null
}

/** Billing URL that preserves the intent, e.g. `/billing?plan=professional`. */
export function billingUrlWithPlan(plan: PlanIntent | null): string {
  return plan ? `/billing?plan=${plan}` : '/billing'
}
