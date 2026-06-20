import { type ReactNode } from 'react'

interface StatPill {
  label: string
  value: string | number
  color?: string
}

interface PageHeaderProps {
  title: string
  subtitle?: string
  pills?: StatPill[]
  actions?: ReactNode
  mono?: boolean
}

export function PageHeader({ title, subtitle, pills, actions, mono }: PageHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
      <div>
        <h1 className={`font-display text-2xl font-bold text-[#FDFBF8] tracking-tight mb-1 ${mono ? 'font-mono' : ''}`}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-[#FDFBF8]/45 text-sm leading-relaxed">{subtitle}</p>
        )}
        {pills && pills.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5">
            {pills.map((p, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 text-xs">
                <span className={`font-mono font-bold ${p.color ?? 'text-[#FDFBF8]'}`}>{p.value}</span>
                <span className="text-[#FDFBF8]/30">{p.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2.5 shrink-0">{actions}</div>
      )}
    </div>
  )
}
