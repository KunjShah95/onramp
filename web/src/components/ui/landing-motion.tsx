import { cn } from '../../lib/utils'

/* ─────────────────────────────────────────────────────────────
 * Calm motion primitives — shadcn-style restraint.
 *
 * The previous file held ScrollProgress, SpotlightCard, Beams,
 * Magnetic, HeroSpotlight, MovingBorder, Marquee, CountUp,
 * Typewriter — classic AI-bloat: cursor glows, infinite loops,
 * springs, conic borders. All removed.
 *
 * API is preserved so existing imports keep compiling, but every
 * primitive now renders a plain, static surface with at most a
 * 150ms color transition. No springs, no loops, no glow.
 * ───────────────────────────────────────────────────────────── */

/* ── Scroll progress — removed. Calm pages don't need a telemetry rail. ── */
export function ScrollProgress() {
  return null
}

/* ── SpotlightCard — plain bordered panel, no cursor glow ─────────── */
export function SpotlightCard({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
  spotClassName?: string
  disabled?: boolean
  glow?: string
}) {
  return <div className={cn('rounded-md border border-seam bg-panel', className)}>{children}</div>
}

/* ── Marquee — static row, no drift ── */
export function Marquee({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
  duration?: number
  reverse?: boolean
}) {
  return <div className={cn('flex w-full flex-wrap items-center gap-6', className)}>{children}</div>
}

/* ── CountUp — final value immediately, no animation ───── */
export function CountUp({
  to,
  prefix = '',
  suffix = '',
  className,
}: {
  to: number
  prefix?: string
  suffix?: string
  duration?: number
  className?: string
  delay?: number
}) {
  const formatted =
    to >= 1000
      ? Math.round(to).toLocaleString()
      : to % 1 === 0
        ? String(Math.round(to))
        : to.toFixed(1)
  return (
    <span className={cn('tabular-nums', className)}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  )
}

/* ── Typewriter — first message only, no loop ───────── */
export function Typewriter({
  messages,
  className,
}: {
  messages: string[]
  className?: string
  typingSpeed?: number
  deletingSpeed?: number
  pause?: number
}) {
  return <span className={className}>{messages[0] ?? ''}</span>
}

/* ── Beams — removed ───────────────── */
export function Beams({ className }: { className?: string }) {
  void className
  return null
}

/* ── Magnetic — plain wrapper, no attraction ────────────────────── */
export function Magnetic({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
  strength?: number
}) {
  return <div className={cn('inline-block', className)}>{children}</div>
}

/* ── HeroSpotlight — removed ────────── */
export function HeroSpotlight({ className }: { className?: string }) {
  void className
  return null
}

/* ── MovingBorder — plain bordered card, no conic ring ───────────── */
export function MovingBorder({
  children,
  className,
  innerClassName,
}: {
  children: React.ReactNode
  className?: string
  innerClassName?: string
  speed?: number
}) {
  return (
    <div className={cn('rounded-md border border-seam bg-panel', className)}>
      <div className={cn('rounded-md', innerClassName)}>{children}</div>
    </div>
  )
}
