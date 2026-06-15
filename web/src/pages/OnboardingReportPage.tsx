import { useState } from 'react'
import { cn } from '../lib/utils'

interface ReportSection {
  title: string
  type: string
  content: any
}

const LEVELS = [
  { value: 'junior', label: 'Junior', duration: '0-2 years' },
  { value: 'mid', label: 'Mid-Level', duration: '2-5 years' },
  { value: 'senior', label: 'Senior', duration: '5+ years' },
]

export default function OnboardingReportPage() {
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
      const response = await fetch('http://localhost:8000/api/v1/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_url: repoUrl.trim(),
          user_level: userLevel,
        }),
      })
      if (!response.ok) {
        throw new Error(`Failed to generate report: ${response.statusText}`)
      }
      const data = await response.json()
      setReport(data.report)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    }
    setLoading(false)
  }

  async function handleDownloadHtml() {
    if (!repoUrl.trim()) return
    setHtmlLoading(true)
    setError('')
    try {
      const response = await fetch('http://localhost:8000/api/v1/reports/generate-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_url: repoUrl.trim(),
          user_level: userLevel,
        }),
      })
      if (!response.ok) {
        throw new Error(`Failed to generate HTML report: ${response.statusText}`)
      }
      const data = await response.json()
      
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'HTML download failed')
    }
    setHtmlLoading(false)
  }

  return (
    <div className="animate-in max-w-4xl pb-12">
      <h1 className="font-display text-2xl font-bold text-text-primary mb-1">Onboarding Report Generator</h1>
      <p className="text-text-secondary text-sm mb-6">Create a unified, download-ready developer onboarding guide for any repository</p>

      <div className="card space-y-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="text-sm text-text-muted mb-2 block font-medium">Repository URL</label>
            <input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/facebook/react"
              className="input"
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            />
          </div>
          <div>
            <label className="text-sm text-text-muted mb-2 block font-medium">Target Developer Level</label>
            <div className="flex gap-2">
              {LEVELS.map((l) => (
                <button
                  key={l.value}
                  onClick={() => setUserLevel(l.value)}
                  className={cn(
                    'flex-1 py-2 px-3 rounded-btn text-xs font-medium transition-all duration-200 border border-transparent',
                    userLevel === l.value
                      ? 'bg-accent-from text-white shadow-card'
                      : 'bg-bg-secondary text-text-secondary border-border hover:bg-bg-elevated hover:text-text-primary'
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
            className="btn flex-1 md:flex-none md:px-8 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Generating Report...' : 'Generate Interactive Report'}
          </button>
          
          <button
            onClick={handleDownloadHtml}
            disabled={htmlLoading || !repoUrl.trim()}
            className="btn btn-ghost whitespace-nowrap disabled:opacity-50"
          >
            {htmlLoading ? 'Preparing HTML...' : 'Download HTML Version'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 text-red-400 rounded-card p-4 mb-6 text-sm border border-red-500/20">{error}</div>
      )}

      {loading && (
        <div className="card flex flex-col items-center justify-center py-12 space-y-4">
          <div className="loader"></div>
          <p className="text-text-secondary text-sm">Analyzing repository files, structural graphs, and compiling objectives...</p>
        </div>
      )}

      {report && (
        <div className="space-y-6">
          {report.map((sec, index) => (
            <div key={index} className="card">
              <h2 className="font-display text-lg font-semibold text-text-primary border-b border-border pb-3 mb-4 flex items-center justify-between">
                <span>{sec.title}</span>
                <span className="text-xs text-text-muted font-normal uppercase tracking-wider">Section 0{index + 1}</span>
              </h2>

              {sec.type === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                  <div>
                    <span className="text-text-muted block text-xs mb-1">Repository</span>
                    <a href={sec.content.repo} target="_blank" rel="noreferrer" className="text-accent-from hover:underline font-semibold font-code truncate block">
                      {sec.content.name}
                    </a>
                  </div>
                  <div>
                    <span className="text-text-muted block text-xs mb-1">Level</span>
                    <span className="badge badge-success capitalize">{sec.content.user_level}</span>
                  </div>
                  <div>
                    <span className="text-text-muted block text-xs mb-1">Generated At</span>
                    <span className="text-text-secondary font-mono">{new Date(sec.content.generated_at).toLocaleString()}</span>
                  </div>
                </div>
              )}

              {sec.type === 'modules' && (
                <div className="space-y-6">
                  <div className="text-sm text-text-secondary flex items-center gap-2 mb-2">
                    <span>Total Estimated Path Duration:</span>
                    <span className="text-accent-via font-bold text-base font-mono">{sec.content.total_estimated_hours} hours</span>
                  </div>
                  <div className="relative border-l border-border pl-6 ml-3 space-y-6">
                    {sec.content.modules.map((m: any, mIdx: number) => (
                      <div key={mIdx} className="relative">
                        <div className="absolute -left-[31px] top-1.5 w-2 h-2 rounded-full bg-accent-from ring-4 ring-bg-tertiary"></div>
                        <div className="flex flex-col md:flex-row md:items-center justify-between mb-2">
                          <h3 className="font-semibold text-text-primary text-sm font-display">{m.name}</h3>
                          <span className="text-xs text-accent-via font-mono bg-accent-via/5 px-2 py-0.5 rounded-full mt-1 md:mt-0 w-max">{m.time}h estimation</span>
                        </div>
                        <p className="text-xs text-text-muted mb-3 leading-relaxed">{m.description}</p>
                        <ul className="space-y-1.5 pl-4 list-disc">
                          {m.items.map((item: string, iIdx: number) => (
                            <li key={iIdx} className="text-xs text-text-secondary leading-relaxed">{item}</li>
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
                    <div key={qIdx} className="border-b border-border/40 pb-4 last:border-b-0 last:pb-0">
                      <h3 className="font-semibold text-text-primary text-sm mb-1.5">Q: {q.q}</h3>
                      <p className="text-xs text-text-secondary leading-relaxed pl-4 border-l border-accent-from/30">A: {q.a}</p>
                    </div>
                  ))}
                </div>
              )}

              {sec.type === 'summary' && (
                <div className="flex flex-col md:flex-row md:items-center justify-between bg-bg-secondary p-4 rounded-card border border-border/50">
                  <div className="mb-4 md:mb-0">
                    <p className="text-sm font-medium text-text-primary">Onboarding Readiness Score</p>
                    <p className="text-xs text-text-muted mt-1">{sec.content.note}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-text-muted text-xs block">Estimated Duration</span>
                    <span className="font-display font-bold text-2xl text-accent-from font-mono">{sec.content.total_hours} Hours</span>
                  </div>
                </div>
              )}

              {sec.type === 'placeholder' && (
                <div className="text-center py-6 text-text-muted text-xs space-y-2">
                  <p>{sec.content.note}</p>
                  {sec.content.files_to_analyze && (
                    <div className="font-code text-[11px] text-text-secondary bg-bg-secondary/60 p-2 rounded max-w-md mx-auto">
                      {sec.content.files_to_analyze.join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
