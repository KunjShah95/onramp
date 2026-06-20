import { useState } from 'react'
import { motion } from 'framer-motion'
import { generateReport, generateHtmlReport } from '../lib/api'
import type { ReportSection } from '../lib/api'
import { cn } from '../lib/utils'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import PageTransition from '../components/ui/page-transition'
import { useToast } from '../context/ToastContext'

const LEVELS = [
  { value: 'junior', label: 'Junior', duration: '0-2 years' },
  { value: 'mid', label: 'Mid-Level', duration: '2-5 years' },
  { value: 'senior', label: 'Senior', duration: '5+ years' },
]

export default function OnboardingReportPage() {
  const toast = useToast()
  const [repoUrl, setRepoUrl] = useState('')
  const [userLevel, setUserLevel] = useState('junior')
  const [loading, setLoading] = useState(false)
  const [htmlLoading, setHtmlLoading] = useState(false)
  const [report, setReport] = useState<ReportSection[] | null>(null)
  const [error, setError] = useState('')

  async function handleGenerate() {
    if (!repoUrl.trim()) return
    setLoading(true)
    setError('')
    setReport(null)
    try {
      const data = await generateReport(repoUrl.trim(), userLevel)
      setReport(data.report)
      toast.success('Report generated', `${data.report.length} sections for ${userLevel} level`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed')
      toast.error('Report generation failed', e instanceof Error ? e.message : undefined)
    }
    setLoading(false)
  }

  async function handleDownloadHtml() {
    if (!repoUrl.trim()) return
    setHtmlLoading(true)
    setError('')
    try {
      const data = await generateHtmlReport(repoUrl.trim(), userLevel)
      
      // Trigger download
      const blob = new Blob([data.html], { type: 'text/html' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${repoUrl.split('/').pop()}-onboarding-report.html`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      toast.success('HTML downloaded', 'Report saved as ' + a.download)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'HTML download failed')
      toast.error('Download failed', e instanceof Error ? e.message : undefined)
    }
    setHtmlLoading(false)
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
  }
  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 },
  }

  return (
    <PageTransition>
    <div className="w-full min-h-[calc(100vh-4rem)] p-4 sm:p-6 font-body text-[#FDFBF8] max-w-4xl pb-12 max-w-full overflow-x-hidden mx-auto">
      <GradientHeading as="h1" className="mb-1">Onboarding Report Generator</GradientHeading>
      <p className="text-[#FDFBF8]/60 text-sm mb-6">Create a unified, download-ready developer onboarding guide for any repository</p>

      <CardSpotlight className="p-6 space-y-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="text-sm text-[#FDFBF8]/40 mb-2 block font-medium">Repository URL</label>
            <input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/facebook/react"
              className="bg-[#0D0906] border border-[#FDFBF8]/8 rounded-lg px-3 py-2 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/25 w-full outline-none focus:border-[#FF8C00]/40 transition-colors"
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            />
          </div>
          <div>
            <label className="text-sm text-[#FDFBF8]/40 mb-2 block font-medium">Target Developer Level</label>
            <div className="flex gap-2">
              {LEVELS.map((l) => (
                <button
                  key={l.value}
                  onClick={() => setUserLevel(l.value)}
                  className={cn(
                    'flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all duration-200 border',
                    userLevel === l.value
                      ? 'bg-[#FF8C00] text-white shadow-lg border-transparent'
                      : 'bg-[#1A110D] text-[#FDFBF8]/60 border-[#FDFBF8]/5 hover:bg-[#1A110D]/80 hover:text-[#FDFBF8]'
                  )}
                >
                  <span className="block font-semibold">{l.label}</span>
                  <span className="block text-[10px] opacity-75 mt-0.5">{l.duration}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleGenerate}
            disabled={loading || !repoUrl.trim()}
            className="bg-[#FF8C00] hover:bg-[#FFB347] text-[#3D1C00] px-4 py-2 rounded-lg text-sm font-bold transition-colors flex-1 md:flex-none md:px-8 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Generating Report...' : 'Generate Interactive Report'}
          </button>
          
          <button
            onClick={handleDownloadHtml}
            disabled={htmlLoading || !repoUrl.trim()}
            className="bg-[#FDFBF8]/5 hover:bg-[#FDFBF8]/10 text-[#FDFBF8]/70 border border-[#FDFBF8]/8 px-4 py-2 rounded-lg text-sm font-bold transition-colors whitespace-nowrap disabled:opacity-50"
          >
            {htmlLoading ? 'Preparing HTML...' : 'Download HTML Version'}
          </button>
        </div>
      </CardSpotlight>

      {error && (
        <div className="bg-red-500/10 text-red-400 rounded-lg p-4 mb-6 text-sm border border-red-500/20">{error}</div>
      )}

      {loading && (
        <CardSpotlight className="flex flex-col items-center justify-center py-12 space-y-4">
          <div className="loader"></div>
          <p className="text-[#FDFBF8]/60 text-sm">Analyzing repository files, structural graphs, and compiling objectives...</p>
        </CardSpotlight>
      )}

      {report && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-6"
        >
          {report.map((sec, index) => (
            <motion.div key={index} variants={itemVariants}>
              <CardSpotlight className="p-6">
                <GradientHeading as="h2" className="text-lg pb-3 mb-4 flex items-center justify-between border-b border-[#FDFBF8]/5">
                  <span>{sec.title}</span>
                  <span className="text-xs text-[#FDFBF8]/40 font-normal uppercase tracking-wider">Section 0{index + 1}</span>
                </GradientHeading>

                {sec.type === 'overview' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                    <div>
                      <span className="text-[#FDFBF8]/40 block text-xs mb-1">Repository</span>
                      <a href={sec.content.repo} target="_blank" rel="noreferrer" className="text-[#FF8C00] hover:underline font-semibold font-code truncate block">
                        {sec.content.name}
                      </a>
                    </div>
                    <div>
                      <span className="text-[#FDFBF8]/40 block text-xs mb-1">Level</span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border bg-green-500/10 text-green-400 border-green-500/20 capitalize">{sec.content.user_level}</span>
                    </div>
                    <div>
                      <span className="text-[#FDFBF8]/40 block text-xs mb-1">Generated At</span>
                      <span className="text-[#FDFBF8]/60 font-mono">{new Date(sec.content.generated_at).toLocaleString()}</span>
                    </div>
                  </div>
                )}

                {sec.type === 'modules' && (
                  <div className="space-y-6">
                    <div className="text-sm text-[#FDFBF8]/60 flex items-center gap-2 mb-2">
                      <span>Total Estimated Path Duration:</span>
                      <span className="text-[#FF8C00] font-bold text-base font-mono">{sec.content.total_estimated_hours} hours</span>
                    </div>
                    <div className="relative border-l border-[#FDFBF8]/5 pl-6 ml-3 space-y-6">
                      {sec.content.modules.map((m: any, mIdx: number) => (
                        <div key={mIdx} className="relative">
                          <div className="absolute -left-[31px] top-1.5 w-2 h-2 rounded-full bg-[#FF8C00] ring-4 ring-[#0D0906]"></div>
                          <div className="flex flex-col md:flex-row md:items-center justify-between mb-2">
                            <h3 className="font-semibold text-[#FDFBF8] text-sm font-display">{m.name}</h3>
                            <span className="text-xs text-[#FF8C00] font-mono bg-[#FF8C00]/10 px-2 py-0.5 rounded-full mt-1 md:mt-0 w-max">{m.time}h estimation</span>
                          </div>
                          <p className="text-xs text-[#FDFBF8]/40 mb-3 leading-relaxed">{m.description}</p>
                          <ul className="space-y-1.5 pl-4 list-disc">
                            {m.items.map((item: string, iIdx: number) => (
                              <li key={iIdx} className="text-xs text-[#FDFBF8]/60 leading-relaxed">{item}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {sec.type === 'faq' && (
                  <div className="space-y-6">
                    {sec.content.questions.map((q: any, qIdx: number) => (
                      <div key={qIdx} className="border-b border-[#FDFBF8]/5 pb-4 last:border-b-0 last:pb-0">
                        <h3 className="font-semibold text-[#FDFBF8] text-sm mb-1.5">Q: {q.q}</h3>
                        <p className="text-xs text-[#FDFBF8]/60 leading-relaxed pl-4 border-l border-[#FF8C00]/30">A: {q.a}</p>
                      </div>
                    ))}
                  </div>
                )}

                {sec.type === 'summary' && (
                  <div className="flex flex-col md:flex-row md:items-center justify-between bg-[#1A110D] p-4 rounded-lg border border-[#FDFBF8]/8">
                    <div className="mb-4 md:mb-0">
                      <p className="text-sm font-medium text-[#FDFBF8]">Onboarding Readiness Score</p>
                      <p className="text-xs text-[#FDFBF8]/40 mt-1">{sec.content.note}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[#FDFBF8]/40 text-xs block">Estimated Duration</span>
                      <span className="font-display font-bold text-2xl text-[#FF8C00] font-mono">{sec.content.total_hours} Hours</span>
                    </div>
                  </div>
                )}

                {sec.type === 'placeholder' && (
                  <div className="text-center py-6 text-[#FDFBF8]/40 text-xs space-y-2">
                    <p>{sec.content.note}</p>
                    {sec.content.files_to_analyze && (
                      <div className="font-code text-[11px] text-[#FDFBF8]/60 bg-[#1A110D]/60 p-2 rounded max-w-md mx-auto">
                        {sec.content.files_to_analyze.join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </CardSpotlight>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
    </PageTransition>
  )
}
