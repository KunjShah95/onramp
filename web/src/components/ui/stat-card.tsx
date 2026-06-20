import { type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface StatCardProps {
  label: string
  value: string | number
  color?: string
  accentColor?: string
  icon?: ReactNode
  sub?: string
  className?: string
  onClick?: () => void
}

export function StatCard({
  label,
  value,
  color = 'text-[#FDFBF8]',
  accentColor,
  icon,
  sub,
  className,
  onClick,
}: StatCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'relative bg-[#1A110D] border border-[#FDFBF8]/5 rounded-xl p-5 overflow-hidden',
        'transition-all duration-300',
        onClick
          ? 'cursor-pointer hover:border-[#FDFBF8]/12 hover:bg-[#1A110D]/80'
          : 'hover:border-[#FDFBF8]/8',
        className
      )}
    >
      {accentColor && (
        <div
          className="absolute inset-x-0 top-0 h-px pointer-events-none"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${accentColor}50 50%, transparent 100%)`,
          }}
        />
      )}
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className={cn('font-display text-3xl font-bold tracking-tight leading-none', color)}>
            {value}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-[#FDFBF8]/35 font-semibold mt-2">
            {label}
          </div>
          {sub && <div className="text-[11px] text-[#FDFBF8]/25 mt-1">{sub}</div>}
        </div>
        {icon && (
          <div className="ml-3 shrink-0 opacity-30">{icon}</div>
        )}
      </div>
    </div>
  )
}
