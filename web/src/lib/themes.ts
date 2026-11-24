/**
 * Theme + accent catalogues — deliberately NOT in ThemeContext.
 *
 * Same Fast Refresh constraint documented in `lib/roles.ts`: a context module
 * that also exports plain arrays cannot be hot-updated, and invalidating it
 * swaps the context identity out from under every `useTheme()` consumer.
 * Data lives here; `ThemeContext.tsx` exports only the provider and its hook.
 *
 * Design research for each theme lives in `web/THEMES.md`.
 */

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
