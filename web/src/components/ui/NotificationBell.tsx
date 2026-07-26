import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '../../lib/utils'
import {
  listNotifications,
  getUnreadCount,
  markNotificationsRead,
  markAllNotificationsRead,
  type OnrampNotification,
} from '../../lib/api'

export default function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<OnrampNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
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

  // Fetch unread count on mount and poll every 30s
  useEffect(() => {
    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 30_000)
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
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
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
  }

  const typeColors: Record<string, string> = {
    task_assigned: 'text-blue-400',
    task_started: 'text-accent-from',
    task_submitted: 'text-purple-400',
    task_reviewed: 'text-yellow-400',
    task_approved: 'text-success',
    task_needs_changes: 'text-error',
    task_completed: 'text-success',
    task_cancelled: 'text-text-muted',
    module_granted: 'text-emerald-400',
    team_invite: 'text-pink-400',
    system_alert: 'text-error',
    pr_merged: 'text-info',
    milestone_reached: 'text-accent-from',
    quiz_graded: 'text-amber-400',
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
    <div ref={dropdownRef} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'relative w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
          open
            ? 'bg-accent-muted text-accent-from'
            : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
        )}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className="material-symbols-outlined text-lg">
          {unreadCount > 0 ? 'notifications_active' : 'notifications'}
        </span>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 flex items-center justify-center rounded-full bg-error text-white text-[9px] font-bold leading-none min-w-[18px] min-h-[18px]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[380px] max-h-[520px] bg-bg-primary border border-border rounded-xl shadow-card overflow-hidden z-50" role="menu" aria-label="Notifications list">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-body-sm font-semibold text-text-primary">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-caption text-accent-from hover:underline"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={handleViewAll}
                className="text-caption text-text-muted hover:text-text-primary transition-colors"
              >
                View all
              </button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-[400px]">
            {loading && notifications.length === 0 && (
              <div className="flex items-center justify-center py-8">
                <svg className="w-5 h-5 animate-spin text-accent-from" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            )}

            {!loading && notifications.length === 0 && (
              <div className="flex flex-col items-center py-8 text-center">
                <span className="material-symbols-outlined text-3xl text-text-muted/30 mb-2">
                  notifications_off
                </span>
                <p className="text-caption text-text-muted/50">No notifications yet</p>
              </div>
            )}

            {notifications.map((n) => (
              <button
                key={n.notification_id}
                onClick={() => handleMarkRead(n)}
                className={cn(
                  'w-full text-left px-4 py-3 border-b border-border/50 transition-colors hover:bg-bg-tertiary/20',
                  !n.read && 'bg-accent-primary/[0.03]'
                )}
              >
                <div className="flex items-start gap-3">
                  <span className={cn(
                    'material-symbols-outlined text-lg mt-0.5 shrink-0',
                    typeColors[n.type] || 'text-text-muted'
                  )}>
                    {typeIcons[n.type] || 'notifications'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn(
                        'text-body-xs font-medium truncate',
                        !n.read ? 'text-text-primary' : 'text-text-secondary'
                      )}>
                        {n.title}
                      </span>
                      <span className="text-caption text-text-muted/40 font-mono shrink-0">
                        {timeAgo(n.created_at)}
                      </span>
                    </div>
                    <p className={cn(
                      'text-caption mt-0.5 line-clamp-2 leading-snug',
                      !n.read ? 'text-text-secondary' : 'text-text-muted'
                    )}>
                      {n.message}
                    </p>
                    {!n.read && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-from" />
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-border/50">
            <button
              onClick={handleViewAll}
              className="w-full text-center text-caption text-text-muted hover:text-text-primary transition-colors"
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
