import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell, Check, X, GitPullRequest, UserCircle, ShieldCheck, Bug, ChartBar, CheckCircle, WarningCircle,
} from '@phosphor-icons/react'
import { useToast } from '../context/ToastContext'
import {
  listNotifications,
  markNotificationsRead,
  markAllNotificationsRead,
  deleteNotification,
  clearReadNotifications,
  notificationLink,
} from '../lib/api'
import type { OnrampNotification } from '../lib/api'
import { PageHeader } from '../components/ui/page-header'
import ConsolePanel from '../components/ui/console-panel'
import { EmptyState } from '../components/ui/empty-state'
import { NotificationsSkeleton } from '../components/ui/Skeleton'
import Pagination from '../components/ui/Pagination'
import { cn } from '../lib/utils'

// Icons keyed on the notification `type` values the backend actually emits.
const ICON_MAP: Record<string, React.ElementType> = {
  task_assigned: CheckCircle,
  task_started: CheckCircle,
  task_submitted: GitPullRequest,
  task_reviewed: ShieldCheck,
  task_approved: ShieldCheck,
  task_needs_changes: Bug,
  task_completed: CheckCircle,
  task_cancelled: X,
  module_granted: ShieldCheck,
  team_invite: UserCircle,
  system_alert: Bug,
  pr_merged: GitPullRequest,
  milestone_reached: ChartBar,
  quiz_graded: ChartBar,
  dev_stuck: WarningCircle,
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export default function NotificationsPage() {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<OnrampNotification[]>([])
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20

  const toast = useToast()

  async function fetchNotifications() {
    setLoading(true); setError('')
    try {
      const data = await listNotifications(filter === 'unread' ? { unread_only: true } : {})
      setNotifications(data.notifications ?? [])
    } catch (err: any) {
      setError(err.message || 'Failed to load notifications.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchNotifications() }, [filter])
  useEffect(() => { setPage(0) }, [filter])

  // Clamp page when the list shrinks (dismiss/clear) so we never strand on an empty page.
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(notifications.length / PAGE_SIZE))
    if (page > totalPages - 1) setPage(totalPages - 1)
  }, [notifications.length, page])

  const unreadCount = notifications.filter((n) => !n.read).length

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.notification_id === id ? { ...n, read: true } : n)))
    try { await markNotificationsRead([id]) }
    catch (err: any) { toast.error('Could not mark read', err.message) }
  }

  async function markAllRead() {
    const ids = notifications.filter((n) => !n.read).map((n) => n.notification_id)
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    try {
      await markAllNotificationsRead()
      toast.success('Marked all as read', `${ids.length} notifications`)
    } catch (err: any) {
      toast.error('Could not mark all read', err.message)
    }
  }

  async function dismiss(id: string) {
    const prev = notifications
    setNotifications((cur) => cur.filter((n) => n.notification_id !== id))
    try { await deleteNotification(id) }
    catch (err: any) { setNotifications(prev); toast.error('Could not dismiss', err.message) }
  }

  async function clearRead() {
    setNotifications((prev) => prev.filter((n) => !n.read))
    try {
      await clearReadNotifications()
      toast.success('Cleared read notifications')
    } catch (err: any) {
      toast.error('Could not clear', err.message)
    }
  }

  const pills = [
    { label: 'total', value: notifications.length },
    { label: 'unread', value: unreadCount, color: unreadCount > 0 ? 'text-go' : undefined },
  ]

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-3xl mx-auto px-4 sm:px-0 py-8 sm:py-10 space-y-6">
        <PageHeader
          eyebrow="Event Bus"
          title="Notifications"
          subtitle="Activity from tasks, reviews, and system signals across your team."
          pills={pills}
          actions={
            <>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="btn btn-secondary">
                  <Check className="w-4 h-4" weight="bold" />
                  Mark all read
                </button>
              )}
              {notifications.some((n) => n.read) && (
                <button onClick={clearRead} className="btn btn-ghost">
                  <X className="w-4 h-4" weight="bold" />
                  Clear read
                </button>
              )}
            </>
          }
        />

        {/* Filter Tabs */}
        <div className="flex items-center gap-2">
          {(['all', 'unread'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1.5 rounded-sm font-sans text-xs font-semibold tracking-wide uppercase transition-all',
                filter === f
                  ? 'bg-well text-ink border border-seam shadow-sm'
                  : 'text-ink-muted hover:text-ink hover:bg-well/50'
              )}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {error && (
          <div className="p-4 rounded-md bg-abort/10 border border-abort/30 text-abort text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={fetchNotifications} className="text-xs underline hover:text-abort font-mono">
              RETRY
            </button>
          </div>
        )}

        {loading && <NotificationsSkeleton />}

        {!loading && notifications.length === 0 && (
          <EmptyState
            icon={<Bell className="w-10 h-10 text-ink-muted/40" weight="duotone" />}
            title={filter === 'unread' ? 'No unread notifications' : 'All caught up'}
            description={filter === 'unread' ? 'You have read all notifications.' : 'No notifications in your event bus.'}
          />
        )}

        {/* List */}
        {!loading && notifications.length > 0 && (
          <div className="space-y-3">
            {notifications.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((notification) => {
              const Icon = ICON_MAP[notification.type] ?? Bell
              return (
                <ConsolePanel
                  key={notification.notification_id}
                  rail={notification.type.toUpperCase().replace(/_/g, ' ')}
                  designator={relativeTime(notification.created_at)}
                  status={notification.read ? 'idle' : 'go'}
                  className={cn(
                    'transition-all cursor-pointer hover:border-seam-strong',
                    !notification.read && 'border-l-2 border-l-go'
                  )}
                  onClick={() => {
                    const link = notificationLink(notification)
                    if (link) navigate(link)
                    if (!notification.read) markRead(notification.notification_id)
                  }}
                >
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      'w-8 h-8 rounded-sm flex items-center justify-center shrink-0 mt-0.5',
                      notification.read ? 'bg-well text-ink-muted' : 'bg-go/10 text-go'
                    )}>
                      <Icon className="w-4 h-4" weight="bold" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm', !notification.read ? 'font-semibold text-ink' : 'text-ink-secondary')}>
                        {notification.title}
                      </p>
                      <p className="text-xs text-ink-muted mt-1 leading-relaxed">{notification.message}</p>
                      <p className="text-[11px] font-mono text-ink-tertiary mt-2">
                        {new Date(notification.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!notification.read && (
                        <button
                          onClick={(e) => { e.stopPropagation(); markRead(notification.notification_id) }}
                          className="p-1.5 rounded-sm hover:bg-well text-ink-muted hover:text-go transition-colors"
                          title="Mark read"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); dismiss(notification.notification_id) }}
                        className="p-1.5 rounded-sm hover:bg-well text-ink-muted hover:text-abort transition-colors"
                        title="Dismiss"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </ConsolePanel>
              )
            })}

            {Math.ceil(notifications.length / PAGE_SIZE) > 1 && (
              <div className="flex justify-end pt-4">
                <Pagination page={page} totalPages={Math.ceil(notifications.length / PAGE_SIZE)} onPageChange={setPage} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}