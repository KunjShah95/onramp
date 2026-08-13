import { motion } from 'framer-motion'
import { cn } from '../../lib/utils'

const EASE = [0.16, 1, 0.3, 1] as const

export interface SectionHeadingProps {
  eyebrow?: string
  heading: React.ReactNode
  sub?: string
  align?: 'left' | 'center'
  className?: string
}

/**
 * SectionHeading — the landing's quiet, confident header block.
 *
 * No chapter markers, no mono eyebrows, no self-reference: a small sans
 * eyebrow, an Inter headline, and an optional subhead. The restraint is the
 * premium — the product carries the page, not the decoration.
 */
export default function SectionHeading({
  eyebrow,
  heading,
  sub,
  align = 'left',
  className,
}: SectionHeadingProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.6, ease: EASE }}
      className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center', className)}
    >
      {eyebrow && (
        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent-primary">
          {eyebrow}
        </p>
      )}
      <h2 className="mt-3 font-body text-[clamp(1.9rem,4vw,2.9rem)] font-bold leading-[1.08] tracking-[-0.02em] text-ink">
        {heading}
      </h2>
      {sub && (
        <p
          className={cn(
            'mt-4 max-w-xl text-[16px] leading-[1.6] text-ink-secondary',
            align === 'center' && 'mx-auto'
          )}
        >
          {sub}
        </p>
      )}
    </motion.div>
  )
}
