import { useEffect, useRef, useState, type ReactNode } from 'react'

interface LazyMountProps {
  children: ReactNode
  /**
   * Rendered until the viewport gate opens. Keeps the same footprint as the
   * real content so there is no layout shift while the chunk is deferred.
   */
  fallback?: ReactNode
  /**
   * Extra viewport expansion (CSS margin shorthand) used to prefetch slightly
   * *before* the element scrolls into view. Default '400px 0px'.
   */
  rootMargin?: string
  /**
   * Minimum delay (ms) after mount before the gate can open, even when the
   * element is already in view. Use for above-the-fold decorative scenes so
   * the initial render never fetches the heavy chunk. Default 0.
   */
  delayMs?: number
  className?: string
}

/**
 * Deferred mount — a complement to `React.lazy`.
 *
 * `React.lazy` alone still *fetches* the chunk as soon as the lazy element
 * renders (i.e. at page load). `LazyMount` keeps the element unmounted until
 * its host approaches the viewport, so the dynamic import — and everything it
 * pulls in, like the ~1.1MB Babylon core hub — only downloads on demand.
 *
 * Once the gate opens it stays open (observer disconnects). Falls back to
 * rendering children immediately when IntersectionObserver is unavailable.
 */
export default function LazyMount({
  children,
  fallback = null,
  rootMargin = '400px 0px',
  delayMs = 0,
  className,
}: LazyMountProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  const [elapsed, setElapsed] = useState(delayMs <= 0)
  const open = inView && elapsed

  useEffect(() => {
    if (delayMs <= 0) return
    const t = window.setTimeout(() => setElapsed(true), delayMs)
    return () => window.clearTimeout(t)
  }, [delayMs])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true)
          io.disconnect()
        }
      },
      { rootMargin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [rootMargin])

  return (
    <div ref={ref} className={className}>
      {open ? children : fallback}
    </div>
  )
}
