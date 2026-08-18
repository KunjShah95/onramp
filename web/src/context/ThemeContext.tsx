import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

export const THEMES = [
  { id: 'light', name: 'Light', icon: 'sun', description: 'Daylit mission control with green accents' },
  { id: 'himalayan', name: 'Himalayan', icon: 'dark_mode', description: 'Deep blue-dark with warm orange accents' },
  { id: 'midnight', name: 'Midnight', icon: 'bedtime', description: 'Cool indigo-dark with violet-blue accents' },
  { id: 'forest', name: 'Forest', icon: 'forest', description: 'Earthy green-dark with fresh green accents' },
  { id: 'purple', name: 'Purple', icon: 'whatshot', description: 'Deep violet-dark with vibrant purple accents' },
  /* ── Unique themes — see THEMES.md for the design research ── */
  { id: 'slate', name: 'Slate', icon: 'monitor', description: 'Quiet Instrument · near-monochrome graphite, one electric-mint accent (Linear × Notion)' },
  { id: 'ember', name: 'Ember', icon: 'fire', description: 'Warm Core · charcoal with a molten ember accent (Raycast × Arc)' },
  { id: 'aurora', name: 'Aurora', icon: 'sparkles', description: 'Neon Vortex · true-black with a cyan→violet→pink gradient (ReactBits × Aceternity)' },
  { id: 'paper', name: 'Paper', icon: 'note', description: 'Editorial Sheet · warm off-white paper light theme (Notion)' },
] as const

export type Theme = (typeof THEMES)[number]['id']

export const ACCENT_COLORS = [
  { name: 'Orange', value: '#FF8C00', cssFrom: '#FF8C00', cssVia: '#FF6B35', cssTo: '#FFB347' },
  { name: 'Blue', value: '#3B82F6', cssFrom: '#3B82F6', cssVia: '#60A5FA', cssTo: '#93C5FD' },
  { name: 'Green', value: '#22C55E', cssFrom: '#22C55E', cssVia: '#4ADE80', cssTo: '#86EFAC' },
  { name: 'Purple', value: '#A855F7', cssFrom: '#A855F7', cssVia: '#C084FC', cssTo: '#D8B4FE' },
  { name: 'Pink', value: '#EC4899', cssFrom: '#EC4899', cssVia: '#F472B6', cssTo: '#F9A8D4' },
  { name: 'Red', value: '#EF4444', cssFrom: '#EF4444', cssVia: '#F87171', cssTo: '#FCA5A5' },
  { name: 'Teal', value: '#14B8A6', cssFrom: '#14B8A6', cssVia: '#2DD4BF', cssTo: '#5EEAD4' },
  { name: 'Amber', value: '#F59E0B', cssFrom: '#F59E0B', cssVia: '#FBBF24', cssTo: '#FCD34D' },
] as const

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
