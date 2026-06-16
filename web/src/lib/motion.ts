/**
 * Shared Framer Motion animation variants.
 * Import these instead of defining per-component — keeps timing + easing consistent.
 */

// ── Reveal Variants ──────────────────────────────────────────

export const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1], delay },
  }),
}

export const fadeIn = {
  hidden: { opacity: 0 },
  visible: (delay = 0) => ({
    opacity: 1,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1], delay },
  }),
}

export const fadeDown = {
  hidden: { opacity: 0, y: -16 },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1], delay },
  }),
}

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: (delay = 0) => ({
    opacity: 1,
    scale: 1,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1], delay },
  }),
}

export const slideInLeft = {
  hidden: { opacity: 0, x: -32 },
  visible: (delay = 0) => ({
    opacity: 1,
    x: 0,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1], delay },
  }),
}

export const slideInRight = {
  hidden: { opacity: 0, x: 32 },
  visible: (delay = 0) => ({
    opacity: 1,
    x: 0,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1], delay },
  }),
}

// ── Container Variants ───────────────────────────────────────

export const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
}

export const staggerContainerSlow = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.15, delayChildren: 0.2 },
  },
}

// ── Interaction Variants ─────────────────────────────────────

export const hoverLift = {
  y: -2,
  transition: { type: 'spring', stiffness: 300, damping: 20 },
}

export const tapScale = {
  scale: 0.97,
  transition: { duration: 0.1 },
}

// ── Easing Presets ───────────────────────────────────────────

export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const
export const EASE_SPRING = [0.34, 1.56, 0.64, 1] as const
export const EASE_SMOOTH = [0.4, 0, 0.2, 1] as const

// ── Duration Presets ─────────────────────────────────────────

export const DURATION = {
  instant: 0.1,
  fast: 0.2,
  normal: 0.3,
  slow: 0.5,
  dramatic: 0.8,
} as const
