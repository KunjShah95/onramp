import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { User, Gear, SignOut, CaretDown } from '@phosphor-icons/react'
import { useAuth } from '../../context/AuthContext'
import { cn } from '../../lib/utils'

function isSafeAvatarUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * Account dropdown anchored on the avatar — shows the user's name + email,
 * links to Profile / Settings, and a Sign Out action.
 */
export default function UserMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const closedByKeyboard = useRef(false)
  const menuId = 'user-menu'

  const name = user?.displayName || user?.email || 'Account'
  const initial = name.charAt(0).toUpperCase()

  // Close on outside click / touch
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closedByKeyboard.current = true
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Focus management: move into the menu on open; return to the trigger when closed via keyboard
  useEffect(() => {
    if (open) {
      const first = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')
      first?.focus()
    } else if (closedByKeyboard.current) {
      triggerRef.current?.focus()
      closedByKeyboard.current = false
    }
  }, [open])

  // Arrow-key navigation between menu items
  const handleMenuKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []
    )
    if (items.length === 0) return
    const idx = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = e.key === 'ArrowDown'
      ? (idx + 1) % items.length
      : (idx - 1 + items.length) % items.length
    items[next]?.focus()
  }

  // Close whenever the route changes (e.g. after clicking Profile/Settings)
  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  const handleSignOut = useCallback(async () => {
    setOpen(false)
    await logout()
    navigate('/login', { replace: true })
  }, [logout, navigate])

  return (
    <div ref={ref} className="relative shrink-0">
      {/* Trigger */}
      <button
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="Account menu"
        className={cn(
          'flex items-center rounded-lg transition-colors duration-150',
          open ? 'bg-well/50' : 'hover:bg-well/40'
        )}
      >
        <span className="flex items-center gap-2">
          {user?.photoURL && isSafeAvatarUrl(user.photoURL) ? (
            <img src={user.photoURL} alt="" className="w-7 h-7 rounded-lg object-cover" />
          ) : (
            <span className="w-7 h-7 rounded-lg bg-go/10 flex items-center justify-center">
              <span className="text-caption font-semibold text-go">{initial}</span>
            </span>
          )}
          <span className="hidden sm:flex items-center gap-1.5 pr-1.5">
            <span className="text-body-xs text-ink-muted max-w-[140px] truncate">{name}</span>
            <CaretDown
              size={11}
              weight="bold"
              className={cn('text-ink-muted transition-transform duration-150', open && 'rotate-180')}
            />
          </span>
        </span>
      </button>

      {/* Menu */}
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Account menu"
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 rounded-xl border border-seam bg-base shadow-overhead animate-fade-in origin-top-right"
        >
          {/* Header: name + email */}
          <div className="px-4 py-3 border-b border-seam/50">
            <p className="text-body-sm font-semibold text-ink truncate">{name}</p>
            <p className="text-caption text-ink-tertiary truncate">{user?.email}</p>
          </div>

          {/* Links */}
          <div className="p-1.5">
            <button
              role="menuitem"
              onClick={() => navigate('/profile')}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-body-sm text-ink-secondary hover:text-ink hover:bg-well/40 transition-colors text-left"
            >
              <User size={16} className="text-ink-muted" />
              Profile
            </button>
            <button
              role="menuitem"
              onClick={() => navigate('/settings')}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-body-sm text-ink-secondary hover:text-ink hover:bg-well/40 transition-colors text-left"
            >
              <Gear size={16} className="text-ink-muted" />
              Settings
            </button>
          </div>

          <div className="border-t border-seam/50" />

          {/* Sign out */}
          <div className="p-1.5">
            <button
              role="menuitem"
              onClick={handleSignOut}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-body-sm text-abort hover:bg-abort/10 transition-colors text-left"
            >
              <SignOut size={16} />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
