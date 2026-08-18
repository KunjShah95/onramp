import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  ShieldCheck,
  FunnelSimple,
  MagnifyingGlass,
  X,
  User,
  Terminal,
  ArrowCounterClockwise,
  FileCsv,
  FileJs,
  CaretLeft,
  CaretRight,
} from '@phosphor-icons/react'
import ConsolePanel from '../components/ui/console-panel'
import { EmptyState } from '../components/ui/empty-state'
import { PageHeader } from '../components/ui/page-header'
import { adminListAuditEvents, exportAuditEvents } from '../lib/api'
import type { AdminAuditEvent } from '../lib/api'
import { formatInIST, formatKeyDate } from '../lib/utils'

const EVENT_TYPE_ICONS: Record<string, { icon: typeof ShieldCheck; color: string; bg: string }> = {
  auth: { icon: User, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  config: { icon: ShieldCheck, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  access: { icon: ShieldCheck, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  deploy: { icon: Terminal, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  api: { icon: Terminal, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  user: { icon: User, color: 'text-pink-400', bg: 'bg-pink-500/10' },
}

const EVENT_TYPES = ['', 'auth', 'config', 'access', 'deploy', 'api', 'user'] as const

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return formatKeyDate(iso)
}

const PAGE_SIZE = 25

export default function AuditLogPage() {
  const [events, setEvents] = useState<AdminAuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  // Filters
  const [filterType, setFilterType] = useState('')
  const [filterActor, setFilterActor] = useState('')
  const [filterVisible, setFilterVisible] = useState(false)

  async function fetchEvents() {
    setLoading(true); setError('')
    try {
      const result = await adminListAuditEvents({
        event_type: filterType || undefined,
        actor_id: filterActor || undefined,
        limit: PAGE_SIZE * (page + 1),
      })
      setEvents(result.events)
      setTotalCount(result.count)
    } catch (err: any) {
      setError(err.message || 'Failed to load audit events.')
    } finally {
      setLoading(false)
    }
  }

  // Immediate fetch for page/filter type changes
  useEffect(() => { fetchEvents() }, [page, filterType])

  // Debounced fetch for text input (actor search)
  useEffect(() => {
    const timer = setTimeout(() => { fetchEvents() }, 300)
    return () => clearTimeout(timer)
  }, [filterActor])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const pageEvents = events.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  async function handleExport(format: 'json' | 'csv') {
    try {
      const blob = await exportAuditEvents({
        format,
        event_type: filterType || undefined,
        actor_id: filterActor || undefined,
        limit: 10000,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.${format}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setError(err.message || 'Export failed.')
    }
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="max-w-6xl mx-auto px-4 sm:px-6 space-y-6 relative">

      {/* Header */}
      <PageHeader
        eyebrow="Folio 13 · Audit log"
        title="Audit Log"
        subtitle="Security and configuration events across all teams."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExport('csv')}
              className="px-3 py-2 rounded-btn text-caption font-medium border border-seam text-ink-secondary hover:bg-well/20 hover:border-seam-strong transition-colors flex items-center gap-1.5"
            >
              <FileCsv className="w-3.5 h-3.5" />
              CSV
            </button>
            <button
              onClick={() => handleExport('json')}
              className="px-3 py-2 rounded-btn text-caption font-medium border border-seam text-ink-secondary hover:bg-well/20 hover:border-seam-strong transition-colors flex items-center gap-1.5"
            >
              <FileJs className="w-3.5 h-3.5" />
              JSON
            </button>
            <button
              onClick={() => setFilterVisible(!filterVisible)}
              className={`px-3 py-2 rounded-btn text-caption font-medium border transition-colors flex items-center gap-1.5 ${
                filterVisible || filterType || filterActor
                  ? 'border-go/40 text-go bg-go/5'
                  : 'border-seam text-ink-secondary hover:bg-well/20 hover:border-seam-strong'
              }`}
            >
              <FunnelSimple className="w-3.5 h-3.5" />
              Filters
              {(filterType || filterActor) && <span className="w-1.5 h-1.5 rounded-full bg-go" />}
            </button>
            <button
              onClick={fetchEvents}
              disabled={loading}
              className="px-3 py-2 rounded-btn text-caption font-medium border border-seam text-ink-secondary hover:bg-well/20 hover:border-seam-strong transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <ArrowCounterClockwise className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        }
      />

      {/* Filters Panel */}
      {filterVisible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-panel border border-seam"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-body-sm font-medium text-ink">Filter Events</h3>
            <button onClick={() => { setFilterType(''); setFilterActor(''); setPage(0) }} className="text-caption text-go/70 hover:text-go transition-colors">
              Clear all
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-caption text-ink-tertiary mb-1.5 block">Event Type</label>
              <div className="flex flex-wrap gap-1.5">
                {EVENT_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => { setFilterType(t); setPage(0) }}
                    className={`px-3 py-1.5 rounded-lg text-caption font-medium transition-colors ${
                      filterType === t
                        ? 'bg-go/10 text-go border border-go/20'
                        : 'bg-well/20 text-ink-secondary border border-transparent hover:bg-well/40'
                    }`}
                  >
                    {t || 'All'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-caption text-ink-tertiary mb-1.5 block">Actor ID</label>
              <div className="relative">
                <MagnifyingGlass className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary" />
                <input
                  type="text"
                  value={filterActor}
                  onChange={(e) => { setFilterActor(e.target.value); setPage(0) }}
                  placeholder="Search by actor ID…"
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-well/20 border border-seam text-body-sm text-ink placeholder:text-ink-tertiary/50 focus:outline-none focus:border-go/40 transition-colors"
                />
                {filterActor && (
                  <button onClick={() => setFilterActor('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-tertiary hover:text-ink">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-abort/10 border border-abort/20 text-abort text-body-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={fetchEvents} className="text-caption underline ml-4 text-abort/70 hover:text-abort">Retry</button>
        </div>
      )}

      {/* Events Table */}
      <ConsolePanel pad="none" className="overflow-hidden">
        {loading && events.length === 0 ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-7 h-7 rounded-lg bg-well/30" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-32 bg-well/30 rounded" />
                  <div className="h-2.5 w-48 bg-well/20 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : pageEvents.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<ShieldCheck className="w-10 h-10 text-ink-tertiary/30" weight="duotone" />}
              title="No events found"
              description={filterType || filterActor ? 'Try adjusting your filters.' : 'Security and configuration events will appear here.'}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="border-collapse text-left w-full table-auto">
              <thead>
                <tr className="border-b border-seam sticky top-0 z-10 bg-panel">
                  <th className="text-left px-4 py-3 text-caption font-medium text-ink-tertiary uppercase tracking-wider align-middle">Event</th>
                  <th className="text-left px-4 py-3 text-caption font-medium text-ink-tertiary uppercase tracking-wider align-middle">Actor</th>
                  <th className="text-left px-4 py-3 text-caption font-medium text-ink-tertiary uppercase tracking-wider align-middle">Target</th>
                  <th className="text-left px-4 py-3 text-caption font-medium text-ink-tertiary uppercase tracking-wider align-middle">Team</th>
                  <th className="text-right px-4 py-3 text-caption font-medium text-ink-tertiary uppercase tracking-wider align-middle">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {pageEvents.map((entry, i) => {
                  const style = EVENT_TYPE_ICONS[entry.event_type] ?? { icon: ShieldCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10' }
                  const Icon = style.icon
                  return (
                    <motion.tr
                      key={entry.event_id || i}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.025 }}
                      className="hover:bg-well/10 transition-colors group"
                    >
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-center gap-3">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${style.bg}`}>
                            <Icon className={`w-3.5 h-3.5 ${style.color}`} weight="fill" />
                          </div>
                          <div>
                            <p className="text-body-sm text-ink-secondary capitalize font-medium">
                              {entry.event_type.replace(/_/g, ' ')}
                            </p>
                            {entry.metadata?.action && (
                              <p className="text-[11px] text-ink-tertiary/50">{entry.metadata.action}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        {entry.actor_name ? (
                          <span className="text-body-sm text-ink-secondary font-medium">{entry.actor_name}</span>
                        ) : entry.actor_id ? (
                          <code className="text-body-xs text-ink-secondary font-mono bg-well/20 px-1.5 py-0.5 rounded text-[12px]">
                            {entry.actor_id.slice(0, 12)}…
                          </code>
                        ) : (
                          <span className="text-body-xs text-ink-tertiary">N/A</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        {entry.target_name ? (
                          <span className="text-body-xs text-ink-tertiary font-medium">{entry.target_name}</span>
                        ) : entry.target_id ? (
                          <span className="text-body-xs text-ink-tertiary font-mono text-[12px]">
                            {entry.target_id.slice(0, 12)}…
                          </span>
                        ) : (
                          <span className="text-body-xs text-ink-tertiary">N/A</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        {entry.team_name ? (
                          <span className="text-body-xs text-ink-tertiary font-medium">{entry.team_name}</span>
                        ) : entry.team_id ? (
                          <span className="text-body-xs text-ink-tertiary font-mono text-[12px]">
                            {entry.team_id.slice(0, 8)}…
                          </span>
                        ) : (
                          <span className="text-body-xs text-ink-tertiary">N/A</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right align-middle">
                        <span className="text-body-xs text-ink-tertiary/60 whitespace-nowrap" title={`${formatInIST(entry.timestamp)} IST`}>
                          {relativeTime(entry.timestamp)}
                        </span>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalCount > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-seam/50">
            <span className="text-caption text-ink-tertiary">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-ink-tertiary hover:text-ink hover:bg-well/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <CaretLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
                const start = Math.max(0, Math.min(page - 3, totalPages - 7))
                const p = start + i
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-caption font-medium transition-colors ${
                      p === page
                        ? 'bg-go/10 text-go'
                        : 'text-ink-tertiary hover:text-ink hover:bg-well/20'
                    }`}
                  >
                    {p + 1}
                  </button>
                )
              })}
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-ink-tertiary hover:text-ink hover:bg-well/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <CaretRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </ConsolePanel>
    </motion.div>
  )
}
