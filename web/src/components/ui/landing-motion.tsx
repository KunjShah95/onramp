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
  glow = 'rgba(14,122,60,0.09)',
}: {
  children: React.ReactNode
  className?: string
  spotClassName?: string
  disabled?: boolean
  /** The cursor-following glow color (CSS color). Defaults to the emerald accent. */
  glow?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const mx = useMotionValue(-400)
  const my = useMotionValue(-400)
  const x = useSpring(mx, { stiffness: 260, damping: 32, mass: 0.6 })
  const y = useSpring(my, { stiffness: 260, damping: 32, mass: 0.6 })
  const bg = useMotionTemplate`radial-gradient(420px circle at ${x}px ${y}px, ${glow}, transparent 65%)`

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

/* ── Beams — drifting background light streaks ─────────────────
 * The Aceternity "background beams / meteors" signature done GPU-cheap:
 * thin rotated gradient lines that translate across the canvas on an
 * infinite loop. Decorative only. transform-only; respects
 * prefers-reduced-motion by freezing to a static opacity ghost. */
export function Beams({ className }: { className?: string }) {
  const reduced = useReducedMotion()
  const beams = [
    { top: '18%', left: '-20%', rotate: 24, delay: 0, dur: 14, op: 0.5 },
    { top: '34%', left: '-32%', rotate: 18, delay: 3.2, dur: 18, op: 0.4 },
    { top: '52%', left: '-15%', rotate: 30, delay: 6, dur: 15, op: 0.35 },
    { top: '66%', left: '-40%', rotate: 12, delay: 1.4, dur: 20, op: 0.45 },
    { top: '80%', left: '-25%', rotate: 26, delay: 5, dur: 13, op: 0.3 },
  ]
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {beams.map((b, i) => (
        <motion.div
          key={i}
          className="absolute h-px w-[42rem]"
          style={{
            top: b.top,
            left: b.left,
            opacity: b.op,
            rotate: b.rotate,
            background:
              'linear-gradient(90deg, transparent 0%, rgba(0,217,255,0.28) 30%, rgba(16,185,129,0.36) 55%, rgba(52,211,153,0.18) 70%, transparent 100%)',
            filter: 'blur(0.5px)',
          }}
          animate={
            reduced
              ? undefined
              : {
                  x: ['0vw', '175vw'],
                  opacity: [b.op, b.op * (i % 2 === 0 ? 0.7 : 0.9), b.op],
                }
          }
          transition={{ duration: b.dur, delay: b.delay, repeat: Infinity, ease: 'linear', repeatDelay: 1.2 }}
        />
      ))}
    </div>
  )
}

/* ── MovingBorder — animated conic gradient border ─────────────
 * The Aceternity "moving border" signature: a slow-rotating conic
 * gradient is clipped to a 1px ring around a card. The gradient turns
 * slowly behind the content; only the ring shows. transform-only. */
export function MovingBorder({
  children,
  className,
  innerClassName,
  speed = 7,
}: {
  children: React.ReactNode
  className?: string
  innerClassName?: string
  speed?: number
}) {
  const reduced = useReducedMotion()
  return (
    // overflow-hidden clips the -inset-[120%] rotating conic gradient so it
    // can't expand the scrollable area on small viewports (the visible 1px
    // ring lives inside the wrapper's border box, so it is unaffected).
    <div className={cn('relative overflow-hidden rounded-[24px] p-px', className)}>
      {/* rotating conic ring */}
      <motion.div
        aria-hidden
        className="absolute -inset-[120%]"
        style={{
          background:
            'conic-gradient(from var(--angle), transparent 0deg, rgba(0,217,255,0.6) 70deg, rgba(52,211,153,0.7) 120deg, rgba(255,255,255,0.08) 160deg, transparent 200deg, transparent 360deg)',
          ['--angle' as string]: '0deg',
        }}
        animate={
          reduced
            ? undefined
            : ({ '--angle': ['0deg', '360deg'] } as unknown as { '--angle': string })
        }
        transition={{ duration: speed, repeat: Infinity, ease: 'linear' }}
      />
      {/* mask back to a thin ring + solid interior */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-[24px]"
        style={{
          background: 'var(--base)',
          WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          padding: '1px',
        }}
      />
      <div className={cn('relative rounded-[23px]', innerClassName)}>{children}</div>
    </div>
  )
}

