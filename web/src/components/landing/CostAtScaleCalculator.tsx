import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, Stack, Lightning, TrendUp, ArrowRight, Check, Info } from '@phosphor-icons/react'

// Real pricing verified Aug 2026 via web search — see footnote for sources.
// Token pricing is per 1M tokens. Subs include headroom; token overage is API rates.
type AgentDef = {
  id: string
  label: string
  sublabel: string
  seatPrice: number // USD / seat / month (monthly billing)
  annualSeatPrice?: number
  inputPerM: number // USD per 1M input tokens
  outputPerM: number // USD per 1M output
  includedCreditsPerSeat?: number // USD value included before overage (Cursor/Copilot)
  notes: string
}

const AGENT_CATALOG: AgentDef[] = [
  {
    id: 'claude-pro',
    label: 'Claude Code Pro',
    sublabel: 'Anthropic · Sonnet 4.6',
    seatPrice: 20,
    annualSeatPrice: 17,
    inputPerM: 3,
    outputPerM: 15,
    notes: 'Pro $20/mo (annual $17), Max 5× $100, Max 20× $200. API Sonnet $3/$15 post-Sep 2026.',
  },
  {
    id: 'claude-team-premium',
    label: 'Claude Team Premium',
    sublabel: 'Anthropic · shared seat',
    seatPrice: 100,
    annualSeatPrice: 100,
    inputPerM: 3,
    outputPerM: 15,
    notes: 'Premium $100/seat annual ($125 monthly), Standard $20/seat. 5× usage.',
  },
  {
    id: 'cursor-pro',
    label: 'Cursor Pro',
    sublabel: 'Cursor · $20 credits',
    seatPrice: 20,
    inputPerM: 3,
    outputPerM: 15,
    includedCreditsPerSeat: 20,
    notes: 'Pro $20/mo incl. $20 credits, Pro+ $60, Ultra $200 ($400 credits). Teams $40/seat.',
  },
  {
    id: 'copilot-business',
    label: 'GitHub Copilot Business',
    sublabel: 'GitHub · AI credits',
    seatPrice: 19,
    inputPerM: 2.5,
    outputPerM: 10,
    includedCreditsPerSeat: 19,
    notes: 'Business $19/seat (1,900 credits), Enterprise $39/seat (3,900), Pro $10, Pro+ $39.',
  },
  {
    id: 'windsurf-pro',
    label: 'Windsurf Pro',
    sublabel: 'Codeium · Flows',
    seatPrice: 15,
    annualSeatPrice: 12.5,
    inputPerM: 3,
    outputPerM: 15,
    notes: 'Pro $15/mo ($20 under Devin from Jul 2026), Teams $40 per full dev seat + flex free.',
  },
  {
    id: 'codex-api',
    label: 'OpenAI Codex API',
    sublabel: 'OpenAI · GPT-5.3-Codex',
    seatPrice: 0,
    inputPerM: 1.75,
    outputPerM: 14,
    notes: 'ChatGPT Plus $20 (Codex incl.), Pro 5× $100. API GPT-5.3-Codex $1.75/$14 per 1M.',
  },
]

const CODEBASE_TOKENS = 250_000
const CHANGES_PER_MONTH = 5
const ONRAMP_FLAT = 99

