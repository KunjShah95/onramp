import { Link } from 'react-router-dom'
import { cn } from '../../lib/utils'

interface RepoCardProps {
  owner: string
  name: string
  status: 'analyzing' | 'ready' | 'error'
  lastAnalyzed: string
}

const statusConfig = {
  analyzing: { label: 'Analyzing', className: 'badge-warning' },
  ready: { label: 'Ready', className: 'badge-success' },
  error: { label: 'Error', className: 'badge-error' },
}

export default function RepoCard({ owner, name, status, lastAnalyzed }: RepoCardProps) {
  const s = statusConfig[status]

  return (
    <Link to={`/analysis/${owner}/${name}`} className="card block group">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-base font-semibold text-text-primary group-hover:text-accent-from transition-colors">
            {owner}/{name}
          </h3>
          <p className="text-sm text-text-muted mt-1">Last analyzed: {lastAnalyzed}</p>
        </div>
        <span className={cn('badge', s.className)}>
          {s.label}
        </span>
      </div>
    </Link>
  )
}
