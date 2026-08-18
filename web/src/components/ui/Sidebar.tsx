import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { prefetchProps } from '../../lib/prefetch'
import { useAuth } from '../../context/AuthContext'
import { CaretLeft, CaretRight, X } from '@phosphor-icons/react'
import { navSections, bottomItems, type NavItem } from '../../lib/nav'

const SIDEBAR_KEY = 'onramp-sidebar-collapsed'

function NavItem({ to, label, Icon, collapsed }: NavItem & { collapsed: boolean }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      title={collapsed ? label : undefined}
      aria-label={label}
      {...prefetchProps(to)}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center text-[13px] leading-none transition-colors duration-150',
          collapsed
            ? 'justify-center h-8 w-8 mx-auto rounded-btn'
            : 'gap-2.5 px-3 py-[7px] w-full rounded-btn',
          isActive
            ? 'text-ink font-medium'
            : 'text-ink-muted hover:text-ink-secondary'
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* 2px signal spine — the workbench index mark */}
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 h-3.5 w-[2px] rounded-full bg-go" aria-hidden />
          )}
          <Icon
            size={15}
            weight={isActive ? 'fill' : 'regular'}
            className={cn(
              'shrink-0 transition-colors duration-150',
              isActive ? 'text-go' : 'text-ink-muted/55 group-hover:text-ink-tertiary'
            )}
          />
          {!collapsed && <span className="truncate">{label}</span>}
        </>
      )}
    </NavLink>
  )
}

function NavGroup({
  index,
  title,
  items,
  collapsed,
}: {
  index: number
  title: string
  items: NavItem[]
  collapsed: boolean
}) {
  const { role } = useAuth()
  const visible = items.filter((i) => !i.roles || i.roles.includes(role || ''))
  if (visible.length === 0) return null

  return (
    <div>
      {collapsed ? (
        <div className="mx-3.5 my-2.5 h-px bg-seam" aria-hidden />
      ) : (
        <div className="px-3 pt-4 pb-1.5">
          <div className="flex items-baseline gap-2">
            <span className="font-code text-[10px] text-ink-muted/60 tabular-nums leading-none">
              {String(index).padStart(2, '0')}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted leading-none">
              {title}
            </span>
          </div>
        </div>
      )}
      <div className={cn(collapsed ? 'flex flex-col items-center space-y-1' : 'space-y-0.5')}>
        {visible.map((item) => (
          <NavItem key={item.to} {...item} collapsed={collapsed} />
        ))}
      </div>
    </div>
  )
}

interface SidebarProps {
  /** Mobile drawer open state (only applies below lg). */
  open?: boolean
  /** Called when the mobile drawer should close (backdrop tap / close button). */
  onClose?: () => void
}

export default function Sidebar({ open = false, onClose }: SidebarProps) {
  const { role } = useAuth()
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(SIDEBAR_KEY) === '1'
  })

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  // Close the mobile drawer with Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Keep the body from scrolling behind the open drawer.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const showManage =
    role === 'senior' || role === 'senior_dev' || role === 'admin' || role === 'ceo' || role === 'cto'

  return (
    <>
      {/* Mobile backdrop — only below lg, only when the drawer is open */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Primary navigation"
        className={cn(
          // Desktop: sticky rail. Mobile: fixed off-canvas drawer.
          'app-sidebar bg-base border-r border-seam flex flex-col shrink-0 transition-[width] duration-200 ease-out overflow-hidden',
          'max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-50 max-lg:shadow-overhead max-lg:transition-transform max-lg:duration-200 max-lg:ease-out',
          open ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full',
          'lg:sticky lg:top-0 lg:self-start lg:h-full',
          collapsed ? 'w-[60px]' : 'w-[212px]'
        )}
      >
        {/* Mobile close button — only visible inside the open drawer */}
        {open && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="absolute right-3 top-4 z-10 flex h-7 w-7 items-center justify-center rounded-btn border border-seam text-ink-muted hover:text-ink hover:bg-well/60 transition-colors lg:hidden"
          >
            <X size={14} />
          </button>
        )}

        {/* Brand */}
        <div className={cn('pt-5 pb-4', collapsed ? 'flex justify-center px-0' : 'px-4')}>
          <NavLink
            to="/"
            className={cn('flex items-center gap-2.5 group', collapsed && 'justify-center')}
            title={collapsed ? 'Onramp' : undefined}
            aria-label="Onramp home"
          >
            <div className="w-7 h-7 rounded-tile bg-ink text-panel-raised flex items-center justify-center transition-colors duration-200 group-hover:bg-go">
              <span className="text-[11px] font-bold font-display tracking-tight">OR</span>
            </div>
            {!collapsed && (
              <span className="flex flex-col leading-none">
                <span className="font-display text-[13px] font-bold text-ink tracking-[0.08em] uppercase">
                  Onramp
                </span>
                <span className="text-[9px] font-code text-ink-muted/70 mt-0.5 tracking-[0.16em] uppercase">
                  Workbench
                </span>
              </span>
            )}
          </NavLink>
        </div>

        {/* Navigation */}
        <div className={cn('flex-1 overflow-y-auto', collapsed ? 'px-1.5 space-y-1' : 'px-2 space-y-1')}>
          {navSections
            .filter((s) => s.title !== 'Manage' || showManage)
            .map((s, i) => (
              <NavGroup key={s.title} index={i + 1} title={s.title} items={s.items} collapsed={collapsed} />
            ))}
        </div>

        {/* Bottom section */}
        <div className={cn('py-3 border-t border-seam mt-2', collapsed ? 'px-1.5' : 'px-2')}>
          <div className={cn(collapsed ? 'flex flex-col items-center space-y-1' : 'space-y-0.5')}>
            {bottomItems.map((item) => (
              <NavItem key={item.to} {...item} collapsed={collapsed} />
            ))}

            {/* Collapse toggle */}
            <button
              onClick={() => setCollapsed((c) => !c)}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={cn(
                'group relative flex items-center rounded-btn text-[13px] leading-none transition-colors duration-150 text-ink-muted hover:text-ink-secondary hover:bg-well/50',
                collapsed ? 'justify-center h-8 w-8 mx-auto' : 'gap-2.5 px-3 py-[7px] w-full'
              )}
            >
              {collapsed ? (
                <CaretRight size={15} className="shrink-0 text-ink-muted" />
              ) : (
                <>
                  <CaretLeft size={15} className="shrink-0 text-ink-muted group-hover:text-ink-secondary" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">Collapse</span>
                </>
              )}
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
