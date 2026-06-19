import { useState, useEffect, useCallback } from 'react'
import { cn } from '../lib/utils'
import {
  listNotifications,
  getUnreadCount,
  markNotificationsRead,
  markAllNotificationsRead,
  deleteNotification,
  clearReadNotifications,
  type CodeFlowNotification,
} from '../lib/api'

const TYPE_ICONS: Record<string, string> = {
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

const TYPE_LABELS: Record<string, string> = {
  task_assigned: 'Task Assigned',
  task_started: 'Task Started',
  task_submitted: 'Submitted',
  task_reviewed: 'Reviewed',
  task_approved: 'Approved',
  task_needs_changes: 'Changes Needed',
  task_completed: 'Completed',
  task_cancelled: 'Cancelled',
  module_granted: 'Module Access',
  team_invite: 'Team Invite',
  system_alert: 'System Alert',
  pr_merged: 'PR Merged',
  milestone_reached: 'Milestone',
}

const TYPE_COLORS: Record<string, string> = {
  task_assigned: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  task_started: 'bg-[#FF8C00]/10 text-[#FF8C00] border-[#FF8C00]/20',
  task_submitted: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  task_reviewed: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  task_approved: 'bg-green-500/10 text-green-400 border-green-500/20',
  task_needs_changes: 'bg-red-500/10 text-red-400 border-red-500/20',
  task_completed: 'bg-green-500/10 text-green-400 border-green-500/20',
  task_cancelled: 'bg-[#FDFBF8]/5 text-[#FDFBF8]/40 border-[#FDFBF8]/10',
  module_granted: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  team_invite: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  system_alert: 'bg-red-500/10 text-red-400 border-red-500/20',
  pr_merged: 'bg-[#4DA8DA]/10 text-[#4DA8DA] border-[#4DA8DA]/20',
  milestone_reached: 'bg-[#FF8C00]/10 text-[#FF8C00] border-[#FF8C00]/20',
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<CodeFlowNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listNotifications({
        type_filter: filter || undefined,
        limit: 100,
      })
      setNotifications(data.notifications)
      const { unread_count } = await getUnreadCount()
      setUnreadCount(unread_count)
    } catch (e: any) {
      setError(e.message || 'Failed to load notifications')
    }
    setLoading(false)
  }, [filter])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Poll unread count
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const { unread_count } = await getUnreadCount()
        setUnreadCount(unread_count)
      } catch { /* ignore */ }
    }, 30_000)
    return () => clearInterval(interval)
  }, [])

  async function handleMarkRead(ids: string[]) {
    try {
      await markNotificationsRead(ids)
      setNotifications((prev) =>
        prev.map((n) =>
          ids.includes(n.notification_id)
            ? { ...n, read: true, read_at: new Date().toISOString() }
            : n
        )
      )
      setUnreadCount((prev) => Math.max(0, prev - ids.length))
      setSelectedIds(new Set())
    } catch { /* ignore */ }
  }

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead()
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read: true, read_at: new Date().toISOString() }))
      )
      setUnreadCount(0)
    } catch { /* ignore */ }
  }

  async function handleDelete(id: string) {
    try {
      await deleteNotification(id)
      setNotifications((prev) => prev.filter((n) => n.notification_id !== id))
    } catch { /* ignore */ }
  }

  async function handleClearRead() {
    try {
      await clearReadNotifications()
      setNotifications((prev) => prev.filter((n) => !n.read))
    } catch { /* ignore */ }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function getUniqueTypes(): string[] {
    const types = new Set(notifications.map((n) => n.type))
    // Sort: unread types first, then alphabetically
    const unreadTypes = new Set(
      notifications.filter((n) => !n.read).map((n) => n.type)
    )
    return Array.from(types).sort((a, b) => {
      const aUnread = unreadTypes.has(a) ? 0 : 1
      const bUnread = unreadTypes.has(b) ? 0 : 1
      if (aUnread !== bUnread) return aUnread - bUnread
      return a.localeCompare(b)
    })
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const days = Math.floor(diff / 86_400_000)

    if (days === 0) {
      return `Today at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    }
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  return (
    <div className="animate-in w-full min-h-[calc(100vh-4rem)] p-6 font-body text-[#FDFBF8]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold mb-1">Notifications</h1>
          <p className="text-[#FDFBF8]/40 text-sm">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
              : 'All caught up'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <button
              onClick={() => handleMarkRead(Array.from(selectedIds))}
              className="bg-[#FF8C00]/20 text-[#FF8C00] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[#FF8C00]/30"
            >
              Mark {selectedIds.size} read
            </button>
          )}
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="bg-[#FF8C00] hover:bg-[#FFB347] text-[#3D1C00] px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
            >
              Mark all read
            </button>
          )}
          <button
            onClick={handleClearRead}
            disabled={!notifications.some((n) => n.read)}
            className="bg-[#1A110D] border border-[#FDFBF8]/10 text-[#FDFBF8]/60 hover:text-[#FDFBF8] px-3 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-40"
          >
            Clear read
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-900/20 border border-red-500/50 text-red-400 text-sm">{error}</div>
      )}

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setFilter(null)}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
            filter === null
              ? 'bg-[#FF8C00]/20 text-[#FF8C00] border-[#FF8C00]/30'
              : 'bg-[#1A110D] text-[#FDFBF8]/50 border-[#FDFBF8]/10 hover:text-[#FDFBF8]'
          )}
        >
          All
        </button>
        {getUniqueTypes().map((type) => (
          <button
            key={type}
            onClick={() => setFilter(type === filter ? null : type)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
              filter === type
                ? 'bg-[#FF8C00]/20 text-[#FF8C00] border-[#FF8C00]/30'
                : 'bg-[#1A110D] text-[#FDFBF8]/50 border-[#FDFBF8]/10 hover:text-[#FDFBF8]'
            )}
          >
            {TYPE_LABELS[type] || type}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <svg className="w-6 h-6 animate-spin text-[#FF8C00]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      )}

      {/* Empty state */}
      {!loading && notifications.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <span className="material-symbols-outlined text-5xl text-[#FDFBF8]/10 mb-4">
            notifications_off
          </span>
          <h3 className="text-lg font-display font-semibold text-[#FDFBF8]/40 mb-1">
            {filter ? 'No matching notifications' : 'No notifications yet'}
          </h3>
          <p className="text-sm text-[#FDFBF8]/25 max-w-sm">
            {filter
              ? 'Try a different filter or check back later.'
              : 'Notifications about task assignments, reviews, and module unlocks will appear here.'}
          </p>
        </div>
      )}

      {/* Notifications list */}
      {!loading && notifications.length > 0 && (
        <div className="bg-[#1A110D] border border-[#FDFBF8]/5 rounded-xl overflow-hidden">
          <div className="divide-y divide-[#FDFBF8]/5">
            {notifications.map((n) => (
              <div
                key={n.notification_id}
                className={cn(
                  'flex items-start gap-4 px-5 py-4 transition-colors',
                  !n.read ? 'bg-[#FF8C00]/[0.02]' : '',
                  'hover:bg-[#FDFBF8]/[0.02]'
                )}
              >
                {/* Checkbox */}
                <div className="pt-0.5">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(n.notification_id)}
                    onChange={() => toggleSelect(n.notification_id)}
                    className="w-4 h-4 rounded border-[#FDFBF8]/20 bg-transparent accent-[#FF8C00] cursor-pointer"
                  />
                </div>

                {/* Icon */}
                <span className={cn(
                  'material-symbols-outlined text-xl mt-0.5 shrink-0',
                  TYPE_COLORS[n.type]?.split(' ')[1] || 'text-[#FDFBF8]/40'
                )}>
                  {TYPE_ICONS[n.type] || 'notifications'}
                </span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'text-sm font-medium',
                        !n.read ? 'text-[#FDFBF8]' : 'text-[#FDFBF8]/60'
                      )}>
                        {n.title}
                      </span>
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded font-mono border',
                        TYPE_COLORS[n.type] || 'bg-[#FDFBF8]/5 text-[#FDFBF8]/30 border-[#FDFBF8]/10'
                      )}>
                        {TYPE_LABELS[n.type] || n.type}
                      </span>
                      {!n.read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#FF8C00]" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-[#FDFBF8]/30 font-mono">
                        {formatDate(n.created_at)}
                      </span>
                      <button
                        onClick={() => handleDelete(n.notification_id)}
                        className="text-[#FDFBF8]/20 hover:text-red-400 transition-colors p-0.5"
                        title="Delete"
                      >
                        <span className="material-symbols-outlined text-sm">close</span>
                      </button>
                    </div>
                  </div>
                  <p className={cn(
                    'text-xs mt-1 leading-relaxed',
                    !n.read ? 'text-[#FDFBF8]/60' : 'text-[#FDFBF8]/35'
                  )}>
                    {n.message}
                  </p>
                  {n.metadata?.module && (
                    <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] text-[#FF8C00]/60 font-mono">
                      <span className="material-symbols-outlined text-[11px]">folder</span>
                      {n.metadata.module}
                      {n.metadata?.source && (
                        <span className="text-[#FDFBF8]/30 ml-1">
                          · {n.metadata.source === 'task_completion' ? 'auto' : 'manual'}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom actions */}
      {!loading && notifications.length > 5 && (
        <div className="flex items-center justify-between mt-4 text-xs text-[#FDFBF8]/30">
          <span>{notifications.length} notification{notifications.length !== 1 ? 's' : ''}</span>
          <button
            onClick={handleClearRead}
            className="hover:text-[#FDFBF8] transition-colors"
          >
            Clear all read
          </button>
        </div>
      )}
    </div>
  )
}
