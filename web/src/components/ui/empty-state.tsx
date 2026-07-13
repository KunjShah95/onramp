import { type ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {icon && (
        <div className="mb-5 text-text-muted/30 [&>svg]:w-10 [&>svg]:h-10">{icon}</div>
      )}
      <p className="text-body-sm font-medium text-text-muted/70 mb-1">{title}</p>
      {description && (
        <p className="text-caption text-text-muted/40 max-w-[260px] leading-relaxed mb-5">
          {description}
        </p>
      )}
      {action && action}
    </div>
  )
}
