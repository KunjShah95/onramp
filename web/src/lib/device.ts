/**
 * Device-capability heuristics for gating heavy runtime features.
 *
 * The landing page renders a ~1.4MB Babylon.js architecture map. On
 * data-constrained or slow networks (or when a user has explicitly enabled
 * Save-Data), we skip the WebGL bundle entirely and render a lightweight static
 * surface instead — saving a multi-MB download the device can't run well.
 *
 * These are soft, preference-driven signals, never a hard block: a capable
 * device on a good network still gets the full 3D scene.
 */

interface NetworkConnection {
  saveData?: boolean
  effectiveType?: 'slow-2g' | '2g' | '3g' | '4g'
}

/** Navigator.connection (Network Information API), typed leniently. */
function getConnection(): NetworkConnection | null {
  if (typeof navigator === 'undefined') return null
  const nav = navigator as Navigator & { connection?: NetworkConnection }
  return nav.connection ?? null
}

/** True when the user has enabled Data Saver / Save-Data. */
export function prefersSaveData(): boolean {
  return !!getConnection()?.saveData
}

/** True on 2G-class or slower networks, where a ~1.4MB bundle would stall. */
export function prefersSlowNetwork(): boolean {
  const t = getConnection()?.effectiveType
  return t === 'slow-2g' || t === '2g'
}

/** True when the user prefers reduced motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * True when heavy WebGL scenes (Babylon.js) should be skipped in favor of a
 * static fallback. Fires on Save-Data or a 2G-class network — both situations
 * where downloading ~1.4MB of 3D engine is pure waste.
 */
export function shouldDeferHeavyScene(): boolean {
  return prefersSaveData() || prefersSlowNetwork()
}
