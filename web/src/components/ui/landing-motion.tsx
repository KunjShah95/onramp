import { useEffect, useRef, useState } from 'react'
import {
  animate,
  motion,
  useInView,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
} from 'framer-motion'
import { cn } from '../../lib/utils'

/* ─────────────────────────────────────────────────────────────
 * Mission Control motion primitives — shared craft layer for the
 * marketing surfaces. Every component is theme-var driven, GPU
 * friendly (opacity/transform only), and honors prefers-reduced-motion.
 * ───────────────────────────────────────────────────────────── */

/* ── Scroll progress — thin GO telemetry rail across the top ── */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.4 })
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-gradient-to-r from-go via-go-lit to-go"
      style={{ scaleX }}
    />
  )
}

/* ── SpotlightCard — cursor-tracked instrument glow ───────────
 * A soft radial light follows the pointer across the panel, the
 * way a reading lamp moves over a plotting board. Spring-smoothed
 * so it feels weighted, never jittery. */
export function SpotlightCard({
  children,
  className,
  spotClassName,
  disabled = false,
}: {
  children: React.ReactNode
  className?: string
  spotClassName?: string
  disabled?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const mx = useMotionValue(-400)
  const my = useMotionValue(-400)
  const x = useSpring(mx, { stiffness: 260, damping: 32, mass: 0.6 })
  const y = useSpring(my, { stiffness: 260, damping: 32, mass: 0.6 })
  const bg = useMotionTemplate`radial-gradient(420px circle at ${x}px ${y}px, rgba(14,122,60,0.09), transparent 65%)`

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (disabled) return
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    mx.set(e.clientX - r.left)
    my.set(e.clientY - r.top)
  }

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={() => {
        mx.set(-400)
        my.set(-400)
      }}
      className={cn('group/spot relative overflow-hidden', className)}
    >
      <motion.div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -inset-px z-0 opacity-0 transition-opacity duration-500 group-hover/spot:opacity-100',
          spotClassName
        )}
        style={{ background: bg }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  )
}

/* ── Marquee — continuous logo/wordmark drift with masked edges ── */
export function Marquee({
  children,
  className,
  duration = 36,
  reverse = false,
}: {
  children: React.ReactNode
  className?: string
  duration?: number
  reverse?: boolean
}) {
  const [contentRef, setContentRef] = useState<HTMLDivElement | null>(null)
  const [minWidth, setMinWidth] = useState(0)

  // Guard: if the single set of items is narrower than the viewport, the
  // -50% translate loop would show a gap. Stretch the track to guarantee
  // seamless coverage on ultra-wide viewports and sparse content.
  useEffect(() => {
    const el = contentRef
    if (!el) return
    const measure = () => setMinWidth(Math.max(el.scrollWidth * 2, window.innerWidth))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [contentRef])

  return (
    <div className={cn('marquee-mask relative flex w-full overflow-hidden', className)}>
      <div
        ref={setContentRef}
        className="flex w-max shrink-0 items-center"
        style={{
          minWidth,
          animation: `marquee-x ${duration}s linear infinite`,
          animationDirection: reverse ? 'reverse' : 'normal',
        }}
      >
        <div className="flex items-center">{children}</div>
        <div aria-hidden className="flex items-center">
          {children}
        </div>
      </div>
    </div>
  )
}

/* ── CountUp — telemetry readout that counts when in view ───── */
export function CountUp({
  to,
  prefix = '',
  suffix = '',
  duration = 1.6,
  className,
  delay = 0,
}: {
  to: number
  prefix?: string
  suffix?: string
  duration?: number
  className?: string
  delay?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const reducedMotion = useReducedMotion()
  const [val, setVal] = useState(0)

  useEffect(() => {
    // Reduced-motion users get the final value immediately.
    if (reducedMotion) {
      setVal(to)
      return
    }
    if (!inView) return
    const controls = animate(0, to, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setVal(v),
    })
    return () => controls.stop()
  }, [inView, to, duration, delay, reducedMotion])

  const formatted =
    to >= 1000
      ? Math.round(val).toLocaleString()
      : to % 1 === 0
        ? String(Math.round(val))
        : val.toFixed(1)

  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  )
}

/* ── Typewriter — cycles messages, types then deletes ───────── */
export function Typewriter({
  messages,
  className,
  typingSpeed = 42,
  deletingSpeed = 18,
  pause = 1600,
}: {
  messages: string[]
  className?: string
  typingSpeed?: number
  deletingSpeed?: number
  pause?: number
}) {
  const [msgIdx, setMsgIdx] = useState(0)
  const [chars, setChars] = useState(0)
  const [deleting, setDeleting] = useState(false)
  // Hold the message list in a ref so the typing loop never re-schedules
  // when the caller passes an inline array literal (new identity per render).
  const messagesRef = useRef(messages)
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    const current = messagesRef.current[msgIdx]
    let timeout: ReturnType<typeof setTimeout>

    if (!deleting && chars === current.length) {
      timeout = setTimeout(() => setDeleting(true), pause)
    } else if (deleting && chars === 0) {
      setDeleting(false)
      setMsgIdx((i) => (i + 1) % messagesRef.current.length)
    } else {
      timeout = setTimeout(
        () => setChars((c) => c + (deleting ? -1 : 1)),
        deleting ? deletingSpeed : typingSpeed
      )
    }
    return () => clearTimeout(timeout)
  }, [chars, deleting, msgIdx, typingSpeed, deletingSpeed, pause])

  return (
    <span className={className}>
      {messages[msgIdx].slice(0, chars)}
      <motion.span
        aria-hidden
        className="ml-px inline-block h-[1em] w-[2px] translate-y-[2px] bg-go align-baseline"
        animate={{ opacity: [1, 0, 1] }}
        transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
      />
    </span>
  )
}
