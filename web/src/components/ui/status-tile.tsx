import { cn } from '../../lib/utils'

interface StatusTileProps {
  status?: 'go' | 'standby' | 'caution' | 'abort' | 'idle'
  label: string
  designator?: string
  className?: string
}

const statusStyles: Record<string, string> = {
  go: 'status-tile-go',
  standby: 'status-tile-standby',
  caution: 'status-tile-caution',
  abort: 'status-tile-abort',
  idle: 'status-tile-idle',
}

export default function StatusTile({ status = 'idle', label, designator, className }: StatusTileProps) {
  return (
    <span className={cn('status-tile', statusStyles[status], className)}>
      {label}
      {designator && <span className="ml-1.5 font-code text-[10px] opacity-80">{designator}</span>}
    </span>
  )
}
