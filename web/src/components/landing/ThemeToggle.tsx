
import { Moon, Sun } from '@phosphor-icons/react'
import { useLandingTheme } from '../../hooks/useLandingTheme'

/**
 * ThemeToggle — light/dark switch for the public surfaces.
 * Sits in LandingNav + MarketingNav. Icon-only, 32px hit area, token-styled
 * so it renders correctly in both modes.
 */
export default function ThemeToggle() {
  const { isLight, toggle } = useLandingTheme()

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      title={isLight ? 'Dark mode' : 'Light mode'}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-seam bg-panel text-ink-secondary transition-colors hover:text-ink hover:border-seam-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
    >
      <span key={isLight ? 'sun' : 'moon'} className="flex">
        {isLight ? <Sun size={15} weight="bold" /> : <Moon size={15} weight="bold" />}
      </span>
    </button>
  )
}
