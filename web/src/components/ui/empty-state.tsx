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
        <div className="mb-5 text-[#FDFBF8]/12 [&>svg]:w-12 [&>svg]:h-12">{icon}</div>
      )}
      <p className="text-sm font-medium text-[#FDFBF8]/35 mb-1">{title}</p>
      {description && (
        <p className="text-xs text-[#FDFBF8]/20 max-w-[240px] leading-relaxed mb-5">
          {description}
        </p>
      )}
      {action && action}
    </div>
  )
}
