import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '../../lib/utils'
import {
  fetchAgentBenchmark,
  recordAgentBenchmarkSnapshot,
  type AgentBenchmarkResponse,
} from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { isLeaderRole } from './RampPanel'

const fmtUsd = (v: number) => `$${Math.round(v).toLocaleString()}`
const fmtInr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`

/** The flat workspace price, with the live ₹ → $ conversion visible. */
const fmtOnrampPrice = (usd: number, inr?: number | null) =>
  inr != null && inr > 0 ? `${fmtInr(inr)} ≈ ${fmtUsd(usd)}/mo` : `${fmtUsd(usd)}/mo`

/** Where the Onramp price came from — live billing beats the $99 default. */
const PRICE_SOURCE_LABEL: Record<string, string> = {
  subscription: 'live subscription',
  team: 'team-calibrated',
  platform: 'platform default',
}

/**
 * Agents vs Onramp · Terminal CLIs — the competitive cost comparison.
 *
 * For the team's stack (React when the repos are JS/TS): what each terminal
 * coding agent costs per month if *every* developer runs it (per-dev
 * subscription × dev count) vs Onramp's flat per-workspace price — the
 * team's live subscription amount (₹ → $, visible) when one exists, else
 * the $99/mo platform default. A leader can record snapshots so the
 * comparison tracks over time. Catalog + pricing live in
 * agent_benchmark_service.py (Aug 2026).
 */
export default function AgentBenchmarkPanel() {
  const { role } = useAuth()
  const canEdit = isLeaderRole(role)
  const queryClient = useQueryClient()

  const { data } = useQuery<AgentBenchmarkResponse>({
    queryKey: ['agentBenchmark'],
    queryFn: () => fetchAgentBenchmark(),
    staleTime: 60_000,
  })

  const snapshotMutation = useMutation({
    mutationFn: () => recordAgentBenchmarkSnapshot(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agentBenchmark'] })
    },
  })

  if (!data) return null

  const { current, history } = data
  const rows = current.agents
  const cheapest = rows[0]
  const isReact = current.team_stack === 'react' || current.team_stack === 'mixed'

  return (
    <section className="rounded-tile bg-base border border-seam p-4 shadow-seam">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-lg text-go">terminal</span>
          <h2 className="text-body-sm font-semibold text-ink">Agents vs Onramp · Terminal CLIs</h2>
          <span className={cn(
            'px-1.5 py-0.5 rounded-md text-caption font-medium',
            isReact ? 'bg-mission/10 text-mission' : 'bg-well text-ink-muted'
          )}>
            {current.team_stack === 'unknown' ? 'no repos yet' : `${current.team_stack} codebase`}
          </span>
        </div>
        {canEdit && (
          <button
            onClick={() => snapshotMutation.mutate()}
            disabled={snapshotMutation.isPending}
            className="text-caption text-ink-muted hover:text-ink transition-colors shrink-0"
          >
            {snapshotMutation.isPending ? 'Recording…' : 'Record snapshot'}
          </button>
        )}
      </div>

      <p className="text-caption text-ink-muted mb-3 font-code">
        {current.dev_count} dev{current.dev_count === 1 ? '' : 's'} · Onramp {fmtOnrampPrice(current.onramp_monthly_usd, current.onramp_price_inr)} flat
        {' '}·{' '}
        <span className={cn(
          current.price_source === 'subscription' ? 'text-go' : current.price_source === 'team' ? 'text-mission' : 'text-ink-muted'
        )}>
          {PRICE_SOURCE_LABEL[current.price_source ?? 'platform']}
        </span>
        {cheapest && (
          <> · cheapest: <span className="text-ink readout">{cheapest.name} {cheapest.plan}</span> at {fmtUsd(cheapest.team_monthly_usd)}/mo</>
        )}
      </p>

      <div className="space-y-1.5">
        {rows.map((a) => {
          const onrampCheaper = a.vs_onramp_usd >= 0
          return (
            <div key={a.slug} className="flex items-center gap-3 py-1.5 border-b border-seam/50 last:border-0">
              <div className="w-44 shrink-0 min-w-0">
                <div className="text-body-xs text-ink font-medium truncate">{a.name}</div>
                <div className="text-caption text-ink-muted truncate">{a.plan}</div>
              </div>
              <div className="flex-1 h-1.5 rounded-tile bg-well overflow-hidden border border-seam">
                <div
                  className={cn('h-full', a.team_monthly_usd === 0 ? 'bg-go' : onrampCheaper ? 'bg-go' : 'bg-caution')}
                  style={{ width: `${Math.min((a.team_monthly_usd / Math.max(current.onramp_monthly_usd, 1)) * 100, 100)}%` }}
                />
              </div>
              <span className="w-16 shrink-0 text-right readout text-caption tabular-nums text-ink">
                {fmtUsd(a.team_monthly_usd)}
              </span>
              <span className={cn(
                'w-32 shrink-0 text-right text-caption tabular-nums',
                onrampCheaper ? 'text-go' : 'text-caution'
              )}>
                {a.vs_onramp_usd === 0 ? 'parity' : onrampCheaper ? `Onramp saves ${fmtUsd(a.vs_onramp_usd)}` : `${fmtUsd(-a.vs_onramp_usd)} cheaper`}
              </span>
            </div>
          )
        })}
      </div>

      {history.length > 0 && (
        <div className="mt-3 pt-3 border-t border-seam space-y-1">
          <div className="overline text-ink-muted/60 text-[10px]">Snapshot history</div>
          {history.slice(0, 3).map((s) => {
            const cheapestRow = [...s.agents].sort((x, y) => x.team_monthly_usd - y.team_monthly_usd)[0]
            return (
              <div key={s.generated_at} className="flex items-center justify-between text-caption text-ink-muted font-code">
                <span>{new Date(s.generated_at).toLocaleDateString()} · {s.dev_count} devs</span>
                <span>
                  Onramp {fmtOnrampPrice(s.onramp_monthly_usd, s.onramp_price_inr)} ({PRICE_SOURCE_LABEL[s.price_source ?? 'platform']}) · cheapest {cheapestRow ? `${cheapestRow.name} ${cheapestRow.plan}` : '—'} {fmtUsd(cheapestRow?.team_monthly_usd ?? 0)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
