import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { UserCircle, Sun, Moon, List, MagnifyingGlass } from '@phosphor-icons/react'
import { openCommandPalette } from './command-palette'
import NotificationBell from './NotificationBell'
import RoastModeToggle from './RoastModeToggle'
import UserMenu from './UserMenu'
import MissionClock from './mission-clock'
import { cn } from '../../lib/utils'
import type { ShortcutEvent } from '../../hooks/useKeyboardShortcuts'

interface TopBarProps {
  lastShortcut?: ShortcutEvent
  /** Current console call-sign shown in the mission clock. */
  callsign?: string
  /** Opens the mobile sidebar drawer (hamburger, visible below lg). */
  onMenuClick?: () => void
}

export default function TopBar({ lastShortcut, callsign, onMenuClick }: TopBarProps) {
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const isDark = theme !== 'light' && theme !== 'paper'

  return (
    <header
      role="banner"
      className="sticky top-0 z-40 h-12 border-b border-seam bg-panel flex items-center justify-between px-5"
    >
      {/* Left: hamburger (mobile) + live mission clock + shortcut feedback */}
      <div className="flex items-center gap-2.5 min-w-0">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Open navigation menu"
            className="lg:hidden -ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] border border-seam text-ink-tertiary hover:text-ink hover:bg-well/60 transition-colors"
          >
            <List size={17} weight="bold" />
          </button>
        )}
        <MissionClock callsign={callsign} />
        <span
          className="relative px-1.5 py-0.5 rounded-[3px] bg-well border border-seam text-ink-muted font-code text-[10px] cursor-default hidden lg:inline"
          title="Press ? for keyboard shortcuts"
        >
          ?
        </span>
        {lastShortcut && (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[3px] text-[10px] font-mono transition-all duration-300',
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
      <div className="flex items-center gap-2.5">
        {user ? (
          <>
            <button
              onClick={openCommandPalette}
              title="Jump to a page (⌘K)"
              aria-label="Jump to a page"
              className="hidden sm:flex w-7 h-7 rounded-btn border border-seam text-ink-muted hover:text-ink hover:bg-well/60 items-center justify-center transition-colors shrink-0"
            >
              <MagnifyingGlass size={15} weight="regular" />
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
              {isDark ? <Sun size={15} weight="regular" /> : <Moon size={15} weight="regular" />}
            </button>
            <UserMenu />
          </>
        ) : (
          <div className="w-7 h-7 rounded-card bg-well flex items-center justify-center">
            <UserCircle size={16} className="text-ink-muted" />
          </div>
        )}
      </div>
    </header>
  )
}
