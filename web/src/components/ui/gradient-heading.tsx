import { type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface GradientHeadingProps {
  children: ReactNode
  className?: string
  as?: 'h1' | 'h2' | 'h3' | 'h4'
}

const sizes = {
  h1: 'text-3xl md:text-4xl',
  h2: 'text-2xl md:text-3xl',
  h3: 'text-xl md:text-2xl',
  h4: 'text-lg md:text-xl',
}

export default function GradientHeading({ children, className, as: Tag = 'h2' }: GradientHeadingProps) {
  return (
    <Tag className={cn(
      'font-display font-bold bg-gradient-to-r from-[#FF8C00] via-[#FF6B35] to-[#FFB347] bg-clip-text text-transparent',
      sizes[Tag],
      className
    )}>
      {children}
    </Tag>
  )
}
