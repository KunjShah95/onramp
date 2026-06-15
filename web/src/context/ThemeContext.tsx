import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

type Theme = 'himalayan' | 'purple'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
  setTheme: (t: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = 'codeflow-theme'

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'himalayan'
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'himalayan' || stored === 'purple') return stored
  return 'himalayan'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'himalayan' ? 'purple' : 'himalayan'))
  }

  const setTheme = (t: Theme) => {
    setThemeState(t)
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
