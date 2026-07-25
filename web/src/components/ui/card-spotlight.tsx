import { type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface CardSpotlightProps {
  children: ReactNode
  className?: string
  color?: string
}

export default function CardSpotlight({ children, className }: CardSpotlightProps) {
  return (
    <div className={cn('console-panel', className)}>
      <div className="relative z-10">{children}</div>
    </div>
  )
}
