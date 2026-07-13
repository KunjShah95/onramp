import { type ReactNode } from 'react'
import GradientHeading from './gradient-heading'

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

export function PageHeader({ title, subtitle, pills, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
      <div>
        <GradientHeading as="h1">{title}</GradientHeading>
        {subtitle && (
          <p className="text-body-sm text-text-muted mt-1.5 max-w-xl">{subtitle}</p>
        )}
        {pills && pills.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3">
            {pills.map((p, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 text-caption">
                <span className={`font-code font-bold ${p.color ?? 'text-text-primary'}`}>{p.value}</span>
                <span className="text-text-muted/50">{p.label}</span>
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
