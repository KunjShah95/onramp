import { useState } from 'react'
import { cn } from '../lib/utils'
import { authHeaders } from '../lib/api'

interface PRDescriptionResult {
  title: string
  summary: string
  changes: { file: string; description: string }[]
  testing_notes: string
  checklist: string[]
  diff_stats?: {
    files_changed: number
    additions: number
    deletions: number
  }
}

export default function PRDescriptionPage() {
  const [repoUrl, setRepoUrl] = useState('')
  const [prNumber, setPrNumber] = useState('')
  const [prTitle, setPrTitle] = useState('')
  const [branch, setBranch] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PRDescriptionResult | null>(null)
  const [error, setError] = useState('')

  async function handleGenerate() {
    if (!repoUrl.trim() || !prNumber.trim()) return
    setLoading(true)
    setError('')
    setResult(null)
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
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`API error ${res.status}: ${text}`)
      }
      const data: PRDescriptionResult = await res.json()
      setResult(data)
    } catch (err: any) {
      setError(err.message || 'Failed to generate PR description.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    if (!result) return
    const text = [
      `## ${result.title}`,
      '',
      result.summary,
      '',
      '### Changes',
      ...result.changes.map((c) => `- **${c.file}**: ${c.description}`),
      '',
      '### Testing',
      result.testing_notes,
      '',
      '### Checklist',
      ...result.checklist.map((c) => `- [ ] ${c}`),
    ].join('\n')
    await navigator.clipboard.writeText(text)
  }

  return (
    <div className="animate-in w-full h-full min-h-[calc(100vh-4rem)] p-8 font-mono text-[#FDFBF8]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="font-display text-3xl font-bold mb-2">PR Description Generator</h1>
          <p className="text-[#FDFBF8]/60 text-[15px]">AI-powered PR descriptions from your diffs.</p>
        </div>
      </div>

      {/* Input form */}
      <div className="bg-[#1A110D] border border-[#FDFBF8]/5 rounded-xl p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-[11px] tracking-widest font-semibold text-[#FDFBF8]/40 mb-2 block">
              GITHUB REPO URL
            </label>
            <input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              className="w-full bg-[#0D0906] border border-[#FDFBF8]/10 rounded-lg px-4 py-3 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/30 outline-none focus:border-[#FF8C00]/50 transition-colors"
            />
          </div>
          <div>
            <label className="text-[11px] tracking-widest font-semibold text-[#FDFBF8]/40 mb-2 block">
              PR NUMBER
            </label>
            <input
              type="number"
              value={prNumber}
              onChange={(e) => setPrNumber(e.target.value)}
              placeholder="42"
              className="w-full bg-[#0D0906] border border-[#FDFBF8]/10 rounded-lg px-4 py-3 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/30 outline-none focus:border-[#FF8C00]/50 transition-colors"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-[11px] tracking-widest font-semibold text-[#FDFBF8]/40 mb-2 block">
              PR TITLE <span className="text-[#FDFBF8]/20">(optional)</span>
            </label>
            <input
              value={prTitle}
              onChange={(e) => setPrTitle(e.target.value)}
              placeholder="feat: add user authentication"
              className="w-full bg-[#0D0906] border border-[#FDFBF8]/10 rounded-lg px-4 py-3 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/30 outline-none focus:border-[#FF8C00]/50 transition-colors"
            />
          </div>
          <div>
            <label className="text-[11px] tracking-widest font-semibold text-[#FDFBF8]/40 mb-2 block">
              BRANCH <span className="text-[#FDFBF8]/20">(optional)</span>
            </label>
            <input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="feature/auth-flow"
              className="w-full bg-[#0D0906] border border-[#FDFBF8]/10 rounded-lg px-4 py-3 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/30 outline-none focus:border-[#FF8C00]/50 transition-colors"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleGenerate}
            disabled={loading || !repoUrl.trim() || !prNumber.trim()}
            className={cn(
              'px-6 py-2.5 rounded-lg text-sm font-medium transition-all border',
              loading
                ? 'bg-[#FDFBF8]/5 border-[#FDFBF8]/10 text-[#FDFBF8]/40'
                : 'bg-[#FF8C00] border-[#FF8C00]/50 text-[#3D1C00] hover:bg-[#FFB347] shadow-[0_0_20px_rgba(255,140,0,0.15)]'
            )}
          >
            {loading ? 'Generating…' : 'Generate Description'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-900/20 border border-red-500/50 text-red-400 font-mono text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="bg-[#1A110D] border border-[#FDFBF8]/5 rounded-xl overflow-hidden">
          {/* Diff stats bar */}
          {result.diff_stats && (
            <div className="flex gap-4 px-6 py-3 bg-[#0D0906] border-b border-[#FDFBF8]/5 text-[11px]">
              <span className="text-[#FDFBF8]/50">
                Files: <strong className="text-[#FDFBF8]">{result.diff_stats.files_changed}</strong>
              </span>
              <span className="text-green-400">
                +{result.diff_stats.additions}
              </span>
              <span className="text-red-400">
                -{result.diff_stats.deletions}
              </span>
            </div>
          )}

          <div className="p-6 space-y-6">
            {/* Title */}
            <div>
              <div className="text-[11px] tracking-widest font-semibold text-[#FDFBF8]/40 mb-2">TITLE</div>
              <h2 className="text-xl font-display text-[#FF8C00]">{result.title}</h2>
            </div>

            {/* Summary */}
            <div>
              <div className="text-[11px] tracking-widest font-semibold text-[#FDFBF8]/40 mb-2">SUMMARY</div>
              <p className="text-sm text-[#FDFBF8]/80 leading-relaxed">{result.summary}</p>
            </div>

            {/* Changes */}
            {result.changes.length > 0 && (
              <div>
                <div className="text-[11px] tracking-widest font-semibold text-[#FDFBF8]/40 mb-3">CHANGES</div>
                <div className="space-y-2">
                  {result.changes.map((change, i) => (
                    <div key={i} className="bg-[#0D0906] border border-[#FDFBF8]/5 rounded-lg p-3">
                      <div className="text-xs font-semibold text-[#4DA8DA] mb-1">{change.file}</div>
                      <div className="text-xs text-[#FDFBF8]/60">{change.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Testing notes */}
            <div>
              <div className="text-[11px] tracking-widest font-semibold text-[#FDFBF8]/40 mb-2">TESTING NOTES</div>
              <p className="text-sm text-[#FDFBF8]/70 leading-relaxed">{result.testing_notes}</p>
            </div>

            {/* Checklist */}
            <div>
              <div className="text-[11px] tracking-widest font-semibold text-[#FDFBF8]/40 mb-2">CHECKLIST</div>
              <div className="space-y-1">
                {result.checklist.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-[#FDFBF8]/70">
                    <span className="w-4 h-4 rounded border border-[#FDFBF8]/20 flex items-center justify-center shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            {/* Copy button */}
            <div className="flex justify-end pt-2 border-t border-[#FDFBF8]/5">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-[#FDFBF8]/50 hover:text-[#FDFBF8] hover:bg-[#FDFBF8]/5 transition-all"
              >
                <span className="material-symbols-outlined text-[13px]">content_copy</span>
                Copy to clipboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
