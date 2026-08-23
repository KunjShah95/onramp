import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { cn } from '../../lib/utils'
import {
  listNotifications,
  getUnreadCount,
  markNotificationsRead,
  markAllNotificationsRead,
  notificationLink,
  type OnrampNotification,
} from '../../lib/api'

export default function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<OnrampNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const fetchUnreadCount = useCallback(async () => {
    try {
      const { unread_count } = await getUnreadCount()
      setUnreadCount(unread_count)
    } catch {
      // silently fail — bell still shows
    }
  }, [])

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listNotifications({ limit: 10 })
      setNotifications(data.notifications)
    } catch {
      // silently fail
    }
    setLoading(false)
  }, [])

  // Poll for unread count (default 2 min, configurable via VITE_NOTIFICATION_POLL_INTERVAL)
  useEffect(() => {
    const raw = import.meta.env.VITE_NOTIFICATION_POLL_INTERVAL
    const parsed = raw != null && raw !== '' ? Number(raw) : 120_000
    const intervalMs = Number.isFinite(parsed) ? parsed : 120_000
    if (intervalMs <= 0) { fetchUnreadCount(); return }
    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, intervalMs)
    return () => clearInterval(interval)
  }, [fetchUnreadCount])

  // Fetch full list when dropdown opens
  useEffect(() => {
    if (open) {
      fetchNotifications()
    }
  }, [open, fetchNotifications])

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Close on scroll so the fixed-position dropdown doesn't float disconnected
  useEffect(() => {
    if (!open) return
    const handleScroll = () => setOpen(false)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [open])

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true, read_at: new Date().toISOString() })))
      setUnreadCount(0)
    } catch {
      // silently fail
    }
  }

  async function handleMarkRead(n: OnrampNotification) {
    if (n.read) return
    try {
      await markNotificationsRead([n.notification_id])
      setNotifications((prev) =>
        prev.map((notif) =>
          notif.notification_id === n.notification_id
            ? { ...notif, read: true, read_at: new Date().toISOString() }
            : notif
        )
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch {
      // silently fail
    }
  }

  /** Open a notification: dev_stuck deep-links to its destination — the
   * leader-gated Ramp view for leader alerts, Ask Codebase for the trainee's
   * own self-serve nudge (they can't access /ramp). */
  function handleOpen(n: OnrampNotification) {
    const link = notificationLink(n)
    if (link) navigate(link)
    if (!n.read) handleMarkRead(n)
  }

  function handleViewAll() {
    setOpen(false)
    navigate('/notifications')
  }

  const typeIcons: Record<string, string> = {
    task_assigned: 'assignment',
    task_started: 'play_arrow',
    task_submitted: 'rate_review',
    task_reviewed: 'visibility',
    task_approved: 'check_circle',
    task_needs_changes: 'edit_note',
    task_completed: 'celebration',
    task_cancelled: 'cancel',
    module_granted: 'lock_open',
    team_invite: 'person_add',
    system_alert: 'warning',
    pr_merged: 'merge',
    milestone_reached: 'flag',
    quiz_graded: 'quiz',
    dev_stuck: 'person_search',
  }

  const typeColors: Record<string, string> = {
    task_assigned: 'text-blue-400',
    task_started: 'text-go',
    task_submitted: 'text-purple-400',
    task_reviewed: 'text-yellow-400',
    task_approved: 'text-go',
    task_needs_changes: 'text-abort',
    task_completed: 'text-go',
    task_cancelled: 'text-ink-muted',
    module_granted: 'text-emerald-400',
    team_invite: 'text-pink-400',
    system_alert: 'text-abort',
    pr_merged: 'text-mission',
    milestone_reached: 'text-go',
    quiz_graded: 'text-amber-400',
    dev_stuck: 'text-abort',
  }

  const timeAgo = (dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    return `${days}d`
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Bell button */}
      <button
        ref={buttonRef}
        onClick={() => {
          if (!open && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect()
            setDropdownPos({
              top: rect.bottom + 8,
              right: window.innerWidth - rect.right,
            })
          }
          setOpen((v) => !v)
        }}
        className={cn(
          'relative w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
          open
            ? 'bg-go/10 text-go'
            : 'text-ink-muted hover:text-ink hover:bg-well'
        )}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className="material-symbols-outlined text-lg">
          {unreadCount > 0 ? 'notifications_active' : 'notifications'}
        </span>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 flex items-center justify-center rounded-full bg-abort text-white text-[9px] font-bold leading-none min-w-[18px] min-h-[18px]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown — portaled to <body> so the TopBar's stacking context can't
          trap it behind the dashboard. Fixed coords stay valid. */}
      {open && dropdownPos && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', top: dropdownPos.top, right: dropdownPos.right, zIndex: 9999 }}
          className="w-[380px] max-h-[520px] bg-panel border border-seam rounded-card shadow-overhead overflow-y-auto"
          role="menu"
          aria-label="Notifications list"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-seam">
            <h3 className="text-body-sm font-semibold text-ink">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-caption text-go hover:underline"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={handleViewAll}
                className="text-caption text-ink-muted hover:text-ink transition-colors"
              >
                View all
              </button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-[400px]">
            {loading && notifications.length === 0 && (
              <div className="flex items-center justify-center py-8">
                <svg className="w-5 h-5 animate-spin text-go" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            )}

            {!loading && notifications.length === 0 && (
              <div className="flex flex-col items-center py-8 text-center">
                <span className="material-symbols-outlined text-3xl text-ink-muted/30 mb-2">
                  notifications_off
                </span>
                <p className="text-caption text-ink-muted/50">No notifications yet</p>
              </div>
            )}

            {notifications.map((n) => (
              <button
                key={n.notification_id}
                role="menuitem"
                onClick={() => handleOpen(n)}
                className={cn(
                  'w-full text-left px-4 py-3 border-b border-seam transition-colors hover:bg-well/60',
                  !n.read && 'bg-go/[0.03]'
                )}
              >
                <div className="flex items-start gap-3">
                  <span className={cn(
                    'material-symbols-outlined text-lg mt-0.5 shrink-0',
                    typeColors[n.type] || 'text-ink-muted'
                  )}>
                    {typeIcons[n.type] || 'notifications'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn(
                        'text-body-xs font-medium truncate',
                        !n.read ? 'text-ink' : 'text-ink-secondary'
                      )}>
                        {n.title}
                      </span>
                      <span className="text-caption text-ink-muted/40 font-mono shrink-0">
                        {timeAgo(n.created_at)}
                      </span>
                    </div>
                    <p className={cn(
                      'text-caption mt-0.5 line-clamp-2 leading-snug',
                      !n.read ? 'text-ink-secondary' : 'text-ink-muted'
                    )}>
                      {n.message}
                    </p>
                    {!n.read && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-go" />
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-seam">
            <button
              onClick={handleViewAll}
              className="w-full text-center text-caption text-ink-muted hover:text-ink transition-colors"
            >
              View all notifications
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
