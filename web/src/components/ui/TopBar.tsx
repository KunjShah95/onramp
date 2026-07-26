import { useAuth } from '../../context/AuthContext'
import { UserCircle } from '@phosphor-icons/react'
import NotificationBell from './NotificationBell'
import RoastModeToggle from './RoastModeToggle'
import { cn } from '../../lib/utils'
import type { ShortcutEvent } from '../../hooks/useKeyboardShortcuts'

interface TopBarProps {
  lastShortcut?: ShortcutEvent
}

export default function TopBar({ lastShortcut }: TopBarProps) {
  const { user } = useAuth()

  return (
    <header
      role="banner"
      className="h-12 border-b border-border bg-bg-primary/60 backdrop-blur-md flex items-center justify-between px-5"
    >
      {/* Left: shortcut hint with feedback */}
      <div className="flex items-center gap-3 min-w-0">
        <span className="relative px-1.5 py-0.5 rounded bg-bg-tertiary border border-border text-text-muted font-code text-[10px] cursor-default">
          ?
        </span>
        <span className="text-caption text-text-muted hidden sm:block">
          Keyboard shortcuts
        </span>
        {lastShortcut && (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-mono transition-all duration-300',
              'bg-accent-primary/10 text-accent-primary border border-accent-primary/20',
              'animate-in fade-in zoom-in-95'
            )}
          >
            <kbd className="px-1 py-0 rounded bg-accent-primary/15 text-[9px] font-bold">
              {lastShortcut.key}
            </kbd>
            <span className="max-w-[160px] truncate">{lastShortcut.description}</span>
          </span>
        )}
      </div>

      {/* Right: user area */}
      <div className="flex items-center gap-2.5">
        {user ? (
          <>
            <RoastModeToggle compact />
            <NotificationBell />
            <div className="hidden sm:flex items-center gap-2.5">
              <span className="text-body-xs text-text-muted">
                {user.displayName || user.email}
              </span>
              <div className="w-7 h-7 rounded-lg bg-accent-muted flex items-center justify-center">
                <span className="text-caption font-semibold text-accent-from">
                  {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                </span>
              </div>
            </div>
            <div className="sm:hidden">
              <div className="w-7 h-7 rounded-lg bg-accent-muted flex items-center justify-center" aria-label={user.displayName || user.email || 'User avatar'}>
                <span className="text-caption font-semibold text-accent-from" aria-hidden="true">
                  {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="w-7 h-7 rounded-lg bg-accent-muted flex items-center justify-center">
            <UserCircle size={16} className="text-accent-from" />
          </div>
        )}
      </div>
    </header>
  )
}
