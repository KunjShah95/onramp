import { useMemo } from 'react'
import { useTheme } from '../context/ThemeContext'

/**
 * Resolve theme CSS variables to concrete rgb() strings for SVG chart
 * attributes (Recharts fills/strokes can't consume raw CSS var triplets).
 * Re-computed whenever the app theme changes so dashboards recolor live.
 *
 * Replaces the old hardcoded `SIG = { go: '#17A34A', ... }` palettes, which
 * rendered the same literal green/blue in every theme regardless of that
 * theme's signal palette.
 */
export function useThemeSignals() {
  const { theme } = useTheme()
  return useMemo(() => {
    const root = document.documentElement
    const read = (name: string) => getComputedStyle(root).getPropertyValue(name).trim()
    const solid = (name: string) => {
      const v = read(name)
      return v ? `rgb(${v})` : '#888888'
    }
    const alpha = (name: string, a: number) => {
      const v = read(name)
      return v ? `rgb(${v} / ${a})` : '#888888'
    }
    return {
      go: solid('--go'),
      blue: solid('--mission'),
      amber: solid('--caution'),
      red: solid('--abort'),
      grid: alpha('--border-rgb', 0.10),
      axis: alpha('--text-tertiary', 0.75),
      goSoft: alpha('--go', 0.28),
      amberSoft: alpha('--caution', 0.22),
    }
  }, [theme])
}
