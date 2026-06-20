import { useState } from 'react'
import { cn } from '../lib/utils'
import { authHeaders } from '../lib/api'
import { PageHeader } from '../components/ui/page-header'
import { EmptyState } from '../components/ui/empty-state'
import { SectionLabel } from '../components/ui/section-label'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import PageTransition from '../components/ui/page-transition'

interface PRDescriptionResult {
  title: string
  summary: string
  changes: { file: string; description: string }[]
  testing_notes: string
  checklist: string[]
  diff_stats?: { files_changed: number; additions: number; deletions: number }
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] uppercase tracking-widest text-[#FDFBF8]/30 font-semibold mb-1.5 block">{children}</label>
}

function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input className={cn(
      'w-full bg-[#0D0906] border border-[#FDFBF8]/8 rounded-lg px-4 py-2.5 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/25 outline-none focus:border-[#FF8C00]/40 transition-colors',
      className
    )} {...props} />
  )
}

export default function PRDescriptionPage() {
  const [repoUrl, setRepoUrl] = useState('')
  const [prNumber, setPrNumber] = useState('')
  const [prTitle, setPrTitle] = useState('')
  const [branch, setBranch] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PRDescriptionResult | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function handleGenerate() {
    if (!repoUrl.trim() || !prNumber.trim()) return
    setLoading(true); setError(''); setResult(null)
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'}/pr-review/describe`,
        {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            repo_url: repoUrl.trim(),
            pr_number: parseInt(prNumber.trim(), 10),
            title: prTitle.trim(),
            branch: branch.trim(),
          }),
        }
      )
      if (!res.ok) { const text = await res.text(); throw new Error(`API error ${res.status}: ${text}`) }
      setResult(await res.json())
    } catch (err: any) {
      setError(err.message || 'Failed to generate PR description.')
    } finally { setLoading(false) }
  }

  async function handleCopy() {
    if (!result) return
    const text = [
      `## ${result.title}`, '',
      result.summary, '',
      '### Changes',
      ...result.changes.map((c) => `- **${c.file}**: ${c.description}`), '',
      '### Testing', result.testing_notes, '',
      '### Checklist',
      ...result.checklist.map((c) => `- [ ] ${c}`),
    ].join('\n')
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <PageTransition>
    <div className="w-full min-h-[calc(100vh-4rem)] p-4 sm:p-6 font-body text-[#FDFBF8] max-w-full overflow-x-hidden">
      <PageHeader
        title="PR Description Generator"
        subtitle="AI-powered descriptions from GitHub diffs — title, summary, file changes, testing notes, checklist"
      />

      {/* Input form */}
      <CardSpotlight className="p-6 mb-6">
        <GradientHeading as="h2" className="text-sm mb-4">Repository Details</GradientHeading>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <FieldLabel>GitHub Repo URL</FieldLabel>
            <Input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repo" />
          </div>
          <div>
            <FieldLabel>PR Number</FieldLabel>
            <Input type="number" value={prNumber} onChange={(e) => setPrNumber(e.target.value)}
              placeholder="42" />
          </div>
          <div>
            <FieldLabel>PR Title <span className="text-[#FDFBF8]/20 normal-case font-normal">(optional)</span></FieldLabel>
            <Input value={prTitle} onChange={(e) => setPrTitle(e.target.value)}
              placeholder="feat: add user authentication" />
          </div>
          <div>
            <FieldLabel>Branch <span className="text-[#FDFBF8]/20 normal-case font-normal">(optional)</span></FieldLabel>
            <Input value={branch} onChange={(e) => setBranch(e.target.value)}
              placeholder="feature/auth-flow" />
          </div>
        </div>
        <div className="flex justify-end">
          <button onClick={handleGenerate} disabled={loading || !repoUrl.trim() || !prNumber.trim()}
            className={cn(
              'flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all',
              loading
                ? 'bg-[#FDFBF8]/5 text-[#FDFBF8]/30 cursor-not-allowed'
                : 'bg-[#FF8C00] text-[#3D1C00] hover:bg-[#FFB347] shadow-[0_0_16px_rgba(255,140,0,0.2)] disabled:opacity-40'
            )}>
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generating…
              </>
            ) : 'Generate Description'}
          </button>
        </div>
      </CardSpotlight>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-500/8 border border-red-500/20 text-red-400 text-sm">{error}</div>
      )}

      {!result && !loading && !error && (
        <CardSpotlight>
          <EmptyState
            title="Enter a repo URL and PR number above"
            description="CodeFlow will analyze the diff and generate a complete PR description"
            icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" /></svg>}
          />
        </CardSpotlight>
      )}

      {result && (
        <CardSpotlight className="overflow-hidden">
          {/* Diff stats bar */}
          {result.diff_stats && (
            <div className="flex items-center gap-6 px-6 py-3 bg-[#0D0906] border-b border-[#FDFBF8]/5">
              <div className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-[#FDFBF8]/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <span className="text-[11px] text-[#FDFBF8]/40">{result.diff_stats.files_changed} files</span>
              </div>
              <span className="text-[11px] text-green-400 font-mono">+{result.diff_stats.additions}</span>
              <span className="text-[11px] text-red-400 font-mono">−{result.diff_stats.deletions}</span>
            </div>
          )}

          <div className="p-6 space-y-6">
            {/* Title */}
            <div>
              <SectionLabel>Title</SectionLabel>
              <h2 className="font-display text-xl font-bold text-[#FF8C00] leading-snug">{result.title}</h2>
            </div>

            {/* Summary */}
            <div>
              <SectionLabel>Summary</SectionLabel>
              <p className="text-sm text-[#FDFBF8]/70 leading-relaxed">{result.summary}</p>
            </div>

            {/* Changes */}
            {result.changes.length > 0 && (
              <div>
                <SectionLabel>File Changes <span className="ml-1 text-[#FDFBF8]/20 font-mono">{result.changes.length}</span></SectionLabel>
                <div className="space-y-2">
                  {result.changes.map((change, i) => (
                    <div key={i} className="bg-[#0D0906] border border-[#FDFBF8]/5 rounded-lg p-3 hover:border-[#FDFBF8]/10 transition-colors">
                      <div className="font-mono text-[11px] text-[#4DA8DA] mb-1.5">{change.file}</div>
                      <div className="text-xs text-[#FDFBF8]/55 leading-relaxed">{change.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Testing notes */}
            <div>
              <SectionLabel>Testing Notes</SectionLabel>
              <p className="text-sm text-[#FDFBF8]/65 leading-relaxed">{result.testing_notes}</p>
            </div>

            {/* Checklist */}
            {result.checklist.length > 0 && (
              <div>
                <SectionLabel>Checklist</SectionLabel>
                <div className="space-y-2">
                  {result.checklist.map((item, i) => (
                    <div key={i} className="flex items-start gap-3 text-sm text-[#FDFBF8]/65">
                      <span className="w-4 h-4 rounded border border-[#FDFBF8]/15 flex items-center justify-center shrink-0 mt-0.5" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Copy button */}
            <div className="flex justify-end pt-2 border-t border-[#FDFBF8]/5">
              <button onClick={handleCopy}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all border',
                  copied
                    ? 'bg-green-500/10 text-green-400 border-green-500/20'
                    : 'text-[#FDFBF8]/45 hover:text-[#FDFBF8] hover:bg-[#FDFBF8]/5 border-[#FDFBF8]/8'
                )}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  {copied ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                  )}
                </svg>
                {copied ? 'Copied!' : 'Copy as Markdown'}
              </button>
            </div>
          </div>
        </CardSpotlight>
      )}
    </div>
    </PageTransition>
  )
}
