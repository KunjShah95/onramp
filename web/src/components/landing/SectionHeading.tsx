import { cn } from '../../lib/utils'

export interface SectionHeadingProps {
  eyebrow?: string
  heading: React.ReactNode
  sub?: string
  align?: 'left' | 'center'
  className?: string
}

/**
 * SectionHeading — calm, composed, shadcn-style.
 * Small muted eyebrow, semibold tracking-tight headline, quiet subhead.
 * No motion, no gradient, no spotlight.
 */
export default function SectionHeading({
  eyebrow,
  heading,
  sub,
  align = 'center',
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center', className)}>
      {eyebrow && (
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground text-ink-tertiary">
          {eyebrow}
        </p>
      )}
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        {heading}
      </h2>
      {sub && (
        <p
          className={cn(
            'mt-3 max-w-xl text-[15px] leading-relaxed text-ink-secondary',
            align === 'center' && 'mx-auto'
          )}
        >
          {sub}
        </p>
      )}
    </div>
  )
}
