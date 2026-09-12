import { useEffect, useState } from 'react'

/**
 * Landing color mode — shared by every public surface (landing, marketing
 * pages, auth shell, 404). Defaults to dark (the Aceternity identity);
 * 'light' is the daylight variant. Persisted per-browser and kept in sync
 * across all mounted consumers with a tiny custom event, so the toggle in
 * one nav flips every public page instantly.
 *
 * Also mirrors the mode onto `<html class="landing-mode-light">` — index.html
 * sets that class pre-paint (before React mounts) from the same storage key,
 * and this hook keeps it correct after mount so the two never disagree.
 */
export type LandingMode = 'dark' | 'light'

const STORAGE_KEY = 'onramp-landing-mode'
const EVENT = 'onramp:landing-mode'
const HTML_CLASS = 'landing-mode-light'

function readInitial(): LandingMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function applyHtmlClass(mode: LandingMode) {
  // No-op guard for non-browser environments (tests, SSR).
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle(HTML_CLASS, mode === 'light')
}

export function useLandingTheme() {
  const [mode, setMode] = useState<LandingMode>(readInitial)

  // Keep the pre-paint class aligned with the resolved mode after mount.
  useEffect(() => {
    applyHtmlClass(mode)
  }, [mode])

  useEffect(() => {
    const sync = () => setMode(readInitial())
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const toggle = () => {
    const next: LandingMode = mode === 'dark' ? 'light' : 'dark'
    setMode(next)
    applyHtmlClass(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* private mode — session-only */
    }
    window.dispatchEvent(new Event(EVENT))
  }

  /** Class fragment to append: '' in dark, ' landing-light' in light mode. */
  const lightClass = mode === 'light' ? ' landing-light' : ''

  return { mode, toggle, isLight: mode === 'light', lightClass }
}
