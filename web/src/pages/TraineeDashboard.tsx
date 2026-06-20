import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../lib/utils'
import { fetchTraineeDashboard, type TraineeDashboardResponse } from '../lib/api'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import StatusBadge from '../components/ui/status-badge'
import PageTransition from '../components/ui/page-transition'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
}

export default function TraineeDashboard() {
  const [data, setData] = useState<TraineeDashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchTraineeDashboard()
      .then(setData)
      .catch((err) => setError(err.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="animate-in w-full min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <svg className="w-8 h-8 animate-spin text-[#FF8C00]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="animate-in w-full min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-red-400 font-mono text-sm mb-2">{error || 'Failed to load dashboard'}</p>
        </div>
      </div>
    )
  }

  const { progress, modules, recent_tasks } = data
  const modulesBySource = {
    task: modules.filter((m) => m.source === 'task_completion').length,
    manual: modules.filter((m) => m.source === 'manual').length,
  }

  return (
    <PageTransition>
      <div className="w-full min-h-[calc(100vh-4rem)] p-4 sm:p-6 font-mono text-[#FDFBF8] max-w-full overflow-x-hidden">
        <div className="mb-8">
          <GradientHeading as="h1" className="text-3xl md:text-4xl mb-1">My Progress</GradientHeading>
          <p className="text-[#FDFBF8]/40 text-sm">{data.user_name} · {data.user_id.slice(0, 8)}</p>
        </div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8"
        >
          {[
            { label: 'Completed', value: progress.completed, color: 'text-green-400' },
            { label: 'In Progress', value: progress.in_progress, color: 'text-[#FF8C00]' },
            { label: 'Pending Review', value: progress.pending_review, color: 'text-yellow-400' },
            { label: 'Completion', value: `${progress.completion_rate}%`, color: 'text-[#4DA8DA]' },
          ].map((m) => (
            <motion.div key={m.label} variants={itemVariants}>
              <CardSpotlight className="p-4">
                <div className={cn('font-display text-2xl font-bold', m.color)}>{m.value}</div>
                <div className="text-[10px] text-[#FDFBF8]/40 uppercase tracking-wider mt-1">{m.label}</div>
              </CardSpotlight>
            </motion.div>
          ))}
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">
          <CardSpotlight className="p-5 lg:col-span-2">
            <GradientHeading as="h2" className="text-sm font-bold mb-4 flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Modules Unlocked ({modules.length})
            </GradientHeading>
            {modules.length === 0 ? (
              <div className="text-center py-8 text-[#FDFBF8]/20 text-sm italic">
                Complete tasks to unlock modules
              </div>
            ) : (
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="space-y-2"
              >
                {modules.map((m, i) => (
                  <motion.div key={i} variants={itemVariants} className="flex items-center justify-between bg-[#0D0906] rounded-lg px-3 py-2.5 text-sm border border-green-500/10">
                    <div className="flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      <span className="text-[#FDFBF8] font-mono">{m.module}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded',
                        m.source === 'task_completion' ? 'bg-green-500/10 text-green-400' : 'bg-[#FF8C00]/10 text-[#FF8C00]'
                      )}>
                        {m.source === 'task_completion' ? 'Task' : 'Granted'}
                      </span>
                      <span className="text-[10px] text-[#FDFBF8]/30">
                        {new Date(m.granted_at).toLocaleDateString()}
                      </span>
                    </div>
                  </motion.div>
                ))}
                <div className="flex gap-2 pt-2 text-[11px] text-[#FDFBF8]/30">
                  <span>{modulesBySource.task} from tasks completed</span>
                  <span>·</span>
                  <span>{modulesBySource.manual} granted by lead</span>
                </div>
              </motion.div>
            )}
          </CardSpotlight>

          <CardSpotlight className="p-5 lg:col-span-3">
            <GradientHeading as="h2" className="text-sm font-bold mb-4">Recent Tasks</GradientHeading>
            {recent_tasks.length === 0 ? (
              <div className="text-center py-8 text-[#FDFBF8]/20 text-sm italic">No tasks assigned yet</div>
            ) : (
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="divide-y divide-[#FDFBF8]/5"
              >
                {recent_tasks.map((t) => (
                  <motion.div key={t.task_id} variants={itemVariants} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className={cn(
                        'w-2 h-2 rounded-full shrink-0',
                        t.state === 'completed' ? 'bg-green-500' :
                        t.state === 'in_progress' ? 'bg-[#FF8C00]' :
                        t.state === 'submitted' || t.state === 'under_review' ? 'bg-yellow-400' :
                        t.state === 'needs_changes' ? 'bg-red-400' :
                        'bg-[#FDFBF8]/20'
                      )} />
                      <div className="min-w-0 flex-1">
                        <span className="text-sm text-[#FDFBF8] truncate block">{t.title}</span>
                        {t.module && (
                          <span className="text-[10px] text-[#FDFBF8]/30">{t.module}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <StatusBadge state={t.state} />
                      <span className="text-[10px] text-[#FDFBF8]/30">
                        {new Date(t.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </CardSpotlight>
        </div>

        <CardSpotlight className="p-5">
          <GradientHeading as="h2" className="text-sm font-bold mb-3">Progress Breakdown</GradientHeading>
          <div className="flex items-center gap-6 text-sm">
            <div className="flex-1">
              <div className="flex justify-between text-xs text-[#FDFBF8]/40 mb-1">
                <span>Total: {progress.total} tasks</span>
                <span>{progress.completion_rate}% complete</span>
              </div>
              <div className="h-2.5 rounded-full bg-[#0D0906] overflow-hidden flex">
                {progress.completed > 0 && (
                  <div
                    className="h-full bg-green-500 transition-all"
                    style={{ width: `${(progress.completed / Math.max(progress.total, 1)) * 100}%` }}
                  />
                )}
                {progress.in_progress > 0 && (
                  <div
                    className="h-full bg-[#FF8C00] transition-all"
                    style={{ width: `${(progress.in_progress / Math.max(progress.total, 1)) * 100}%` }}
                  />
                )}
                {progress.pending_review > 0 && (
                  <div
                    className="h-full bg-yellow-400 transition-all"
                    style={{ width: `${(progress.pending_review / Math.max(progress.total, 1)) * 100}%` }}
                  />
                )}
              </div>
              <div className="flex gap-4 mt-2 text-[10px] text-[#FDFBF8]/30">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Completed</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#FF8C00] inline-block" /> In Progress</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> Pending Review</span>
              </div>
            </div>
          </div>
        </CardSpotlight>
      </div>
    </PageTransition>
  )
}
