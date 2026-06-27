import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { cn } from '../lib/utils'
import { listTasks, getTeamMembers, listTeams, type WorkflowTask } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import StatusBadge from '../components/ui/status-badge'
import PageTransition from '../components/ui/page-transition'
import {
  ResponsiveContainer, Tooltip,
  PieChart, Pie, Cell,
} from 'recharts'

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
}

export default function ModuleHealthPage() {
  const { moduleName } = useParams()
  const navigate = useNavigate()
  const { activeTeamId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState<WorkflowTask[]>([])
  const [members, setMembers] = useState<{ user_id: string; name: string; role: string }[]>([])

  useEffect(() => {
    if (!moduleName) return
    const load = async () => {
      let teamId = activeTeamId
      if (!teamId) {
        try {
          const teamsData = await listTeams('current-user')
          if (teamsData.teams?.length > 0) teamId = teamsData.teams[0].team_id
        } catch {}
      }

      await Promise.all([
        listTasks({ team_id: teamId || undefined }).then((r: any) => {
          setTasks((r.tasks || []).filter((t: WorkflowTask) => t.module === moduleName))
        }).catch(() => {}),
        teamId ? getTeamMembers(teamId).then(setMembers).catch(() => {}) : Promise.resolve(),
      ])
      setLoading(false)
    }
    load()
  }, [moduleName, activeTeamId])

  const stats = useMemo(() => {
    const total = tasks.length
    const completed = tasks.filter(t => t.state === 'completed').length
    const inProgress = tasks.filter(t => t.state === 'in_progress').length
    const pending = tasks.filter(t => ['submitted', 'under_review', 'product_review', 'approved'].includes(t.state)).length
    const blocked = tasks.filter(t => ['needs_changes'].includes(t.state)).length
    const health = total > 0 ? Math.round((completed / total) * 100) : 0
    const assigneeCounts: Record<string, number> = {}
    for (const t of tasks) {
      if (t.assigned_to) assigneeCounts[t.assigned_to] = (assigneeCounts[t.assigned_to] || 0) + 1
    }
    const topAssignees = Object.entries(assigneeCounts)
      .map(([id, count]) => ({ id, name: members.find(m => m.user_id === id)?.name || id.slice(0, 10), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return { total, completed, inProgress, pending, blocked, health, topAssignees }
  }, [tasks, members])

  const distributionData = useMemo(() => [
    { name: 'Completed', value: stats.completed, color: '#22c55e' },
    { name: 'In Progress', value: stats.inProgress, color: '#FF8C00' },
    { name: 'Pending', value: stats.pending, color: '#eab308' },
    { name: 'Blocked', value: stats.blocked, color: '#ef4444' },
  ].filter(d => d.value > 0), [stats])

  return (
    <PageTransition>
      <div className="w-full min-h-[calc(100vh-4rem)] p-4 sm:p-6 font-body text-[#FDFBF8] max-w-full overflow-x-hidden">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-[11px] text-[#FDFBF8]/40 hover:text-[#FDFBF8] mb-4 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back
        </button>

        {loading ? (
          <div className="space-y-4">
            <div className="h-8 w-48 bg-[#0D0906] rounded animate-pulse" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[1,2,3,4].map(i => <div key={i} className="h-24 bg-[#0D0906] border border-[#FDFBF8]/5 rounded-xl animate-pulse" />)}
            </div>
          </div>
        ) : (
          <>
            <motion.div variants={itemVariants} initial="hidden" animate="visible" className="mb-6">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold',
                  stats.health >= 70 ? 'bg-green-500/10 text-green-400' :
                  stats.health >= 50 ? 'bg-[#FF8C00]/10 text-[#FF8C00]' :
                  'bg-red-500/10 text-red-400'
                )}>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div>
                  <GradientHeading as="h1">{moduleName}</GradientHeading>
                  <p className="text-[#FDFBF8]/40 text-sm mt-1">Module health dashboard · {stats.total} tasks</p>
                </div>
              </div>
            </motion.div>

            <motion.div variants={itemVariants} initial="hidden" animate="visible"
              className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              {[
                { label: 'Health Score', value: `${stats.health}%`, color: stats.health >= 70 ? 'text-green-400' : stats.health >= 50 ? 'text-[#FF8C00]' : 'text-red-400' },
                { label: 'Total Tasks', value: stats.total, color: 'text-[#FDFBF8]' },
                { label: 'Completed', value: stats.completed, color: 'text-green-400' },
                { label: 'In Progress', value: stats.inProgress, color: 'text-[#FF8C00]' },
                { label: 'Pending Review', value: stats.pending, color: 'text-yellow-400' },
              ].map(s => (
                <CardSpotlight key={s.label} className="p-4" color="rgba(255,140,0,0.03)">
                  <div className={cn('font-display text-2xl font-bold tracking-tight', s.color)}>{s.value}</div>
                  <div className="text-[10px] text-[#FDFBF8]/35 uppercase tracking-wider mt-1">{s.label}</div>
                </CardSpotlight>
              ))}
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
              {/* Distribution */}
              <CardSpotlight className="p-5 lg:col-span-2" color="rgba(255,140,0,0.03)">
                <h2 className="font-display text-sm font-bold text-[#FDFBF8] mb-4">Task Distribution</h2>
                {distributionData.length === 0 ? (
                  <div className="text-center py-6 text-[#FDFBF8]/20 text-sm italic">No data</div>
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="w-28 h-28 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={distributionData} cx="50%" cy="50%" innerRadius={28} outerRadius={46} paddingAngle={3} dataKey="value" stroke="none">
                            {distributionData.map(d => <Cell key={d.name} fill={d.color} />)}
                          </Pie>
                          <Tooltip contentStyle={{ background: '#1A110D', border: '1px solid rgba(253,251,248,0.1)', borderRadius: '8px', fontSize: '12px', color: '#FDFBF8' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-1.5">
                      {distributionData.map(d => (
                        <div key={d.name} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                            <span className="text-[#FDFBF8]/60">{d.name}</span>
                          </div>
                          <span className="text-[#FDFBF8] font-mono tabular-nums">{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardSpotlight>

              {/* Top assignees */}
              <CardSpotlight className="p-5 lg:col-span-3" color="rgba(255,140,0,0.03)">
                <h2 className="font-display text-sm font-bold text-[#FDFBF8] mb-4">Top Contributors</h2>
                {stats.topAssignees.length === 0 ? (
                  <div className="text-center py-6 text-[#FDFBF8]/20 text-sm italic">No assignees</div>
                ) : (
                  <div className="space-y-2">
                    {stats.topAssignees.map((a) => (
                      <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-[#FDFBF8]/[0.02] transition-colors">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#FF8C00]/15 to-[#FFB347]/10 border border-[#FF8C00]/20 flex items-center justify-center text-[11px] font-bold text-[#FF8C00]">
                          {a.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm text-[#FDFBF8] font-medium">{a.name}</div>
                          <div className="text-[10px] text-[#FDFBF8]/30">{a.count} tasks</div>
                        </div>
                        <div className="w-16 h-1.5 rounded-full bg-[#0D0906] overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${(a.count / Math.max(stats.topAssignees[0]?.count, 1)) * 100}%` }}
                            className="h-full rounded-full bg-[#FF8C00]"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardSpotlight>
            </div>

            {/* Tasks list */}
            <CardSpotlight className="p-0 overflow-hidden" color="rgba(255,140,0,0.03)">
              <div className="px-5 py-4 border-b border-[#FDFBF8]/5">
                <h2 className="font-display text-sm font-bold text-[#FDFBF8]">
                  All Tasks <span className="ml-2 text-[10px] text-[#FDFBF8]/25 font-mono">{tasks.length}</span>
                </h2>
              </div>
              {tasks.length === 0 ? (
                <div className="px-5 py-8 text-center text-[#FDFBF8]/20 text-sm italic">No tasks for this module</div>
              ) : (
                <div className="divide-y divide-[#FDFBF8]/5">
                  {tasks.slice(0, 20).map((t, i) => (
                    <motion.div
                      key={t.task_id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#FDFBF8]/[0.015] transition-colors"
                    >
                      <div className={cn(
                        'w-2 h-2 rounded-full shrink-0',
                        t.state === 'completed' ? 'bg-green-500' :
                        t.state === 'in_progress' ? 'bg-[#FF8C00]' :
                        ['submitted', 'under_review', 'product_review', 'approved'].includes(t.state) ? 'bg-yellow-400' :
                        'bg-[#FDFBF8]/20'
                      )} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-[#FDFBF8] truncate font-medium">{t.title}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <StatusBadge state={t.state} />
                          {t.assigned_to && <span className="text-[10px] text-[#FDFBF8]/30">by {t.assigned_to.slice(0, 10)}</span>}
                        </div>
                      </div>
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize',
                        t.priority === 'high' ? 'border-red-500/30 text-red-400' :
                        t.priority === 'medium' ? 'border-[#FF8C00]/30 text-[#FF8C00]' :
                        'border-green-500/30 text-green-400'
                      )}>{t.priority}</span>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardSpotlight>
          </>
        )}
      </div>
    </PageTransition>
  )
}
