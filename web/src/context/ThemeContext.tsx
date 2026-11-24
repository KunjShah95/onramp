import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { THEMES, ACCENT_COLORS, type Theme } from '../lib/themes'

// The theme and accent catalogues live in `lib/themes.ts` so this module keeps
// only the Provider + hook. A context module that also exports plain arrays
// cannot be Fast-Refreshed — Vite invalidates it, the context identity swaps,
// and every `useTheme()` consumer throws on the next edit. See lib/themes.ts.
//
// The type re-export is safe (erased at compile time); re-exporting a *value*
// here would reintroduce the bug this split exists to prevent.
export type { Theme } from '../lib/themes'

interface ThemeContextValue {
  theme: Theme
  accentColor: string
  setTheme: (t: Theme) => void
  setAccentColor: (color: string) => void
  resetAccentColor: () => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const THEME_KEY = 'onramp-theme'
const ACCENT_KEY = 'onramp-accent'
const DARK_THEME_KEY = 'onramp-dark-theme'

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const stored = localStorage.getItem(THEME_KEY)
  const valid = THEMES.find(t => t.id === stored)
  return valid?.id ?? 'light'
}

function getInitialAccent(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(ACCENT_KEY) || ''
}

/** Convert a #RRGGBB / #RGB hex color to an "r g b" CSS triplet (used by rgb(var(--x) / …)). */
function hexToRgbTriplet(hex: string): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const num = Number.parseInt(full, 16)
  if (Number.isNaN(num)) return hex
  return `${(num >> 16) & 255} ${(num >> 8) & 255} ${num & 255}`
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)
  const [accentColor, setAccentColorState] = useState<string>(getInitialAccent)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    const root = document.documentElement
    if (accentColor) {
      const match = ACCENT_COLORS.find(c => c.value === accentColor)
      if (match) {
        root.style.setProperty('--accent-from', hexToRgbTriplet(match.cssFrom))
        root.style.setProperty('--accent-via', hexToRgbTriplet(match.cssVia))
        root.style.setProperty('--accent-to', hexToRgbTriplet(match.cssTo))
        root.style.setProperty('--accent-muted', hexToRgbTriplet(match.value))
        root.style.setProperty('--accent-glow', hexToRgbTriplet(match.value))
        root.style.setProperty('--accent-primary', hexToRgbTriplet(match.value))
        root.style.setProperty('--accent-primary-hover', hexToRgbTriplet(match.cssTo))
      } else {
        root.style.setProperty('--accent-from', hexToRgbTriplet(accentColor))
        root.style.setProperty('--accent-primary', hexToRgbTriplet(accentColor))
      }
      localStorage.setItem(ACCENT_KEY, accentColor)
    } else {
      root.style.removeProperty('--accent-from')
      root.style.removeProperty('--accent-via')
      root.style.removeProperty('--accent-to')
      root.style.removeProperty('--accent-muted')
      root.style.removeProperty('--accent-glow')
      root.style.removeProperty('--accent-primary')
      root.style.removeProperty('--accent-primary-hover')
      localStorage.removeItem(ACCENT_KEY)
    }
  }, [accentColor])

  const setTheme = useCallback((t: Theme) => {
    if (t !== 'light') {
      localStorage.setItem(DARK_THEME_KEY, t)
    }
    setThemeState(t)
  }, [])

  /** Toggle between light mode and the last-used dark theme. */
  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      if (current === 'light') {
        const storedDark = localStorage.getItem(DARK_THEME_KEY)
        const validDark = THEMES.find((t) => t.id === storedDark && t.id !== 'light')
        return validDark?.id ?? 'himalayan'
      }
      localStorage.setItem(DARK_THEME_KEY, current)
      return 'light'
    })
  }, [])

  const setAccentColor = useCallback((color: string) => {
    setAccentColorState(color)
  }, [])

  const resetAccentColor = useCallback(() => {
    setAccentColorState('')
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, accentColor, setTheme, setAccentColor, resetAccentColor, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
