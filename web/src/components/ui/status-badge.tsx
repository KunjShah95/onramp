import { cn } from '../../lib/utils'

interface StatusBadgeProps {
  state: string
  className?: string
}

const TILE: Record<string, string> = {
  pending: 'status-tile-idle',
  cancelled: 'status-tile-idle',
  assigned: 'status-tile-standby',
  in_progress: 'status-tile-standby',
  submitted: 'status-tile-caution',
  under_review: 'status-tile-caution',
  product_review: 'status-tile-caution',
  needs_changes: 'status-tile-abort',
  approved: 'status-tile-go',
  completed: 'status-tile-go',
}

const LABELS: Record<string, string> = {
  pending: 'STANDBY',
  assigned: 'ASSIGNED',
  in_progress: 'IN PROGRESS',
  submitted: 'SUBMITTED',
  under_review: 'UNDER REVIEW',
  needs_changes: 'CHANGES',
  product_review: 'PRODUCT',
  approved: 'APPROVED',
  completed: 'DONE',
  cancelled: 'CANCELLED',
}

export default function StatusBadge({ state, className }: StatusBadgeProps) {
  return (
    <span className={cn('status-tile', TILE[state] || 'status-tile-idle', className)}>
      {LABELS[state] || state}
    </span>
  )
}
