import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import { ArrowUpRight, CaretUp, CaretDown } from '@phosphor-icons/react'
import { cn } from '../../lib/utils'

export interface Readout {
  /** Call-sign label under the value. */
  label: string
  /** Displayed value. Numbers animate up on mount; strings render as-is. */
  value: number | string
  /** Suffix appended to a numeric value once it settles (e.g. "%"). */
  suffix?: string
  /** Value text colour token class. Defaults to ink. */
  color?: string
  /** Optional route — the cell becomes a link with a ↗ affordance. */
  link?: string
  /** Signed delta vs. previous period; renders a caution/go trend chip. */
  delta?: number
}

interface ReadoutBankProps {
  /** Rail call-sign, e.g. "MISSION TELEMETRY". */
  callsign?: string
  items: Readout[]
  /** Cells per row at the widest breakpoint. */
  columns?: 4 | 5 | 6 | 7
  className?: string
}

/** Count a number up from 0 → target on mount. Skips when reduced-motion. */
function useCountUp(target: number, enabled: boolean, ms = 750) {
  const [n, setN] = useState(enabled ? 0 : target)
  const raf = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!enabled) { setN(target); return }
    const start = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms)
      // ease-out-expo — settles like an instrument needle
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p)
      setN(target * eased)
      if (p < 1) raf.current = requestAnimationFrame(tick)
      else setN(target)
    }
    raf.current = requestAnimationFrame(tick)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [target, enabled, ms])
  return n
}

function Cell({ item, animate }: { item: Readout; animate: boolean }) {
  const numeric = typeof item.value === 'number'
  const counted = useCountUp(numeric ? (item.value as number) : 0, animate && numeric)
  const shown = numeric
    ? `${Math.round(counted).toLocaleString()}${item.suffix ?? ''}`
    : item.value

  const body = (
    <div className="px-4 py-5 h-full transition-colors duration-150 group-hover/cell:bg-well/60">
      <div className="flex items-baseline gap-2">
        <span className={cn(
          'font-code tabular-nums text-3xl md:text-[2.35rem] font-semibold leading-none tracking-tight',
          item.color ?? 'text-ink',
        )}>
          {shown}
        </span>
        {typeof item.delta === 'number' && item.delta !== 0 && (
          <span className={cn(
            'inline-flex items-center gap-0.5 font-code text-[11px] tabular-nums',
            item.delta > 0 ? 'text-go' : 'text-caution',
          )}>
            {item.delta > 0 ? <CaretUp size={10} weight="bold" /> : <CaretDown size={10} weight="bold" />}
            {Math.abs(item.delta)}
          </span>
        )}
      </div>
      <div className="overline text-ink-muted/60 mt-2.5 flex items-center gap-1">
        {item.label}
        {item.link && <ArrowUpRight size={11} weight="bold" className="text-ink-muted/40" />}
      </div>
    </div>
  )

  return item.link
    ? <Link to={item.link} className="group/cell block focus-visible:outline focus-visible:outline-2 focus-visible:outline-go">{body}</Link>
    : <div className="group/cell">{body}</div>
}

const colClass: Record<number, string> = {
  4: 'sm:grid-cols-4',
  5: 'sm:grid-cols-3 xl:grid-cols-5',
  6: 'sm:grid-cols-3 xl:grid-cols-6',
  7: 'sm:grid-cols-4 xl:grid-cols-7',
}

/**
 * Big Board (signature). Leadership/overview metrics as a butted bank of mono
 * readouts seamed by hairlines — not a row of floating hero cards. Flat and
 * seated per the design bible; the only motion is a needle-settle count-up.
 */
export default function ReadoutBank({ callsign, items, columns = 6, className }: ReadoutBankProps) {
  const reduce = useReducedMotion()
  return (
    <div className={cn('rounded-card border border-seam bg-panel shadow-seam overflow-hidden', className)}>
      {callsign && (
        <div className="px-5 pt-4 pb-1">
          <span className="callsign opacity-50">{callsign}</span>
        </div>
      )}
      <div className={cn('grid grid-cols-2 divide-x divide-y xl:divide-y-0 divide-seam', colClass[columns])}>
        {items.map((item) => (
          <Cell key={item.label} item={item} animate={!reduce} />
        ))}
      </div>
    </div>
  )
}
