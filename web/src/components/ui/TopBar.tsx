import { useAuth } from '../../context/AuthContext'
import { UserCircle } from '@phosphor-icons/react'
import NotificationBell from './NotificationBell'

export default function TopBar() {
  const { user } = useAuth()

  return (
    <header
      role="banner"
      className="h-12 border-b border-border bg-bg-primary/60 backdrop-blur-md flex items-center justify-between px-5"
    >
      {/* Left: shortcut hint */}
      <div className="flex items-center gap-3">
        <span className="px-1.5 py-0.5 rounded bg-bg-tertiary border border-border text-text-muted font-code text-[10px]">
          ?
        </span>
        <span className="text-caption text-text-muted hidden sm:block">
          Keyboard shortcuts
        </span>
      </div>

      {/* Right: user area */}
      <div className="flex items-center gap-2.5">
        {user ? (
          <>
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
              <div className="w-7 h-7 rounded-lg bg-accent-muted flex items-center justify-center">
                <span className="text-caption font-semibold text-accent-from">
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
