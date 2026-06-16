import { useState } from 'react'
import {
  findIssues,
  generateGuide,
  fetchPairWalkthrough,
  fetchTestChecklist,
} from '../lib/api'
import type { ScoredIssue, IssueGuide } from '../lib/types'
import IssueCard from '../components/IssueCard'
import { IssueListSkeleton, GuideSkeleton } from '../components/ui/Skeleton'
import { cn } from '../lib/utils'

const LEVELS = ['junior', 'mid', 'senior']

export default function FirstIssuePage() {
  const [repoUrl, setRepoUrl] = useState('')
  const [userLevel, setUserLevel] = useState('junior')
  const [loading, setLoading] = useState(false)
  const [issues, setIssues] = useState<ScoredIssue[]>([])
  const [error, setError] = useState('')
  const [guide, setGuide] = useState<IssueGuide | null>(null)
  const [guideLoading, setGuideLoading] = useState(false)

  // Unique differentiator states
  const [selectedIssue, setSelectedIssue] = useState<ScoredIssue | null>(null)
  const [activeTab, setActiveTab] = useState<'guide' | 'pair' | 'test'>('guide')
  const [pairData, setPairData] = useState<any | null>(null)
  const [pairLoading, setPairLoading] = useState(false)
  const [testData, setTestData] = useState<any | null>(null)
  const [testLoading, setTestLoading] = useState(false)

  async function handleFindIssues() {
    if (!repoUrl.trim()) return
    setLoading(true)
    setError('')
    setIssues([])
    setGuide(null)
    setSelectedIssue(null)
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
    setSelectedIssue(issue)
    setPairData(null)
    setTestData(null)
    setActiveTab('guide')
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

  async function handleFetchPair(issue: ScoredIssue) {
    setPairLoading(true)
    setError('')
    try {
      const repoStructure = {
        files: issues.map((i) => ({ path: i.title })),
        issues: issues.map((i) => ({
          id: i.id,
          title: i.title,
          body: i.body,
        })),
      }
      const data = await fetchPairWalkthrough(
        issue.title,
        issue.body || '',
        repoStructure
      )
      setPairData(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch pair programming session')
    }
    setPairLoading(false)
  }

  async function handleFetchTestChecklist(issue: ScoredIssue) {
    setTestLoading(true)
    setError('')
    try {
      const mockDiff = `diff --git a/src/main.py b/src/main.py
index 1234567..89abcde 100644
--- a/src/main.py
+++ b/src/main.py
@@ -1,5 +1,6 @@
 def process():
-    # old behavior
+    # fix for ${issue.title}
+    pass`

      const repoStructure = {
        files: issues.map((i) => ({ path: i.title })),
        issues: issues.map((i) => ({
          id: i.id,
          title: i.title,
          body: i.body,
        })),
      }
      const data = await fetchTestChecklist(mockDiff, repoStructure)
      setTestData(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch test checklist')
    }
    setTestLoading(false)
  }

  return (
    <div className="animate-in max-w-4xl pb-12">
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

      {guide && selectedIssue && (
        <div className="card space-y-6">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h2 className="font-display text-base font-semibold text-text-primary">{guide.title}</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('guide')}
                className={cn(
                  'px-3 py-1.5 rounded-btn text-xs font-semibold transition-all duration-200',
                  activeTab === 'guide' ? 'bg-accent-from text-white shadow-card' : 'bg-bg-secondary text-text-secondary'
                )}
              >
                Guide
              </button>
              <button
                onClick={() => {
                  setActiveTab('pair')
                  if (!pairData) handleFetchPair(selectedIssue)
                }}
                className={cn(
                  'px-3 py-1.5 rounded-btn text-xs font-semibold transition-all duration-200',
                  activeTab === 'pair' ? 'bg-accent-via text-white shadow-card' : 'bg-bg-secondary text-text-secondary'
                )}
              >
                Pair Programming
              </button>
              <button
                onClick={() => {
                  setActiveTab('test')
                  if (!testData) handleFetchTestChecklist(selectedIssue)
                }}
                className={cn(
                  'px-3 py-1.5 rounded-btn text-xs font-semibold transition-all duration-200',
                  activeTab === 'test' ? 'bg-accent-to text-white shadow-card' : 'bg-bg-secondary text-text-secondary'
                )}
              >
                Test Checklist
              </button>
            </div>
          </div>

          {activeTab === 'guide' && (
            <div className="space-y-4">
              {guide.files_to_touch.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wider">Files to modify:</h3>
                  <div className="flex flex-wrap gap-2">
                    {guide.files_to_touch.map((f) => (
                      <span key={f} className="text-[10px] bg-bg-secondary border border-border text-text-secondary px-2.5 py-1 rounded font-code">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wider">Step-by-step guide:</h3>
                <ol className="space-y-2">
                  {guide.steps.map((step, i) => (
                    <li key={i} className="text-sm text-text-secondary flex items-start gap-2 leading-relaxed">
                      <span className="text-accent-from font-medium shrink-0 font-mono">{i + 1}.</span>
                      <span>{step.replace(/^\d+\.\s*/, '')}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          {activeTab === 'pair' && (
            <div className="space-y-4">
              {pairLoading ? (
                <div className="flex flex-col items-center py-8 space-y-2">
                  <div className="loader"></div>
                  <p className="text-xs text-text-muted">Narrating thought process and drafting changes...</p>
                </div>
              ) : pairData ? (
                <div className="space-y-5 text-sm">
                  <div className="bg-bg-secondary p-4 rounded-card border border-border/40">
                    <span className="text-[10px] text-accent-via font-mono uppercase tracking-wider block mb-1.5 font-bold">Thought Process (Senior Dev)</span>
                    <p className="text-text-secondary leading-relaxed text-xs italic">"{pairData.thought_process}"</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-bg-secondary/40 p-4 rounded-card border border-border/30">
                      <h4 className="font-semibold text-text-primary text-xs uppercase tracking-wider mb-2">Key Insights</h4>
                      <ul className="list-disc pl-4 space-y-1 text-xs text-text-secondary">
                        {pairData.key_insights.map((insight: string, idx: number) => (
                          <li key={idx}>{insight}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="bg-bg-secondary/40 p-4 rounded-card border border-border/30">
                      <h4 className="font-semibold text-text-primary text-xs uppercase tracking-wider mb-2">Testing Approach</h4>
                      <p className="text-xs text-text-secondary leading-relaxed">{pairData.testing_approach}</p>
                    </div>
                  </div>

                  {pairData.solution_steps && (
                    <div>
                      <h4 className="font-semibold text-text-primary text-xs uppercase tracking-wider mb-2">Actionable steps</h4>
                      <ol className="list-decimal pl-4 space-y-1 text-xs text-text-secondary">
                        {pairData.solution_steps.map((step: string, idx: number) => (
                          <li key={idx}>{step}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {activeTab === 'test' && (
            <div className="space-y-4">
              {testLoading ? (
                <div className="flex flex-col items-center py-8 space-y-2">
                  <div className="loader"></div>
                  <p className="text-xs text-text-muted">Analyzing PR changes and generating tests...</p>
                </div>
              ) : testData ? (
                <div className="space-y-5 text-sm">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-bg-secondary/40 p-4 rounded-card border border-border/30">
                      <h4 className="font-semibold text-text-primary text-xs uppercase tracking-wider mb-2">Must Test</h4>
                      <ul className="list-disc pl-4 space-y-1 text-xs text-text-secondary">
                        {testData.must_test.map((item: string, idx: number) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="bg-bg-secondary/40 p-4 rounded-card border border-border/30">
                      <h4 className="font-semibold text-text-primary text-xs uppercase tracking-wider mb-2">Edge Cases</h4>
                      <ul className="list-disc pl-4 space-y-1 text-xs text-text-secondary">
                        {testData.edge_cases.map((item: string, idx: number) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {testData.test_code_template && (
                    <div>
                      <h4 className="font-semibold text-text-primary text-xs uppercase tracking-wider mb-2">Test Code Template</h4>
                      <pre className="bg-bg-secondary p-4 rounded-card border border-border/60 overflow-x-auto text-[11px] font-code text-accent-to leading-relaxed">
                        <code>{testData.test_code_template}</code>
                      </pre>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
