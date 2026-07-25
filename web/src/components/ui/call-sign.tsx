import { cn } from '../../lib/utils'

interface CallSignProps {
  children: string
  className?: string
  as?: 'span' | 'div' | 'label'
}

export default function CallSign({ children, className, as: Tag = 'span' }: CallSignProps) {
  return (
    <Tag className={cn('callsign', className)}>
      {children}
    </Tag>
  )
}
