import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '../../lib/utils'
import {
  fetchEfficiencyBenchmark,
  fetchHeadcountScenarioHistory,
  recordHeadcountScenario,
  type EfficiencyBenchmark,
  type HeadcountScenarioRecord,
} from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { isLeaderRole } from './RampPanel'

const fmtTokens = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : String(v)
const fmtUsd = (v: number) => `$${Math.round(v).toLocaleString()}`

/**
 * The efficiency story customers hear — and the numbers that back it.
 *
 * When the codebase changes, a coding agent re-reads the WHOLE repo into
 * context and burns tokens on it. Onramp re-embeds only the changed files
 * (~10%) and merges the delta into its persisted graph — and the free-first
 * router serves most of that (and the team's real traffic) on free keys.
 * The faster the codebase churns, the wider the gap.
 *
 * Honest label (from the backend): incremental changed-files-only refresh
 * is the target architecture the numbers assume — today a re-index
 * re-embeds the full repo.
 */
export default function EfficiencyBenchmarkPanel() {
  const { role } = useAuth()
  const canEdit = isLeaderRole(role)
  const queryClient = useQueryClient()
  const [changes, setChanges] = useState<number | null>(null)
  const [headcount, setHeadcount] = useState<number | null>(null)
  const [products, setProducts] = useState<number | null>(null)
  const [perDev, setPerDev] = useState<boolean>(true)

  const { data } = useQuery<EfficiencyBenchmark>({
    queryKey: ['efficiencyBenchmark', changes, headcount, products, perDev],
    queryFn: () => fetchEfficiencyBenchmark({
      ...(changes ? { changesPerMonth: changes } : {}),
      ...(headcount ? { devCount: headcount } : {}),
      ...(products ? { productCount: products } : {}),
      perDevTokenBurn: perDev,
    }),
    staleTime: 60_000,
  })
  const { data: history } = useQuery<{ history: HeadcountScenarioRecord[] }>({
    queryKey: ['headcountHistory'],
    queryFn: () => fetchHeadcountScenarioHistory(),
    staleTime: 60_000,
  })

  const recordMutation = useMutation({
    mutationFn: (devCount: number) => recordHeadcountScenario(devCount, perDev, products ?? 1),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['headcountHistory'] })
    },
  })

  if (!data) return null

  const { agent, onramp, assumptions } = data
  const freePct = onramp.measured.free_pct
  const sliderValue = changes ?? assumptions.changes_per_month
  const perChangeSaved = agent.tokens_per_change - onramp.graph_refresh.tokens_per_change
  const headcountValue = headcount ?? data.dev_count
  const hiring = headcountValue !== data.dev_count
  const perDevSub = agent.subscription_monthly_usd > 0
    ? agent.subscription_monthly_usd / data.simulated_dev_count
    : 0

  return (
    <section className="rounded-tile bg-base border border-seam p-4 shadow-seam">
      {/* Headline pitch */}
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-lg text-go">bolt</span>
            <h2 className="text-body-sm font-semibold text-ink">
              Codebase changes fast? That's where we win.
            </h2>
            <span className="px-1.5 py-0.5 rounded-md bg-well text-ink-muted text-caption font-medium">
              {data.codebase_size_note}
            </span>
          </div>
          <p className="text-caption text-ink-muted mt-1 max-w-2xl">
            Coding agents re-read the whole repo on every change. We re-embed only the changed
            files and update the graph — and serve most of it on free keys.
          </p>
        </div>
        <span className={cn(
          'px-1.5 py-0.5 rounded-md text-caption font-medium shrink-0',
          freePct >= 50 ? 'bg-go/10 text-go' : 'bg-mission/10 text-mission'
        )}>
          {freePct}% of requests on free keys
        </span>
      </div>

      {/* What happens when the codebase changes */}
      <div className="grid md:grid-cols-2 gap-3 mb-3">
        <div className="rounded-tile border border-abort/30 bg-abort/[0.03] p-3">
          <div className="text-caption font-medium text-abort mb-2 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base">refresh</span>
            Coding agent · when the codebase changes
          </div>
          <ol className="space-y-1.5 text-caption text-ink-secondary list-none">
            <li className="flex gap-2">
              <span className="material-symbols-outlined text-sm text-ink-muted shrink-0 mt-px">1</span>
              <span><span className="text-ink font-medium">Re-reads the whole repo</span> — every file back into context</span>
            </li>
            <li className="flex gap-2">
              <span className="material-symbols-outlined text-sm text-ink-muted shrink-0 mt-px">2</span>
              <span>Burns <span className="text-abort readout tabular-nums">{fmtTokens(agent.tokens_per_dev_per_change)}</span> tokens per change <span className="text-ink-muted">· per developer</span></span>
            </li>
            <li className="flex gap-2">
              <span className="material-symbols-outlined text-sm text-ink-muted shrink-0 mt-px">3</span>
              <span>× {data.simulated_dev_count} devs = <span className="text-abort tabular-nums">{fmtTokens(agent.tokens_per_change)}</span> per change — every dev's agent holds its own copy</span>
            </li>
            <li className="flex gap-2">
              <span className="material-symbols-outlined text-sm text-ink-muted shrink-0 mt-px">4</span>
              <span>Re-does it on every session, every PR, every sync — all on paid keys</span>
            </li>
          </ol>
          <div className="mt-2 pt-2 border-t border-abort/20 font-code text-caption">
            <span className="text-abort">{fmtTokens(agent.monthly_tokens_burned)}</span>
            <span className="text-ink-muted"> tokens/mo ({fmtTokens(agent.tokens_per_change)} × {assumptions.changes_per_month} changes)</span>
          </div>
        </div>

        <div className="rounded-tile border border-go/30 bg-go/[0.03] p-3">
          <div className="text-caption font-medium text-go mb-2 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base">account_tree</span>
            Onramp · when the codebase changes
          </div>
          <ol className="space-y-1.5 text-caption text-ink-secondary list-none">
            <li className="flex gap-2">
              <span className="material-symbols-outlined text-sm text-ink-muted shrink-0 mt-px">1</span>
              <span>Detects the change, <span className="text-ink font-medium">re-embeds only the changed files</span> (~{Math.round(assumptions.change_file_ratio * 100)}% of the repo)</span>
            </li>
            <li className="flex gap-2">
              <span className="material-symbols-outlined text-sm text-ink-muted shrink-0 mt-px">2</span>
              <span>Merges the delta into the <span className="text-ink font-medium">persisted graph</span> — the rest is untouched</span>
            </li>
            <li className="flex gap-2">
              <span className="material-symbols-outlined text-sm text-ink-muted shrink-0 mt-px">3</span>
              <span>Refresh rides <span className="text-go font-medium">free keys first</span> ({freePct}% of your requests are already free)</span>
            </li>
          </ol>
          <div className="mt-2 pt-2 border-t border-go/20 font-code text-caption">
            <span className="text-go">{fmtTokens(onramp.graph_refresh.tokens_per_change)}</span>
            <span className="text-ink-muted"> × {assumptions.changes_per_month} = </span>
            <span className="text-go">{fmtTokens(onramp.graph_refresh.tokens_monthly)}</span>
            <span className="text-ink-muted"> tokens/mo</span>
          </div>
        </div>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="rounded-tile bg-well/40 border border-seam p-2.5">
          <div className="overline text-ink-muted/60 text-[10px]">Per change · tokens saved</div>
          <div className="text-lg font-semibold text-ink font-display tabular-nums">
            {fmtTokens(perChangeSaved)} <span className="text-caption text-ink-muted font-normal">per change</span>
          </div>
          <p className="text-caption text-ink-muted mt-0.5 font-code">
            agent {fmtTokens(agent.tokens_per_change)} ({data.simulated_dev_count} devs) vs Onramp {fmtTokens(onramp.graph_refresh.tokens_per_change)}
          </p>
        </div>
        <div className="rounded-tile bg-well/40 border border-seam p-2.5">
          <div className="overline text-ink-muted/60 text-[10px]">Dollars · per month</div>
          <div className="text-lg font-semibold text-ink font-display tabular-nums">
            ~{fmtUsd(data.monthly_savings_usd)}{' '}
            <span className="text-caption text-ink-muted font-normal">saved vs {agent.name} {agent.plan}</span>
          </div>
          <p className="text-caption text-ink-muted mt-0.5 font-code">
            agent {fmtUsd(agent.monthly_usd)} (tokens {fmtUsd(agent.token_cost_usd)} + subs {fmtUsd(agent.subscription_monthly_usd)}) vs Onramp {fmtUsd(onramp.monthly_usd)}
          </p>
        </div>
      </div>

      {/* Hiring dial — every engineer scales the agent side, Onramp stays flat */}
      <div className="rounded-tile border border-seam p-3 mb-3">
        <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
          <div>
            <div className="text-caption font-medium text-ink">
              Hire more devs?{' '}
              <span className="text-ink-muted font-normal">
                agents charge per seat — Onramp doesn't
              </span>
            </div>
            <p className="text-caption text-ink-muted mt-0.5 font-code">
              at {headcountValue} devs · agent subs {fmtUsd(agent.subscription_monthly_usd)}/mo
              {' '}({fmtUsd(perDevSub)}/dev) · Onramp stays {fmtUsd(onramp.monthly_usd)}/mo
            </p>
          </div>
          {canEdit && (
            <button
              onClick={() => recordMutation.mutate(headcountValue)}
              disabled={recordMutation.isPending}
              className="text-caption text-ink-muted hover:text-ink transition-colors shrink-0"
            >
              {recordMutation.isPending ? 'Recording…' : 'Record scenario'}
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 text-caption text-ink-muted">
          <span className="shrink-0">Devs ({data.dev_count} now)</span>
          <input
            type="range"
            min={1}
            max={50}
            value={headcountValue}
            onChange={(e) => setHeadcount(Number(e.target.value))}
            className="flex-1 accent-go"
            aria-label="Simulated developer count"
          />
          <span className="readout text-ink tabular-nums w-8 text-right">{headcountValue}</span>
        </div>
        <div className="flex items-center gap-3 mt-2 text-caption text-ink-muted">
          <span className="shrink-0">Products</span>
          <input
            type="range"
            min={1}
            max={10}
            value={products ?? 1}
            onChange={(e) => setProducts(Number(e.target.value))}
            className="flex-1 accent-go"
            aria-label="Products in the scenario"
          />
          <span className="readout text-ink tabular-nums w-8 text-right">{products ?? 1}</span>
        </div>
        <label className="flex items-center gap-2 mt-2 text-caption text-ink-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={perDev}
            onChange={(e) => setPerDev(e.target.checked)}
            className="accent-go"
            aria-label="Per-developer token burn"
          />
          <span>
            Each dev's agent holds its own codebase copy{' '}
            <span className="text-ink-muted/70">(uncheck = one shared re-read per change)</span>
          </span>
        </label>
        {hiring && (
          <p className="text-caption text-caution mt-2 font-code">
            Agent monthly cost at {headcountValue} devs: {fmtUsd(agent.monthly_usd)} (subs{' '}
            {fmtUsd(agent.subscription_monthly_usd)} + tokens {fmtUsd(agent.token_cost_usd)})
            {perDev && ` — ${fmtTokens(agent.monthly_tokens_burned)} tokens, one re-read per dev`}
            {' '}· Onramp: {fmtUsd(onramp.monthly_usd)}. Save {fmtUsd(data.monthly_savings_usd)}/mo.
          </p>
        )}
        {history && history.history.length > 0 && (
          <div className="mt-2 pt-2 border-t border-seam space-y-1">
            <div className="overline text-ink-muted/60 text-[10px]">Recorded scenarios</div>
            {history.history.slice(0, 3).map((s) => (
              <div key={s.generated_at} className="flex items-center justify-between text-caption text-ink-muted font-code">
                <span>{new Date(s.generated_at).toLocaleDateString()} · {s.simulated_dev_count} devs{s.product_count && s.product_count > 1 ? ` × ${s.product_count} products` : ''}</span>
                <span>
                  agent {fmtUsd(s.agent_monthly_usd)} vs Onramp {fmtUsd(s.onramp_monthly_usd)} ·{' '}
                  <span className="text-go">{fmtUsd(s.monthly_savings_usd)} saved</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Change-frequency dial — the faster the churn, the wider the gap */}
      <div className="flex items-center gap-3 text-caption text-ink-muted">
        <span className="shrink-0">Codebase changes / month</span>
        <input
          type="range"
          min={1}
          max={20}
          value={sliderValue}
          onChange={(e) => setChanges(Number(e.target.value))}
          className="flex-1 accent-go"
          aria-label="Codebase changes per month"
        />
        <span className="readout text-ink tabular-nums w-8 text-right">{sliderValue}</span>
      </div>

      {/* Measured vs modeled */}
      <p className="text-caption text-ink-muted/70 mt-3 font-code">
        Onramp side measured from your real 30-day usage ({fmtTokens(onramp.measured.tokens_30d)} tokens,
        {fmtUsd(onramp.measured.cost_usd_30d)} spend, {freePct}% free). {data.caveat}
      </p>
    </section>
  )
}
