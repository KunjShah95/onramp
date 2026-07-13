import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  FileText,
  Download,
  Spinner,
  GitBranch,
  BookOpenText,
} from '@phosphor-icons/react'
import PageTransition from '../components/ui/page-transition'
import CardSpotlight from '../components/ui/card-spotlight'
import { EmptyState } from '../components/ui/empty-state'
import { ReportSkeleton } from '../components/ui/Skeleton'
import { useToast } from '../context/ToastContext'
import { generateReport, generateHtmlReport } from '../lib/api'
import type { ReportResult, ReportSection } from '../lib/api'

const LEVELS = [
  { key: 'junior', label: 'Junior' },
  { key: 'mid', label: 'Mid' },
  { key: 'senior', label: 'Senior' },
]

function renderContent(content: any) {
  if (content == null) return null
  if (typeof content === 'string') {
    return <p className="text-body-sm text-text-secondary leading-relaxed whitespace-pre-line">{content}</p>
  }
  if (Array.isArray(content)) {
    return (
      <ul className="space-y-1 list-disc list-inside text-body-sm text-text-secondary">
        {content.map((item: any, i: number) => (
          <li key={i}>{typeof item === 'object' ? JSON.stringify(item) : String(item)}</li>
        ))}
      </ul>
    )
  }
  if (typeof content === 'object') {
    return (
      <div className="space-y-1 text-body-sm text-text-secondary">
        {Object.entries(content).map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <span className="text-text-tertiary capitalize min-w-[120px]">{k.replace(/_/g, ' ')}:</span>
            <span className="flex-1">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
          </div>
        ))}
      </div>
    )
  }
  return <p className="text-body-sm text-text-secondary">{String(content)}</p>
}

export default function OnboardingReportPage() {
  const [repoUrl, setRepoUrl] = useState('')
  const [userLevel, setUserLevel] = useState('junior')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ReportResult | null>(null)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)

  const toast = useToast()

  async function handleGenerate() {
    if (!repoUrl.trim()) return
    setLoading(true); setError(''); setResult(null)
    try {
      const data = await generateReport(repoUrl, userLevel)
      setResult(data)
    } catch (err: any) {
      setError(err.message || 'Failed to generate report.')
      toast.error('Report failed', err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDownload() {
    if (!repoUrl.trim()) return
    setDownloading(true)
    try {
      const data = await generateHtmlReport(repoUrl, userLevel)
      const blob = new Blob([data.html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'onboarding-report.html'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      toast.error('Download failed', err.message)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <PageTransition>
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-accent-primary" weight="duotone" />
            </div>
            <div>
              <h1 className="text-display-sm font-display font-medium text-text-primary">
                Onboarding Report
              </h1>
              <p className="text-body-sm text-text-tertiary">
                Generate a professional onboarding report for any repository.
              </p>
            </div>
          </div>
          {result && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="btn btn-secondary flex items-center gap-2 shrink-0"
            >
              {downloading ? <Spinner className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              HTML
            </button>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex items-center w-full md:flex-1">
            <GitBranch size={16} className="absolute left-3.5 text-text-tertiary/40 pointer-events-none" />
            <input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              placeholder="github.com/owner/repo"
              className="w-full bg-bg-secondary border border-border text-text-primary text-body-sm rounded-input pl-9 pr-4 py-2.5 focus:outline-none focus:border-accent-primary/60 focus:ring-1 focus:ring-accent-primary/40 transition-colors placeholder:text-text-tertiary/40"
            />
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-bg-tertiary/30 w-fit">
            {LEVELS.map((l) => (
              <button
                key={l.key}
                onClick={() => setUserLevel(l.key)}
                className={`px-3 py-1.5 rounded-lg text-caption font-medium transition-all ${
                  userLevel === l.key
                    ? 'bg-bg-primary text-text-primary shadow-sm'
                    : 'text-text-tertiary hover:text-text-secondary'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <button
            onClick={handleGenerate}
            disabled={loading || !repoUrl.trim()}
            className="px-5 py-2.5 rounded-xl text-caption font-semibold bg-accent-primary hover:brightness-110 disabled:opacity-40 text-[#09090B] transition-all flex items-center gap-2 shrink-0"
          >
            <BookOpenText className="w-3.5 h-3.5" weight="fill" />
            {loading ? 'Generating…' : 'Generate'}
          </button>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-lg bg-error-muted border border-error/20 text-error text-body-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={handleGenerate} disabled={loading} className="text-caption underline ml-4 text-error/70 hover:text-error">Retry</button>
          </div>
        )}

        {loading && <ReportSkeleton />}

        {!loading && !result && (
          <CardSpotlight className="border border-accent-primary/10">
            <EmptyState
              icon={<FileText className="w-10 h-10 text-text-tertiary/30" weight="duotone" />}
              title="Enter a GitHub repository above"
              description="We'll compile a repository overview, architecture, learning path, and good-first-issues into a report."
              action={
                <button onClick={handleGenerate} disabled={!repoUrl.trim()} className="mt-2 px-5 py-2 rounded-btn text-caption border border-border text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors font-code disabled:opacity-40">
                  Generate
                </button>
              }
            />
          </CardSpotlight>
        )}

        {!loading && result && (
          <div className="space-y-4">
            {result.report.map((section: ReportSection, i) => (
              <motion.div
                key={`${section.title}-${i}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <CardSpotlight className="p-6">
                  <h3 className="text-body font-medium text-text-primary mb-3">{section.title}</h3>
                  {renderContent(section.content)}
                </CardSpotlight>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  )
}
