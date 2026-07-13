import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  ShieldCheck,
  Users,
  GitPullRequest,
  Heartbeat,
  Key,
  Bell,
  ChartBar,
} from '@phosphor-icons/react'
import PageTransition from '../components/ui/page-transition'
import CardSpotlight from '../components/ui/card-spotlight'
import { AdminDashboardSkeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/empty-state'
import {
  adminGetUsage,
  adminGetTeamUsage,
  adminListApiKeys,
  adminListAuditEvents,
} from '../lib/api'
import type { AdminAuditEvent } from '../lib/api'

const AUDIT_ICON: Record<string, { icon: any; color: string; bg: string }> = {
  auth: { icon: Key, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  config: { icon: ShieldCheck, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  access: { icon: Key, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  deploy: { icon: GitPullRequest, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [usage, setUsage] = useState<number | null>(null)
  const [keys, setKeys] = useState<number | null>(null)
  const [teams, setTeams] = useState<number | null>(null)
  const [members, setMembers] = useState<number | null>(null)
  const [audit, setAudit] = useState<AdminAuditEvent[]>([])

  async function fetchAdminData() {
    setLoading(true); setError('')
    try {
      await Promise.all([
        adminGetUsage().then((u) => setUsage(u.total_requests)).catch(() => {}),
        adminListApiKeys().then((k) => setKeys(k.count)).catch(() => {}),
        adminGetTeamUsage().then((t) => {
          setTeams(t.count)
          setMembers(t.teams.reduce((acc, x) => acc + (x.member_count || 0), 0))
        }).catch(() => {}),
        adminListAuditEvents({ limit: 8 }).then((a) => setAudit(a.events)).catch(() => {}),
      ])
    } catch (err: any) {
      setError(err.message || 'Failed to load admin data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAdminData() }, [])

  const fmt = (n: number | null) => (n == null ? '—' : n.toLocaleString())

  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-accent-primary" weight="duotone" />
            </div>
            <div>
              <h1 className="text-display-sm font-display font-medium text-text-primary">
                Admin Dashboard
              </h1>
              <p className="text-body-sm text-text-tertiary">
                System-wide monitoring and management.
              </p>
            </div>
          </div>
          <button onClick={fetchAdminData} disabled={loading} className="text-caption text-accent-primary/70 hover:text-accent-primary transition-colors shrink-0">Refresh</button>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-lg bg-error-muted border border-error/20 text-error text-body-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={fetchAdminData} disabled={loading} className="text-caption underline ml-4 text-error/70 hover:text-error disabled:opacity-50">Retry</button>
          </div>
        )}

        {loading ? (
          <div className="py-8"><AdminDashboardSkeleton /></div>
        ) : (
          <>
            {/* Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'API Calls (24h)', value: fmt(usage), icon: ChartBar, color: 'text-emerald-400' },
                { label: 'Active Teams', value: fmt(teams), icon: Users, color: 'text-blue-400' },
                { label: 'Active Members', value: fmt(members), icon: Users, color: 'text-purple-400' },
                { label: 'Active API Keys', value: fmt(keys), icon: Key, color: 'text-amber-400' },
              ].map((metric, i) => (
                <motion.div key={metric.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                  <CardSpotlight className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-9 h-9 rounded-lg ${metric.color.replace('text', 'bg')}/10 flex items-center justify-center`}>
                        <metric.icon className={`w-4.5 h-4.5 ${metric.color}`} weight="fill" />
                      </div>
                      <span className="text-caption text-text-tertiary">{metric.label}</span>
                    </div>
                    <p className="text-display-xs font-display font-medium text-text-primary">{metric.value}</p>
                  </CardSpotlight>
                </motion.div>
              ))}
            </div>

            {/* Two-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Org Health */}
              <CardSpotlight className="p-5">
                <h3 className="text-body-sm font-medium text-text-primary mb-4">Organization Health</h3>
                <div className="space-y-4">
                  {[
                    { label: 'Teams', value: teams ?? 0, color: 'bg-emerald-400' },
                    { label: 'Members', value: members ?? 0, color: 'bg-blue-400' },
                    { label: 'API Keys', value: keys ?? 0, color: 'bg-amber-400' },
                    { label: 'Requests (24h)', value: usage ?? 0, color: 'bg-purple-400' },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-caption text-text-tertiary">{item.label}</span>
                      <span className="text-body-sm font-medium text-text-primary">{fmt(item.value as number)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-3">
                  {[
                    { label: 'API Calls', value: fmt(usage), icon: ChartBar },
                    { label: 'Keys', value: fmt(keys), icon: Key },
                  ].map((stat) => (
                    <div key={stat.label} className="flex items-center gap-2">
                      <stat.icon className="w-3.5 h-3.5 text-text-tertiary" />
                      <div>
                        <p className="text-body-sm font-medium text-text-primary">{stat.value}</p>
                        <p className="text-caption text-text-tertiary">{stat.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardSpotlight>

              {/* Audit Log */}
              <CardSpotlight className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-body-sm font-medium text-text-primary">Recent Audit Log</h3>
                  <Bell className="w-4 h-4 text-text-tertiary" weight="duotone" />
                </div>
                {audit.length === 0 ? (
                  <EmptyState icon={<Bell className="w-8 h-8 text-text-tertiary/30" weight="duotone" />} title="No audit events" description="Security and config events will appear here." />
                ) : (
                  <div className="space-y-2">
                    {audit.map((entry, i) => {
                      const style = AUDIT_ICON[entry.event_type] ?? { icon: GitPullRequest, color: 'text-emerald-400', bg: 'bg-emerald-500/10' }
                      return (
                        <motion.div
                          key={entry.event_id || i}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-bg-tertiary/10 transition-colors"
                        >
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${style.bg}`}>
                            <style.icon className={`w-3.5 h-3.5 ${style.color}`} weight="fill" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-body-sm text-text-secondary capitalize">{entry.event_type.replace(/_/g, ' ')}</p>
                            <p className="text-caption text-text-tertiary/60">
                              {entry.actor_id} → {entry.target_id || '—'}
                            </p>
                            <p className="text-[11px] text-text-tertiary/40">{relativeTime(entry.timestamp)}</p>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                )}
              </CardSpotlight>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Manage Users', icon: Users, color: 'text-blue-400' },
                { label: 'View API Keys', icon: Key, color: 'text-purple-400' },
                { label: 'View Audit Log', icon: ShieldCheck, color: 'text-amber-400' },
                { label: 'System Health', icon: Heartbeat, color: 'text-emerald-400' },
              ].map((action) => (
                <button key={action.label} className="card p-3 flex items-center gap-3 hover:border-accent-primary/30 transition-all">
                  <action.icon className={`w-4 h-4 ${action.color}`} weight="duotone" />
                  <span className="text-caption font-medium text-text-primary">{action.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </PageTransition>
  )
}
