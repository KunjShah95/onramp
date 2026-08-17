import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '../../lib/utils'
import {
  fetchCostModel,
  updateCostModel,
  fetchRampBenchmark,
  recordRampBenchmarkSnapshot,
  type CostModelResponse,
  type RampBenchmarkResponse,
} from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { isLeaderRole } from './RampPanel'

const fmtUsd = (v: number) => `$${Math.round(v).toLocaleString()}`
const fmtInr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`
const fmtH = (v: number) => `${Math.round(v * 100) / 100}h`

/** The flat workspace price, with the live ₹ → $ conversion visible. */
const fmtOnrampPrice = (usd: number, inr?: number | null) =>
  inr != null && inr > 0 ? `${fmtInr(inr)} ≈ ${fmtUsd(usd)}/mo` : `${fmtUsd(usd)}/mo`

/** Where the benchmark's Onramp price came from — live billing beats the default. */
const PRICE_SOURCE_LABEL: Record<string, string> = {
  subscription: 'live subscription',
  team: 'team-calibrated',
  platform: 'platform default',
}

/**
 * Cost Model · Phase 0 — the assumptions under the hood, pressure-tested.
 *
 * Shows the effective cost-model assumptions (team override → platform
 * default), the measured signals that bound them (average elapsed review
 * cycle vs. the 0.5h senior-attention assumption, stalled re-engagement
 * weeks), and the estimate's honest uncertainty band — the cost story is a
 * model, so leadership sees the range, not a false-precision point.
 *
 * Leaders can calibrate the rate, review-cycle time, and Onramp benchmark
 * price in place (PUT /ramp/cost-model) — the same dial a real team uses
 * when they say "our seniors are $115/hr and reviews take 20 minutes".
 */
export default function CostModelPanel() {
  const { role } = useAuth()
  const canEdit = isLeaderRole(role)
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [rateDraft, setRateDraft] = useState('')
  const [cycleDraft, setCycleDraft] = useState('')
  const [priceDraft, setPriceDraft] = useState('')

  const { data, isLoading } = useQuery<CostModelResponse>({
    queryKey: ['costModel'],
    queryFn: () => fetchCostModel(),
    staleTime: 60_000,
  })

  // The cost story: React-scoped when the team has React repos, else
  // team-wide — the honest label rides along either way.
  const { data: reactBench } = useQuery<RampBenchmarkResponse>({
    queryKey: ['rampBenchmark', 'react'],
    queryFn: () => fetchRampBenchmark('react'),
    staleTime: 60_000,
  })
  const { data: allBench } = useQuery<RampBenchmarkResponse>({
    queryKey: ['rampBenchmark', 'all'],
    queryFn: () => fetchRampBenchmark(),
    staleTime: 60_000,
  })
  const bench = reactBench?.current?.task_count && reactBench.current.task_count > 0 ? reactBench : allBench
  const benchStack = bench === reactBench ? 'react' : undefined

  const updateMutation = useMutation({
    mutationFn: (overrides: { senior_hourly_rate_usd?: number; review_hours_per_cycle?: number; onramp_price_usd_per_month?: number }) =>
      updateCostModel(overrides),
    onSuccess: () => {
      setEditing(false)
      queryClient.invalidateQueries({ queryKey: ['costModel'] })
    },
  })

  const snapshotMutation = useMutation({
    mutationFn: () => recordRampBenchmarkSnapshot(benchStack),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rampBenchmark'] })
    },
  })

  if (isLoading || !data) return null

  const { settings, source, measured, sensitivity } = data
  const band = sensitivity
  const fmtPct = (v: number) => `${Math.round(v * 100) / 100}`
  const openEdit = () => {
    setRateDraft(String(settings.senior_hourly_rate_usd))
    setCycleDraft(String(settings.review_hours_per_cycle))
    setPriceDraft(String(settings.onramp_price_usd_per_month))
    setEditing(true)
  }
  const save = () => {
    const overrides: { senior_hourly_rate_usd?: number; review_hours_per_cycle?: number; onramp_price_usd_per_month?: number } = {}
    const rate = Number(rateDraft)
    const cycle = Number(cycleDraft)
    const price = Number(priceDraft)
    if (Number.isFinite(rate) && rate !== settings.senior_hourly_rate_usd) overrides.senior_hourly_rate_usd = rate
    if (Number.isFinite(cycle) && cycle !== settings.review_hours_per_cycle) overrides.review_hours_per_cycle = cycle
    if (Number.isFinite(price) && price !== settings.onramp_price_usd_per_month) overrides.onramp_price_usd_per_month = price
    if (Object.keys(overrides).length > 0) updateMutation.mutate(overrides)
    else setEditing(false)
  }

  const elapsedVsAssumption =
    measured.avg_cycle_elapsed_hours != null
      ? measured.avg_cycle_elapsed_hours >= settings.review_hours_per_cycle
      : null

  return (
    <section className="rounded-tile bg-base border border-seam p-4 shadow-seam">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-lg text-go">science</span>
          <h2 className="text-body-sm font-semibold text-ink">Cost model · Phase 0</h2>
          <span className={cn(
            'px-1.5 py-0.5 rounded-md text-caption font-medium',
            source === 'team' ? 'bg-mission/10 text-mission' : 'bg-well text-ink-muted'
          )}>
            {source === 'team' ? 'team-calibrated' : 'platform default'}
          </span>
        </div>
        {canEdit && !editing && (
          <button onClick={openEdit} className="text-caption text-ink-muted hover:text-ink transition-colors">
            Calibrate
          </button>
        )}
      </div>

      {/* Assumption readouts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div className="rounded-tile bg-well/40 border border-seam p-2.5">
          <div className="text-caption text-ink-muted mb-0.5">Senior rate</div>
          <div className="readout text-body font-semibold tabular-nums text-ink">
            {fmtUsd(settings.senior_hourly_rate_usd)}<span className="text-caption text-ink-muted">/hr</span>
          </div>
        </div>
        <div className="rounded-tile bg-well/40 border border-seam p-2.5">
          <div className="text-caption text-ink-muted mb-0.5">Review cycle</div>
          <div className="readout text-body font-semibold tabular-nums text-ink">
            {fmtH(settings.review_hours_per_cycle)}
          </div>
        </div>
        <div className="rounded-tile bg-well/40 border border-seam p-2.5">
          <div className="text-caption text-ink-muted mb-0.5">Stalled re-engagement</div>
          <div className="readout text-body font-semibold tabular-nums text-ink">
            {fmtH(settings.stalled_weekly_hours)}<span className="text-caption text-ink-muted">/wk</span>
          </div>
        </div>
        <div className="rounded-tile bg-well/40 border border-seam p-2.5">
          <div className="text-caption text-ink-muted mb-0.5">Onramp price</div>
          <div className="readout text-body font-semibold tabular-nums text-ink">
            {fmtUsd(settings.onramp_price_usd_per_month)}<span className="text-caption text-ink-muted">/mo</span>
          </div>
          <div className="text-caption text-ink-muted/70">
            {bench?.current?.price_source === 'subscription'
              ? 'benchmark uses live subscription' 
              : 'benchmark price (no subscription)'}
          </div>
        </div>
      </div>

      {/* Uncertainty band */}
      <div className="text-caption text-ink-muted mb-3">
        Estimate{' '}
        <span className="text-ink font-medium readout tabular-nums">{fmtUsd(band.cost_current)}</span>
        {' '}· honest range{' '}
        <span className="text-ink tabular-nums">{fmtUsd(band.cost_low)}–{fmtUsd(band.cost_high)}</span>
        <span className="text-ink-muted/70"> (rate $75–100 · cycle 0.25–1h)</span>
      </div>

      {/* Measured vs assumption */}
      <div className="space-y-1 text-caption text-ink-muted font-code">
        <div className="flex items-center gap-2">
          <span>measured avg review cycle</span>
          <span className="readout text-ink tabular-nums">
            {measured.avg_cycle_elapsed_hours != null ? `${fmtPct(measured.avg_cycle_elapsed_hours)}h elapsed` : 'no cycles yet'}
          </span>
          {elapsedVsAssumption !== null && (
            <span className={elapsedVsAssumption ? 'text-caution' : 'text-go'}>
              vs {fmtPct(settings.review_hours_per_cycle)}h assumption
              {elapsedVsAssumption ? ' — elapsed ≠ senior time, pressure-test' : ''}
            </span>
          )}
        </div>
        <div>
          <span>{measured.review_cycles} review cycle{measured.review_cycles === 1 ? '' : 's'} · {fmtPct(measured.stall_weeks)} stalled re-engagement wk{measured.stall_weeks === 1 ? '' : 's'}</span>
        </div>
      </div>

      {/* The cost story — ramp vs Onramp at the benchmark price */}
      {bench?.current && (
        <div className="mt-3 pt-3 border-t border-seam">
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <p className="text-caption text-ink-muted">
              vs Onramp <span className="text-ink font-medium readout">{fmtUsd(bench.current.onramp_cost_usd)}</span>
              <span className="text-ink-muted/70"> at {fmtOnrampPrice(bench.current.onramp_price_usd_per_month, bench.current.onramp_price_inr)} (workspace)</span>
              <span className="ml-2 px-1.5 py-0.5 rounded-md bg-well text-ink-muted text-[11px]">
                {benchStack === 'react' ? 'React-scoped' : `team-wide · ${bench.current.team_stack}`}
              </span>
              <span className={cn(
                'ml-1 px-1.5 py-0.5 rounded-md text-[11px]',
                bench.current.price_source === 'subscription' ? 'bg-go/10 text-go' : 'bg-well text-ink-muted'
              )}>
                {PRICE_SOURCE_LABEL[bench.current.price_source ?? 'platform']}
              </span>
            </p>
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
          <p className="text-body-xs text-ink">
            Ramp cost <span className="readout tabular-nums font-semibold">{fmtUsd(bench.current.senior_cost_usd)}</span>
            {' '}· every $1 of Onramp offsets{' '}
            <span className="readout tabular-nums font-semibold text-go">{bench.current.roi_multiple}×</span>
            {' '}of senior time
          </p>
          {bench.history.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="overline text-ink-muted/60 text-[10px]">Snapshot history</div>
              {bench.history.slice(0, 3).map((s) => (
                <div key={s.generated_at} className="flex items-center justify-between text-caption text-ink-muted font-code">
                  <span>{new Date(s.generated_at).toLocaleDateString()}</span>
                  <span>
                    {fmtUsd(s.senior_cost_usd)} vs {fmtUsd(s.onramp_cost_usd)} ·{' '}
                    <span className="text-go">{s.roi_multiple}×</span>
                    {s.onramp_price_inr != null && s.onramp_price_inr > 0 && (
                      <span className="text-ink-muted/70"> · {fmtOnrampPrice(s.onramp_price_usd_per_month ?? s.onramp_cost_usd, s.onramp_price_inr)}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Leader calibration */}
      {canEdit && editing && (
        <div className="mt-3 pt-3 border-t border-seam space-y-2.5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-caption text-ink-muted block mb-1">Senior rate ($/hr, 20–1000)</span>
              <input
                type="number"
                value={rateDraft}
                onChange={(e) => setRateDraft(e.target.value)}
                className="input w-full"
                aria-label="Senior hourly rate"
              />
            </label>
            <label className="block">
              <span className="text-caption text-ink-muted block mb-1">Review cycle (h, 0.05–8)</span>
              <input
                type="number"
                step="0.05"
                value={cycleDraft}
                onChange={(e) => setCycleDraft(e.target.value)}
                className="input w-full"
                aria-label="Review hours per cycle"
              />
            </label>
            <label className="block">
              <span className="text-caption text-ink-muted block mb-1">Onramp price ($/mo workspace, 0.05–1000)</span>
              <input
                type="number"
                step="0.05"
                value={priceDraft}
                onChange={(e) => setPriceDraft(e.target.value)}
                className="input w-full"
                aria-label="Onramp price per workspace per month"
              />
            </label>
          </div>
          {updateMutation.isError && (
            <p className="text-caption text-abort">{String(updateMutation.error)}</p>
          )}
          <div className="flex gap-2">
            <button onClick={save} disabled={updateMutation.isPending} className="btn">
              {updateMutation.isPending ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)} className="text-caption text-ink-muted hover:text-ink">
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
