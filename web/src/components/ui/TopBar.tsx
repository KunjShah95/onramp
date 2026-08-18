import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { Sun, Moon, List, MagnifyingGlass } from '@phosphor-icons/react'
import { openCommandPalette } from './command-palette'
import NotificationBell from './NotificationBell'
import RoastModeToggle from './RoastModeToggle'
import UserMenu from './UserMenu'
import { navSections, bottomItems } from '../../lib/nav'
import { cn } from '../../lib/utils'
import type { ShortcutEvent } from '../../hooks/useKeyboardShortcuts'

interface TopBarProps {
  lastShortcut?: ShortcutEvent
  /** Opens the mobile sidebar drawer (hamburger, visible below lg). */
  onMenuClick?: () => void
}

/**
 * Quiet workbench top bar. Left: section context (which folio you are in).
 * Right: search, roast, notifications, theme, account. Nothing blinks.
 */
export default function TopBar({ lastShortcut, onMenuClick }: TopBarProps) {
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { pathname } = useLocation()
  const isDark = theme !== 'light' && theme !== 'paper'

  const section = useMemo(() => {
    const inSection = (items: { to: string }[]) =>
      items.some((i) => pathname === i.to || pathname.startsWith(`${i.to}/`))
    const s = navSections.find((sec) => inSection(sec.items))
    if (s) return s.title
    return bottomItems.some((i) => pathname === i.to || pathname.startsWith(`${i.to}/`)) ? 'System' : ''
  }, [pathname])

  return (
    <header
      role="banner"
      className="sticky top-0 z-40 h-11 border-b border-seam bg-base/90 backdrop-blur-sm flex items-center justify-between px-4 sm:px-5"
    >
      {/* Left: hamburger (mobile) + section context + shortcut feedback */}
      <div className="flex items-center gap-2.5 min-w-0">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Open navigation menu"
            className="lg:hidden -ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-btn border border-seam text-ink-tertiary hover:text-ink hover:bg-well/60 transition-colors"
          >
            <List size={15} weight="bold" />
          </button>
        )}
        {section && (
          <span className="index-kicker hidden sm:inline-flex" aria-hidden>
            {section}
          </span>
        )}
        <span
          className="relative px-1.5 py-0.5 rounded-[3px] bg-well border border-seam text-ink-muted font-code text-[10px] cursor-default hidden lg:inline"
          title="Press ? for keyboard shortcuts"
        >
          ?
        </span>
        {lastShortcut && (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[3px] text-[10px] font-code transition-all duration-300',
              'bg-go/10 text-go border border-go/20',
              'animate-fade-in'
            )}
          >
            <kbd className="px-1 py-0 rounded-[2px] bg-go/15 text-[9px] font-bold">{lastShortcut.key}</kbd>
            <span className="max-w-[160px] truncate">{lastShortcut.description}</span>
          </span>
        )}
      </div>

      {/* Right: user area */}
      <div className="flex items-center gap-1.5 sm:gap-2.5">
        {user ? (
          <>
            <button
              onClick={openCommandPalette}
              title="Jump to a page (⌘K)"
              aria-label="Jump to a page"
              className="hidden sm:flex w-7 h-7 rounded-btn border border-seam text-ink-muted hover:text-ink hover:bg-well/60 items-center justify-center transition-colors shrink-0"
            >
              <MagnifyingGlass size={14} weight="regular" />
            </button>
            <RoastModeToggle compact />
            <NotificationBell />

            {/* Light / dark theme toggle */}
            <button
              onClick={toggleTheme}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="w-7 h-7 rounded-btn border border-seam text-ink-muted hover:text-go hover:border-go/40 hover:bg-go/5 flex items-center justify-center transition-all duration-150 active:scale-95 shrink-0"
            >
              {isDark ? <Sun size={14} weight="regular" /> : <Moon size={14} weight="regular" />}
            </button>
            <UserMenu />
          </>
        ) : (
          <div className="w-7 h-7 rounded-tile bg-well flex items-center justify-center">
            <span className="font-code text-[10px] text-ink-muted">·</span>
          </div>
        )}
      </div>
    </header>
  )
}
