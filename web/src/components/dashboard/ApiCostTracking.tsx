/*
 * API Cost Tracking — shared panel for leadership seats (CEO/CTO, senior devs).
 *
 * Surfaces the org's monthly credit spend plus every API key's budget state:
 * credits used vs. cost limit, with a progress bar and a warning chip when a
 * key has hit its limit. Reads the same live endpoints as the Settings and
 * Developer Portal key sections (listApiKeys + getUsageSummary).
 */
import { useEffect, useState } from 'react'
import { Spinner } from '@phosphor-icons/react'
import { useAuth } from '../../context/AuthContext'
import { getUsageSummary, getProviderUsage, type UsageSummary, type ProviderUsage } from '../../lib/api'
import { cn } from '../../lib/utils'
import { EmptyRow } from '../ui/empty-state'

/** Compact USD formatting — matches the Admin dashboard's cost figures. */
function fmtUsd(n: number): string {
  return n >= 100 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`
}

export default function ApiCostTracking({ className }: { className?: string }) {
  const { activeTeamId } = useAuth()
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [providerUsage, setProviderUsage] = useState<ProviderUsage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!activeTeamId) {
        setLoading(false)
        return
      }
      setLoading(true); setError('')
      // allSettled: a failure in one source (e.g. provider attribution) must
      // never take down the per-key budgets — each loads independently.
      const [usageResult, providerResult] = await Promise.allSettled([
        getUsageSummary(activeTeamId),
        getProviderUsage(activeTeamId, 'month'),
      ])
      if (cancelled) return
      if (usageResult.status === 'fulfilled') setUsage(usageResult.value)
      else setError((usageResult.reason as Error)?.message || 'Failed to load usage')
      if (providerResult.status === 'fulfilled') setProviderUsage(providerResult.value)
    }
    load()
    return () => { cancelled = true }
  }, [activeTeamId])

  const totalCredits = usage?.total_credits ?? 0

  return (
    <div className={cn('space-y-4', className)}>
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Spinner className="w-5 h-5 text-go animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-6 text-ink-tertiary text-sm">
          <p>{error}</p>
          <p className="text-xs mt-1">Tracking will appear once the server connects.</p>
        </div>
      ) : (
        <>
          {/* Monthly summary */}
          <div className="bg-panel border border-seam rounded-lg p-3">
            <p className="text-[10px] text-ink-tertiary uppercase tracking-wider font-medium mb-1">Credits Used</p>
            <p className="text-xl font-bold text-go tabular-nums leading-none">{totalCredits.toLocaleString()}</p>
            <p className="text-[10px] text-ink-tertiary mt-1">this month</p>
          </div>

          {/* Provider attribution — free-first routing savings */}
          {providerUsage && providerUsage.tracked_requests === 0 && (
            <EmptyRow label="No provider attribution yet — appears once requests are routed." />
          )}
          {providerUsage && providerUsage.tracked_requests > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] text-ink-tertiary uppercase tracking-wider font-medium">Provider Attribution</span>
                <span className="text-[10px] font-mono text-ink-tertiary/50">FREE-FIRST ROUTING</span>
              </div>

              {/* Free vs paid split */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-well overflow-hidden flex">
                  <div className="h-full bg-go transition-all" style={{ width: `${providerUsage.free_pct}%` }} />
                  <div className="h-full bg-mission transition-all" style={{ width: `${Math.max(0, 100 - providerUsage.free_pct)}%` }} />
                </div>
                <span className="text-caption font-mono text-ink-tertiary tabular-nums shrink-0">
                  {Math.round(providerUsage.free_pct)}% free
                </span>
              </div>

              {/* Spend vs savings */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div className="bg-panel border border-seam rounded-lg p-3">
                  <p className="text-[10px] text-ink-tertiary uppercase tracking-wider font-medium mb-1">Spend</p>
                  <p className="text-lg font-bold text-ink tabular-nums leading-none">{fmtUsd(providerUsage.total_cost_usd)}</p>
                  <p className="text-[10px] text-ink-tertiary mt-1">{providerUsage.tracked_requests} tracked req</p>
                </div>
                <div className="bg-panel border border-seam rounded-lg p-3">
                  <p className="text-[10px] text-ink-tertiary uppercase tracking-wider font-medium mb-1">Cost Avoided</p>
                  <p className="text-lg font-bold text-go tabular-nums leading-none">{fmtUsd(providerUsage.total_cost_avoided_usd)}</p>
                  <p className="text-[10px] text-ink-tertiary mt-1">vs paid baseline model</p>
                </div>
              </div>

              {/* Per-provider rows */}
              <div className="space-y-1.5 mt-3">
                {Object.entries(providerUsage.provider_costs || {})
                  .sort((a, b) => b[1].requests - a[1].requests)
                  .map(([provider, pc]) => (
                    <div key={provider} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-panel/60 border border-seam">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="capitalize text-body-xs text-ink font-medium truncate">{provider}</span>
                        <span className="text-caption text-ink-tertiary font-code shrink-0">{pc.requests} req</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 font-mono text-[10px]">
                        {pc.cost_usd > 0 && (
                          <span className="text-ink-tertiary tabular-nums">{fmtUsd(pc.cost_usd)}</span>
                        )}
                        {pc.cost_avoided_usd > 0 && (
                          <span className="text-go tabular-nums">saved {fmtUsd(pc.cost_avoided_usd)}</span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

        </>
      )}
    </div>
  )
}
