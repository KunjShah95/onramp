import { Link } from 'react-router-dom'
import { ArrowUpRight, CaretUp, CaretDown } from '@phosphor-icons/react'
import { cn } from '../../lib/utils'

export interface Readout {
  /** Call-sign label under the value. */
  label: string
  /** Displayed value. Numbers animate up on mount; strings render as-is. */
  value: number | string
  /** Prefix rendered before a numeric value (e.g. "$"). */
  prefix?: string
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
  /** Quiet rail label above the bank, e.g. "Systems". */
  callsign?: string
  items: Readout[]
  /** Cells per row at the widest breakpoint. */
  columns?: 4 | 5 | 6 | 7
  className?: string
}

/** Static value — numbers render directly, no count-up. */
function Cell({ item }: { item: Readout; animate?: boolean }) {
  const numeric = typeof item.value === 'number'
  const shown = numeric
    ? `${item.prefix ?? ''}${Math.round(item.value as number).toLocaleString()}${item.suffix ?? ''}`
    : item.value

  const body = (
    <div className="px-4 py-5 h-full transition-colors duration-150 group-hover/cell:bg-well/60">
      <div className="flex items-baseline gap-2">
        <span className={cn(
          'font-code tabular-nums text-3xl md:text-4xl font-semibold leading-none tracking-tight',
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
      <div className="overline text-ink-tertiary mt-2.5 flex items-center gap-1">
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
 * seated per the design bible; values render statically.
 */
export default function ReadoutBank({ callsign, items, columns = 6, className }: ReadoutBankProps) {
  return (
    <div className={cn('rounded-card border border-seam bg-panel shadow-seam overflow-hidden', className)}>
      {callsign && (
        <div className="px-5 pt-4 pb-1">
          <span className="font-code text-[10.5px] tracking-[0.04em] text-ink-muted/70">{callsign}</span>
        </div>
      )}
      <div className={cn('grid grid-cols-2 divide-x divide-y xl:divide-y-0 divide-seam', colClass[columns])}>
        {items.map((item) => (
          <Cell key={item.label} item={item} />
        ))}
      </div>
    </div>
  )
}
