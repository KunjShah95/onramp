import { motion } from 'framer-motion'
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
      <motion.span
        key={isLight ? 'sun' : 'moon'}
        initial={{ rotate: -30, opacity: 0, scale: 0.8 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="flex"
      >
        {isLight ? <Sun size={15} weight="bold" /> : <Moon size={15} weight="bold" />}
      </motion.span>
    </button>
  )
}
