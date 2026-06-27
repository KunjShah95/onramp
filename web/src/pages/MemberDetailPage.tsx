import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { cn } from '../lib/utils'
import { listTasks, getTeamMembers, getUserModulePermissions, getUserProgress, listTeams, type WorkflowTask } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import CardSpotlight from '../components/ui/card-spotlight'
import StatusBadge from '../components/ui/status-badge'
import PageTransition from '../components/ui/page-transition'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip,
} from 'recharts'

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
}

export default function MemberDetailPage() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const { activeTeamId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [member, setMember] = useState<{ user_id: string; name: string; role: string } | null>(null)
  const [tasks, setTasks] = useState<WorkflowTask[]>([])
  const [modules, setModules] = useState<string[]>([])

  useEffect(() => {
    if (!userId) return
    const load = async () => {
      // Resolve team_id from auth context or first available team
      let teamId = activeTeamId
      if (!teamId) {
        try {
          const teamsData = await listTeams('current-user')
          if (teamsData.teams?.length > 0) teamId = teamsData.teams[0].team_id
        } catch {}
      }
      if (!teamId) { setLoading(false); return }

      await Promise.all([
        listTasks({ assigned_to: userId }).then((r: any) => setTasks(r.tasks || [])).catch(() => {}),
        getTeamMembers(teamId).then(members => {
          const m = members.find(m => m.user_id === userId)
          if (m) setMember(m)
        }).catch(() => {}),
        getUserModulePermissions(teamId, userId).then(r => setModules(r.modules || [])).catch(() => {}),
        getUserProgress(userId, teamId).catch(() => {}),
      ])
      setLoading(false)
    }
    load()
  }, [userId, activeTeamId])

  const taskStats = useMemo(() => {
    const states: Record<string, number> = {}
    for (const t of tasks) { states[t.state] = (states[t.state] || 0) + 1 }
    return {
      total: tasks.length,
      completed: tasks.filter(t => t.state === 'completed').length,
      inProgress: tasks.filter(t => t.state === 'in_progress').length,
      pendingReview: tasks.filter(t => ['submitted', 'under_review', 'product_review', 'approved'].includes(t.state)).length,
      completionRate: tasks.length > 0 ? Math.round((tasks.filter(t => t.state === 'completed').length / tasks.length) * 100) : 0,
    }
  }, [tasks])

  const byModule = useMemo(() => {
    const map: Record<string, number> = {}
    for (const t of tasks) { const mod = t.module || 'uncategorized'; map[mod] = (map[mod] || 0) + 1 }
    return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
  }, [tasks])

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
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#0D0906] border border-[#FDFBF8]/5 animate-pulse" />
              <div className="space-y-2">
                <div className="h-6 w-32 bg-[#0D0906] rounded animate-pulse" />
                <div className="h-3 w-20 bg-[#0D0906] rounded animate-pulse" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[1,2,3,4].map(i => <div key={i} className="h-24 bg-[#0D0906] border border-[#FDFBF8]/5 rounded-xl animate-pulse" />)}
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            {member && (
              <motion.div variants={itemVariants} initial="hidden" animate="visible" className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF8C00]/15 to-[#FFB347]/10 border border-[#FF8C00]/20 flex items-center justify-center text-lg font-bold text-[#FF8C00]">
                  {member.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h1 className="font-display text-xl font-bold text-[#FDFBF8]">{member.name}</h1>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-[#FDFBF8]/40 font-mono">{member.user_id.slice(0, 12)}</span>
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded font-medium',
                      member.role === 'owner' ? 'bg-yellow-500/10 text-yellow-400' :
                      member.role === 'senior' ? 'bg-[#FF8C00]/10 text-[#FF8C00]' :
                      'bg-[#FDFBF8]/5 text-[#FDFBF8]/40'
                    )}>{member.role}</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Stats */}
            <motion.div variants={itemVariants} initial="hidden" animate="visible"
              className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {[
                { label: 'Total Tasks', value: taskStats.total, color: 'text-[#FDFBF8]' },
                { label: 'Completed', value: taskStats.completed, color: 'text-green-400' },
                { label: 'In Progress', value: taskStats.inProgress, color: 'text-[#FF8C00]' },
                { label: 'Completion Rate', value: `${taskStats.completionRate}%`, color: taskStats.completionRate >= 70 ? 'text-green-400' : 'text-[#FF8C00]' },
              ].map(s => (
                <CardSpotlight key={s.label} className="p-4" color="rgba(255,140,0,0.03)">
                  <div className={cn('font-display text-2xl font-bold tracking-tight', s.color)}>{s.value}</div>
                  <div className="text-[10px] text-[#FDFBF8]/35 uppercase tracking-wider mt-1">{s.label}</div>
                </CardSpotlight>
              ))}
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
              {/* Modules */}
              <CardSpotlight className="p-5 lg:col-span-2" color="rgba(255,140,0,0.03)">
                <h2 className="font-display text-sm font-bold text-[#FDFBF8] mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  Module Access ({modules.length})
                </h2>
                {modules.length === 0 ? (
                  <div className="text-center py-6 text-[#FDFBF8]/20 text-sm italic">No modules unlocked</div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {modules.map(m => (
                      <span key={m} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-green-500/10 text-green-400 text-[11px] font-mono border border-green-500/15">
                        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                          <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        {m}
                      </span>
                    ))}
                  </div>
                )}
              </CardSpotlight>

              {/* Activity by module */}
              <CardSpotlight className="p-5 lg:col-span-3" color="rgba(255,140,0,0.03)">
                <h2 className="font-display text-sm font-bold text-[#FDFBF8] mb-3">Tasks by Module</h2>
                {byModule.length === 0 ? (
                  <div className="text-center py-6 text-[#FDFBF8]/20 text-sm italic">No tasks</div>
                ) : (
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={byModule} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(253,251,248,0.06)" horizontal={false} />
                        <XAxis type="number" tick={{ fill: 'rgba(253,251,248,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fill: 'rgba(253,251,248,0.5)', fontSize: 10 }} axisLine={false} tickLine={false} width={80} />
                        <Tooltip contentStyle={{ background: '#1A110D', border: '1px solid rgba(253,251,248,0.1)', borderRadius: '8px', fontSize: '12px', color: '#FDFBF8' }} />
                        <Bar dataKey="count" fill="#FF8C00" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardSpotlight>
            </div>

            {/* Recent tasks */}
            <CardSpotlight className="p-0 overflow-hidden" color="rgba(255,140,0,0.03)">
              <div className="px-5 py-4 border-b border-[#FDFBF8]/5">
                <h2 className="font-display text-sm font-bold text-[#FDFBF8]">
                  Recent Tasks <span className="ml-2 text-[10px] text-[#FDFBF8]/25 font-mono">{tasks.length}</span>
                </h2>
              </div>
              {tasks.length === 0 ? (
                <div className="px-5 py-8 text-center text-[#FDFBF8]/20 text-sm italic">No tasks found</div>
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
                          {t.module && <span className="text-[10px] text-[#FDFBF8]/30 font-mono">{t.module}</span>}
                        </div>
                      </div>
                      <span className="text-[11px] text-[#FDFBF8]/25 font-mono shrink-0">
                        {new Date(t.updated_at).toLocaleDateString()}
                      </span>
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
