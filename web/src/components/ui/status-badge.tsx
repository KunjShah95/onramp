import { cn } from '../../lib/utils'

interface StatusBadgeProps {
  state: string
  className?: string
}

const COLORS: Record<string, string> = {
  pending: 'text-text-muted/60 bg-bg-tertiary border-border',
  assigned: 'text-info bg-info-muted border-info/20',
  in_progress: 'text-accent-from bg-accent-muted border-accent/20',
  submitted: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  under_review: 'text-warning bg-warning-muted border-warning/20',
  needs_changes: 'text-error bg-error-muted border-error/20',
  product_review: 'text-pink-400 bg-pink-500/10 border-pink-500/20',
  approved: 'text-success bg-success-muted border-success/20',
  completed: 'text-success bg-success-muted border-success/20',
  cancelled: 'text-text-disabled bg-bg-tertiary border-border',
}

const LABELS: Record<string, string> = {
  pending: 'Pending',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  submitted: 'Submitted',
  under_review: 'Under Review',
  needs_changes: 'Changes',
  product_review: 'Product',
  approved: 'Approved',
  completed: 'Done',
  cancelled: 'Cancelled',
}

export default function StatusBadge({ state, className }: StatusBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border',
      COLORS[state] || COLORS.pending,
      className
    )}>
      <span className={cn(
        'w-1.5 h-1.5 rounded-full',
        state === 'completed' || state === 'approved' ? 'bg-success' :
        state === 'in_progress' ? 'bg-accent-from' :
        state === 'submitted' || state === 'under_review' ? 'bg-warning' :
        state === 'needs_changes' ? 'bg-error' :
        state === 'assigned' ? 'bg-info' :
        'bg-current'
      )} />
      {LABELS[state] || state}
    </span>
  )
}
