/*
 * API Cost Tracking — shared panel for leadership seats (CEO/CTO, senior devs).
 *
 * Surfaces the org's monthly credit spend plus every API key's budget state:
 * credits used vs. cost limit, with a progress bar and a warning chip when a
 * key has hit its limit. Reads the same live endpoints as the Settings and
 * Developer Portal key sections (listApiKeys + getUsageSummary).
 */
import { useEffect, useState } from 'react'
import { Key, Spinner, Warning } from '@phosphor-icons/react'
import { useAuth } from '../../context/AuthContext'
import { listApiKeys, getUsageSummary, getProviderUsage, type ApiKey, type UsageSummary, type ProviderUsage } from '../../lib/api'
import { cn, formatKeyDate } from '../../lib/utils'

/** Compact USD formatting — matches the Admin dashboard's cost figures. */
function fmtUsd(n: number): string {
  return n >= 100 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`
}

export default function ApiCostTracking({ className }: { className?: string }) {
  const { activeTeamId } = useAuth()
  const [keys, setKeys] = useState<ApiKey[]>([])
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
      const [keyResult, usageResult, providerResult] = await Promise.allSettled([
        listApiKeys(activeTeamId),
        getUsageSummary(activeTeamId),
        getProviderUsage(activeTeamId, 'month'),
      ])
      if (cancelled) return
      if (keyResult.status === 'fulfilled') {
        setKeys(keyResult.value.keys ?? [])
      } else {
        setError((keyResult.reason as Error)?.message || 'Failed to load API keys')
      }
      if (usageResult.status === 'fulfilled') setUsage(usageResult.value)
      if (providerResult.status === 'fulfilled') setProviderUsage(providerResult.value)
    }
    load()
    return () => { cancelled = true }
  }, [activeTeamId])

  const totalCredits = usage?.total_credits ?? 0
  const activeCount = keys.filter((k) => k.is_active).length
  const overBudget = keys.filter((k) => {
    const limit = k.credit_limit ?? 0
    const used = k.credits_used ?? k.usage_count ?? 0
    return k.is_active && limit > 0 && used >= limit
  }).length

  return (
    <div className={cn('space-y-4', className)}>
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Spinner className="w-5 h-5 text-go animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-6 text-text-tertiary text-sm">
          <p>{error}</p>
          <p className="text-xs mt-1">Tracking will appear once the server connects.</p>
        </div>
      ) : (
        <>
          {/* Monthly summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-bg-secondary border border-border rounded-lg p-3">
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider font-medium mb-1">Credits Used</p>
              <p className="text-xl font-bold text-go tabular-nums leading-none">{totalCredits.toLocaleString()}</p>
              <p className="text-[10px] text-text-tertiary mt-1">this month · across all keys</p>
            </div>
            <div className="bg-bg-secondary border border-border rounded-lg p-3">
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider font-medium mb-1">API Keys</p>
              <p className="text-xl font-bold text-text-primary tabular-nums leading-none">
                {activeCount}<span className="text-sm text-text-tertiary">/{keys.length}</span>
              </p>
              <p className="text-[10px] text-text-tertiary mt-1">
                active{overBudget > 0 && <span className="text-error"> · {overBudget} over budget</span>}
              </p>
            </div>
          </div>

          {/* Provider attribution — free-first routing savings */}
          {providerUsage && providerUsage.tracked_requests === 0 && (
            <p className="text-center py-3 text-text-tertiary text-xs">No provider attribution yet — appears once requests are routed.</p>
          )}
          {providerUsage && providerUsage.tracked_requests > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] text-text-tertiary uppercase tracking-wider font-medium">Provider Attribution</span>
                <span className="text-[10px] font-mono text-text-tertiary/50">FREE-FIRST ROUTING</span>
              </div>

              {/* Free vs paid split */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-bg-tertiary overflow-hidden flex">
                  <div className="h-full bg-go transition-all" style={{ width: `${providerUsage.free_pct}%` }} />
                  <div className="h-full bg-info transition-all" style={{ width: `${Math.max(0, 100 - providerUsage.free_pct)}%` }} />
                </div>
                <span className="text-caption font-mono text-text-tertiary tabular-nums shrink-0">
                  {Math.round(providerUsage.free_pct)}% free
                </span>
              </div>

              {/* Spend vs savings */}
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="bg-bg-secondary border border-border rounded-lg p-3">
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider font-medium mb-1">Spend</p>
                  <p className="text-lg font-bold text-text-primary tabular-nums leading-none">{fmtUsd(providerUsage.total_cost_usd)}</p>
                  <p className="text-[10px] text-text-tertiary mt-1">{providerUsage.tracked_requests} tracked req</p>
                </div>
                <div className="bg-bg-secondary border border-border rounded-lg p-3">
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider font-medium mb-1">Cost Avoided</p>
                  <p className="text-lg font-bold text-go tabular-nums leading-none">{fmtUsd(providerUsage.total_cost_avoided_usd)}</p>
                  <p className="text-[10px] text-text-tertiary mt-1">vs paid baseline model</p>
                </div>
              </div>

              {/* Per-provider rows */}
              <div className="space-y-1.5 mt-3">
                {Object.entries(providerUsage.provider_costs || {})
                  .sort((a, b) => b[1].requests - a[1].requests)
                  .map(([provider, pc]) => (
                    <div key={provider} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-bg-secondary/60 border border-border">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="capitalize text-body-xs text-text-primary font-medium truncate">{provider}</span>
                        <span className="text-caption text-text-tertiary font-code shrink-0">{pc.requests} req</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 font-mono text-[10px]">
                        {pc.cost_usd > 0 && (
                          <span className="text-text-tertiary tabular-nums">{fmtUsd(pc.cost_usd)}</span>
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

          {/* Per-key budget state */}
          {keys.length === 0 ? (
            <p className="text-center py-6 text-text-tertiary text-sm">
              No API keys yet — create one in Settings or the Developer Portal.
            </p>
          ) : (
            <div className="space-y-2">
              {keys.map((key) => {
                const limit = key.credit_limit ?? 0
                const used = key.credits_used ?? key.usage_count ?? 0
                const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
                const exhausted = limit > 0 && used >= limit
                return (
                  <div
                    key={key.key_id}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-bg-secondary border border-border"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <Key className={cn('w-3.5 h-3.5 shrink-0', exhausted ? 'text-error' : 'text-text-tertiary')} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-body-xs text-text-primary font-medium truncate">{key.name || 'Unnamed Key'}</p>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono uppercase bg-go/10 text-go border border-go/20">
                            {key.tier}
                          </span>
                          {!key.is_active && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-bg-tertiary text-text-tertiary border border-border">
                              revoked
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="h-1.5 flex-1 max-w-[160px] rounded-full bg-bg-tertiary overflow-hidden">
                            <div
                              className={cn('h-full rounded-full transition-all', exhausted ? 'bg-error' : 'bg-go')}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className={cn('text-caption font-mono tabular-nums', exhausted ? 'text-error' : 'text-text-tertiary')}>
                            {key.credit_limit != null ? `${used}/${key.credit_limit} credits` : `${used} credits`}
                          </span>
                        </div>
                        <p className="font-mono text-[10px] text-text-tertiary/60 mt-1">
                          Created {formatKeyDate(key.created_at)}
                          {key.last_used_at && <> · last used {formatKeyDate(key.last_used_at)}</>}
                          {key.expires_at && <> · expires {formatKeyDate(key.expires_at)}</>}
                        </p>
                      </div>
                    </div>
                    {exhausted && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-error/10 text-error border border-error/20 shrink-0 flex items-center gap-1">
                        <Warning size={10} weight="fill" /> Limit reached
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
