import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell,
  Check,
  X,
  GitPullRequest,
  UserCircle,
  ShieldCheck,
  Bug,
  ChartBar,
  CheckCircle,
} from '@phosphor-icons/react'
import PageTransition from '../components/ui/page-transition'
import { EmptyState } from '../components/ui/empty-state'
import { NotificationsSkeleton } from '../components/ui/Skeleton'
import { useToast } from '../context/ToastContext'
import {
  listNotifications,
  markNotificationsRead,
  markAllNotificationsRead,
  deleteNotification,
  clearReadNotifications,
} from '../lib/api'
import type { CodeFlowNotification } from '../lib/api'
import Pagination from '../components/ui/Pagination'

const ICON_MAP: Record<string, React.ElementType> = {
  review: GitPullRequest,
  mention: UserCircle,
  alert: Bug,
  pr: GitPullRequest,
  report: ChartBar,
  approval: ShieldCheck,
  task: CheckCircle,
  module: ShieldCheck,
}

const COLOR_MAP: Record<string, string> = {
  review: 'text-blue-400',
  mention: 'text-purple-400',
  alert: 'text-red-400',
  pr: 'text-emerald-400',
  report: 'text-amber-400',
  approval: 'text-cyan-400',
  task: 'text-accent-primary',
  module: 'text-cyan-400',
}

const BG_MAP: Record<string, string> = {
  review: 'bg-blue-500/10',
  mention: 'bg-purple-500/10',
  alert: 'bg-red-500/10',
  pr: 'bg-emerald-500/10',
  report: 'bg-amber-500/10',
  approval: 'bg-cyan-500/10',
  task: 'bg-accent-primary/10',
  module: 'bg-cyan-500/10',
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
  const [notifications, setNotifications] = useState<CodeFlowNotification[]>([])
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

  useEffect(() => {
    fetchNotifications()
  }, [filter])

  useEffect(() => { setPage(0) }, [filter])

  const unreadCount = notifications.filter((n) => !n.read).length

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.notification_id === id ? { ...n, read: true } : n)))
    try {
      await markNotificationsRead([id])
    } catch (err: any) {
      toast.error('Could not mark read', err.message)
    }
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
    try {
      await deleteNotification(id)
    } catch (err: any) {
      setNotifications(prev)
      toast.error('Could not dismiss', err.message)
    }
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

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center">
                <Bell className="w-5 h-5 text-accent-primary" weight="duotone" />
              </div>
              <h1 className="text-display-sm font-display font-medium text-text-primary">
                Notifications
              </h1>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-accent-primary/15 text-accent-primary text-caption font-medium">
                  {unreadCount} new
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="btn btn-secondary text-caption px-3 py-1.5 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" weight="bold" />
                Mark all read
              </button>
            )}
            {notifications.some((n) => n.read) && (
              <button onClick={clearRead} className="btn btn-secondary text-caption px-3 py-1.5 flex items-center gap-1.5">
                <X className="w-3.5 h-3.5" weight="bold" />
                Clear read
              </button>
            )}
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-bg-tertiary/30 w-fit">
          {(['all', 'unread'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-lg text-caption font-medium transition-all ${
                filter === f
                  ? 'bg-bg-primary text-text-primary shadow-sm'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {error && (
          <div className="px-4 py-3 rounded-lg bg-error-muted border border-error/20 text-error text-body-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={fetchNotifications} className="text-caption underline ml-4 text-error/70 hover:text-error">Retry</button>
          </div>
        )}

        {loading && <NotificationsSkeleton />}

        {!loading && notifications.length === 0 && (
          <EmptyState
            icon={<Bell className="w-10 h-10 text-text-tertiary/30" weight="duotone" />}
            title={filter === 'unread' ? 'No unread notifications' : 'All caught up'}
            description={filter === 'unread' ? 'You have read everything.' : 'No notifications yet.'}
          />
        )}

        {/* List */}
        {!loading && notifications.length > 0 && (
          <>
            <div className="space-y-1">
              <AnimatePresence mode="popLayout">
                {notifications.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((notification) => {
                  const Icon = ICON_MAP[notification.type] ?? Bell
                  const key = notification.type ?? 'default'
                  return (
                    <motion.div
                      key={notification.notification_id}
                      layout
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 20, scale: 0.95 }}
                      className={`group relative flex items-start gap-4 p-4 rounded-xl transition-all cursor-pointer hover:bg-bg-tertiary/20 ${
                        !notification.read ? 'bg-accent-primary/[0.03]' : ''
                      }`}
                      onClick={() => !notification.read && markRead(notification.notification_id)}
                    >
                      {!notification.read && (
                        <span className="absolute left-2 top-6 w-1.5 h-1.5 rounded-full bg-accent-primary" />
                      )}
                      <div className={`w-9 h-9 rounded-lg ${BG_MAP[key] ?? 'bg-bg-tertiary/40'} flex items-center justify-center shrink-0`}>
                        <Icon className={`w-4.5 h-4.5 ${COLOR_MAP[key] ?? 'text-text-tertiary'}`} weight="fill" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-body-sm ${!notification.read ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>
                          {notification.title}
                        </p>
                        <p className="text-caption text-text-tertiary mt-0.5">{notification.message}</p>
                        <p className="text-[11px] text-text-tertiary/60 mt-1">{relativeTime(notification.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!notification.read && (
                          <button
                            onClick={(e) => { e.stopPropagation(); markRead(notification.notification_id) }}
                            className="w-7 h-7 rounded-lg bg-bg-tertiary/50 flex items-center justify-center text-text-tertiary hover:text-text-primary"
                            title="Mark read"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); dismiss(notification.notification_id) }}
                          className="w-7 h-7 rounded-lg bg-bg-tertiary/50 flex items-center justify-center text-text-tertiary hover:text-red-400"
                          title="Dismiss"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
            {Math.ceil(notifications.length / PAGE_SIZE) > 1 && (
              <div className="flex justify-end pt-4">
                <Pagination page={page} totalPages={Math.ceil(notifications.length / PAGE_SIZE)} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </div>
    </PageTransition>
  )
}
