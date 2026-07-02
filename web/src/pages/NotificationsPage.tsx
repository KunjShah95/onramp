import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { cn } from '../lib/utils'
import {
  listNotifications, getUnreadCount, markNotificationsRead,
  markAllNotificationsRead, deleteNotification, clearReadNotifications,
} from '../lib/api'
import { PageHeader } from '../components/ui/page-header'
import { EmptyState } from '../components/ui/empty-state'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import StatusBadge from '../components/ui/status-badge'
import PageTransition from '../components/ui/page-transition'
import { useToast } from '../context/ToastContext'
import { NotificationsSkeleton } from '../components/ui/Skeleton'

const TYPE_ICONS: Record<string, string> = {
  task_assigned: 'assignment', task_started: 'play_arrow', task_submitted: 'rate_review',
  task_reviewed: 'visibility', task_approved: 'check_circle', task_needs_changes: 'edit_note',
  task_completed: 'celebration', task_cancelled: 'cancel', module_granted: 'lock_open',
  team_invite: 'person_add', system_alert: 'warning', pr_merged: 'merge', milestone_reached: 'flag',
}

const TYPE_LABELS: Record<string, string> = {
  task_assigned: 'Task Assigned', task_started: 'Task Started', task_submitted: 'Submitted',
  task_reviewed: 'Reviewed', task_approved: 'Approved', task_needs_changes: 'Changes Needed',
  task_completed: 'Completed', task_cancelled: 'Cancelled', module_granted: 'Module Access',
  team_invite: 'Team Invite', system_alert: 'System Alert', pr_merged: 'PR Merged',
  milestone_reached: 'Milestone',
}

const TYPE_ICON_COLORS: Record<string, string> = {
  task_assigned: 'text-blue-400', task_started: 'text-[#FF8C00]', task_submitted: 'text-purple-400',
  task_reviewed: 'text-yellow-400', task_approved: 'text-green-400', task_needs_changes: 'text-red-400',
  task_completed: 'text-green-400', task_cancelled: 'text-[#FDFBF8]/25', module_granted: 'text-emerald-400',
  team_invite: 'text-pink-400', system_alert: 'text-red-400', pr_merged: 'text-[#4DA8DA]',
  milestone_reached: 'text-[#FF8C00]',
}

