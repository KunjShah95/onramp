import { useState } from 'react'
import { Link } from 'react-router-dom'
import ConsolePanel from '../ui/console-panel'
import { SkeletonBase } from '../ui/Skeleton'

import {
  runAutopilotAnalyze,
  type AutopilotAnalyzeResponse,
} from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { Play, Spinner, GitBranch, ArrowSquareOut, ArrowRight } from '@phosphor-icons/react'

const ROLE_LABELS: Record<string, string> = {
  intern: 'Intern',
  developer: 'Junior Dev',
  senior_dev: 'Senior',
}

const statusLabel = (state: string) => {
  const labels: Record<string, string> = {
    pending: 'Pending',
    cancelled: 'Cancelled',
    assigned: 'Assigned',
    in_progress: 'In progress',
    submitted: 'Submitted',
    under_review: 'Under review',
    needs_changes: 'Changes requested',
    product_review: 'Product review',
    approved: 'Approved',
    completed: 'Done',
  }
  return labels[state] || state
}

/**
 * Autopilot · Repo Pipeline — run the repo-autopilot pipeline from the
 * dashboard. Enter a repo URL, run analysis, and the discovered issues land
 * as real Onramp tasks assigned round-robin by role (intern → new_dev, junior
 * → developer, senior → senior_dev). The task list is clickable through to
 * the Tasks console; created tasks also feed the Mission Control readouts.
 */
export default function AutopilotPanel({ teamId }: { teamId?: string }) {
  const { activeTeamId } = useAuth()
  const [repoUrl, setRepoUrl] = useState('')
  const [branch, setBranch] = useState('main')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<AutopilotAnalyzeResponse | null>(null)

  const canRun = repoUrl.trim().length > 0 && !running

  async function handleRun() {
    if (!repoUrl.trim()) {
      setError('Enter a GitHub repository URL to analyze.')
      return
    }
    setRunning(true)
    setError('')
    setResult(null)
    try {
      const res = await runAutopilotAnalyze({
        repo_url: repoUrl.trim(),
        branch: branch.trim() || 'main',
        max_issues: 5,
        create_tasks: true,
        team_id: (teamId || activeTeamId || '').trim() || undefined,
      })
      setResult(res)
    } catch (err: any) {
      setError(err.message || 'Autopilot analysis failed.')
    } finally {
      setRunning(false)
    }
  }

  const tasks = result?.tasks ?? []
  const issues = result?.issues ?? []
  const designator = result
    ? `${tasks.length} TASK${tasks.length === 1 ? '' : 'S'} · ${issues.length} ISSUE${issues.length === 1 ? '' : 'S'}`
    : 'REPO → TASKS'

  return (
    <ConsolePanel
      rail="Autopilot · Repo Pipeline"
      designator={designator}
      status={running ? 'standby' : result ? (tasks.length ? 'go' : 'caution') : 'idle'}
      live={running}
      action={
        <Link
          to="/tasks"
          className="text-caption text-ink-secondary hover:text-ink transition-colors font-semibold flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-go/50 rounded"
        >
          Tasks <ArrowRight size={12} aria-hidden className="shrink-0" />
        </Link>
      }
    >
      {/* Run controls */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <label className="flex items-center gap-2 input flex-1 !py-2">
          <GitBranch size={14} className="text-ink-muted shrink-0" />
          <input
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canRun) handleRun() }}
            placeholder="https://github.com/owner/repo"
            className="flex-1 bg-transparent outline-none border-none p-0 text-body-xs font-code text-ink placeholder:text-ink-disabled"
          />
        </label>
        <label className="flex items-center gap-2 input !py-2 w-28 shrink-0">
          <input
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="main"
            className="flex-1 bg-transparent outline-none border-none p-0 text-body-xs font-code text-ink placeholder:text-ink-disabled"
          />
        </label>
        <button
          onClick={handleRun}
          disabled={!canRun}
          className="btn !py-2 shrink-0 disabled:opacity-40"
        >
          {running ? <Spinner size={14} className="animate-spin" /> : <Play size={14} weight="fill" />}
          {running ? 'Analyzing' : 'Run Pipeline'}
        </button>
      </div>

      {error && (
        <div className="text-abort text-body-sm font-code mb-3">{error}</div>
      )}

      {/* Empty state */}
      {!result && !running && !error && (
        <p className="text-caption text-ink-muted font-code">
          Analyze a repo → issues are discovered by the model router and created as real
          Onramp tasks, auto-assigned by role.
        </p>
      )}

      {running && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" role="status" aria-label="Analyzing repository">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBase key={i} className="h-14 rounded-tile" />
          ))}
        </div>
      )}

      {/* Created tasks */}
      {result && !running && (
        <div className="space-y-4">
          {tasks.length === 0 ? (
            <p className="text-caption text-ink-muted font-code">
              Analysis complete · no tasks created
              {issues.length ? ' (task creation may have been skipped or disabled)' : ''}.
            </p>
          ) : (
            <div className="divide-y divide-seam -mx-5">
              {tasks.map((t) => (
                <Link
                  key={t.task_id}
                  to="/tasks"
                  className="flex items-center gap-3 px-5 py-2.5 hover:bg-well/40 transition-colors"
                >
                  <span className="w-1 self-stretch rounded-sm shrink-0 bg-mission" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-body-sm text-ink font-medium truncate">{t.title}</span>
                      <span className="font-code text-caption text-ink-muted">{statusLabel(t.state)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-caption text-ink-muted">
                      <span className="font-code uppercase tracking-wide text-mission">
                        {ROLE_LABELS[t.team_role] || t.team_role}
                      </span>
                      <span>· {t.priority}</span>
                      {t.assigned_to && <span>· assigned</span>}
                    </div>
                  </div>
                  <ArrowSquareOut size={14} className="text-ink-muted shrink-0" />
                </Link>
              ))}
            </div>
          )}

          {/* Issues that didn't become tasks (e.g. duplicates) */}
          {issues.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="overline text-ink-muted/60 shrink-0">Discovered</span>
              <span className="text-caption text-ink-muted font-code truncate">
                {issues.map((i) => i.title).join(' · ')}
              </span>
            </div>
          )}
        </div>
      )}
    </ConsolePanel>
  )
}
