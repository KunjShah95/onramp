import { NavLink, useNavigate } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { useAuth } from '../../context/AuthContext'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '◈' },
  { to: '/explore', label: 'Explore', icon: '◈' },
  { to: '/learn', label: 'Learn', icon: '◈' },
  { to: '/first-issue', label: 'Issues', icon: '◈' },
  { to: '/ask', label: 'Ask', icon: '◈' },
]

const bottomItems = [
  { to: '/settings', label: 'Settings' },
  { to: '/profile', label: 'Profile' },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      await logout()
      navigate('/login')
    } catch (err) {
      console.error('Logout failed:', err)
    }
  }

  return (
    <aside className="w-[260px] min-h-screen bg-slate-900/40 backdrop-blur-md border-r border-white/10 flex flex-col shrink-0">
      <div className="px-6 py-5 border-b border-white/10">
        <NavLink to="/" className="font-display text-xl font-bold text-text-primary">
          CodeFlow
        </NavLink>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-btn text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-accent-from/20 text-accent-from shadow-[0_0_15px_rgba(34,197,94,0.3)]'
                  : 'text-text-secondary hover:bg-white/10 hover:text-white'
              )
            }
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      {user && (
        <div className="px-3 py-3 border-t border-white/10">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-accent-from/20 flex items-center justify-center text-sm text-accent-from font-medium shrink-0">
              {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {user.displayName || 'User'}
              </p>
              <p className="text-xs text-text-muted truncate">{user.email}</p>
            </div>
          </div>
        </div>
      )}

      <div className="px-3 py-4 border-t border-white/10 space-y-1">
        {bottomItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-btn text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-accent-from/20 text-accent-from shadow-[0_0_15px_rgba(34,197,94,0.3)]'
                  : 'text-text-secondary hover:bg-white/10 hover:text-white'
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-btn text-sm font-medium transition-all duration-200 text-text-secondary hover:bg-red-500/10 hover:text-red-400"
        >
          Sign Out
        </button>
      </div>
    </aside>
  )
}
