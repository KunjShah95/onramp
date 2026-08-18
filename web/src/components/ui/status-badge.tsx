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
  pending: 'Pending',
  assigned: 'Assigned',
  in_progress: 'In progress',
  submitted: 'Submitted',
  under_review: 'Under review',
  needs_changes: 'Changes requested',
  product_review: 'Product review',
  approved: 'Approved',
  completed: 'Done',
  cancelled: 'Cancelled',
}

export default function StatusBadge({ state, className }: StatusBadgeProps) {
  return (
    <span className={cn('status-tile', TILE[state] || 'status-tile-idle', className)}>
      {LABELS[state] || state}
    </span>
  )
}
