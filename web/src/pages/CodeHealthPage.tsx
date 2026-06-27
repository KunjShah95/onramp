import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../lib/utils'
import { listTasks, listTeams, fetchRepos, type WorkflowTask } from '../lib/api'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import PageTransition from '../components/ui/page-transition'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
} from 'recharts'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
}

export default function CodeHealthPage() {
  const [loading, setLoading] = useState(true)
  const [repos, setRepos] = useState<any[]>([])
  const [selectedRepo, setSelectedRepo] = useState('')
  const [tasks, setTasks] = useState<WorkflowTask[]>([])
  const [activeTab, setActiveTab] = useState<'overview' | 'modules' | 'tasks'>('overview')

  useEffect(() => {
    Promise.all([
      fetchRepos().then(d => { setRepos(d.repos || []); if (d.repos?.length > 0) setSelectedRepo(`${d.repos[0].owner}/${d.repos[0].name}`) }).catch(() => {}),
      listTeams('current-user').then(d => {
        if (d.teams?.length > 0) {
          return listTasks({ team_id: d.teams[0].team_id }).then((r: any) => setTasks(r.tasks || [])).catch(() => {})
        }
      }).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  const moduleHealth = useMemo(() => {
    const moduleMap: Record<string, { total: number; completed: number; inProgress: number; pending: number; blocked: number }> = {}
    for (const task of tasks) {
      const mod = task.module || 'uncategorized'
      if (!moduleMap[mod]) moduleMap[mod] = { total: 0, completed: 0, inProgress: 0, pending: 0, blocked: 0 }
      moduleMap[mod].total++
      if (task.state === 'completed') moduleMap[mod].completed++
      else if (task.state === 'in_progress') moduleMap[mod].inProgress++
      else if (['submitted', 'under_review', 'product_review', 'approved'].includes(task.state)) moduleMap[mod].pending++
      else moduleMap[mod].blocked++
    }
    return Object.entries(moduleMap).map(([name, data]) => ({
      name,
      ...data,
      health: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
    })).sort((a, b) => a.health - b.health)
  }, [tasks])

  const overallHealth = useMemo(() => {
    if (moduleHealth.length === 0) return 0
    return Math.round(moduleHealth.reduce((sum, m) => sum + m.health, 0) / moduleHealth.length)
  }, [moduleHealth])

  const taskDistribution = useMemo(() => {
    const states: Record<string, number> = {}
    for (const t of tasks) { states[t.state] = (states[t.state] || 0) + 1 }
    return Object.entries(states).map(([name, value]) => ({ name, value }))
  }, [tasks])

  const mockTrendData = useMemo(() => {
    return [
      { month: 'Feb', coverage: 72, techDebt: 45, velocity: 12 },
      { month: 'Mar', coverage: 75, techDebt: 42, velocity: 15 },
      { month: 'Apr', coverage: 78, techDebt: 38, velocity: 18 },
      { month: 'May', coverage: 81, techDebt: 35, velocity: 22 },
      { month: 'Jun', coverage: 84, techDebt: 31, velocity: 28 },
    ]
  }, [])

  return (
    <PageTransition>
      <div className="w-full min-h-[calc(100vh-4rem)] p-4 sm:p-6 font-body text-[#FDFBF8] max-w-full overflow-x-hidden">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <GradientHeading as="h1">Code Health</GradientHeading>
            <p className="text-[#FDFBF8]/40 text-sm mt-1">Codebase health metrics, coverage trends, and module-level analysis</p>
          </div>
          <div className="flex gap-2">
            <select value={selectedRepo} onChange={(e) => setSelectedRepo(e.target.value)}
              className="bg-[#120D0A] border border-[#FDFBF8]/8 text-[#FDFBF8]/70 text-sm rounded-lg px-3 py-2 outline-none focus:border-[#FF8C00]/40">
              {repos.map(r => <option key={`${r.owner}/${r.name}`} value={`${r.owner}/${r.name}`}>{r.name}</option>)}
            </select>
            <div className="flex bg-[#120D0A] border border-[#FDFBF8]/8 rounded-lg overflow-hidden p-0.5 gap-0.5">
              {(['overview', 'modules', 'tasks'] as const).map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={cn('px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize',
                    activeTab === tab ? 'bg-[#2A1D16] text-[#FF8C00] shadow-sm' : 'text-[#FDFBF8]/35 hover:text-[#FDFBF8]/60'
                  )}>{tab}</button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[1,2,3,4].map(i => <div key={i} className="h-28 bg-[#0D0906] border border-[#FDFBF8]/5 rounded-xl animate-pulse" />)}
            </div>
            <div className="h-64 bg-[#0D0906] border border-[#FDFBF8]/5 rounded-xl animate-pulse" />
          </div>
        ) : (
          <>
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <>
                {/* Stats cards */}
                <motion.div variants={containerVariants} initial="hidden" animate="visible"
                  className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  {[
                    { label: 'Code Health Score', value: `${overallHealth}%`, color: overallHealth >= 70 ? 'text-green-400' : overallHealth >= 50 ? 'text-[#FF8C00]' : 'text-red-400', sub: 'Module average', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
                    { label: 'Test Coverage', value: '84%', color: 'text-green-400', sub: '+3% from last month', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
                    { label: 'Tech Debt', value: '31', color: 'text-[#FF8C00]', sub: 'Issues identified', icon: 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z' },
                    { label: 'Team Velocity', value: '28', color: 'text-[#4DA8DA]', sub: 'Tasks completed this month', icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z' },
                  ].map(s => (
                    <motion.div key={s.label} variants={itemVariants}>
                      <CardSpotlight className="p-4" color="rgba(255,140,0,0.03)">
                        <div className="flex items-start justify-between mb-2">
                          <svg className="w-4 h-4 text-[#FDFBF8]/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
                          </svg>
                        </div>
                        <div className={cn('font-display text-2xl font-bold tracking-tight', s.color)}>{s.value}</div>
                        <div className="text-[10px] text-[#FDFBF8]/35 uppercase tracking-wider mt-1">{s.label}</div>
                        <div className="text-[10px] text-[#FDFBF8]/20 mt-0.5">{s.sub}</div>
                      </CardSpotlight>
                    </motion.div>
                  ))}
                </motion.div>

                {/* Trends chart */}
                <motion.div variants={itemVariants} initial="hidden" animate="visible">
                  <CardSpotlight className="p-5 mb-6" color="rgba(255,140,0,0.03)">
                    <div className="flex items-center gap-2.5 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-[#4DA8DA]/10 border border-[#4DA8DA]/20 flex items-center justify-center">
                        <svg className="w-4 h-4 text-[#4DA8DA]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                        </svg>
                      </div>
                      <h2 className="font-display text-sm font-bold text-[#FDFBF8]">6-Month Trends</h2>
                    </div>
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={mockTrendData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorCoverage" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorDebt" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#eab308" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorVelocity" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#4DA8DA" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#4DA8DA" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(253,251,248,0.06)" />
                          <XAxis dataKey="month" tick={{ fill: 'rgba(253,251,248,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: 'rgba(253,251,248,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ background: '#1A110D', border: '1px solid rgba(253,251,248,0.1)', borderRadius: '8px', fontSize: '12px', color: '#FDFBF8' }} />
                          <Area type="monotone" dataKey="coverage" stroke="#22c55e" fill="url(#colorCoverage)" strokeWidth={2} dot={false} name="Coverage %" />
                          <Area type="monotone" dataKey="techDebt" stroke="#eab308" fill="url(#colorDebt)" strokeWidth={2} dot={false} name="Tech Debt" />
                          <Area type="monotone" dataKey="velocity" stroke="#4DA8DA" fill="url(#colorVelocity)" strokeWidth={2} dot={false} name="Velocity" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex gap-4 mt-3 text-[10px] text-[#FDFBF8]/30">
                      <span className="flex items-center gap-1"><span className="w-2 h-0.5 rounded bg-green-500 inline-block" /> Coverage</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-0.5 rounded bg-yellow-400 inline-block" /> Tech Debt</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-0.5 rounded bg-[#4DA8DA] inline-block" /> Velocity</span>
                    </div>
                  </CardSpotlight>
                </motion.div>

                {/* Module health grid */}
                <motion.div variants={itemVariants} initial="hidden" animate="visible">
                  <CardSpotlight className="p-0 overflow-hidden" color="rgba(255,140,0,0.03)">
                    <div className="px-5 py-4 border-b border-[#FDFBF8]/5">
                      <h2 className="font-display text-sm font-bold text-[#FDFBF8]">Module Health Overview</h2>
                    </div>
                    {moduleHealth.length === 0 ? (
                      <div className="px-5 py-8 text-center text-[#FDFBF8]/20 text-sm italic">No module data available</div>
                    ) : (
                      <div className="divide-y divide-[#FDFBF8]/5">
                        {moduleHealth.map((m) => (
                          <div key={m.name} className="px-5 py-4 flex items-center gap-4">
                            <div className={cn(
                              'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold',
                              m.health >= 70 ? 'bg-green-500/10 text-green-400' :
                              m.health >= 50 ? 'bg-[#FF8C00]/10 text-[#FF8C00]' :
                              'bg-red-500/10 text-red-400'
                            )}>{m.health}%</div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-[#FDFBF8] truncate">{m.name}</div>
                              <div className="text-[10px] text-[#FDFBF8]/30 mt-0.5">{m.total} tasks</div>
                            </div>
                            <div className="flex gap-1.5">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">{m.completed}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FF8C00]/10 text-[#FF8C00]">{m.inProgress}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-400/10 text-yellow-400">{m.pending}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardSpotlight>
                </motion.div>
              </>
            )}

            {/* Modules Tab */}
            {activeTab === 'modules' && (
              <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4">
                {moduleHealth.length === 0 ? (
                  <CardSpotlight className="py-8 text-center text-[#FDFBF8]/20 text-sm italic">No modules with tasks yet</CardSpotlight>
                ) : (
                  moduleHealth.map((m) => (
                    <motion.div key={m.name} variants={itemVariants}>
                      <CardSpotlight className="p-5" color="rgba(255,140,0,0.02)">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h3 className="font-display text-sm font-bold text-[#FDFBF8]">{m.name}</h3>
                            <span className="text-[10px] text-[#FDFBF8]/30">{m.total} total tasks</span>
                          </div>
                          <div className={cn(
                            'px-2.5 py-1 rounded-lg text-xs font-bold font-mono',
                            m.health >= 70 ? 'bg-green-500/15 text-green-400' :
                            m.health >= 50 ? 'bg-[#FF8C00]/15 text-[#FF8C00]' :
                            'bg-red-500/15 text-red-400'
                          )}>Health: {m.health}%</div>
                        </div>
                        <div className="h-2 rounded-full bg-[#0D0906] overflow-hidden flex mb-3">
                          {m.completed > 0 && (
                            <div className="h-full bg-green-500 transition-all" style={{ width: `${(m.completed / m.total) * 100}%` }} />
                          )}
                          {m.inProgress > 0 && (
                            <div className="h-full bg-[#FF8C00] transition-all" style={{ width: `${(m.inProgress / m.total) * 100}%` }} />
                          )}
                          {m.pending > 0 && (
                            <div className="h-full bg-yellow-400 transition-all" style={{ width: `${(m.pending / m.total) * 100}%` }} />
                          )}
                        </div>
                        <div className="flex gap-3 text-[10px] text-[#FDFBF8]/30">
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> {m.completed} done</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#FF8C00]" /> {m.inProgress} in progress</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400" /> {m.pending} pending</span>
                        </div>
                      </CardSpotlight>
                    </motion.div>
                  ))
                )}
              </motion.div>
            )}

            {/* Tasks Tab */}
            {activeTab === 'tasks' && (
              <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <motion.div variants={itemVariants}>
                  <CardSpotlight className="p-5" color="rgba(255,140,0,0.03)">
                    <div className="flex items-center gap-2.5 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
                        <svg className="w-4 h-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
                        </svg>
                      </div>
                      <h2 className="font-display text-sm font-bold text-[#FDFBF8]">Task Distribution</h2>
                    </div>
                    {taskDistribution.length === 0 ? (
                      <div className="text-center py-8 text-[#FDFBF8]/20 text-sm italic">No tasks</div>
                    ) : (
                      <div className="flex items-center gap-4">
                        <div className="w-32 h-32 shrink-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={taskDistribution} cx="50%" cy="50%" innerRadius={32} outerRadius={54} paddingAngle={3} dataKey="value" stroke="none">
                                {taskDistribution.map((d, i) => (
                                  <Cell key={d.name} fill={['#22c55e', '#FF8C00', '#eab308', '#ef4444', '#4DA8DA', '#a855f7'][i % 6]} />
                                ))}
                              </Pie>
                              <Tooltip contentStyle={{ background: '#1A110D', border: '1px solid rgba(253,251,248,0.1)', borderRadius: '8px', fontSize: '12px', color: '#FDFBF8' }} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex-1 space-y-1.5">
                          {taskDistribution.map((d, i) => (
                            <div key={d.name} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ['#22c55e', '#FF8C00', '#eab308', '#ef4444', '#4DA8DA', '#a855f7'][i % 6] }} />
                                <span className="text-[#FDFBF8]/60 capitalize">{d.name.replace(/_/g, ' ')}</span>
                              </div>
                              <span className="text-[#FDFBF8] font-mono tabular-nums">{d.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardSpotlight>
                </motion.div>

                <motion.div variants={itemVariants}>
                  <CardSpotlight className="p-5" color="rgba(255,140,0,0.03)">
                    <div className="flex items-center gap-2.5 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-[#4DA8DA]/10 border border-[#4DA8DA]/20 flex items-center justify-center">
                        <svg className="w-4 h-4 text-[#4DA8DA]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                        </svg>
                      </div>
                      <h2 className="font-display text-sm font-bold text-[#FDFBF8]">Module Activity</h2>
                    </div>
                    {moduleHealth.length === 0 ? (
                      <div className="text-center py-8 text-[#FDFBF8]/20 text-sm italic">No data</div>
                    ) : (
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={moduleHealth.slice(0, 8)} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(253,251,248,0.06)" horizontal={false} />
                            <XAxis type="number" tick={{ fill: 'rgba(253,251,248,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                            <YAxis type="category" dataKey="name" tick={{ fill: 'rgba(253,251,248,0.5)', fontSize: 10 }} axisLine={false} tickLine={false} width={90} />
                            <Tooltip contentStyle={{ background: '#1A110D', border: '1px solid rgba(253,251,248,0.1)', borderRadius: '8px', fontSize: '12px', color: '#FDFBF8' }} />
                            <Bar dataKey="total" fill="#FF8C00" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardSpotlight>
                </motion.div>
              </motion.div>
            )}
          </>
        )}
      </div>
    </PageTransition>
  )
}
