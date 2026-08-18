import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  FileText,
  Download,
  Spinner,
  GitBranch,
  BookOpenText,
} from '@phosphor-icons/react'
import ConsolePanel from '../components/ui/console-panel'
import { EmptyState } from '../components/ui/empty-state'
import { PageHeader } from '../components/ui/page-header'
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
    return <p className="text-body-sm text-ink-secondary leading-relaxed whitespace-pre-line">{content}</p>
  }
  if (Array.isArray(content)) {
    return (
      <ul className="space-y-1 list-disc list-inside text-body-sm text-ink-secondary">
        {content.map((item: any, i: number) => (
          <li key={i}>{typeof item === 'object' ? JSON.stringify(item) : String(item)}</li>
        ))}
      </ul>
    )
  }
  if (typeof content === 'object') {
    return (
      <div className="space-y-1 text-body-sm text-ink-secondary">
        {Object.entries(content).map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <span className="text-ink-tertiary capitalize min-w-[120px]">{k.replace(/_/g, ' ')}:</span>
            <span className="flex-1">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
          </div>
        ))}
      </div>
    )
  }
  return <p className="text-body-sm text-ink-secondary">{String(content)}</p>
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 80, damping: 18 } },
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
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-4xl mx-auto px-4 sm:px-6 space-y-8 relative"
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <PageHeader
          eyebrow="Folio 12 · Onboarding report"
          title="Onboarding Report"
          subtitle="Generate a professional onboarding report for any repository."
          actions={
            result ? (
              <button onClick={handleDownload} disabled={downloading} className="btn-secondary flex items-center gap-2">
                {downloading ? <Spinner className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Download HTML
              </button>
            ) : undefined
          }
        />
      </motion.div>

      {/* Controls */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex items-center w-full md:flex-1">
          <GitBranch size={16} className="absolute left-3.5 text-ink-tertiary/40 pointer-events-none" />
          <input
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            placeholder="github.com/owner/repo"
            className="w-full bg-panel border border-seam text-ink text-body-sm rounded-input pl-9 pr-4 py-2.5 focus:outline-none focus:border-go/60 focus:ring-1 focus:ring-go/40 transition-colors placeholder:text-ink-tertiary/40"
          />
        </div>
        <div className="flex items-center gap-0.5 p-0.5 rounded-btn border border-seam bg-well/40 w-fit">
          {LEVELS.map((l) => (
            <button
              key={l.key}
              onClick={() => setUserLevel(l.key)}
              className={`px-3 py-1.5 rounded-[3px] text-caption font-medium transition-colors ${
                userLevel === l.key
                  ? 'bg-panel-raised text-ink'
                  : 'text-ink-tertiary hover:text-ink-secondary'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <button onClick={handleGenerate} disabled={loading || !repoUrl.trim()} className="btn shrink-0">
          <BookOpenText className="w-3.5 h-3.5" weight="fill" />
          {loading ? 'Generating…' : 'Generate'}
        </button>
      </motion.div>

      {error && (
        <motion.div variants={itemVariants} className="px-4 py-3 rounded-lg bg-abort/10 border border-abort/20 text-abort text-body-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={handleGenerate} disabled={loading} className="text-caption underline ml-4 text-abort/70 hover:text-abort">Retry</button>
        </motion.div>
      )}

      {loading && <motion.div variants={itemVariants}><ReportSkeleton /></motion.div>}

      {!loading && !result && (
        <motion.div variants={itemVariants}>
          <ConsolePanel rail="Start" designator="Awaiting input">
            <EmptyState
              icon={<FileText className="w-10 h-10 text-ink-tertiary/30" weight="duotone" />}
              title="Enter a GitHub repository above"
              description="We'll compile a repository overview, architecture, learning path, and good-first-issues into a report."
              action={
                <button
                  onClick={handleGenerate}
                  disabled={!repoUrl.trim()}
                  className="mt-2 px-5 py-2 rounded-btn text-caption border border-seam text-ink-muted hover:text-ink hover:bg-well transition-colors font-code disabled:opacity-40"
                >
                  Generate
                </button>
              }
            />
          </ConsolePanel>
        </motion.div>
      )}

      {!loading && result && (
        <motion.div variants={itemVariants} className="space-y-4">
          {result.report.map((section: ReportSection, i) => (
            <motion.div
              key={`${section.title}-${i}`}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: i * 0.04, type: 'spring', stiffness: 80, damping: 18 }}
            >
              <ConsolePanel rail={section.title}>
                {renderContent(section.content)}
              </ConsolePanel>
            </motion.div>
          ))}
        </motion.div>
      )}
    </motion.div>
  )
}