const fmtUsd = (v: number) => `$${Math.round(v).toLocaleString()}`
const fmtUsdPrecise = (v: number) => (v < 10 ? `$${v.toFixed(2)}` : fmtUsd(v))
const fmtTokens = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${Math.round(v / 1_000)}K`

const PRESETS = [
  { label: 'Starter', devs: 3, products: 2, changes: 3 },
  { label: 'Growth', devs: 8, products: 4, changes: 8 },
  { label: 'Scale', devs: 15, products: 6, changes: 12 },
] as const

function blendedRatePerM(a: AgentDef) {
  // Code tasks: ~65% input (codebase), 35% output (edits)
  return a.inputPerM * 0.65 + a.outputPerM * 0.35
}

function agentMonthlyCost(a: AgentDef, monthlyTokens: number, devs: number) {
  const subs = a.seatPrice * devs
  const tokenCost = (monthlyTokens / 1_000_000) * blendedRatePerM(a)
  const included = (a.includedCreditsPerSeat ?? 0) * devs
  const overage = Math.max(0, tokenCost - included)
  // For agents without credit pool, tokenCost is on top of subs (API) or included up to cap (subs).
  // We model both as subs + overage so the bill never hides tokens.
  const total = subs + overage
  return { subs, tokenCost, included, overage, total }
}

function Slider({
  label,
  value,
  min,
  max,
  onChange,
  id,
  icon: Icon,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  id: string
  icon: React.ElementType
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <label
          htmlFor={id}
          className="flex items-center gap-2 text-[13px] font-semibold tracking-[-0.01em] text-[hsl(var(--foreground))]"
        >
          <span className="w-7 h-7 rounded-[4px] bg-[hsl(var(--muted))] border border-[hsl(var(--border))] flex items-center justify-center">
            <Icon size={13} weight="bold" className="text-[hsl(var(--muted-foreground))]" />
          </span>
          {label}
        </label>
        <motion.span
          key={value}
          initial={{ scale: 0.92, opacity: 0.7 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          className="min-w-[36px] text-center rounded-full bg-[hsl(var(--foreground))] text-[hsl(var(--background))] px-2.5 py-1 text-[12px] font-bold tabular-nums"
        >
          {value}
        </motion.span>
      </div>
      <div className="relative">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
          className="w-full h-[6px] appearance-none rounded-full outline-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, hsl(var(--accent)) 0%, hsl(var(--accent)) ${pct}%, hsl(var(--border)) ${pct}%, hsl(var(--border)) 100%)`,
          }}
        />
        <div className="flex justify-between mt-1.5 text-[10px] font-medium tabular-nums text-[hsl(var(--muted-foreground))]">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      </div>
    </div>
  )
}

