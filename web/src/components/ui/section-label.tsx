import { type ReactNode } from 'react'

interface SectionLabelProps {
  children: ReactNode
  action?: ReactNode
  className?: string
}

export function SectionLabel({ children, action, className }: SectionLabelProps) {
  return (
    <div className={`flex items-center justify-between mb-4 ${className ?? ''}`}>
      <span className="text-[10px] uppercase tracking-widest text-[#FDFBF8]/30 font-semibold">
        {children}
      </span>
      {action && action}
    </div>
  )
}

export function Divider({ className }: { className?: string }) {
  return <div className={`border-t border-[#FDFBF8]/5 ${className ?? ''}`} />
}
