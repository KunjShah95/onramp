import { useState } from 'react'

// Marketing-page defaults — mirrors the ramp efficiency benchmark's model:
// 250K tokens per codebase, 5 changes/mo, Claude Code Pro $20/dev, paid-mix
// token rate ($2.40 in + $3.00 out per M = $5.40/M), Onramp's flat $99/mo.
const CODEBASE_TOKENS = 250_000
const CHANGES_PER_MONTH = 5
const AGENT_PER_DEV = 20
const AGENT_TOKEN_RATE_PER_M = 5.40
const ONRAMP_FLAT = 99

const fmtUsd = (v: number) => `$${Math.round(v).toLocaleString()}`
const fmtTokens = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${Math.round(v / 1_000)}K`

/**
 * Cost at scale — the "multiple devs, multiple products" pitch.
 *
 * Every developer × every product multiplies what a coding-agent setup
 * burns: each agent holds every product's codebase in its own context, so
 * token burn grows with devs × products × changes. Onramp's flat workspace
 * price never moves. Self-contained (no auth, no API) so it runs on the
 * public marketing page.
 */
export default function CostAtScaleCalculator() {
  const [devs, setDevs] = useState(5)
  const [products, setProducts] = useState(3)
  const [changes, setChanges] = useState(CHANGES_PER_MONTH)

  const totalTokens = CODEBASE_TOKENS * products
  const agentTokensPerChange = totalTokens * devs // each dev's agent re-reads every product
  const agentMonthlyTokens = agentTokensPerChange * changes
  const agentSubs = AGENT_PER_DEV * devs
  const agentTokensCost = (agentMonthlyTokens / 1_000_000) * AGENT_TOKEN_RATE_PER_M
  const agentTotal = agentSubs + agentTokensCost

  const onrampRefreshTokens = totalTokens * 0.1 * changes
  const onrampRefreshCost = (onrampRefreshTokens / 1_000_000) * AGENT_TOKEN_RATE_PER_M
  const onrampTotal = ONRAMP_FLAT + onrampRefreshCost

  const savings = agentTotal - onrampTotal
  const ratio = agentTotal / onrampTotal

  return (
    <div className="rounded-card border border-seam bg-panel overflow-hidden">
      <div className="grid md:grid-cols-[1fr_1fr]">
        {/* Sliders */}
        <div className="p-8 space-y-6 border-b md:border-b-0 md:border-r border-seam">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-[hsl(var(--foreground))]" htmlFor="cale-devs">
                Developers
              </label>
              <span className="font-code text-sm text-[hsl(var(--muted-foreground))]">{devs}</span>
            </div>
            <input
              id="cale-devs"
              type="range"
              min={1}
              max={30}
              value={devs}
              onChange={(e) => setDevs(Number(e.target.value))}
              className="w-full accent-go"
              aria-label="Number of developers"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-[hsl(var(--foreground))]" htmlFor="cale-products">
                Products / codebases
              </label>
              <span className="font-code text-sm text-[hsl(var(--muted-foreground))]">{products}</span>
            </div>
            <input
              id="cale-products"
              type="range"
              min={1}
              max={10}
              value={products}
              onChange={(e) => setProducts(Number(e.target.value))}
              className="w-full accent-go"
              aria-label="Number of products"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-[hsl(var(--foreground))]" htmlFor="cale-changes">
                Code changes / month
              </label>
              <span className="font-code text-sm text-[hsl(var(--muted-foreground))]">{changes}</span>
            </div>
            <input
              id="cale-changes"
              type="range"
              min={1}
              max={20}
              value={changes}
              onChange={(e) => setChanges(Number(e.target.value))}
              className="w-full accent-go"
              aria-label="Code changes per month"
            />
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))] font-code">
            Claude Code Pro · {fmtTokens(CODEBASE_TOKENS)} tokens/product · per-dev re-reads
          </p>
        </div>

        {/* Result */}
        <div className="p-8 flex flex-col justify-center">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="rounded-card border border-abort/30 bg-abort/[0.04] p-4">
              <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">Coding agents · /mo</div>
              <div className="font-display text-3xl font-bold text-[hsl(var(--foreground))] tabular-nums">
                {fmtUsd(agentTotal)}
              </div>
              <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1 font-code">
                {fmtUsd(agentSubs)} subs · {fmtUsd(agentTokensCost)} tokens ({fmtTokens(agentMonthlyTokens)})
              </div>
            </div>
            <div className="rounded-card border border-go/30 bg-go/[0.04] p-4">
              <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">Onramp · /mo</div>
              <div className="font-display text-3xl font-bold text-go tabular-nums">
                {fmtUsd(onrampTotal)}
              </div>
              <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1 font-code">
                flat {fmtUsd(ONRAMP_FLAT)} · refresh {fmtUsd(onrampRefreshCost)}
              </div>
            </div>
          </div>
          <p className="text-center text-[hsl(var(--foreground))] font-body text-sm">
            At <strong>{devs} developers × {products} products</strong>, agents cost{' '}
            <span className="text-abort font-semibold">{fmtUsd(agentTotal)}/mo</span> ·{' '}
            <span className="text-go font-semibold">{ratio.toFixed(0)}× more</span> than Onramp.{' '}
            <strong className="text-go">{fmtUsd(savings)} saved /mo.</strong>
          </p>
          <p className="text-center text-xs text-[hsl(var(--muted-foreground))] mt-3">
            Every hire × every product multiplies the agent bill. Onramp's flat price doesn't move.
          </p>
        </div>
      </div>
    </div>
  )
}
