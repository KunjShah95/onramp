import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

export const THEMES = [
  { id: 'himalayan', name: 'Himalayan', icon: 'dark_mode', description: 'Deep blue-dark with warm orange accents' },
  { id: 'midnight', name: 'Midnight', icon: 'bedtime', description: 'Cool indigo-dark with violet-blue accents' },
  { id: 'forest', name: 'Forest', icon: 'forest', description: 'Earthy green-dark with fresh green accents' },
  { id: 'purple', name: 'Purple', icon: 'whatshot', description: 'Deep violet-dark with vibrant purple accents' },
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
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const THEME_KEY = 'onramp-theme'
const ACCENT_KEY = 'onramp-accent'

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'himalayan'
  const stored = localStorage.getItem(THEME_KEY)
  const valid = THEMES.find(t => t.id === stored)
  return valid?.id ?? 'himalayan'
}

function getInitialAccent(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(ACCENT_KEY) || ''
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
        root.style.setProperty('--accent-from', match.cssFrom)
        root.style.setProperty('--accent-via', match.cssVia)
        root.style.setProperty('--accent-to', match.cssTo)
        root.style.setProperty('--accent-muted', `${match.value}1F`)
        root.style.setProperty('--accent-glow', `${match.value}0F`)
      } else {
        root.style.setProperty('--accent-from', accentColor)
      }
      localStorage.setItem(ACCENT_KEY, accentColor)
    } else {
      root.style.removeProperty('--accent-from')
      root.style.removeProperty('--accent-via')
      root.style.removeProperty('--accent-to')
      root.style.removeProperty('--accent-muted')
      root.style.removeProperty('--accent-glow')
      localStorage.removeItem(ACCENT_KEY)
    }
  }, [accentColor])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
  }, [])

  const setAccentColor = useCallback((color: string) => {
    setAccentColorState(color)
  }, [])

  const resetAccentColor = useCallback(() => {
    setAccentColorState('')
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, accentColor, setTheme, setAccentColor, resetAccentColor }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
