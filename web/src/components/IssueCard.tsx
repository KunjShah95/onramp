import type { ScoredIssue } from '../lib/types'
import { cn } from '../lib/utils'

interface Props {
  issue: ScoredIssue
  onSelect?: (issue: ScoredIssue) => void
}

const complexityColors: Record<number, string> = {
  0: 'bg-green-500/10 text-green-400',
  1: 'bg-green-500/10 text-green-400',
  2: 'bg-green-500/10 text-green-400',
  3: 'bg-yellow-500/10 text-yellow-400',
  4: 'bg-yellow-500/10 text-yellow-400',
  5: 'bg-orange-500/10 text-orange-400',
  6: 'bg-orange-500/10 text-orange-400',
  7: 'bg-red-500/10 text-red-400',
  8: 'bg-red-500/10 text-red-400',
  9: 'bg-red-500/10 text-red-400',
  10: 'bg-red-500/10 text-red-400',
}

export default function IssueCard({ issue, onSelect }: Props) {
  const colorClass = complexityColors[Math.round(issue.complexity_score)] || 'bg-bg-tertiary text-text-muted'

  return (
    <div
      className="card cursor-pointer"
      onClick={() => onSelect?.(issue)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-text-primary truncate">{issue.title}</h3>
          {issue.body && (
            <p className="text-xs text-text-secondary mt-1 line-clamp-2">{issue.body}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn('text-xs px-2 py-0.5 rounded-full', colorClass)}>
            {issue.complexity_score.toFixed(1)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <span className="text-xs text-text-muted">{issue.estimated_hours}h</span>
        {issue.labels.slice(0, 3).map((label) => (
          <span
            key={label}
            className="text-xs bg-bg-elevated text-text-secondary px-2 py-0.5 rounded-full"
          >
            {label}
          </span>
        ))}
      </div>

      <div className="mt-2">
        <a
          href={issue.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-accent-from hover:text-accent-via"
          onClick={(e) => e.stopPropagation()}
        >
          View on GitHub →
        </a>
      </div>
    </div>
  )
}
