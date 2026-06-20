import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../lib/utils'
import { findIssues, generateGuide, fetchPairWalkthrough, createTask } from '../lib/api'
import type { ScoredIssue, IssueGuide } from '../lib/types'
import type { PairWalkthroughResult } from '../lib/api'
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

export default function FirstIssuePage() {
  const [repoUrl, setRepoUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [issues, setIssues] = useState<ScoredIssue[]>([])
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [guideLoading, setGuideLoading] = useState<string | null>(null)
  const [selectedGuide, setSelectedGuide] = useState<IssueGuide | null>(null)
  const [walkthroughLoading, setWalkthroughLoading] = useState<string | null>(null)
  const [selectedWalkthrough, setSelectedWalkthrough] = useState<PairWalkthroughResult | null>(null)
  const [taskCreating, setTaskCreating] = useState(false)
  const [taskCreatedId, setTaskCreatedId] = useState<string | null>(null)

  const toast = useToast()

  async function handleCreateTaskForGuide(guide: IssueGuide) {
    setTaskCreating(true)
    try {
      const task = await createTask({
        team_id: 'default',
        title: guide.title || 'First PR Task',
        description: guide.steps?.join('\n') || '',
        priority: 'medium',
      })
      setTaskCreatedId(task.task_id)
      toast.success('Task created', 'Linked to /tasks kanban')
    } catch (e: any) {
      toast.error('Failed to create task', e.message)
    }
    setTaskCreating(false)
  }

  async function handleFindIssues() {
    if (!repoUrl.trim()) return
    setLoading(true)
    setError('')
    try {
      const result = await findIssues(repoUrl, 'junior')
      setIssues(result.issues)
      toast.success('Issues found', `${result.issues.length} beginner-friendly issues`)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch issues.')
      toast.error('Failed to fetch issues', err.message)
    } finally {
      setLoading(false)
    }
  }

  const filteredIssues = issues.filter(issue => 
    issue.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (issue.body && issue.body.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  return (
    <PageTransition>
      <div className="w-full h-full min-h-[calc(100vh-4rem)] p-4 sm:p-8 font-mono text-[#FDFBF8] max-w-full overflow-x-hidden">
        
        {/* Header Section */}
        <div className="max-w-5xl mb-12">
          <div className="inline-flex px-2 py-1 rounded-sm border border-[#FF8C00]/30 bg-[#1A110D] text-[#FF8C00] text-[10px] font-bold tracking-wider mb-4 uppercase">
            Accelerator
          </div>
          
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-8">
            <div className="max-w-2xl">
              <GradientHeading as="h1" className="mb-4">First PR Accelerator</GradientHeading>
              <p className="text-[#FDFBF8]/70 text-[15px] leading-relaxed font-body">
                Discover beginner-friendly issues curated to help you make your first contribution. High-impact, low-complexity tasks across the ecosystem.
              </p>
            </div>
            
            <div className="flex flex-col gap-3 w-full lg:w-[400px]">
              <CardSpotlight>
                <div className="flex flex-col sm:flex-row gap-2 p-3">
                  <input
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleFindIssues()}
                    placeholder="Enter GitHub repository URL..."
                    className="w-full bg-[#1A110D] border border-[#FDFBF8]/10 text-[#FDFBF8] text-[15px] rounded-lg px-4 py-3 focus:outline-none focus:border-[#FF8C00]/50 transition-colors placeholder:text-[#FDFBF8]/30"
                  />
                  <button 
                    onClick={handleFindIssues}
                    disabled={loading}
                    className={cn(
                      "px-6 py-3 rounded-lg font-bold text-[15px] transition-all",
                      loading 
                        ? "bg-[#FF8C00]/50 text-[#3D1C00] cursor-not-allowed" 
                        : "bg-[#FFB347] hover:bg-[#FF8C00] text-[#3D1C00]"
                    )}
                  >
                    {loading ? 'Finding...' : 'Find'}
                  </button>
                </div>
              </CardSpotlight>
              
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <svg className="w-4 h-4 text-[#FDFBF8]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                </div>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter issues..."
                  className="w-full bg-[#110D0A] border border-[#FDFBF8]/10 text-[#FDFBF8] text-sm rounded-sm pl-9 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#FF8C00] transition-colors placeholder:text-[#FDFBF8]/40 font-body font-medium"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <CardSpotlight className="max-w-5xl mb-12 border-[#FDFBF8]/5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 p-6">
            <div>
              <div className="text-[10px] tracking-widest font-semibold text-[#FDFBF8]/40 mb-2 uppercase">Available Issues</div>
              <div className="text-3xl font-bold text-[#FF8C00]">{issues.length}</div>
            </div>
            
            <div>
              <div className="text-[10px] tracking-widest font-semibold text-[#FDFBF8]/40 mb-2 uppercase">Languages</div>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set(issues.flatMap(i => i.labels || []))).slice(0, 4).map(label => (
                  <span key={label} className="px-2.5 py-1 rounded-sm bg-[#1A110D] text-[#FDFBF8] text-xs font-medium border border-[#FDFBF8]/10">{label}</span>
                ))}
              </div>
            </div>
            
            <div className="md:pr-8">
              <div className="text-[10px] tracking-widest font-semibold text-[#FDFBF8]/40 mb-2 uppercase">Your Progress</div>
              <div className="text-[13px] text-[#FDFBF8] mb-3">0/1 First PR completed</div>
              <div className="h-1.5 w-full bg-[#1A110D] rounded-full overflow-hidden border border-[#FDFBF8]/5">
                <div className="h-full w-0 bg-[#FF8C00]"></div>
              </div>
            </div>
          </div>
        </CardSpotlight>

        {error && (
          <div className="max-w-5xl mb-8 p-4 rounded-lg bg-red-900/20 border border-red-500/50 text-red-400 font-mono text-sm">
            {error}
          </div>
        )}

        {/* Issues Grid */}
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-12 max-w-5xl">
          {!loading && issues.length === 0 && !error && (
            <motion.div variants={itemVariants} className="col-span-1 md:col-span-2 text-[#FDFBF8]/40 font-mono text-sm italic py-8">
              Enter a repository URL to find beginner-friendly issues.
            </motion.div>
          )}

          {loading && (
            <motion.div variants={itemVariants} className="col-span-1 md:col-span-2 flex flex-col items-center justify-center py-12">
              <svg className="w-8 h-8 animate-spin text-[#FF8C00] mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-[#FDFBF8]/60 text-sm font-mono animate-pulse">Scanning repository for accessible issues...</p>
            </motion.div>
          )}

          {filteredIssues.map((issue) => (
            <motion.div variants={itemVariants} key={issue.id} className="flex flex-col border-b border-[#FDFBF8]/5 pb-8 md:border-none md:pb-0">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[#FF8C00] text-[13px] font-mono">#{issue.id}</span>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-sm bg-[#1A110D] text-[#FDFBF8]/60 text-[11px] font-medium border border-[#FDFBF8]/5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    ~{issue.estimated_hours}hrs
                  </span>
                  <span className="inline-flex px-2 py-1 rounded-sm bg-[#1A2633] text-[#4DA8DA] text-[10px] font-bold border border-[#4DA8DA]/20 tracking-wide uppercase">
                    Complexity: {issue.complexity_score}/10
                  </span>
                </div>
              </div>
              
              <h2 className="font-display text-xl font-bold text-[#FDFBF8] mb-3 leading-snug">{issue.title}</h2>
              
              <p className="text-[#FDFBF8]/60 text-[13px] leading-relaxed mb-6 font-body flex-1">
                {issue.body && issue.body.length > 120 ? issue.body.substring(0, 120) + '...' : issue.body}
              </p>
              
              <div className="flex flex-wrap gap-2 mb-8 mt-auto">
                {issue.labels && issue.labels.map((label, i) => (
                  <span key={i} className="px-2 py-1 rounded-sm bg-[#1A110D] text-[#FDFBF8]/50 text-[11px] font-medium font-mono border border-[#FDFBF8]/10">
                    {label}
                  </span>
                ))}
              </div>
              
              <div className="flex gap-2 mt-auto">
                <button
                  onClick={async () => {
                    setGuideLoading(String(issue.id))
                    setError('')
                    try {
                      const guide = await generateGuide(issue.id, { files: [], classes: [], functions: [], imports: [], exports: [] })
                      guide.title = issue.title
                      setSelectedGuide(guide)
                    } catch (e: any) {
                      setError(e.message || 'Failed to generate guide')
                    }
                    setGuideLoading(null)
                  }}
                  disabled={guideLoading === String(issue.id)}
                  className="flex-1 bg-transparent border border-[#FDFBF8]/20 text-[#FDFBF8]/80 hover:text-[#FDFBF8] hover:bg-[#FDFBF8]/5 py-2.5 rounded-sm text-[13px] font-medium transition-colors font-body disabled:opacity-40"
                >
                  {guideLoading === String(issue.id) ? 'Loading...' : 'View Guide'}
                </button>
                <button
                  onClick={async () => {
                    setWalkthroughLoading(String(issue.id))
                    setError('')
                    try {
                      const walkthrough = await fetchPairWalkthrough(
                        issue.title,
                        issue.body || '',
                        { files: [], classes: [], functions: [], imports: [], exports: [] }
                      )
                      setSelectedWalkthrough(walkthrough)
                    } catch (e: any) {
                      setError(e.message || 'Failed to generate walkthrough')
                    }
                    setWalkthroughLoading(null)
                  }}
                  disabled={walkthroughLoading === String(issue.id)}
                  className="flex-1 bg-transparent border border-[#4DA8DA]/30 text-[#4DA8DA]/80 hover:text-[#4DA8DA] hover:bg-[#4DA8DA]/5 py-2.5 rounded-sm text-[13px] font-medium transition-colors font-body disabled:opacity-40"
                >
                  {walkthroughLoading === String(issue.id) ? 'Loading...' : 'Walkthrough'}
                </button>
                <a 
                  href={issue.url} 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex-[0.7] bg-[#FFB347] hover:bg-[#FF8C00] text-[#3D1C00] py-2.5 rounded-sm text-[13px] font-bold transition-colors font-body flex items-center justify-center gap-2"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                  GitHub
                </a>
              </div>
            </motion.div>
          ))}

        </motion.div>

        {/* ── Guide Modal ─────────────────────────────────────────── */}
        <AnimatePresence>
          {selectedGuide && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
              onClick={() => { setSelectedGuide(null); setTaskCreatedId(null) }}
            >
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }} 
                animate={{ opacity: 1, scale: 1, y: 0 }} 
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-[#120D0A] border border-[#FDFBF8]/10 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="sticky top-0 bg-[#120D0A] border-b border-[#FDFBF8]/5 px-6 py-4 flex items-center justify-between z-10">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#FF8C00]" />
                    <h2 className="font-display text-base font-bold text-[#FDFBF8]">Step-by-Step Guide</h2>
                  </div>
                  <button onClick={() => { setSelectedGuide(null); setTaskCreatedId(null) }} className="text-[#FDFBF8]/30 hover:text-[#FDFBF8] transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="p-6 space-y-5">
                  <h3 className="font-display text-lg font-semibold text-[#FDFBF8]">{selectedGuide.title}</h3>

                  {selectedGuide.files_to_touch && selectedGuide.files_to_touch.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-[#FDFBF8]/30 font-semibold mb-2">Files to Modify</div>
                      <div className="space-y-1.5">
                        {selectedGuide.files_to_touch.map((file, i) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-2 bg-[#0D0906] rounded-lg border border-[#FDFBF8]/5">
                            <svg className="w-3.5 h-3.5 text-[#FF8C00]/70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                            <span className="text-sm text-[#FDFBF8] font-mono">{file}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedGuide.steps && selectedGuide.steps.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-[#FDFBF8]/30 font-semibold mb-3">Steps</div>
                      <ol className="space-y-3">
                        {selectedGuide.steps.map((step, i) => (
                          <li key={i} className="flex gap-3">
                            <span className="w-6 h-6 rounded-full bg-[#FF8C00]/15 border border-[#FF8C00]/30 flex items-center justify-center text-[11px] font-bold text-[#FF8C00] shrink-0 mt-0.5">
                              {i + 1}
                            </span>
                            <span className="text-sm text-[#FDFBF8]/70 leading-relaxed pt-0.5">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {selectedGuide.similar_prs && selectedGuide.similar_prs.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-[#FDFBF8]/30 font-semibold mb-2">Similar PRs</div>
                      <div className="space-y-2">
                        {selectedGuide.similar_prs.map((pr, i) => (
                          <a key={i} href={pr.url} target="_blank" rel="noreferrer"
                            className="flex items-center gap-2 px-3 py-2 bg-[#0D0906] rounded-lg border border-[#FDFBF8]/5 hover:border-[#4DA8DA]/30 transition-colors group">
                            <svg className="w-3.5 h-3.5 text-[#4DA8DA] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                            </svg>
                            <span className="text-sm text-[#FDFBF8]/60 group-hover:text-[#FDFBF8] flex-1 truncate">{pr.title}</span>
                            {pr.merged && (
                              <span className="text-[10px] bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded border border-green-500/20">merged</span>
                            )}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="border-t border-[#FDFBF8]/5 pt-4">
                    {taskCreatedId ? (
                      <div className="flex items-center gap-2 text-green-400 text-sm">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Task created — track it in <a href="/tasks" className="underline hover:text-green-300">/tasks</a>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleCreateTaskForGuide(selectedGuide)}
                        disabled={taskCreating}
                        className="w-full bg-[#FF8C00] hover:bg-[#FFB347] text-[#3D1C00] px-4 py-2.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {taskCreating ? (
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                          </svg>
                        )}
                        {taskCreating ? 'Creating Task…' : 'Create Task for This Issue'}
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Walkthrough Modal ────────────────────────────────────── */}
        <AnimatePresence>
          {selectedWalkthrough && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
              onClick={() => setSelectedWalkthrough(null)}
            >
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }} 
                animate={{ opacity: 1, scale: 1, y: 0 }} 
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-[#120D0A] border border-[#FDFBF8]/10 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="sticky top-0 bg-[#120D0A] border-b border-[#FDFBF8]/5 px-6 py-4 flex items-center justify-between z-10">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#4DA8DA]" />
                    <h2 className="font-display text-base font-bold text-[#FDFBF8]">Pair Programming Walkthrough</h2>
                  </div>
                  <button onClick={() => setSelectedWalkthrough(null)} className="text-[#FDFBF8]/30 hover:text-[#FDFBF8] transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="p-6 space-y-5">
                  {/* Thought Process */}
                  {selectedWalkthrough.thought_process && (
                    <div className="bg-[#0D0906] border-l-2 border-[#4DA8DA] rounded-r-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-4 h-4 text-[#4DA8DA]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        <span className="text-[11px] font-semibold text-[#4DA8DA] uppercase tracking-wider">Thinking Aloud</span>
                      </div>
                      <p className="text-sm text-[#FDFBF8]/70 leading-relaxed italic">{selectedWalkthrough.thought_process}</p>
                    </div>
                  )}

                  {/* Key Insights */}
                  {selectedWalkthrough.key_insights && selectedWalkthrough.key_insights.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-[#FDFBF8]/30 font-semibold mb-2">Key Insights</div>
                      <div className="space-y-1.5">
                        {selectedWalkthrough.key_insights.map((insight, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm text-[#FDFBF8]/65">
                            <span className="text-[#FF8C00] mt-0.5">→</span>
                            {insight}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Solution Steps */}
                  {selectedWalkthrough.solution_steps && selectedWalkthrough.solution_steps.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-[#FDFBF8]/30 font-semibold mb-2">Solution Steps</div>
                      <ol className="space-y-2">
                        {selectedWalkthrough.solution_steps.map((step, i) => (
                          <li key={i} className="flex gap-3">
                            <span className="w-6 h-6 rounded-full bg-[#4DA8DA]/15 border border-[#4DA8DA]/30 flex items-center justify-center text-[11px] font-bold text-[#4DA8DA] shrink-0 mt-0.5">
                              {i + 1}
                            </span>
                            <span className="text-sm text-[#FDFBF8]/70 leading-relaxed pt-0.5">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* Testing Approach */}
                  {selectedWalkthrough.testing_approach && (
                    <div className="bg-[#0D0906] border border-green-500/15 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-[11px] font-semibold text-green-400 uppercase tracking-wider">Testing Approach</span>
                      </div>
                      <p className="text-sm text-[#FDFBF8]/65 leading-relaxed">{selectedWalkthrough.testing_approach}</p>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  )
}
