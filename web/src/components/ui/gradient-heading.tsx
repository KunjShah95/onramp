import { cn } from '../../lib/utils'

interface GradientHeadingProps {
  children: React.ReactNode
  as?: 'h1' | 'h2' | 'h3' | 'h4'
  className?: string
}

export default function GradientHeading({ children, as: Tag = 'h2', className }: GradientHeadingProps) {
  return (
    <Tag className={cn(
      'font-display font-bold text-text-primary tracking-tight',
      Tag === 'h1' && 'text-display-md md:text-display-lg',
      Tag === 'h2' && 'text-display-sm md:text-display-md',
      Tag === 'h3' && 'text-display-xs',
      Tag === 'h4' && 'text-display-xs',
      className
    )}>
      {children}
    </Tag>
  )
}
