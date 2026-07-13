import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  ChartBar, Users, CurrencyDollar, CreditCard, TrendUp,
  Building, Bell, ShieldCheck, GitPullRequest,
} from '@phosphor-icons/react'
import PageTransition from '../components/ui/page-transition'
import CardSpotlight from '../components/ui/card-spotlight'
import { EmptyState } from '../components/ui/empty-state'
import { cn } from '../lib/utils'
import { fetchSeedRoleData } from '../lib/api'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
}

const AUDIT_STYLES: Record<string, { icon: any; color: string; bg: string }> = {
  auth: { icon: ShieldCheck, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  config: { icon: Bell, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  access: { icon: Users, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  deploy: { icon: GitPullRequest, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
}

export default function ExecutivePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [seedData, setSeedData] = useState<any>(null)

  useEffect(() => {
    let cancelled = false
    fetchSeedRoleData()
      .then((res) => { if (!cancelled) { setSeedData(res.data); setLoading(false) } })
      .catch((err) => { if (!cancelled) { setError(err.message); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  const d = seedData
  const metrics = [
    { label: 'Monthly Revenue (MRR)', value: d ? `$${d.mrr?.toLocaleString() ?? '0'}` : '$0', icon: CurrencyDollar, color: 'text-emerald-400' },
    { label: 'Active Teams', value: d ? `${d.stats?.active_teams ?? 0}` : '0', icon: Building, color: 'text-blue-400' },
    { label: 'Active Users', value: d ? `${d.stats?.total_users ?? 0}` : '0', icon: Users, color: 'text-purple-400' },
    { label: 'Credits Used (24h)', value: d ? `${(d.stats?.api_calls_24h ?? 0).toLocaleString()}` : '0', icon: CreditCard, color: 'text-amber-400' },
  ]

  return (
    <PageTransition>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-6xl mx-auto space-y-8"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <ChartBar className="w-5 h-5 text-emerald-400" weight="duotone" />
          </div>
          <div>
            <h1 className="text-display-sm font-display font-medium text-text-primary">Executive Dashboard</h1>
            <p className="text-body-sm text-text-tertiary">CTO/CEO overview of organization metrics.</p>
          </div>
        </motion.div>

        {error && (
          <div className="px-4 py-3 rounded-lg bg-error-muted border border-error/20 text-error text-body-sm">{error}</div>
        )}

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 rounded-xl bg-bg-secondary border border-border animate-pulse" />
              ))}
            </div>
            <div className="h-48 rounded-xl bg-bg-secondary border border-border animate-pulse" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="h-64 rounded-xl bg-bg-secondary border border-border animate-pulse" />
              <div className="h-64 rounded-xl bg-bg-secondary border border-border animate-pulse" />
            </div>
          </div>
        ) : (
          <>
            {/* Stats row */}
            <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {metrics.map((metric) => (
                <CardSpotlight key={metric.label} className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', metric.color.replace('text', 'bg'), '/10')}>
                      <metric.icon className={cn('w-4 h-4', metric.color)} weight="fill" />
                    </div>
                    <span className="text-caption text-text-tertiary">{metric.label}</span>
                  </div>
                  <p className="text-display-xs font-display font-medium text-text-primary">{metric.value}</p>
                </CardSpotlight>
              ))}
            </motion.div>

            {/* Two-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Revenue Overview */}
              <motion.div variants={itemVariants} className="lg:col-span-3">
                <CardSpotlight className="p-5">
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                      <TrendUp className="w-4 h-4 text-emerald-400" weight="fill" />
                    </div>
                    <h2 className="font-display text-body-sm font-bold text-text-primary">Revenue Overview</h2>
                  </div>
                    <div className="h-48 rounded-xl bg-bg-tertiary/40 border border-border border-dashed flex items-center justify-center">
                      <div className="text-center">
                        <CurrencyDollar className="w-8 h-8 text-text-tertiary/30 mx-auto mb-2" weight="duotone" />
                        <p className="text-caption text-text-tertiary/60">Revenue Overview</p>
                        <p className="text-display-xs font-display font-medium text-text-primary mt-2">${(d?.mrr ?? 0).toLocaleString()} MRR</p>
                        <div className="flex items-center justify-center gap-4 mt-2 text-caption text-text-tertiary/50">
                          <span>↑ {d?.mrr_growth ?? 0}% MoM</span>
                          <span>·</span>
                          <span>{d?.active_subscriptions ?? 0} active subscriptions</span>
                        </div>
                      </div>
                    </div>
                </CardSpotlight>
              </motion.div>

              {/* Top Teams */}
              <motion.div variants={itemVariants} className="lg:col-span-2">
                <CardSpotlight className="p-5">
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                      <Users className="w-4 h-4 text-blue-400" weight="fill" />
                    </div>
                    <h2 className="font-display text-body-sm font-bold text-text-primary">Top Teams</h2>
                  </div>
                  {!d?.top_teams?.length ? (
                    <EmptyState icon={<Users className="w-8 h-8 text-text-tertiary/30" weight="duotone" />} title="No teams" description="Teams will appear once created." />
                  ) : (
                    <div className="space-y-3">
                      {d.top_teams.map((team: any, i: number) => (
                        <motion.div
                          key={team.name}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.06 }}
                          className="p-3 rounded-lg bg-bg-tertiary/20 border border-border hover:bg-bg-tertiary/40 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-body-xs font-medium text-text-primary">{team.name}</span>
                            <span className="text-caption text-text-tertiary/60">{team.members} members</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
                              <div
                                className={cn('h-full rounded-full transition-all duration-700', team.completion_rate >= 80 ? 'bg-success' : team.completion_rate >= 60 ? 'bg-accent-from' : 'bg-error')}
                                style={{ width: `${team.completion_rate}%` }}
                              />
                            </div>
                            <span className={cn('text-caption font-code tabular-nums', team.completion_rate >= 80 ? 'text-success' : team.completion_rate >= 60 ? 'text-accent-from' : 'text-error')}>{team.completion_rate}%</span>
                          </div>
                          <div className="mt-1.5 flex items-center gap-1 text-caption text-text-tertiary/50">
                            <TrendUp size={12} weight="bold" />
                            <span>Velocity {team.velocity}x</span>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </CardSpotlight>
              </motion.div>
            </div>

            {/* Bottom row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Billing Summary */}
              <motion.div variants={itemVariants}>
                <CardSpotlight className="p-5">
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                      <CreditCard className="w-4 h-4 text-amber-400" weight="fill" />
                    </div>
                    <h2 className="font-display text-body-sm font-bold text-text-primary">Billing Summary</h2>
                  </div>
                  <div className="space-y-3">
                    {[
                      { tier: 'Active', key: 'active', color: 'bg-success' },
                      { tier: 'Past Due', key: 'past_due', color: 'bg-error' },
                      { tier: 'Trialing', key: 'trialing', color: 'bg-accent-from' },
                      { tier: 'Canceled', key: 'canceled', color: 'bg-text-tertiary/40' },
                    ].map((t) => {
                      const count = d?.billing_summary?.[t.key] ?? 0
                      const total = d?.active_subscriptions ?? 1
                      const pct = Math.round((count / Math.max(total, 1)) * 100)
                      return (
                        <div key={t.key} className="flex items-center gap-3">
                          <div className="w-20 text-caption text-text-tertiary shrink-0">{t.tier}</div>
                          <div className="flex-1 h-2 rounded-full bg-bg-tertiary overflow-hidden">
                            <div className={cn('h-full rounded-full', t.color)} style={{ width: `${pct}%` }} />
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-body-xs font-code tabular-nums text-text-primary">{count}</span>
                            <span className="text-caption text-text-tertiary/50">{pct}%</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-caption">
                    <span className="text-text-tertiary/60">Total subscriptions</span>
                    <span className="text-text-primary font-code font-medium">{d?.active_subscriptions ?? 0}</span>
                  </div>
                </CardSpotlight>
              </motion.div>

              {/* Recent Audit Events */}
              <motion.div variants={itemVariants}>
                <CardSpotlight className="p-5">
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                      <Bell className="w-4 h-4 text-red-400" weight="fill" />
                    </div>
                    <h2 className="font-display text-body-sm font-bold text-text-primary">Recent Audit Events</h2>
                  </div>
                  {!d?.recent_audit_events?.length ? (
                    <EmptyState icon={<Bell className="w-8 h-8 text-text-tertiary/30" weight="duotone" />} title="No audit events" description="Security events will appear here." />
                  ) : (
                    <div className="space-y-2">
                      {d.recent_audit_events.map((event: any, i: number) => {
                        const type = (event.action ?? '').toLowerCase().includes('deploy') ? 'deploy' : 'auth'
                        const style = AUDIT_STYLES[type] ?? { icon: ShieldCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10' }
                        return (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-bg-tertiary/10 transition-colors"
                          >
                            <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', style.bg)}>
                              <style.icon className={cn('w-3.5 h-3.5', style.color)} weight="fill" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-body-xs text-text-primary font-medium capitalize">{type}</p>
                              <p className="text-caption text-text-tertiary/70">
                                {event.actor} <span className="text-text-tertiary/40">{event.action}</span>
                              </p>
                              <p className="text-[11px] text-text-tertiary/40">{event.time}</p>
                            </div>
                          </motion.div>
                        )
                      })}
                    </div>
                  )}
                </CardSpotlight>
              </motion.div>
            </div>
          </>
        )}
      </motion.div>
    </PageTransition>
  )
}
