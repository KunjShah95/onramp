import { useState, useEffect, useRef } from 'react'
import { CaretDown, Check, Gauge, Coin, Brain, Scales } from '@phosphor-icons/react'
import { cn } from '../../lib/utils'

export type RoutingModeValue = string | number | null

interface RoutingModePickerProps {
  value: RoutingModeValue
  onChange: (value: RoutingModeValue) => void
}

const OPTIONS: Array<{
  id: RoutingModeValue
  label: string
  sub: string
  icon: React.ReactNode
}> = [
  {
    id: null,
    label: 'Auto',
    sub: 'Team default (Cost / Balanced / Intelligence) · set in Developer Portal',
    icon: <Gauge size={12} weight="fill" />,
  },
  {
    id: 'cost',
    label: 'Cost',
    sub: 'Cheapest models first · free providers dominate',
    icon: <Coin size={12} weight="fill" />,
  },
  {
    id: 'balanced',
    label: 'Balanced',
    sub: 'Trust the router\u2019s per-task provider ranking',
    icon: <Scales size={12} weight="fill" />,
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    sub: 'Strongest models first · quality over price',
    icon: <Brain size={12} weight="fill" />,
  },
]

/**
 * Cost/quality routing dial for in-app chat. ``null`` = Auto (let the team
 * default — or the router — decide); a preset ("cost"/"balanced"/"intelligence")
 * is sent with every /ask request and beats the team's stored preference for
 * that call. Mirrors RoutingMode in backend app/llm.py.
 */
export default function RoutingModePicker({ value, onChange }: RoutingModePickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = OPTIONS.find((o) => o.id === value) ?? OPTIONS[0]

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1.5 text-[12px] font-body transition-colors',
          value
            ? 'bg-mission/10 border-mission/25 text-mission hover:bg-mission/15 hover:border-mission/40'
            : 'bg-panel-raised border-seam-strong text-ink-secondary hover:border-seam-strong hover:text-ink'
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={current.sub}
      >
        <span className="font-code text-[10px] tracking-wider uppercase opacity-60 mr-0.5">Route</span>
        <span className="font-code text-[12px]">{current.label}</span>
        <CaretDown size={11} weight="bold" className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-1.5 z-50 w-[300px] max-w-[85vw] rounded-[3px] border border-seam-strong bg-panel-raised shadow-lift overflow-hidden"
        >
          <div className="flex items-center gap-2 border-b border-seam px-3 py-2">
            <span className="designator text-ink-tertiary">ROUTING DIAL</span>
          </div>
          <div className="max-h-[320px] overflow-y-auto py-1">
            {OPTIONS.map((o) => (
              <button
                key={o.label}
                role="option"
                aria-selected={value === o.id}
                onClick={() => {
                  onChange(o.id)
                  setOpen(false)
                }}
                className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-base transition-colors"
              >
                <span className="w-4 h-4 mt-0.5 flex items-center justify-center shrink-0 text-ink-tertiary">
                  {value === o.id ? (
                    <Check size={12} weight="bold" className="text-go" />
                  ) : (
                    <span className="opacity-60">{o.icon}</span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-code text-[12px] text-ink">{o.label}</span>
                  <span className="block text-[10.5px] text-ink-tertiary mt-0.5 leading-relaxed">{o.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
