import { type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface BentoCardProps {
  children: ReactNode
  className?: string
  variant?: 'default' | 'accent' | 'outline'
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizeClasses = {
  sm: 'col-span-1 row-span-1 p-5',
  md: 'col-span-1 md:col-span-1 row-span-1 p-6',
  lg: 'col-span-1 md:col-span-2 row-span-1 p-6',
  xl: 'col-span-1 md:col-span-2 row-span-1 md:row-span-2 p-6',
}

const variantClasses = {
  default: 'bg-slate-900/60 border-white/[0.06] hover:border-white/[0.12]',
  accent: 'bg-gradient-to-br from-accent-from/[0.08] to-accent-via/[0.04] border-accent-from/20 hover:border-accent-from/40',
  outline: 'bg-transparent border-white/[0.04] hover:border-white/[0.1]',
}

export default function BentoCard({ children, className, variant = 'default', size = 'md' }: BentoCardProps) {
  return (
    <div className={cn(
      'group relative rounded-2xl border backdrop-blur-sm transition-all duration-500',
      sizeClasses[size],
      variantClasses[variant],
      'hover:shadow-[0_0_40px_-12px_rgba(255,140,0,0.15)]',
      className
    )}>
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-accent-from/0 via-accent-via/0 to-accent-to/0 group-hover:from-accent-from/[0.02] group-hover:via-accent-via/[0.02] group-hover:to-accent-to/[0.02] transition-all duration-500 pointer-events-none" />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  )
}

export function BentoIcon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn(
      'w-9 h-9 rounded-lg bg-gradient-to-br from-accent-from/15 to-accent-via/15 border border-accent-from/15 flex items-center justify-center mb-4',
      className
    )}>
      {children}
    </div>
  )
}

export function BentoTag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-800/60 border border-white/[0.06] text-[10px] font-medium text-slate-400 uppercase tracking-wider',
      className
    )}>
      {children}
    </span>
  )
}
