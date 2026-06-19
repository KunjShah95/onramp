import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '../../lib/utils'
import {
  listNotifications,
  getUnreadCount,
  markNotificationsRead,
  markAllNotificationsRead,
  type CodeFlowNotification,
} from '../../lib/api'

export default function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<CodeFlowNotification[]>([])
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

  async function handleMarkRead(n: CodeFlowNotification) {
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
  }

  const typeColors: Record<string, string> = {
    task_assigned: 'text-blue-400',
    task_started: 'text-[#FF8C00]',
    task_submitted: 'text-purple-400',
    task_reviewed: 'text-yellow-400',
    task_approved: 'text-green-400',
    task_needs_changes: 'text-red-400',
    task_completed: 'text-green-400',
    task_cancelled: 'text-[#FDFBF8]/40',
    module_granted: 'text-emerald-400',
    team_invite: 'text-pink-400',
    system_alert: 'text-red-400',
    pr_merged: 'text-[#4DA8DA]',
    milestone_reached: 'text-[#FF8C00]',
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
            ? 'bg-[#FF8C00]/10 text-[#FF8C00]'
            : 'text-[#FDFBF8]/50 hover:text-[#FDFBF8] hover:bg-[#FDFBF8]/5'
        )}
        title="Notifications"
      >
        <span className="material-symbols-outlined text-lg">
          {unreadCount > 0 ? 'notifications_active' : 'notifications'}
        </span>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none min-w-[18px] min-h-[18px]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[380px] max-h-[520px] bg-[#1A1512] border border-[#FDFBF8]/10 rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#FDFBF8]/5">
            <h3 className="text-sm font-semibold text-[#FDFBF8]">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-[10px] text-[#FF8C00] hover:underline"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={handleViewAll}
                className="text-[10px] text-[#FDFBF8]/40 hover:text-[#FDFBF8]/70"
              >
                View all
              </button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-[400px]">
            {loading && notifications.length === 0 && (
              <div className="flex items-center justify-center py-8">
                <svg className="w-5 h-5 animate-spin text-[#FF8C00]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            )}

            {!loading && notifications.length === 0 && (
              <div className="flex flex-col items-center py-8 text-center">
                <span className="material-symbols-outlined text-3xl text-[#FDFBF8]/15 mb-2">
                  notifications_off
                </span>
                <p className="text-xs text-[#FDFBF8]/30">No notifications yet</p>
              </div>
            )}

            {notifications.map((n) => (
              <button
                key={n.notification_id}
                onClick={() => handleMarkRead(n)}
                className={cn(
                  'w-full text-left px-4 py-3 border-b border-[#FDFBF8]/5 transition-colors hover:bg-[#FDFBF8]/[0.02]',
                  !n.read && 'bg-[#FF8C00]/[0.03]'
                )}
              >
                <div className="flex items-start gap-3">
                  <span className={cn(
                    'material-symbols-outlined text-lg mt-0.5 shrink-0',
                    typeColors[n.type] || 'text-[#FDFBF8]/40'
                  )}>
                    {typeIcons[n.type] || 'notifications'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn(
                        'text-[13px] font-medium truncate',
                        !n.read ? 'text-[#FDFBF8]' : 'text-[#FDFBF8]/60'
                      )}>
                        {n.title}
                      </span>
                      <span className="text-[10px] text-[#FDFBF8]/30 font-mono shrink-0">
                        {timeAgo(n.created_at)}
                      </span>
                    </div>
                    <p className={cn(
                      'text-[12px] mt-0.5 line-clamp-2 leading-snug',
                      !n.read ? 'text-[#FDFBF8]/70' : 'text-[#FDFBF8]/40'
                    )}>
                      {n.message}
                    </p>
                    {!n.read && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#FF8C00]" />
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-[#FDFBF8]/5">
            <button
              onClick={handleViewAll}
              className="w-full text-center text-[11px] text-[#FDFBF8]/40 hover:text-[#FDFBF8] transition-colors"
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
