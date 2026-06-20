import { useRef, useState, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface CardSpotlightProps {
  children: ReactNode
  className?: string
  radius?: number
  color?: string
}

export default function CardSpotlight({
  children,
  className,
  radius = 350,
  color = 'rgba(255,140,0,0.08)',
}: CardSpotlightProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [x, setX] = useState(0)
  const [y, setY] = useState(0)

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    setX(e.clientX - rect.left)
    setY(e.clientY - rect.top)
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-[#FDFBF8]/5 bg-[#1A110D] transition-all duration-300',
        'hover:border-[#FF8C00]/20 hover:shadow-[0_0_40px_-12px_rgba(255,140,0,0.12)]',
        className
      )}
    >
      <div
        className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(${radius}px circle at ${x}px ${y}px, ${color}, transparent 80%)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  )
}
