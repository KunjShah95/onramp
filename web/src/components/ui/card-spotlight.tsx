import { type ReactNode, type MouseEvent, useRef } from 'react'
import { cn } from '../../lib/utils'

interface CardSpotlightProps {
  children: ReactNode
  className?: string
  color?: string
}

/**
 * Premium card component with subtle spotlight hover effect.
 * Uses a radial-gradient that follows the mouse cursor for an elegant
 * illuminated surface feel without being overly flashy.
 */
export default function CardSpotlight({ children, className, color = 'rgba(245,158,11,0.04)' }: CardSpotlightProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current
    if (!card) return
    const rect = card.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    card.style.setProperty('--mouse-x', `${x}px`)
    card.style.setProperty('--mouse-y', `${y}px`)
  }

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      className={cn(
        'relative rounded-card border border-border bg-bg-secondary shadow-card overflow-hidden',
        'transition-all duration-300 hover:border-border-hover hover:shadow-elevated',
        'before:pointer-events-none before:absolute before:inset-0 before:opacity-0 before:transition-opacity before:duration-500',
        'hover:before:opacity-100',
        className
      )}
      style={{
        backgroundImage: `radial-gradient(300px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), ${color}, transparent 70%)`,
      }}
    >
      {/* Inner border glow */}
      <div className="absolute inset-0 rounded-card pointer-events-none shadow-inner-glow" />
      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  )
}