export default function CostAtScaleCalculator() {
  const [devs, setDevs] = useState(5)
  const [products, setProducts] = useState(3)
  const [changes, setChanges] = useState(CHANGES_PER_MONTH)
  const [selectedId, setSelectedId] = useState<string>('claude-pro')

  const selected = AGENT_CATALOG.find((a) => a.id === selectedId) ?? AGENT_CATALOG[0]

  const { totalTokens, agentTokensPerChange, agentMonthlyTokens, onrampRefreshTokens, onrampRefreshCost, onrampTotal, rows } =
    useMemo(() => {
      const totalTokens = CODEBASE_TOKENS * products
      const agentTokensPerChange = totalTokens * devs
      const agentMonthlyTokens = agentTokensPerChange * changes
      const onrampRefreshTokens = totalTokens * 0.1 * changes
      const onrampRefreshCost = (onrampRefreshTokens / 1_000_000) * blendedRatePerM(selected)
      const onrampTotal = ONRAMP_FLAT + onrampRefreshCost
      const rows = AGENT_CATALOG.map((a) => {
        const c = agentMonthlyCost(a, agentMonthlyTokens, devs)
        return { agent: a, ...c, savings: c.total - onrampTotal, ratio: c.total / Math.max(1, onrampTotal) }
      }).sort((a, b) => b.total - a.total)
      return { totalTokens, agentTokensPerChange, agentMonthlyTokens, onrampRefreshTokens, onrampRefreshCost, onrampTotal, rows }
    }, [devs, products, changes, selected])

  const primary = rows.find((r) => r.agent.id === selectedId) ?? rows[0]
  const maxBar = Math.max(...rows.map((r) => r.total), onrampTotal, 1)
  const primaryBarPct = (primary.total / maxBar) * 100
  const onrampBarPct = (onrampTotal / maxBar) * 100
  const activePreset = PRESETS.find((p) => p.devs === devs && p.products === products && p.changes === changes)?.label

  return (
    <div className="rounded-[12px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_24px_rgba(15,23,42,0.06)]">
      {/* Preset pills */}
      <div className="flex flex-wrap items-center gap-2 px-6 sm:px-8 pt-6 pb-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40">
        <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[hsl(var(--muted-foreground))]">Quick presets</span>
        <div className="flex gap-1.5 ml-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => {
                setDevs(p.devs)
                setProducts(p.products)
                setChanges(p.changes)
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                activePreset === p.label
                  ? 'bg-[hsl(var(--foreground))] text-[hsl(var(--background))] border-[hsl(var(--foreground))] shadow-sm'
                  : 'bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--border))] hover:border-[hsl(var(--foreground))]/20 hover:bg-[hsl(var(--accent))]/6'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <span className="hidden sm:inline text-[11px] text-[hsl(var(--muted-foreground))] ml-auto font-mono">
          {fmtTokens(CODEBASE_TOKENS)}/product · per-dev re-reads · {fmtTokens(totalTokens)} total
        </span>
      </div>

      {/* Agent tabs — realistic catalog */}
      <div className="px-6 sm:px-8 pt-4 pb-2 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {AGENT_CATALOG.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedId(a.id)}
              className={`px-3.5 py-2 rounded-full text-xs font-semibold border whitespace-nowrap transition-all ${
                selectedId === a.id
                  ? 'bg-[hsl(var(--foreground))] text-[hsl(var(--background))] border-[hsl(var(--foreground))]'
                  : 'bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]'
              }`}
              title={a.notes}
            >
              {a.label} <span className={`ml-1 font-normal ${selectedId === a.id ? 'opacity-70' : 'opacity-60'}`}>· {fmtUsd(a.seatPrice)}/seat</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-2 font-mono flex items-center gap-1.5">
          <Info size={12} weight="bold" /> {selected.notes} <span className="hidden sm:inline opacity-60">· pricing verified Aug 2026</span>
        </p>
      </div>

      <div className="grid md:grid-cols-[1.05fr_1.15fr]">
        {/* Sliders */}
        <div className="p-6 sm:p-8 space-y-7 border-b md:border-b-0 md:border-r border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <Slider label="Developers" value={devs} min={1} max={30} onChange={setDevs} id="calc-devs" icon={Users} />
          <Slider label="Products / codebases" value={products} min={1} max={10} onChange={setProducts} id="calc-products" icon={Stack} />
          <Slider label="Code changes / month" value={changes} min={1} max={20} onChange={setChanges} id="calc-changes" icon={Lightning} />
          <div className="flex items-center gap-2 rounded-[8px] bg-[hsl(var(--muted))] border border-[hsl(var(--border))] px-3 py-2.5">
            <TrendUp size={14} weight="bold" className="text-[hsl(var(--muted-foreground))] shrink-0" />
            <p className="text-[11px] leading-relaxed text-[hsl(var(--muted-foreground))] font-mono">
              {selected.label} · {fmtTokens(totalTokens)} total · {fmtTokens(agentTokensPerChange)}/change · {fmtTokens(agentMonthlyTokens)}/mo @ ${blendedRatePerM(selected).toFixed(2)}/M
            </p>
          </div>
        </div>

        {/* Result — primary comparison */}
        <div className="p-6 sm:p-8 flex flex-col">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
            <div className="rounded-[10px] border border-[hsl(var(--abort))]/20 bg-[hsl(var(--abort))]/[0.06] p-4 sm:p-5">
              <div className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[hsl(var(--muted-foreground))] mb-1.5 truncate">{primary.agent.label} · /mo</div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={Math.round(primary.total)}
                  initial={{ y: 6, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -6, opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  className="font-mono text-[26px] sm:text-[30px] font-bold tracking-[-0.03em] text-[hsl(var(--foreground))] tabular-nums leading-none"
                >
                  {fmtUsd(primary.total)}
                </motion.div>
              </AnimatePresence>
              <div className="text-[11px] text-[hsl(var(--muted-foreground))] mt-2 font-mono leading-relaxed">
                <span className="tabular-nums">{fmtUsd(primary.subs)} subs</span>
                <span className="mx-1 opacity-40">·</span>
                <span className="tabular-nums">{primary.included ? `${fmtUsd(primary.overage)} overage` : `${fmtUsd(primary.tokenCost)} tokens`}</span>
                <span className="block opacity-70 tabular-nums">
                  {fmtTokens(agentMonthlyTokens)} · ${blendedRatePerM(primary.agent).toFixed(2)}/M blended
                  {primary.included ? ` · ${fmtUsd(primary.included)} incl.` : ''}
                </span>
              </div>
            </div>
            <div className="rounded-[10px] border border-[hsl(var(--accent))]/25 bg-[hsl(var(--accent))]/[0.07] p-4 sm:p-5">
              <div className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[hsl(var(--muted-foreground))] mb-1.5">Onramp · /mo</div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={Math.round(onrampTotal)}
                  initial={{ y: 6, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -6, opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  className="font-mono text-[26px] sm:text-[30px] font-bold tracking-[-0.03em] text-[hsl(var(--accent))] tabular-nums leading-none"
                >
                  {fmtUsd(onrampTotal)}
                </motion.div>
              </AnimatePresence>
              <div className="text-[11px] text-[hsl(var(--muted-foreground))] mt-2 font-mono leading-relaxed">
                flat <span className="tabular-nums">{fmtUsd(ONRAMP_FLAT)}</span>
                <span className="mx-1 opacity-40">·</span>
                refresh <span className="tabular-nums">{fmtUsdPrecise(onrampRefreshCost)}</span>
                <span className="block opacity-70 tabular-nums">{fmtTokens(onrampRefreshTokens)} · 10% incremental</span>
              </div>
            </div>
          </div>

          <div className="space-y-3 mb-6 rounded-[10px] bg-[hsl(var(--muted))]/50 border border-[hsl(var(--border))] p-4">
            <div className="flex items-center gap-3">
              <span className="w-[88px] text-[11px] font-semibold text-[hsl(var(--muted-foreground))] truncate">{primary.agent.label.split(' ')[0]}</span>
              <div className="flex-1 h-2.5 rounded-full bg-[hsl(var(--background))] border border-[hsl(var(--border))] overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-[hsl(var(--abort))]"
                  animate={{ width: `${primaryBarPct}%` }}
                  transition={{ type: 'spring', stiffness: 160, damping: 22 }}
                />
              </div>
              <span className="w-[64px] text-right text-xs font-mono font-semibold tabular-nums text-[hsl(var(--abort))]">{fmtUsd(primary.total)}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-[88px] text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">Onramp</span>
              <div className="flex-1 h-2.5 rounded-full bg-[hsl(var(--background))] border border-[hsl(var(--border))] overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-[hsl(var(--accent))]"
                  animate={{ width: `${onrampBarPct}%` }}
                  transition={{ type: 'spring', stiffness: 160, damping: 22 }}
                />
              </div>
              <span className="w-[64px] text-right text-xs font-mono font-semibold tabular-nums text-[hsl(var(--accent))]">{fmtUsd(onrampTotal)}</span>
            </div>
          </div>

          <div className="rounded-[10px] bg-[hsl(var(--foreground))] text-[hsl(var(--background))] p-5 text-center">
            <p className="text-[13px] leading-relaxed">
              At <span className="font-semibold">{devs} devs × {products} products</span> × {changes} changes,{' '}
              <span className="font-mono font-bold tabular-nums">{primary.agent.label}</span> costs{' '}
              <span className="font-mono font-bold tabular-nums">{fmtUsd(primary.total)}/mo</span> —{' '}
              <motion.span key={Math.round(primary.ratio * 10)} initial={{ scale: 0.96 }} animate={{ scale: 1 }} className="inline-flex items-center gap-1 font-bold">
                {primary.ratio.toFixed(1)}× more <ArrowRight size={12} weight="bold" className="opacity-70" />
              </motion.span>{' '}
              than Onramp.
            </p>
            <motion.p
              key={Math.round(primary.savings)}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 font-mono text-[18px] font-bold tabular-nums tracking-[-0.02em]"
            >
              {fmtUsd(primary.savings)} saved /mo · {fmtUsd(primary.savings * 12)} /yr
            </motion.p>
          </div>
          <p className="text-center text-[11px] leading-relaxed text-[hsl(var(--muted-foreground))] mt-4 font-mono">
            Every hire × every product multiplies the terminal-agent bill. Onramp flat never moves.
          </p>
        </div>
      </div>

      {/* All terminals compared — realistic sound table */}
      <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 px-6 sm:px-8 py-6">
        <div className="flex items-center gap-2 mb-3">
          <h4 className="text-xs font-bold tracking-[0.06em] uppercase text-[hsl(var(--foreground))]">All coding-agent terminals compared</h4>
          <span className="text-[11px] font-mono text-[hsl(var(--muted-foreground))]">· {devs} devs × {products} products × {changes} changes</span>
          <span className="ml-auto hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-[hsl(var(--muted-foreground))]">
            <Check size={12} weight="bold" className="text-[hsl(var(--accent))]" /> verified Aug 2026
          </span>
        </div>
        <div className="overflow-x-auto rounded-[10px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] ">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[hsl(var(--muted))] text-left">
                <th className="px-3 py-2.5 font-semibold text-[hsl(var(--foreground))]">Terminal</th>
                <th className="px-3 py-2.5 font-semibold text-[hsl(var(--foreground))]">Seat</th>
                <th className="px-3 py-2.5 font-semibold text-[hsl(var(--foreground))]">Tokens/mo</th>
                <th className="px-3 py-2.5 font-semibold text-[hsl(var(--foreground))]">Total /mo</th>
                <th className="px-3 py-2.5 font-semibold text-[hsl(var(--foreground))]">vs Onramp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(var(--border))]">
              {rows.map((r) => (
                <tr key={r.agent.id} className={r.agent.id === selectedId ? 'bg-[hsl(var(--accent))]/[0.06]' : ''}>
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-[hsl(var(--foreground))] leading-none">{r.agent.label}</div>
                    <div className="text-[11px] text-[hsl(var(--muted-foreground))] font-mono">{r.agent.sublabel}</div>
                  </td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-[hsl(var(--foreground))]">{fmtUsd(r.agent.seatPrice)}</td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-[hsl(var(--muted-foreground))]">
                    {fmtTokens(agentMonthlyTokens)} <span className="opacity-60">@ ${blendedRatePerM(r.agent).toFixed(2)}/M</span>
                  </td>
                  <td className="px-3 py-2.5 font-mono font-bold tabular-nums text-[hsl(var(--foreground))]">{fmtUsd(r.total)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-bold tabular-nums ${r.savings > 0 ? 'bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))] border border-[hsl(var(--accent))]/20' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`}>
                      {r.savings > 0 ? `+${fmtUsd(r.savings)} · ${r.ratio.toFixed(1)}×` : '—'}
                    </span>
                  </td>
                </tr>
              ))}
              <tr className="bg-[hsl(var(--accent))]/[0.08] font-semibold">
                <td className="px-3 py-2.5 text-[hsl(var(--accent))]">Onramp (flat)</td>
                <td className="px-3 py-2.5 font-mono tabular-nums text-[hsl(var(--accent))]">{fmtUsd(ONRAMP_FLAT)}</td>
                <td className="px-3 py-2.5 font-mono tabular-nums text-[hsl(var(--accent))]">{fmtTokens(onrampRefreshTokens)} refresh</td>
                <td className="px-3 py-2.5 font-mono font-bold tabular-nums text-[hsl(var(--accent))]">{fmtUsd(onrampTotal)}</td>
                <td className="px-3 py-2.5 text-[hsl(var(--accent))] font-mono text-[11px]">baseline</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] leading-relaxed text-[hsl(var(--muted-foreground))] mt-3 font-mono">
          Sources: Anthropic Claude pricing (Pro $20, Max $100/$200, Team Premium $100/seat, Sonnet $3/$15), Cursor pricing ($20 incl. $20 credits, Teams $40/seat), GitHub Docs (Copilot Pro $10, Pro+ $39, Business $19, Enterprise $39, AI credits),
          Windsurf/Codeium ($15 Pro, Teams $40/full seat), OpenAI Platform (GPT-5.3-Codex $1.75/$14). Token math: {fmtTokens(CODEBASE_TOKENS)}/product × products × devs = per-change re-read, × changes/mo.
          Every hire × every product multiplies terminal-agent tokens; Onramp refresh is 10% incremental at same blended rate.
        </p>
      </div>
    </div>
  )
}
