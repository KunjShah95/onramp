import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { NavLink } from 'react-router-dom'
import {
  GraduationCap, Compass, BookOpenText, BugBeetle,
  CheckCircle, Circle, ArrowRight, Clock, Code,
} from '@phosphor-icons/react'
import PageTransition from '../components/ui/page-transition'
import CardSpotlight from '../components/ui/card-spotlight'
import { EmptyState } from '../components/ui/empty-state'
import { useAuth } from '../context/AuthContext'
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

interface ChecklistItem {
  label: string
  done: boolean
}

export default function OnboardingHubPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [seedData, setSeedData] = useState<any>(null)
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])

  useEffect(() => {
    let cancelled = false
    fetchSeedRoleData()
      .then((res) => {
        if (cancelled) return
        const d = res.data
        setSeedData(d)
        if (d?.checklist) {
          setChecklist(d.checklist.map((c: any) => ({ label: c.label, done: c.done })))
        }
        setLoading(false)
      })
      .catch((err) => {
        if (!cancelled) { setError(err.message); setLoading(false) }
      })
    return () => { cancelled = true }
  }, [])

  const completedCount = checklist.filter((c) => c.done).length
  const totalCount = checklist.length

  const quickActions = [
    { to: '/explore', label: 'Explore Repo', icon: Compass, desc: 'Browse the codebase architecture' },
    { to: '/learn', label: 'Start Learning', icon: BookOpenText, desc: 'Follow guided learning paths' },
    { to: '/first-issue', label: 'Find Issues', icon: BugBeetle, desc: 'Pick your first contribution' },
    { to: '/ask', label: 'Ask Questions', icon: Code, desc: 'Get answers about the codebase' },
  ]

  return (
    <PageTransition>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-6xl mx-auto space-y-8"
      >
        {/* Header with welcome */}
        <motion.div variants={itemVariants} className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-indigo-400" weight="duotone" />
          </div>
          <div>
            <h1 className="text-display-sm font-display font-medium text-text-primary">Your Onboarding Hub</h1>
            <p className="text-body-sm text-text-tertiary">
              Welcome{user?.displayName ? `, ${user.displayName}` : ''}. Let's get you up to speed.
            </p>
          </div>
        </motion.div>

        {error && (
          <div className="px-4 py-3 rounded-lg bg-error-muted border border-error/20 text-error text-body-sm">{error}</div>
        )}

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 h-72 rounded-xl bg-bg-secondary border border-border animate-pulse" />
              <div className="h-72 rounded-xl bg-bg-secondary border border-border animate-pulse" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-28 rounded-xl bg-bg-secondary border border-border animate-pulse" />
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Getting Started + Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Checklist */}
              <motion.div variants={itemVariants} className="lg:col-span-2">
                <CardSpotlight className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-success-muted border border-success/20 flex items-center justify-center">
                        <CheckCircle className="w-4 h-4 text-success" weight="fill" />
                      </div>
                      <h2 className="font-display text-body-sm font-bold text-text-primary">Getting Started</h2>
                    </div>
                    <span className="text-caption text-text-tertiary/60 font-code">{completedCount}/{totalCount} done</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-bg-tertiary overflow-hidden mb-5">
                    <div
                      className="h-full rounded-full bg-success transition-all duration-700"
                      style={{ width: `${(completedCount / totalCount) * 100}%` }}
                    />
                  </div>
                  <div className="space-y-1">
                    {checklist.map((item, i) => (
                      <motion.div
                        key={item.label}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        onClick={() => {
                          if (!item.done) {
                            setChecklist((prev) =>
                              prev.map((c) => (c.label === item.label ? { ...c, done: true } : c))
                            )
                          }
                        }}
                        className={cn(
                          'flex items-center gap-3 p-2.5 rounded-lg transition-all cursor-pointer',
                          item.done ? 'opacity-60' : 'hover:bg-bg-tertiary/30'
                        )}
                      >
                        {item.done ? (
                          <CheckCircle className="w-5 h-5 text-success shrink-0" weight="fill" />
                        ) : (
                          <Circle className="w-5 h-5 text-text-tertiary/40 shrink-0" />
                        )}
                        <span className={cn('text-body-sm', item.done ? 'text-text-tertiary line-through' : 'text-text-primary')}>
                          {item.label}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </CardSpotlight>
              </motion.div>

              {/* Quick Actions */}
              <motion.div variants={itemVariants}>
                <CardSpotlight className="p-5 h-full">
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-accent-muted border border-accent/20 flex items-center justify-center">
                      <Compass className="w-4 h-4 text-accent-from" weight="fill" />
                    </div>
                    <h2 className="font-display text-body-sm font-bold text-text-primary">Quick Actions</h2>
                  </div>
                  <div className="space-y-3">
                    {quickActions.map((action) => (
                      <NavLink key={action.to} to={action.to}>
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-bg-tertiary/20 border border-border hover:border-accent/30 hover:bg-bg-tertiary/40 transition-all group cursor-pointer">
                          <div className="w-8 h-8 rounded-lg bg-accent-muted border border-accent/15 flex items-center justify-center shrink-0 group-hover:bg-accent-muted/70 transition-colors">
                            <action.icon className="w-4 h-4 text-accent-from" weight="fill" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-body-xs font-medium text-text-primary">{action.label}</p>
                            <p className="text-caption text-text-tertiary/60">{action.desc}</p>
                          </div>
                          <ArrowRight className="w-3.5 h-3.5 text-text-tertiary/30 group-hover:text-accent-from transition-colors mt-1" weight="bold" />
                        </div>
                      </NavLink>
                    ))}
                  </div>
                </CardSpotlight>
              </motion.div>
            </div>

            {/* Learning Progress + Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Learning Progress */}
              <motion.div variants={itemVariants}>
                <CardSpotlight className="p-5">
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-info-muted border border-info/20 flex items-center justify-center">
                      <BookOpenText className="w-4 h-4 text-info" weight="fill" />
                    </div>
                    <h2 className="font-display text-body-sm font-bold text-text-primary">Learning Progress</h2>
                  </div>
                  {!seedData?.learning_modules?.length ? (
                    <EmptyState icon={<BookOpenText className="w-8 h-8 text-text-tertiary/30" weight="duotone" />} title="No modules" description="Learning modules will appear once assigned." />
                  ) : (
                    <div className="space-y-4">
                      {seedData.learning_modules.map((mod: any) => (
                        <div key={mod.name}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-body-xs text-text-primary font-medium">{mod.name}</span>
                            <span className="text-caption font-code tabular-nums text-text-tertiary/60">{mod.progress}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all duration-700',
                                mod.progress >= 100 ? 'bg-success' : mod.progress > 0 ? 'bg-accent-from' : 'bg-bg-tertiary'
                              )}
                              style={{ width: `${mod.progress}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-caption text-text-tertiary/50">
                    <span>Tasks completed</span>
                    <span className="font-code text-text-primary font-medium">
                      {seedData?.completed_tasks ?? 0}/{seedData?.total_tasks ?? 0}
                    </span>
                  </div>
                </CardSpotlight>
              </motion.div>

              {/* Recent Activity */}
              <motion.div variants={itemVariants}>
                <CardSpotlight className="p-5">
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                      <Clock className="w-4 h-4 text-amber-400" weight="fill" />
                    </div>
                    <h2 className="font-display text-body-sm font-bold text-text-primary">Recent Activity</h2>
                  </div>
                  {!seedData?.recent_activity?.length ? (
                    <EmptyState icon={<Clock className="w-8 h-8 text-text-tertiary/30" weight="duotone" />} title="No activity yet" description="Your onboarding activity will show here." />
                  ) : (
                    <div className="relative">
                      <div className="absolute left-3.5 top-0 bottom-0 w-px bg-border" />
                      <div className="space-y-0">
                        {seedData.recent_activity.map((event: any, i: number) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.06 }}
                            className="relative flex gap-4 pl-10 py-3"
                          >
                            <div className="absolute left-2.5 w-[7px] h-[7px] rounded-full bg-accent-from border-2 border-bg-secondary mt-1.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-body-xs text-text-primary">{event.title}</p>
                              <p className="text-caption text-text-tertiary/50 mt-0.5">{event.time}</p>
                            </div>
                          </motion.div>
                        ))}
                      </div>
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
