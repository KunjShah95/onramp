import { cn } from '../../lib/utils'

interface StatusBadgeProps {
  state: string
  className?: string
}

const COLORS: Record<string, string> = {
  pending: 'text-[#FDFBF8]/50 bg-[#FDFBF8]/5 border-[#FDFBF8]/10',
  assigned: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  in_progress: 'text-[#FF8C00] bg-[#FF8C00]/10 border-[#FF8C00]/20',
  submitted: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  under_review: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  needs_changes: 'text-red-400 bg-red-500/10 border-red-500/20',
  product_review: 'text-pink-400 bg-pink-500/10 border-pink-500/20',
  approved: 'text-green-400 bg-green-500/10 border-green-500/20',
  completed: 'text-green-400 bg-green-500/10 border-green-500/20',
  cancelled: 'text-[#FDFBF8]/30 bg-[#FDFBF8]/5 border-[#FDFBF8]/10',
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
        state === 'completed' ? 'bg-green-400' :
        state === 'in_progress' ? 'bg-[#FF8C00]' :
        state === 'submitted' || state === 'under_review' ? 'bg-yellow-400' :
        state === 'needs_changes' ? 'bg-red-400' :
        state === 'approved' ? 'bg-green-400' :
        'bg-current'
      )} />
      {LABELS[state] || state}
    </span>
  )
}
