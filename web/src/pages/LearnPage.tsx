import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { analyzeArchitecture, generateLearningPath, createTask } from '../lib/api'
import type { LearningPathResult } from '../lib/types'
import { cn } from '../lib/utils'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import PageTransition from '../components/ui/page-transition'
import { useToast } from '../context/ToastContext'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
}

const fileListVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.03 } },
}
const fileItemVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0 },
}

export default function LearnPage() {
  const navigate = useNavigate()
  const [repoUrl, setRepoUrl] = useState('')
  const [userLevel, setUserLevel] = useState('junior')
  const [loading, setLoading] = useState(false)
  const [creatingTasks, setCreatingTasks] = useState(false)
  const [result, setResult] = useState<LearningPathResult | null>(null)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const toast = useToast()

  async function handleGenerate() {
    if (!repoUrl.trim()) return
    setLoading(true)
    setError('')
    setSuccessMsg('')
    try {
      // First, get the repo structure
      const architecture = await analyzeArchitecture(repoUrl)
      // Then, generate the learning path
      const pathResult = await generateLearningPath(architecture.entities, userLevel)
      setResult(pathResult)
      toast.success('Learning path generated', `${pathResult.path.length} modules · ${pathResult.total_estimated_hours} hours`)
    } catch (err: any) {
      setError(err.message || 'Failed to generate learning path.')
      toast.error('Generation failed', err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleStartLearning() {
    if (!result || !result.path.length) return
    setCreatingTasks(true)
    setError('')
    setSuccessMsg('')
    try {
      // Create one task per learning module
      for (const module of result.path) {
        await createTask({
          team_id: 'default',
          title: module.name,
          description: `${module.description}\n\nObjectives:\n${module.objectives?.map((o: string) => `- ${o}`).join('\n') || ''}`,
          module: module.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
          priority: 'medium',
          estimated_hours: module.time_hours,
        })
      }
      toast.success('Tasks created', `${result.path.length} onboarding tasks created! Redirecting...`)
      setSuccessMsg(`Created ${result.path.length} onboarding tasks! Redirecting to tasks page...`)
      setTimeout(() => navigate('/tasks'), 1500)
    } catch (err: any) {
      setError(err.message || 'Failed to create tasks.')
      toast.error('Failed to create tasks', err.message)
    } finally {
      setCreatingTasks(false)
    }
  }

  return (
    <PageTransition>
      <div className="w-full h-full min-h-[calc(100vh-4rem)] p-4 sm:p-8 font-mono text-[#FDFBF8] relative max-w-full overflow-x-hidden">
        
        {/* Background Grid Pattern (Subtle) */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA0MCAwIEwgMCAwIDAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI0ZGRkZGRiIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')]"></div>

        {/* Header Section */}
        <div className="max-w-4xl mb-12 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#FF8C00]/30 bg-[#FF8C00]/5 text-[#FF8C00] text-xs font-bold mb-6">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            DEVELOPER ONBOARDING
          </div>
          
          <GradientHeading as="h1" className="mb-4">Learning Paths</GradientHeading>
          <p className="text-[#FDFBF8]/70 text-lg leading-relaxed max-w-2xl font-body mb-8">
            Your personalized trajectory to mastering the codebase. Enter a repository URL to generate a custom curriculum.
          </p>

          <div className="flex flex-col md:flex-row gap-4 max-w-3xl">
            <input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              placeholder="Enter GitHub repository URL..."
              className="flex-1 bg-[#1A110D] border border-[#FDFBF8]/10 text-[#FDFBF8] text-[15px] rounded-lg px-4 py-3 focus:outline-none focus:border-[#FF8C00]/50 transition-colors placeholder:text-[#FDFBF8]/30"
            />
            <select 
              value={userLevel}
              onChange={(e) => setUserLevel(e.target.value)}
              className="bg-[#1A110D] border border-[#FDFBF8]/10 text-[#FDFBF8] text-[15px] rounded-lg px-4 py-3 focus:outline-none focus:border-[#FF8C00]/50 transition-colors"
            >
              <option value="junior">Junior</option>
              <option value="mid">Mid-Level</option>
              <option value="senior">Senior</option>
            </select>
            <button
              onClick={handleGenerate}
              disabled={loading}
              className={cn(
                "px-6 py-3 rounded-lg font-bold text-[15px] transition-all",
                loading 
                  ? "bg-[#FF8C00]/50 text-[#3D1C00] cursor-not-allowed" 
                  : "bg-[#FFB347] hover:bg-[#FF8C00] text-[#3D1C00]"
              )}
            >
              {loading ? 'Generating...' : 'Generate Path'}
            </button>
          </div>

          {error && (
            <div className="mt-6 p-4 rounded-lg bg-red-900/20 border border-red-500/50 text-red-400 font-mono text-sm">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="mt-6 p-4 rounded-lg bg-green-900/20 border border-green-500/50 text-green-400 font-mono text-sm animate-pulse">
              ✓ {successMsg}
            </div>
          )}
        </div>

        <div className="flex flex-col lg:flex-row gap-12 relative z-10">
          
          {/* Left Side: Timeline & Modules */}
          <div className="flex-1 relative">
            
            {/* Timeline Line */}
            <div className="absolute left-2.5 top-8 bottom-0 w-px bg-[#FDFBF8]/10"></div>

            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-12">
              {!result && !loading && (
                <motion.div variants={itemVariants} className="text-[#FDFBF8]/40 font-mono text-sm italic">
                  No learning path generated yet. Enter a repository URL to begin.
                </motion.div>
              )}
              
              {loading && (
                <motion.div variants={itemVariants} className="flex flex-col items-center justify-center py-12">
                  <svg className="w-8 h-8 animate-spin text-[#FF8C00] mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <p className="text-[#FDFBF8]/60 text-sm font-mono animate-pulse">Analyzing codebase & generating curriculum...</p>
                </motion.div>
              )}

              {result && result.path.map((module, idx) => (
                <motion.div variants={itemVariants} key={idx} className={cn("relative pl-12", idx > 0 ? "opacity-70 hover:opacity-100 transition-opacity" : "")}>
                  {/* Timeline Dot */}
                  <div className={cn(
                    "absolute left-0 top-6 w-5 h-5 rounded-full border-4 border-[#0A0705] z-10",
                    idx === 0 
                      ? "bg-[#FF8C00] shadow-[0_0_0_1px_rgba(255,140,0,0.3)]" 
                      : "bg-[#3D332D] left-1 w-3 h-3 border-none"
                  )}></div>
                  
                  <CardSpotlight>
                    <div className={cn("border border-[#FDFBF8]/5 rounded-2xl p-8", idx === 0 ? "bg-[#1A110D]" : "bg-[#1A110D]/50")}>
                      <div className="flex items-start justify-between mb-4">
                        <h2 className="text-2xl font-bold text-[#FDFBF8] font-display flex items-baseline gap-3">
                          <span className={idx === 0 ? "text-[#FF8C00] text-lg font-mono" : "text-[#FDFBF8]/30 text-lg font-mono"}>
                            {String(idx + 1).padStart(2, '0')}
                          </span> {module.name}
                        </h2>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#2A1D16] text-[#FDFBF8]/60 text-xs font-medium">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {module.time_hours} HRS
                        </div>
                      </div>
                      
                      <p className="text-[#FDFBF8]/60 text-sm leading-relaxed mb-6 font-body">
                        {module.description}
                      </p>

                      <div className="mb-8">
                        <div className="flex items-center gap-2 text-[#FDFBF8]/80 text-sm mb-4 font-body font-medium">
                          <svg className="w-4 h-4 text-[#FDFBF8]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
                          </svg>
                          Target Files
                        </div>
                        
                        {module.files && module.files.length > 0 && (
                          <div className="bg-[#0A0705] rounded-xl border border-[#FDFBF8]/5 overflow-hidden">
                            <motion.div variants={fileListVariants} initial="hidden" animate="visible">
                              {module.files.map((file, fIdx) => (
                                <motion.div key={fIdx} variants={fileItemVariants} className="flex items-center justify-between px-4 py-3 border-b border-[#FDFBF8]/5 group hover:bg-[#1A110D]/50 transition-colors">
                                  <div className="flex items-center gap-3 overflow-hidden">
                                    <svg className="w-4 h-4 text-[#FF8C00]/70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                    </svg>
                                    <span className="text-[13px] text-[#FDFBF8] truncate">{file}</span>
                                  </div>
                                </motion.div>
                              ))}
                            </motion.div>
                          </div>
                        )}
                      </div>

                      {idx === 0 && (
                        <div className="flex items-center gap-6">
                          <button
                            onClick={handleStartLearning}
                            disabled={creatingTasks}
                            className="bg-[#FFB347] hover:bg-[#FF8C00] text-[#3D1C00] px-6 py-2.5 rounded text-[13px] font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          >
                            {creatingTasks ? (
                              <>
                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Creating Tasks...
                              </>
                            ) : 'Start Learning →'}
                          </button>
                          <span className="text-[11px] text-[#FDFBF8]/30">Creates {result.path.length} onboarding tasks in /tasks</span>
                        </div>
                      )}
                    </div>
                  </CardSpotlight>
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* Right Side: Path Summary Widget */}
          <div className="w-full lg:w-80 shrink-0">
            <CardSpotlight className="border-[#FF8C00]/20 shadow-xl shadow-[#FF8C00]/5">
              <div className="p-6">
                <GradientHeading as="h3" className="mb-6 flex items-center gap-2">
                  <svg className="w-5 h-5 text-[#FF8C00]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Path Summary
                </GradientHeading>

                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="bg-[#0A0705] border border-[#FDFBF8]/5 rounded-xl p-4">
                    <div className="text-[11px] font-medium text-[#FDFBF8]/40 mb-2">Total Time</div>
                    <div className="text-2xl font-bold text-[#FDFBF8] mb-1">{result ? result.total_estimated_hours : 0}</div>
                    <div className="text-xs text-[#FF8C00]">Hours Est.</div>
                  </div>
                  
                  <div className="bg-[#0A0705] border border-[#FDFBF8]/5 rounded-xl p-4">
                    <div className="text-[11px] font-medium text-[#FDFBF8]/40 mb-2">Progress</div>
                    <div className="text-2xl font-bold text-[#FDFBF8] mb-1">0<span className="text-[#FDFBF8]/30">/{result ? result.path.length : 0}</span></div>
                    <div className="text-xs text-[#FDFBF8]/40">Modules</div>
                  </div>
                </div>

                <div className="mb-8">
                  <div className="flex items-center justify-between text-[11px] font-medium mb-3">
                    <span className="text-[#FDFBF8]/60">Completion Status</span>
                    <span className="text-[#FDFBF8]">0%</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#0A0705] border border-[#FDFBF8]/5 overflow-hidden">
                    <div className="h-full bg-[#FF8C00] w-0"></div>
                  </div>
                </div>

                <button className="w-full bg-[#2A1D16] hover:bg-[#3D291F] text-[#FDFBF8] border border-[#FDFBF8]/10 py-3 rounded-lg text-[13px] font-bold transition-colors flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Resume Path
                </button>
              </div>
            </CardSpotlight>
          </div>

        </div>
      </div>
    </PageTransition>
  )
}
