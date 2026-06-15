import { useAuth } from '../../context/AuthContext'

export default function TopBar() {
  const { user } = useAuth()

  return (
    <header className="h-14 border-b border-white/10 bg-slate-900/40 backdrop-blur-md flex items-center justify-between px-6">
      <div className="text-sm text-text-secondary" />
      <div className="flex items-center gap-3">
        {user && (
          <>
            <span className="text-xs text-text-muted hidden sm:block">
              {user.displayName || user.email}
            </span>
            <div className="w-7 h-7 rounded-full bg-accent-from/20 flex items-center justify-center text-xs text-accent-from font-medium">
              {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
            </div>
          </>
        )}
        {!user && (
          <div className="w-7 h-7 rounded-full bg-accent-from/20 flex items-center justify-center text-xs text-accent-from font-medium">
            U
          </div>
        )}
      </div>
    </header>
  )
}
