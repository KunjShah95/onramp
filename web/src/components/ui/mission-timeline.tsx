import { motion, useReducedMotion } from 'framer-motion'
import { Check, Circle, Warning } from '@phosphor-icons/react'
import { cn } from '../../lib/utils'

export type StageState = 'complete' | 'active' | 'upcoming' | 'blocked'

export interface Stage {
  id: string
  label: string
  /** Mono designator, e.g. "T-04" or "ORBIT". */
  designator?: string
  state: StageState
}

interface MissionTimelineProps {
  stages: Stage[]
  className?: string
}

const nodeStyle: Record<StageState, string> = {
  complete: 'border-go bg-go text-panel-raised',
  active: 'border-go bg-panel-raised text-go',
  upcoming: 'border-seam-strong bg-well text-ink-disabled',
  blocked: 'border-abort bg-panel-raised text-abort',
}

function Node({ state }: { state: StageState }) {
  if (state === 'complete') return <Check size={12} weight="bold" />
  if (state === 'blocked') return <Warning size={12} weight="fill" />
  if (state === 'active') return <Circle size={9} weight="fill" />
  return <Circle size={7} weight="bold" />
}

/**
 * Mission Timeline (signature). The onboarding path rendered as a flight plan —
 * T-minus stages wired along a rail, the completed segment lit GO green, the
 * active node pulsing. Horizontal on wide screens, a vertical ladder on mobile.
 */
export default function MissionTimeline({ stages, className }: MissionTimelineProps) {
  const reduce = useReducedMotion()
  const doneCount = stages.filter((s) => s.state === 'complete').length
  const activeIndex = stages.findIndex((s) => s.state === 'active')
  // Fill reaches the active node, else the last completed segment.
  const reached = activeIndex >= 0 ? activeIndex : Math.max(0, doneCount - 1)
  const pct = stages.length > 1 ? (reached / (stages.length - 1)) * 100 : 0

  return (
    <div className={cn('relative', className)}>
      {/* ── Horizontal (md+) ── */}
      <div className="hidden md:block">
        <div className="relative">
          {/* rail */}
          <div className="absolute left-0 right-0 top-3 h-px bg-seam-strong" />
          <motion.div
            className="absolute left-0 top-3 h-px bg-go origin-left"
            initial={reduce ? false : { scaleX: 0 }}
            animate={{ scaleX: pct / 100 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            style={{ width: '100%' }}
          />
          <ol className="relative flex justify-between">
            {stages.map((s, i) => (
              <motion.li
                key={s.id}
                className="flex flex-col items-center text-center gap-2 w-full"
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.06, ease: 'easeOut' }}
              >
                <span
                  className={cn(
                    'relative z-10 w-6 h-6 rounded-full border flex items-center justify-center shrink-0',
                    nodeStyle[s.state],
                  )}
                >
                  <Node state={s.state} />
                  {s.state === 'active' && !reduce && (
                    <span className="absolute inset-0 rounded-full border border-go animate-ping opacity-40" />
                  )}
                </span>
                <span className="flex flex-col items-center gap-0.5 px-1">
                  {s.designator && <span className="designator">{s.designator}</span>}
                  <span className={cn(
                    'text-caption leading-tight max-w-[9rem]',
                    s.state === 'upcoming' ? 'text-ink-muted' : 'text-ink font-medium',
                  )}>
                    {s.label}
                  </span>
                </span>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>

      {/* ── Vertical ladder (mobile) ── */}
      <ol className="md:hidden relative pl-1">
        <div className="absolute left-[11px] top-1 bottom-1 w-px bg-seam-strong" />
        {stages.map((s, i) => (
          <li key={s.id} className="relative flex items-start gap-3 pb-4 last:pb-0">
            <span className={cn(
              'relative z-10 w-6 h-6 rounded-full border flex items-center justify-center shrink-0',
              nodeStyle[s.state],
            )}>
              <Node state={s.state} />
            </span>
            <span className="flex flex-col pt-0.5">
              {s.designator && <span className="designator">{s.designator}</span>}
              <span className={cn(
                'text-body-sm leading-tight',
                s.state === 'upcoming' ? 'text-ink-muted' : 'text-ink font-medium',
              )}>
                {s.label}
              </span>
            </span>
            {i < stages.length - 1 && null}
          </li>
        ))}
      </ol>
    </div>
  )
}
