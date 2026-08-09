/*
 * ─── DIRECTION CONTRACT · ONRAMP MISSION CONTROL ────────────────────────────
 * THESIS: The autonomous-coding seat is a flight engineer's IDE console — an
 *   editor cockpit (activity rail · explorer · line-numbered brief editor ·
 *   agent terminal · status bar) that drives the one-shot agent run. VSCode
 *   ergonomics, rendered in the daylit ops room, not a dark neon clone.
 * OWN-WORLD: Seated panels, hairline seams, JetBrains Mono telemetry, signal-
 *   only colour (GO / mission / caution / abort). Radii <=4px.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Robot, GithubLogo, GitBranch, GitPullRequest, FileCode, Play,
  Check, X, Warning, Spinner, TreeStructure, ClockCounterClockwise,
  ArrowSquareOut, CaretDown, DotsThreeVertical,
} from '@phosphor-icons/react'
import { cn } from '../lib/utils'
import { useToast } from '../context/ToastContext'
import { executeAutonomousCoding, type AutonomousCodingResult } from '../lib/api'

type StageState = 'pending' | 'active' | 'done' | 'failed'
const STAGES = ['Clone workspace', 'Analyse codebase', 'Generate patches', 'Open pull request'] as const

interface RunRecord {
  id: string
  repo: string
  issue: string
  result: AutonomousCodingResult
  at: number
}

function shortRepo(url: string) {
  return url.replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\.git$/, '') || 'no repository'
}

export default function AutonomousCodingPage() {
  const [repoUrl, setRepoUrl] = useState('')
  const [baseBranch, setBaseBranch] = useState('main')
  const [issue, setIssue] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<AutonomousCodingResult | null>(null)
  const [error, setError] = useState('')
  const [stage, setStage] = useState(-1)
  const [panel, setPanel] = useState<'explorer' | 'runs'>('explorer')
  const [termOpen, setTermOpen] = useState(true)
  const [runs, setRuns] = useState<RunRecord[]>([])

  const toast = useToast()
  const gutterRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const stageTimer = useRef<number | undefined>(undefined)

  // Keep the gutter scroll locked to the editor.
  const onEditorScroll = () => {
    if (gutterRef.current && taRef.current) gutterRef.current.scrollTop = taRef.current.scrollTop
  }

  useEffect(() => () => { if (stageTimer.current) window.clearInterval(stageTimer.current) }, [])

  const lineCount = Math.max(issue.split('\n').length, 24)
  const canRun = repoUrl.trim() && issue.trim() && !running

  async function handleRun() {
    if (!repoUrl.trim() || !issue.trim()) {
      setError('A repository URL and a brief are required.')
      setTermOpen(true)
      return
    }
    setRunning(true); setError(''); setResult(null); setStage(0); setTermOpen(true)

    // Advance the stage stepper through 0→2 as a progress affordance; the final
    // "Open pull request" stage holds until the real request resolves.
    stageTimer.current = window.setInterval(() => {
      setStage((s) => (s < 2 ? s + 1 : s))
    }, 1400)

    try {
      const res = await executeAutonomousCoding(repoUrl.trim(), issue.trim(), baseBranch)
      if (stageTimer.current) window.clearInterval(stageTimer.current)
      setStage(res.success ? 4 : -2)
      setResult(res)
      setRuns((r) => [{ id: crypto.randomUUID(), repo: shortRepo(repoUrl), issue, result: res, at: Date.now() }, ...r].slice(0, 12))
      if (res.success) toast.success('PR created', `PR #${res.pr_number} on ${shortRepo(repoUrl)}`)
      else toast.error('Agent run failed', res.error || 'Could not generate changes.')
    } catch (err: any) {
      if (stageTimer.current) window.clearInterval(stageTimer.current)
      setStage(-2)
      setError(err.message || 'Failed to execute the coding agent.')
      toast.error('Execution failed', err.message)
    } finally {
      setRunning(false)
    }
  }

  function stageStatus(i: number): StageState {
    if (stage === -2) return i === 0 ? 'failed' : 'pending' // failed early
    if (stage === 4) return 'done'
    if (i < stage) return 'done'
    if (i === stage) return 'active'
    return 'pending'
  }

  return (
    <div className="-m-6 h-[calc(100dvh-3rem)] flex flex-col bg-room text-ink overflow-hidden select-none">
      <div className="flex-1 flex min-h-0">
        {/* ── Activity rail ── */}
        <nav className="w-12 shrink-0 bg-base border-r border-seam flex flex-col items-center py-2 gap-1" aria-label="Activity">
          {[
            { key: 'explorer' as const, Icon: TreeStructure, label: 'Explorer' },
            { key: 'runs' as const, Icon: ClockCounterClockwise, label: 'Run history' },
          ].map(({ key, Icon, label }) => (
            <button
              key={key}
              onClick={() => setPanel(key)}
              title={label}
              aria-label={label}
              aria-pressed={panel === key}
              className={cn(
                'relative w-10 h-10 rounded-tile flex items-center justify-center transition-colors',
                panel === key ? 'text-ink' : 'text-ink-muted hover:text-ink-secondary',
              )}
            >
              {panel === key && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-go" />}
              <Icon size={20} weight={panel === key ? 'fill' : 'regular'} />
            </button>
          ))}
          <div className="mt-auto w-8 h-8 rounded-tile bg-go flex items-center justify-center shadow-lit" title="Auto-Coding agent">
            <Robot size={16} weight="fill" className="text-panel-raised" />
          </div>
        </nav>

        {/* ── Side panel ── */}
        <aside className="w-64 shrink-0 bg-panel border-r border-seam flex flex-col min-h-0">
          <div className="console-rail justify-between">
            <span className="callsign opacity-60">{panel === 'explorer' ? 'Explorer' : 'Run History'}</span>
            <DotsThreeVertical size={14} className="text-ink-muted" />
          </div>

          {panel === 'explorer' ? (
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {/* Workspace config */}
              <div className="space-y-2">
                <span className="overline text-ink-muted/70">Workspace</span>
                <label className="flex items-center gap-2 input !py-2">
                  <GithubLogo size={14} className="text-ink-muted shrink-0" />
                  <input
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="owner/repo URL"
                    className="flex-1 bg-transparent outline-none border-none p-0 text-body-xs font-code text-ink placeholder:text-ink-disabled"
                  />
                </label>
                <label className="flex items-center gap-2 input !py-2">
                  <GitBranch size={14} className="text-ink-muted shrink-0" />
                  <input
                    value={baseBranch}
                    onChange={(e) => setBaseBranch(e.target.value)}
                    placeholder="main"
                    className="flex-1 bg-transparent outline-none border-none p-0 text-body-xs font-code text-ink placeholder:text-ink-disabled"
                  />
                </label>
              </div>

              {/* Open editors */}
              <div className="space-y-1">
                <span className="overline text-ink-muted/70">Open Editors</span>
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-tile bg-well border border-go/30 text-ink">
                  <FileCode size={14} weight="fill" className="text-go" />
                  <span className="text-body-xs font-code">ISSUE.md</span>
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-go" />
                </div>
              </div>

              {/* Changes (after a successful run) */}
              {result?.success && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
                  <span className="overline text-ink-muted/70">Changes · PR #{result.pr_number}</span>
                  <div className="px-2 py-1.5 rounded-tile bg-well border border-seam space-y-1">
                    <div className="flex items-center justify-between text-body-xs font-code">
                      <span className="text-ink-secondary">files changed</span>
                      <span className="readout text-go">{result.files_changed ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between text-body-xs font-code">
                      <span className="text-ink-secondary">patches applied</span>
                      <span className="readout text-go">{result.patches_applied ?? 0}</span>
                    </div>
                    {!!result.patches_failed && (
                      <div className="flex items-center justify-between text-body-xs font-code">
                        <span className="text-ink-secondary">patches failed</span>
                        <span className="readout text-caution">{result.patches_failed}</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {runs.length === 0 ? (
                <p className="text-caption text-ink-muted p-3 text-center">No agent runs yet this session.</p>
              ) : (
                runs.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => { setResult(r.result); setIssue(r.issue) }}
                    className="w-full text-left px-2 py-2 rounded-tile hover:bg-well border border-transparent hover:border-seam transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', r.result.success ? 'bg-go' : 'bg-abort')} />
                      <span className="text-body-xs font-code text-ink truncate">{r.repo}</span>
                    </div>
                    <p className="text-caption text-ink-muted truncate mt-0.5 pl-3.5">{r.issue}</p>
                  </button>
                ))
              )}
            </div>
          )}
        </aside>

        {/* ── Editor group ── */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-panel-raised">
          {/* Tab strip */}
          <div className="flex items-stretch h-9 bg-panel border-b border-seam shrink-0">
            <div className="flex items-center gap-2 px-3 bg-panel-raised border-r border-seam">
              <FileCode size={14} weight="fill" className="text-go" />
              <span className="text-body-xs font-code text-ink">ISSUE.md</span>
              <span className={cn('w-1.5 h-1.5 rounded-full ml-1', issue.trim() ? 'bg-ink-disabled' : 'bg-transparent')} />
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-2 pr-3">
              <kbd className="hidden sm:inline text-caption font-code text-ink-muted bg-well border border-seam rounded-tile px-1.5 py-0.5">Ctrl ↵</kbd>
              <button
                onClick={handleRun}
                disabled={!canRun}
                className="btn !py-1.5 !px-3 my-1.5 disabled:opacity-40"
              >
                {running ? <Spinner size={14} className="animate-spin" /> : <Play size={14} weight="fill" />}
                {running ? 'Running' : 'Run Agent'}
              </button>
            </div>
          </div>

          {/* Editor body: gutter + textarea */}
          <div className="flex-1 flex min-h-0">
            <div
              ref={gutterRef}
              aria-hidden
              className="shrink-0 overflow-hidden bg-well border-r border-seam text-right py-3 select-none"
              style={{ width: 52 }}
            >
              {Array.from({ length: lineCount }).map((_, i) => (
                <div key={i} className="px-3 leading-6 text-[13px] font-code text-ink-disabled tabular-nums">{i + 1}</div>
              ))}
            </div>
            <textarea
              ref={taRef}
              value={issue}
              onChange={(e) => setIssue(e.target.value)}
              onScroll={onEditorScroll}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleRun() } }}
              spellCheck={false}
              placeholder={'# Describe the issue or feature\n\nExpected behaviour, edge cases, relevant files or functions.\nThe agent implements it against the workspace and opens a PR.\n\nPress Ctrl+Enter to launch the run.'}
              className="flex-1 resize-none bg-panel-raised outline-none border-none py-3 px-4 leading-6 text-[13px] font-code text-ink placeholder:text-ink-disabled selection:bg-go/20"
            />
          </div>

          {/* ── Terminal / agent panel ── */}
          <div className={cn('border-t border-seam bg-panel shrink-0 flex flex-col', termOpen ? 'h-56' : 'h-9')}>
            <div className="console-rail justify-between cursor-pointer" onClick={() => setTermOpen((o) => !o)}>
              <div className="flex items-center gap-3">
                <span className="callsign opacity-60">Agent Output</span>
                <span className="designator">TERMINAL</span>
              </div>
              <CaretDown size={14} className={cn('text-ink-muted transition-transform', termOpen ? '' : 'rotate-180')} />
            </div>

            {termOpen && (
              <div className="flex-1 overflow-y-auto p-3 font-code text-body-xs">
                {/* Stage stepper */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-3">
                  {STAGES.map((label, i) => {
                    const st = stageStatus(i)
                    return (
                      <div key={label} className="flex items-center gap-2">
                        <span className={cn(
                          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-tile border',
                          st === 'done' && 'border-go/30 text-go bg-go/5',
                          st === 'active' && 'border-mission/40 text-mission bg-mission/5',
                          st === 'failed' && 'border-abort/40 text-abort bg-abort/5',
                          st === 'pending' && 'border-seam text-ink-disabled',
                        )}>
                          {st === 'done' && <Check size={11} weight="bold" />}
                          {st === 'active' && <Spinner size={11} className="animate-spin" />}
                          {st === 'failed' && <X size={11} weight="bold" />}
                          {st === 'pending' && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50" />}
                          {label}
                        </span>
                        {i < STAGES.length - 1 && <span className="text-ink-disabled">›</span>}
                      </div>
                    )
                  })}
                </div>

                {/* Log lines */}
                <div className="space-y-1">
                  <LogLine prompt>agent run --repo {repoUrl ? shortRepo(repoUrl) : '<repo>'} --base {baseBranch}</LogLine>
                  {error && <LogLine tone="abort"><Warning size={12} weight="fill" className="inline mb-0.5 mr-1" />{error}</LogLine>}
                  {running && <LogLine tone="mission">agent working… {STAGES[Math.min(stage, 3)] ?? ''}</LogLine>}

                  {result && (result.success ? (
                    <>
                      <LogLine tone="go"><Check size={12} weight="bold" className="inline mb-0.5 mr-1" />Pull request #{result.pr_number} opened{result.branch ? ` on ${result.branch}` : ''}.</LogLine>
                      <LogLine>{result.summary || 'Changes applied.'}</LogLine>
                      <LogLine>{result.files_changed ?? 0} files changed · {result.patches_applied ?? 0} patches applied{result.patches_failed ? ` · ${result.patches_failed} failed` : ''}.</LogLine>
                      {result.pr_url && (
                        <a href={result.pr_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 mt-1 text-mission hover:text-mission-lit">
                          <GitPullRequest size={12} weight="fill" /> View pull request <ArrowSquareOut size={11} />
                        </a>
                      )}
                    </>
                  ) : (
                    <LogLine tone="abort"><X size={12} weight="bold" className="inline mb-0.5 mr-1" />{result.error || 'Agent could not generate changes.'}</LogLine>
                  ))}

                  {!running && !result && !error && (
                    <LogLine tone="muted">Idle. Write a brief and Run Agent to launch.</LogLine>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Status bar ── */}
      <footer className="h-6 shrink-0 bg-go text-panel-raised flex items-center justify-between px-3 text-[11px] font-code">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><GitBranch size={12} weight="bold" /> {baseBranch || 'main'}</span>
          <span className="flex items-center gap-1 opacity-90"><GithubLogo size={12} /> {shortRepo(repoUrl)}</span>
        </div>
        <div className="flex items-center gap-3">
          <AnimatePresence mode="wait">
            <motion.span
              key={running ? 'run' : result ? (result.success ? 'go' : 'abort') : 'idle'}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center gap-1 uppercase tracking-wide"
            >
              {running ? <><Spinner size={11} className="animate-spin" /> Running</>
                : result?.success ? <><Check size={11} weight="bold" /> PR #{result.pr_number}</>
                : result ? <><X size={11} weight="bold" /> Failed</>
                : <>Ready</>}
            </motion.span>
          </AnimatePresence>
          {result?.success && <span className="opacity-90">{result.files_changed ?? 0} files · {result.patches_applied ?? 0} patches</span>}
        </div>
      </footer>
    </div>
  )
}

function LogLine({ children, prompt, tone }: { children: React.ReactNode; prompt?: boolean; tone?: 'go' | 'abort' | 'mission' | 'muted' }) {
  return (
    <div className={cn(
      'leading-relaxed break-words',
      tone === 'go' && 'text-go',
      tone === 'abort' && 'text-abort',
      tone === 'mission' && 'text-mission',
      tone === 'muted' && 'text-ink-muted',
      !tone && 'text-ink-secondary',
    )}>
      {prompt && <span className="text-go mr-1.5">❯</span>}
      {children}
    </div>
  )
}