export default function NotificationsPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const { data: notifData, isLoading: loading, error } = useQuery({
    queryKey: ['notifications', filter],
    queryFn: () => listNotifications({ type_filter: filter || undefined, limit: 100 }),
    refetchInterval: 30_000,
    staleTime: 10_000,
  })

  const { data: unreadData } = useQuery({
    queryKey: ['unreadCount'],
    queryFn: getUnreadCount,
    refetchInterval: 30_000,
    staleTime: 5_000,
  })

  const notifications = notifData?.notifications ?? []
  const unreadCount = unreadData?.unread_count ?? 0

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
    queryClient.invalidateQueries({ queryKey: ['unreadCount'] })
  }, [queryClient])

  const markReadMutation = useMutation({
    mutationFn: (ids: string[]) => markNotificationsRead(ids),
    onSuccess: () => { invalidate(); setSelectedIds(new Set()) },
  })

  const markAllReadMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => { invalidate(); toast.success('All marked as read') },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteNotification(id),
    onSuccess: () => {
      invalidate()
      toast.info('Notification removed')
      setSelectedIds(new Set())
    },
  })

  const clearReadMutation = useMutation({
    mutationFn: clearReadNotifications,
    onSuccess: () => { invalidate(); toast.info('Read notifications cleared') },
  })

  function handleMarkRead(ids: string[]) {
    markReadMutation.mutate(ids)
  }

  function handleMarkAllRead() {
    markAllReadMutation.mutate()
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this notification?')) return
    deleteMutation.mutate(id)
  }

  function handleClearRead() {
    clearReadMutation.mutate()
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function getUniqueTypes() {
    const types = new Set(notifications.map((n) => n.type))
    const unreadTypes = new Set(notifications.filter((n) => !n.read).map((n) => n.type))
    return Array.from(types).sort((a, b) => {
      const diff = (unreadTypes.has(a) ? 0 : 1) - (unreadTypes.has(b) ? 0 : 1)
      return diff !== 0 ? diff : a.localeCompare(b)
    })
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.03 } },
  }
  const itemVariants = {
    hidden: { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0 },
  }

  function notifTypeToBadge(type: string): string {
    const map: Record<string, string> = {
      task_assigned: 'assigned',
      task_started: 'in_progress',
      task_submitted: 'submitted',
      task_reviewed: 'under_review',
      task_approved: 'approved',
      task_needs_changes: 'needs_changes',
      task_completed: 'completed',
      task_cancelled: 'cancelled',
    }
    return map[type] || 'pending'
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const diff = Date.now() - d.getTime()
    const days = Math.floor(diff / 86_400_000)
    if (days === 0) return `Today ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days}d ago`
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  return (
    <PageTransition>
    <div className="w-full min-h-[calc(100vh-4rem)] p-4 sm:p-6 font-body text-[#FDFBF8] max-w-full overflow-x-hidden">
      <PageHeader
        title="Notifications"
        subtitle={unreadCount > 0
          ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
          : 'All caught up'}
        pills={unreadCount > 0 ? [{ label: 'unread', value: unreadCount, color: 'text-[#FF8C00]' }] : undefined}
        actions={
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <button onClick={() => handleMarkRead(Array.from(selectedIds))}
                className="bg-[#FF8C00]/15 text-[#FF8C00] hover:bg-[#FF8C00]/25 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
                Mark {selectedIds.size} read
              </button>
            )}
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead}
                className="bg-[#FFB347] hover:bg-[#FF8C00] text-[#3D1C00] px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                Mark all read
              </button>
            )}
            <button onClick={handleClearRead} disabled={!notifications.some((n) => n.read)}
              className="bg-[#120D0A] border border-[#FDFBF8]/8 text-[#FDFBF8]/50 hover:text-[#FDFBF8] px-3 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-30">
              Clear read
            </button>
          </div>
        }
      />

      {error && (
        <div className="mb-5 px-4 py-3 rounded-lg bg-red-500/8 border border-red-500/20 text-red-400 text-sm">{(error as Error)?.message}</div>
      )}

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button onClick={() => setFilter(null)}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
            filter === null
              ? 'bg-[#FF8C00]/15 text-[#FF8C00] border-[#FF8C00]/25'
              : 'bg-[#120D0A] text-[#FDFBF8]/40 border-[#FDFBF8]/8 hover:text-[#FDFBF8]/70'
          )}>
          All
        </button>
        {getUniqueTypes().map((type) => (
          <button key={type} onClick={() => setFilter(type === filter ? null : type)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
              filter === type
                ? 'bg-[#FF8C00]/15 text-[#FF8C00] border-[#FF8C00]/25'
                : 'bg-[#120D0A] text-[#FDFBF8]/40 border-[#FDFBF8]/8 hover:text-[#FDFBF8]/70'
            )}>
            {TYPE_LABELS[type] || type}
          </button>
        ))}
      </div>

      {loading && <NotificationsSkeleton />}

      {!loading && notifications.length === 0 && (
        <div className="bg-[#120D0A] border border-[#FDFBF8]/5 rounded-xl">
          <EmptyState
            title={filter ? 'No matching notifications' : 'No notifications yet'}
            description={filter
              ? 'Try a different filter or clear it to see all'
              : 'Task assignments, reviews, and module unlocks will appear here'}
            icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>}
          />
        </div>
      )}

      {!loading && notifications.length > 0 && (
        <CardSpotlight className="overflow-hidden">
          <GradientHeading as="h2" className="text-sm px-5 pt-4 pb-0">Notifications</GradientHeading>
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="divide-y divide-[#FDFBF8]/4"
          >
            {notifications.map((n) => (
              <motion.div key={n.notification_id} variants={itemVariants}
                className={cn(
                  'flex items-start gap-4 px-5 py-4 transition-colors group',
                  !n.read ? 'bg-[#FF8C00]/[0.015]' : '',
                  'hover:bg-[#FDFBF8]/[0.015]'
                )}>
                {/* Checkbox */}
                <div className="pt-0.5 shrink-0">
                  <input type="checkbox" checked={selectedIds.has(n.notification_id)}
                    onChange={() => toggleSelect(n.notification_id)}
                    className="w-3.5 h-3.5 rounded border-[#FDFBF8]/20 bg-transparent accent-[#FF8C00] cursor-pointer" />
                </div>

                {/* Unread dot */}
                <div className="pt-2 shrink-0">
                  {!n.read
                    ? <span className="w-1.5 h-1.5 rounded-full bg-[#FF8C00] block" />
                    : <span className="w-1.5 h-1.5 block" />
                  }
                </div>

                {/* Icon */}
                <span className={cn(
                  'material-symbols-outlined text-lg mt-0.5 shrink-0',
                  TYPE_ICON_COLORS[n.type] || 'text-[#FDFBF8]/30'
                )}>
                  {TYPE_ICONS[n.type] || 'notifications'}
                </span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className={cn('text-sm font-medium truncate', !n.read ? 'text-[#FDFBF8]' : 'text-[#FDFBF8]/55')}>
                        {n.title}
                      </span>
                      <StatusBadge state={notifTypeToBadge(n.type)} />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-[#FDFBF8]/25 font-mono whitespace-nowrap">
                        {formatDate(n.created_at)}
                      </span>
                      <button onClick={() => handleDelete(n.notification_id)}
                        className="text-[#FDFBF8]/15 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <p className={cn('text-xs mt-1 leading-relaxed', !n.read ? 'text-[#FDFBF8]/55' : 'text-[#FDFBF8]/30')}>
                    {n.message}
                  </p>
                  {n.metadata?.module && (
                    <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] text-[#FF8C00]/50 font-mono">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
                      </svg>
                      {n.metadata.module}
                      {n.metadata?.source && (
                        <span className="text-[#FDFBF8]/20 ml-1">
                          · {n.metadata.source === 'task_completion' ? 'auto' : 'manual'}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </CardSpotlight>
      )}

      {!loading && notifications.length > 5 && (
        <div className="flex items-center justify-between mt-4 text-xs text-[#FDFBF8]/25">
          <span>{notifications.length} notification{notifications.length !== 1 ? 's' : ''}</span>
          <button onClick={handleClearRead} className="hover:text-[#FDFBF8]/60 transition-colors">
            Clear all read
          </button>
        </div>
      )}
    </div>
    </PageTransition>
  )
}
