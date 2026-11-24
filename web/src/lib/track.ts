/**
 * First-party product analytics.
 *
 * Events go to our own API (`POST /api/v1/events`), not to a hosted analytics
 * vendor. The reasoning is in backend/app/api/v1/analytics.py — short version:
 * we sell the fact that we treat customer code carefully, so the behaviour data
 * stays in our infrastructure too, where it can be described honestly on the
 * Trust page.
 *
 * What this file deliberately does NOT send:
 *   - no cookies, no localStorage identifier, no fingerprinting
 *   - no query strings or fragments, so the reset/verify tokens that travel in
 *     the URL (`/reset-password?token=…`) can never be captured
 *   - no form values, no error text, no user input of any kind
 *   - nothing identifying a person; the visitor id is derived server-side from a
 *     rotating daily hash of the IP, which we never see
 *
 * Every call is best-effort. Analytics must never throw, never block a render,
 * and never delay navigation.
 */

import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { captureUtm } from './attribution'
import { captureCouponIntent } from './plan-intent'

/** Must stay in sync with ALLOWED_EVENTS in the backend. Unknown names are dropped server-side. */
export type EventName =
  | 'cta_click'
  | 'section_viewed'
  | 'calculator_adjusted'
  | 'pricing_tier_viewed'
  | 'signup_completed'
  | 'docs_opened'
  | 'repo_connected'
  | 'ask_answered'
  | 'invite_sent'
  | 'contact_submitted'

export type EventProps = Record<string, string | number | boolean>

const ENDPOINT = '/api/v1/events'
const FLUSH_MS = 2500
const MAX_BATCH = 20

let queue: Array<{ name: EventName; props: EventProps }> = []
let timer: ReturnType<typeof setTimeout> | null = null
let currentPath = '/'

/** Honoured so the tracker is not the one thing that ignores the signal. */
function doNotTrack(): boolean {
  if (typeof navigator === 'undefined') return true
  const win = navigator as Navigator & { msDoNotTrack?: string; globalPrivacyControl?: boolean }
  return (
    navigator.doNotTrack === '1' ||
    win.msDoNotTrack === '1' ||
    win.globalPrivacyControl === true
  )
}

function enabled(): boolean {
  if (typeof window === 'undefined') return false
  if (doNotTrack()) return false
  // Local development: don't fill the dev database with noise.
  if (import.meta.env.DEV) return false
  return true
}

/**
 * Strip anything that could carry a secret or an identifier.
 * Only pathname is ever sent — never search, never hash, never href.
 */
export function safePath(): string {
  if (typeof window === 'undefined') return '/'
  const { pathname } = window.location
  return pathname.split('?')[0].split('#')[0] || '/'
}

function flush() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (queue.length === 0) return

  const batch = queue.slice(0, MAX_BATCH)
  queue = queue.slice(MAX_BATCH)
  const body = JSON.stringify({ path: currentPath, events: batch })

  try {
    if (navigator.sendBeacon) {
      // Survives page unload, which a normal fetch does not.
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))
      return
    }
  } catch {
    // fall through to fetch
  }

  try {
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'omit',
    }).catch(() => {
      /* analytics is best-effort */
    })
  } catch {
    /* analytics is best-effort */
  }
}

/** Record an event. Safe to call from anywhere; never throws. */
export function track(name: EventName, props: EventProps = {}): void {
  if (!enabled()) return
  try {
    queue.push({ name, props })
    if (queue.length >= MAX_BATCH) {
      flush()
      return
    }
    if (!timer) timer = setTimeout(flush, FLUSH_MS)
  } catch {
    /* analytics is best-effort */
  }
}

/** Keep the reported path in step with client-side navigation. */
export function useTrackedPath(): void {
  const { pathname } = useLocation()
  useEffect(() => {
    currentPath = pathname.split('?')[0].split('#')[0] || '/'
    captureUtm()
    captureCouponIntent()
  }, [pathname])
}

/**
 * Report a section once, the first time it scrolls into view.
 *
 * Fires at most once per mount, and uses the same rootMargin as the reveal
 * animation so a section is counted when it becomes visible rather than when
 * it is technically on screen.
 */
export function useSectionView(sectionId: string | undefined): void {
  const sent = useRef(false)

  useEffect(() => {
    if (!sectionId) return
    if (!enabled()) return
    if (sent.current) return
    if (typeof IntersectionObserver === 'undefined') return

    sent.current = true
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          track('section_viewed', { section: sectionId })
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0 },
    )

    const el = document.getElementById(sectionId)
    if (!el) {
      sent.current = false
      return
    }
    observer.observe(el)
    return () => observer.disconnect()
  }, [sectionId])
}
