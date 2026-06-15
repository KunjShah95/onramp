import { useState } from 'react'
import { findIssues, generateGuide } from '../lib/api'
import type { ScoredIssue, IssueGuide } from '../lib/types'
import IssueCard from '../components/IssueCard'
import { IssueListSkeleton, GuideSkeleton } from '../components/ui/Skeleton'


const LEVELS = ['junior', 'mid', 'senior']

export default function FirstIssuePage() {
  const [repoUrl, setRepoUrl] = useState('')
  const [userLevel, setUserLevel] = useState('junior')
  const [loading, setLoading] = useState(false)
  const [issues, setIssues] = useState<ScoredIssue[]>([])
  const [error, setError] = useState('')
  const [guide, setGuide] = useState<IssueGuide | null>(null)
  const [guideLoading, setGuideLoading] = useState(false)

  async function handleFindIssues() {
    if (!repoUrl.trim()) return
    setLoading(true)
    setError('')
    setIssues([])
    setGuide(null)
    try {
      const data = await findIssues(repoUrl.trim(), userLevel)
      setIssues(data.issues)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch issues')
    }
    setLoading(false)
  }

  async function handleIssueSelect(issue: ScoredIssue) {
    setGuideLoading(true)
    setGuide(null)
    try {
      const repoStructure = {
        files: issues.map((i) => ({ path: i.title })),
        issues: issues.map((i) => ({
          id: i.id,
          title: i.title,
          body: i.body,
        })),
      }
      const data = await generateGuide(issue.id, repoStructure)
      setGuide(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate guide')
    }
    setGuideLoading(false)
  }

  return (
    <div className="animate-in max-w-4xl">
      <h1 className="font-display text-2xl font-bold text-text-primary mb-1">First PR Accelerator</h1>
      <p className="text-text-secondary text-sm mb-6">Find beginner-friendly issues and get step-by-step guides</p>

      <div className="flex gap-3 mb-6">
        <input
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="https://github.com/facebook/react"
          className="input flex-1"
          onKeyDown={(e) => e.key === 'Enter' && handleFindIssues()}
        />
        <select
          value={userLevel}
          onChange={(e) => setUserLevel(e.target.value)}
          className="input w-auto"
        >
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l.charAt(0).toUpperCase() + l.slice(1)}
            </option>
          ))}
        </select>
        <button
          onClick={handleFindIssues}
          disabled={loading || !repoUrl.trim()}
          className="btn whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Searching...' : 'Find Issues'}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 text-red-400 rounded-card p-4 mb-6 text-sm border border-red-500/20">{error}</div>
      )}

      {loading && <IssueListSkeleton count={4} />}

      {issues.length > 0 && (
        <div className="space-y-3 mb-8">
          <h2 className="font-display text-base font-semibold text-text-secondary">
            Found {issues.length} issues
          </h2>
          {issues.map((issue) => (
            <IssueCard key={issue.id} issue={issue} onSelect={handleIssueSelect} />
          ))}
        </div>
      )}

      {guideLoading && <div className="mt-6"><GuideSkeleton /></div>}

      {guide && (
        <div className="card">
          <h2 className="font-display text-base font-semibold text-text-primary mb-4">{guide.title}</h2>

          {guide.files_to_touch.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-text-secondary mb-2">Files to modify:</h3>
              <div className="flex flex-wrap gap-2">
                {guide.files_to_touch.map((f) => (
                  <span key={f} className="text-xs bg-bg-elevated text-text-secondary px-2 py-1 rounded">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-medium text-text-secondary mb-2">Step-by-step guide:</h3>
            <ol className="space-y-2">
              {guide.steps.map((step, i) => (
                <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
                  <span className="text-accent-from font-medium shrink-0">{i + 1}.</span>
                  <span>{step.replace(/^\d+\.\s*/, '')}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}
