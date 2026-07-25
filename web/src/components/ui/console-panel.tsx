import { type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface ConsolePanelProps {
  children: ReactNode
  rail?: string
  designator?: string
  status?: 'go' | 'standby' | 'caution' | 'abort' | 'idle'
  raised?: boolean
  className?: string
  hoverable?: boolean
}

function StatusDot({ status }: { status: ConsolePanelProps['status'] }) {
  if (!status) return null
  const dotMap = {
    go: 'bg-go',
    standby: 'bg-mission',
    caution: 'bg-caution',
    abort: 'bg-abort',
    idle: 'bg-ink-disabled',
  }
  return <span className={cn('w-1.5 h-1.5 rounded-full', dotMap[status])} />
}

export default function ConsolePanel({
  children, rail, designator, status, raised, className, hoverable,
}: ConsolePanelProps) {
  return (
    <div
      className={cn(
        raised ? 'console-panel-raised' : 'console-panel',
        hoverable && 'cursor-pointer',
        className
      )}
    >
      {(rail || designator || status) && (
        <div className="panel-rail">
          {status && <StatusDot status={status} />}
          {rail && <span className="callsign">{rail}</span>}
          {designator && <span className="readout text-ink-muted text-[11px]">{designator}</span>}
        </div>
      )}
      {children}
    </div>
  )
}
