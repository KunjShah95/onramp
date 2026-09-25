/*
 * ─── DIRECTION CONTRACT · ONRAMP MISSION CONTROL ────────────────────────────
 * THESIS: The autonomous-coding seat is a real in-browser IDE over a GitHub
 *   repo: explorer tree · tabbed Monaco editors with diffs · source control
 *   (one commit + PR) · coding agent whose proposals land as reviewable diffs
 *   in the working copy · output log · status bar. VSCode ergonomics, rendered
 *   in the daylit ops room, not a dark neon clone.
 * OWN-WORLD: Seated panels, hairline seams, JetBrains Mono telemetry, signal-
 *   only colour (GO / mission / caution / abort). Radii <=4px.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Robot, GithubLogo, GitBranch, GitPullRequest, FileCode, Play, Check, X, Warning, Spinner,
  TreeStructure, ClockCounterClockwise, ArrowSquareOut, CaretDown, GitDiff, FilePlus, Trash,
  ArrowCounterClockwise, ArrowsClockwise, MagnifyingGlass, Sparkle, NotePencil,
} from '@phosphor-icons/react'
import { cn } from '../lib/utils'
import { useToast } from '../context/ToastContext'
import {
  fetchRepos, fetchIdeTree, fetchIdeFile, ideCommit, ideProposeChanges, resolveRepoIssue, submitTask,
  type AgentFix, type IdeTreeEntry, type ResolveIssueResult,
} from '../lib/api'
import IdeEditor, { languageForPath } from '../components/ide/IdeEditor'
import FileTree, { type ChangeKind } from '../components/ide/FileTree'
import { EmptyRow } from '../components/ui/empty-state'

const BRIEF = '__brief__'

interface WorkFile {
  /** Content at the base ref; null = file created in the working copy. */
  original: string | null
  /** Working-copy content; null = deleted. */
  content: string | null
  binary?: boolean
  tooLarge?: boolean
}
type Proposal = AgentFix & { status: 'applied' | 'not_found' | 'error' }
interface LogEntry { at: number; tone?: 'go' | 'abort' | 'mission' | 'muted'; text: string; href?: string }
interface RunRecord { id: string; repo: string; issue: string; result: ResolveIssueResult; at: number }
type Panel = 'explorer' | 'scm' | 'agent' | 'runs'

function parseRepo(input: string): { owner: string; repo: string } | null {
  const s = input.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\.git$/, '').replace(/\/$/, '')
  const [owner, repo] = s.split('/')
  return owner && repo ? { owner, repo } : null
}

const storageKey = (slug: string, ref: string) => `onramp.ide.${slug}@${ref}`
function loadStored(key: string): Record<string, WorkFile> {
  try { return JSON.parse(localStorage.getItem(key) || '{}') } catch { return {} }
}
function saveStored(key: string, files: Record<string, WorkFile>) {
  try {
    const dirty = Object.fromEntries(Object.entries(files).filter(([, f]) => f.content !== f.original))
    if (Object.keys(dirty).length) localStorage.setItem(key, JSON.stringify(dirty))
    else localStorage.removeItem(key)
  } catch { /* storage unavailable — working copy stays in memory */ }
}

function changeKind(f: WorkFile): ChangeKind | null {
  if (f.content === f.original) return null
  if (f.original === null) return 'A'
  if (f.content === null) return 'D'
  return 'M'
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

export default function AutonomousCodingPage() {
  const [searchParams] = useSearchParams()
  const linkedTaskId = searchParams.get('task_id') ?? ''
  const paramRepo = searchParams.get('repo') ?? ''
  const toast = useToast()

  // ── Workspace ─────────────────────────────────────────────────────────
  const [repoInput, setRepoInput] = useState(paramRepo)
  const [baseBranch, setBaseBranch] = useState('main')
  const [workspace, setWorkspace] = useState<{ owner: string; repo: string; ref: string } | null>(null)
  const [entries, setEntries] = useState<IdeTreeEntry[]>([])
  const [treeLoading, setTreeLoading] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')
  const [files, setFiles] = useState<Record<string, WorkFile>>({})
  const [tabs, setTabs] = useState<string[]>([BRIEF])
  const [active, setActive] = useState<string>(BRIEF)
  const [diffTabs, setDiffTabs] = useState<Set<string>>(new Set())
  const [cursor, setCursor] = useState({ line: 1, col: 1 })
  const [panel, setPanel] = useState<Panel>('explorer')
  const [newFileOpen, setNewFileOpen] = useState(false)
  const [newFilePath, setNewFilePath] = useState('')

  // ── Agent / SCM / output ──────────────────────────────────────────────
  const [brief, setBrief] = useState('')
  const [agentBusy, setAgentBusy] = useState<null | 'propose' | 'auto'>(null)
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [analysis, setAnalysis] = useState<ResolveIssueResult['analysis'] | null>(null)
  const [commitMsg, setCommitMsg] = useState('')
  const [commitBranch, setCommitBranch] = useState('')
  const [openPr, setOpenPr] = useState(true)
  const [committing, setCommitting] = useState(false)
  const [lastPr, setLastPr] = useState<{ url: string; number: number } | null>(null)
  const [taskSubmitted, setTaskSubmitted] = useState(false)
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [log, setLog] = useState<LogEntry[]>([])
  const [termOpen, setTermOpen] = useState(true)
  const filterRef = useRef<HTMLInputElement>(null)
  const logEnd = useRef<HTMLDivElement>(null)

  const { data: reposData } = useQuery({ queryKey: ['repos'], queryFn: fetchRepos, staleTime: 60_000 })
  const tracked = reposData?.repos ?? []

  const say = useCallback((text: string, tone?: LogEntry['tone'], href?: string) => {
    setLog((l) => [...l.slice(-199), { at: Date.now(), text, tone, href }])
  }, [])
  useEffect(() => { logEnd.current?.scrollIntoView({ block: 'end' }) }, [log])

  // ── Load a repository ─────────────────────────────────────────────────
  const openWorkspace = useCallback(async (input = repoInput, ref = baseBranch) => {
    const parsed = parseRepo(input)
    if (!parsed) { toast.error('Invalid repository', 'Use owner/repo or a GitHub URL.'); return }
    setTreeLoading(true)
    say(`git fetch ${parsed.owner}/${parsed.repo}@${ref}`)
    try {
      const tree = await fetchIdeTree(parsed.owner, parsed.repo, ref)
      const slug = `${parsed.owner}/${parsed.repo}`
      setWorkspace({ ...parsed, ref })
      setEntries(tree.entries)
      const restored = loadStored(storageKey(slug, ref))
      setFiles(restored)
      setTabs([BRIEF, ...Object.keys(restored).slice(0, 8)])
      setActive(BRIEF)
      setDiffTabs(new Set())
      setExpanded(new Set())
      setProposals([])
      setLastPr(null)
      say(`${tree.entries.filter((e) => e.type === 'file').length} files at ${tree.sha.slice(0, 7)}${tree.truncated ? ' (tree truncated by GitHub)' : ''}`, 'go')
      if (Object.keys(restored).length) say(`Restored ${Object.keys(restored).length} uncommitted change(s) from this browser.`, 'mission')
    } catch (e: any) {
      say(e.message || 'Could not load repository', 'abort')
      toast.error('Could not open repository', e.message)
    } finally {
      setTreeLoading(false)
    }
  }, [repoInput, baseBranch, say, toast])

  // Deep link (/autonomous?repo=…) opens once per repo — guards StrictMode's double effect.
  const autoOpened = useRef<string | null>(null)
  useEffect(() => {
    if (!paramRepo || autoOpened.current === paramRepo) return
    autoOpened.current = paramRepo
    setRepoInput(paramRepo)
    openWorkspace(paramRepo, baseBranch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramRepo])

  // Autosave the working copy (dirty files only) per repo@ref.
  useEffect(() => {
    if (!workspace) return
    const t = window.setTimeout(() => saveStored(storageKey(`${workspace.owner}/${workspace.repo}`, workspace.ref), files), 600)
    return () => window.clearTimeout(t)
  }, [files, workspace])

  // ── Files & tabs ──────────────────────────────────────────────────────
  const ensureLoaded = useCallback(async (path: string): Promise<WorkFile | null> => {
    if (!workspace) return null
    const existing = files[path]
    if (existing) return existing
    try {
      const f = await fetchIdeFile(workspace.owner, workspace.repo, path, workspace.ref)
      const wf: WorkFile = { original: f.content, content: f.content, binary: f.binary, tooLarge: f.too_large }
      setFiles((prev) => (prev[path] ? prev : { ...prev, [path]: wf }))
      return wf
    } catch (e: any) {
      say(`open ${path}: ${e.message}`, 'abort')
      return null
    }
  }, [workspace, files, say])

  const openFile = useCallback(async (path: string, diff = false) => {
    setTabs((t) => (t.includes(path) ? t : [...t, path]))
    setActive(path)
    if (diff) setDiffTabs((s) => new Set(s).add(path))
    await ensureLoaded(path)
  }, [ensureLoaded])

  const closeTab = (path: string) => {
    setTabs((t) => {
      const next = t.filter((p) => p !== path)
      if (active === path) setActive(next[next.length - 1] ?? BRIEF)
      return next.length ? next : [BRIEF]
    })
  }

  const updateFile = (path: string, content: string) =>
    setFiles((prev) => (prev[path] ? { ...prev, [path]: { ...prev[path], content } } : prev))

  const discard = (path: string) => setFiles((prev) => {
    const f = prev[path]
    if (!f) return prev
    if (f.original === null) { const { [path]: _drop, ...rest } = prev; void _drop; closeTab(path); return rest }
    return { ...prev, [path]: { ...f, content: f.original } }
  })

  const createFile = () => {
    const path = newFilePath.trim().replace(/^\/+/, '')
    if (!path || path.includes('..')) return
    if (entries.some((e) => e.path === path) || files[path]) { openFile(path); setNewFileOpen(false); return }
    setFiles((prev) => ({ ...prev, [path]: { original: null, content: '' } }))
    setNewFileOpen(false); setNewFilePath('')
    setTabs((t) => [...t, path]); setActive(path)
    say(`created ${path}`, 'go')
  }

  const deleteFile = async (path: string) => {
    const f = await ensureLoaded(path)
    if (!f) return
    if (f.original === null) { discard(path); return }
    setFiles((prev) => ({ ...prev, [path]: { ...prev[path], content: null } }))
    say(`deleted ${path} (staged)`, 'caution' as LogEntry['tone'])
  }

  const changes = useMemo(() => {
    const out: Record<string, ChangeKind> = {}
    for (const [p, f] of Object.entries(files)) { const k = changeKind(f); if (k) out[p] = k }
    return out
  }, [files])
  const changedPaths = Object.keys(changes).sort()
  const newFiles = useMemo(() => Object.entries(files).filter(([, f]) => f.original === null).map(([p]) => p), [files])

  // Ctrl+P → quick open, Ctrl+Shift+G → source control.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key.toLowerCase() === 'p' && !e.shiftKey) { e.preventDefault(); setPanel('explorer'); setTimeout(() => filterRef.current?.focus(), 0) }
      if (e.key.toLowerCase() === 'g' && e.shiftKey) { e.preventDefault(); setPanel('scm') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Agent ─────────────────────────────────────────────────────────────
  async function proposeChanges() {
    if (!workspace || !brief.trim()) { toast.error('Brief required', 'Describe the change in ISSUE.md first.'); return }
    setAgentBusy('propose'); setProposals([]); setAnalysis(null); setPanel('agent'); setTermOpen(true)
    say(`agent propose --base ${workspace.ref} "${brief.trim().split('\n')[0].slice(0, 60)}"`)
    try {
      const res = await ideProposeChanges(workspace.owner, workspace.repo, brief.trim(), workspace.ref)
      setAnalysis(res.analysis ?? null)
      if (!res.fixes?.length) { say(res.error || 'Agent proposed no changes.', 'abort'); return }
      if (res.analysis?.root_cause) say(`root cause: ${res.analysis.root_cause}`, 'mission')
      const applied: Proposal[] = []
      const working: Record<string, WorkFile> = {}
      for (const fix of res.fixes) {
        const f = working[fix.file_path] ?? files[fix.file_path] ?? await ensureLoaded(fix.file_path)
        if (!f || f.content === null) { applied.push({ ...fix, status: 'error' }); continue }
        if (!fix.search_string || !f.content.includes(fix.search_string)) { applied.push({ ...fix, status: 'not_found' }); continue }
        working[fix.file_path] = { ...f, content: f.content.replace(fix.search_string, fix.replace_string) }
        applied.push({ ...fix, status: 'applied' })
      }
      setFiles((prev) => ({ ...prev, ...working }))
      setProposals(applied)
      const ok = applied.filter((p) => p.status === 'applied')
      say(`${ok.length}/${applied.length} proposed edit(s) applied to the working copy — review the diffs, then commit.`, ok.length ? 'go' : 'abort')
      const first = Object.keys(working)[0]
      if (first) { setTabs((t) => Array.from(new Set([...t, ...Object.keys(working)]))); setDiffTabs((s) => new Set([...s, ...Object.keys(working)])); setActive(first) }
      if (!commitMsg) setCommitMsg(`fix: ${brief.trim().split('\n')[0].slice(0, 72)}`)
    } catch (e: any) {
      say(e.message || 'Agent failed', 'abort'); toast.error('Agent failed', e.message)
    } finally {
      setAgentBusy(null)
    }
  }

  async function autoPr() {
    if (!workspace || !brief.trim()) { toast.error('Brief required', 'Describe the change in ISSUE.md first.'); return }
    setAgentBusy('auto'); setTermOpen(true)
    say(`agent run --apply --base ${workspace.ref} (clone → analyse → patch → PR)`)
    try {
      const res = await resolveRepoIssue(workspace.owner, workspace.repo, {
        repo_url: `https://github.com/${workspace.owner}/${workspace.repo}`, issue_description: brief.trim(), branch: workspace.ref,
      })
      setRuns((r) => [{ id: crypto.randomUUID(), repo: `${workspace.owner}/${workspace.repo}`, issue: brief, result: res, at: Date.now() }, ...r].slice(0, 12))
      if (res.success && res.pr_url) {
        say(`PR #${res.pr_number} opened on ${res.branch} · ${res.patches_applied ?? 0} patch(es)`, 'go', res.pr_url)
        setLastPr({ url: res.pr_url, number: res.pr_number ?? 0 })
        await linkTask(res.pr_url)
      } else {
        say(res.error || 'Agent could not open a pull request.', 'abort')
      }
    } catch (e: any) {
      say(e.message || 'Agent run failed', 'abort'); toast.error('Agent run failed', e.message)
    } finally {
      setAgentBusy(null)
    }
  }

  async function linkTask(prUrl: string) {
    if (!linkedTaskId || taskSubmitted) return
    try {
      await submitTask(linkedTaskId, prUrl)
      setTaskSubmitted(true)
      say('Linked task submitted for senior review.', 'go')
    } catch {
      say('PR created, but the linked task could not be auto-submitted — submit it from your dashboard.', 'abort')
    }
  }

  // ── Commit ────────────────────────────────────────────────────────────
  async function commit() {
    if (!workspace || !changedPaths.length || !commitMsg.trim()) return
    const branch = commitBranch.trim() || `onramp/${slugify(commitMsg) || 'changes'}-${Date.now().toString(36).slice(-4)}`
    setCommitting(true); setTermOpen(true)
    say(`git commit -m "${commitMsg.trim().split('\n')[0]}" (${changedPaths.length} file(s)) → ${branch}`)
    try {
      const res = await ideCommit(workspace.owner, workspace.repo, {
        base: workspace.ref, branch, message: commitMsg.trim(), open_pr: openPr,
        files: changedPaths.map((p) => ({ path: p, content: files[p].content })),
      })
      say(`committed ${res.commit_sha.slice(0, 7)} on ${res.branch}`, 'go', res.commit_url)
      if (res.pr_url) {
        say(`pull request #${res.pr_number} ready for review`, 'go', res.pr_url)
        setLastPr({ url: res.pr_url, number: res.pr_number ?? 0 })
        await linkTask(res.pr_url)
      }
      toast.success(res.pr_url ? `PR #${res.pr_number} opened` : 'Committed', res.branch)
      // Committed changes become the new baseline of this working copy.
      setFiles((prev) => {
        const next: Record<string, WorkFile> = {}
        for (const [p, f] of Object.entries(prev)) if (f.content !== null) next[p] = { ...f, original: f.content }
        return next
      })
      setDiffTabs(new Set()); setProposals([]); setCommitMsg(''); setCommitBranch('')
    } catch (e: any) {
      say(e.message || 'Commit failed', 'abort'); toast.error('Commit failed', e.message)
    } finally {
      setCommitting(false)
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────
  const activeFile = active !== BRIEF ? files[active] : undefined
  const showDiff = active !== BRIEF && diffTabs.has(active) && activeFile && activeFile.original !== null && activeFile.content !== null
  const activeLang = active === BRIEF ? 'markdown' : languageForPath(active)
  const busy = !!agentBusy || committing

  const rail: { key: Panel; Icon: typeof TreeStructure; label: string; badge?: number }[] = [
    { key: 'explorer', Icon: TreeStructure, label: 'Explorer (Ctrl+P)' },
    { key: 'scm', Icon: GitBranch, label: 'Source Control (Ctrl+Shift+G)', badge: changedPaths.length },
    { key: 'agent', Icon: Sparkle, label: 'Coding agent' },
    { key: 'runs', Icon: ClockCounterClockwise, label: 'Agent run history' },
  ]

  return (
    <div className="-m-6 h-[calc(100dvh-3rem)] flex flex-col bg-room text-ink overflow-hidden">
      <div className="flex-1 flex min-h-0">
        {/* ── Activity rail ── */}
        <nav className="w-12 shrink-0 bg-base border-r border-seam flex flex-col items-center py-2 gap-1" aria-label="Activity">
          {rail.map(({ key, Icon, label, badge }) => (
            <button key={key} onClick={() => setPanel(key)} title={label} aria-label={label} aria-pressed={panel === key}
              className={cn('relative w-10 h-10 rounded-tile flex items-center justify-center transition-colors',
                panel === key ? 'text-ink' : 'text-ink-muted hover:text-ink-secondary')}>
              {panel === key && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-go" />}
              <Icon size={20} weight={panel === key ? 'fill' : 'regular'} />
              {!!badge && <span className="absolute top-1 right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-mission text-[9px] font-bold text-panel-raised flex items-center justify-center">{badge}</span>}
            </button>
          ))}
          <div className="mt-auto w-8 h-8 rounded-tile bg-go flex items-center justify-center shadow-seam" title="Onramp coding agent">
            <Robot size={16} weight="fill" className="text-panel-raised" />
          </div>
        </nav>

        {/* ── Side panel ── */}
        <aside className="w-72 shrink-0 bg-panel border-r border-seam flex flex-col min-h-0">
          <div className="flex items-center justify-between gap-2 border-b border-seam px-3 py-2">
            <span className="font-display text-[12px] font-semibold uppercase tracking-wider text-ink-secondary">
              {{ explorer: 'Explorer', scm: 'Source Control', agent: 'Coding Agent', runs: 'Run History' }[panel]}
            </span>
            {panel === 'explorer' && workspace && (
              <div className="flex items-center gap-1">
                <IconBtn title="New file" onClick={() => setNewFileOpen((o) => !o)}><FilePlus size={14} /></IconBtn>
                <IconBtn title="Refresh" onClick={() => openWorkspace(`${workspace.owner}/${workspace.repo}`, workspace.ref)}><ArrowsClockwise size={14} /></IconBtn>
              </div>
            )}
          </div>

          {panel === 'explorer' && (
            <div className="flex-1 flex flex-col min-h-0">
              <form className="p-3 space-y-2 border-b border-seam" onSubmit={(e) => { e.preventDefault(); openWorkspace() }}>
                <label className="flex items-center gap-2 input !py-1.5">
                  <GithubLogo size={14} className="text-ink-muted shrink-0" />
                  <input value={repoInput} onChange={(e) => setRepoInput(e.target.value)} placeholder="owner/repo" aria-label="Repository"
                    list="ide-tracked-repos" className="flex-1 min-w-0 bg-transparent outline-none border-none p-0 text-body-xs font-code text-ink placeholder:text-ink-disabled" />
                  <datalist id="ide-tracked-repos">{tracked.map((r) => <option key={r.id} value={`${r.owner}/${r.name}`} />)}</datalist>
                </label>
                <div className="flex gap-2">
                  <label className="flex-1 flex items-center gap-2 input !py-1.5">
                    <GitBranch size={14} className="text-ink-muted shrink-0" />
                    <input value={baseBranch} onChange={(e) => setBaseBranch(e.target.value)} placeholder="main" aria-label="Base branch"
                      className="flex-1 min-w-0 bg-transparent outline-none border-none p-0 text-body-xs font-code text-ink" />
                  </label>
                  <button type="submit" disabled={treeLoading || !repoInput.trim()} className="btn !py-1.5 !px-3 shrink-0 whitespace-nowrap disabled:opacity-40">
                    {treeLoading ? <Spinner size={14} className="animate-spin" /> : 'Open'}
                  </button>
                </div>
              </form>

              {workspace && (
                <>
                  <div className="px-3 pt-2 pb-1">
                    <label className="flex items-center gap-2 input !py-1">
                      <MagnifyingGlass size={12} className="text-ink-muted shrink-0" />
                      <input ref={filterRef} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Go to file… (Ctrl+P)" aria-label="Filter files"
                        onKeyDown={(e) => { if (e.key === 'Escape') setFilter('') }}
                        className="flex-1 min-w-0 bg-transparent outline-none border-none p-0 text-body-xs font-code text-ink placeholder:text-ink-disabled" />
                    </label>
                  </div>
                  {newFileOpen && (
                    <form className="px-3 pb-2" onSubmit={(e) => { e.preventDefault(); createFile() }}>
                      <input autoFocus value={newFilePath} onChange={(e) => setNewFilePath(e.target.value)} placeholder="path/to/new-file.ts"
                        onKeyDown={(e) => { if (e.key === 'Escape') setNewFileOpen(false) }}
                        className="input w-full !py-1 text-body-xs font-code" aria-label="New file path" />
                    </form>
                  )}
                  <div className="flex-1 overflow-y-auto">
                    <FileTree entries={entries} extraFiles={newFiles} changes={changes} expanded={expanded}
                      onToggle={(d) => setExpanded((s) => { const n = new Set(s); if (n.has(d)) n.delete(d); else n.add(d); return n })}
                      activePath={active === BRIEF ? null : active} onOpen={(p) => openFile(p)} filter={filter} />
                  </div>
                </>
              )}
              {!workspace && (
                <div className="p-3 text-caption text-ink-muted space-y-2">
                  <p>Open a repository registered to your team to browse, edit and ship changes.</p>
                  {tracked.slice(0, 6).map((r) => (
                    <button key={r.id} onClick={() => { const s = `${r.owner}/${r.name}`; setRepoInput(s); openWorkspace(s, baseBranch) }}
                      className="w-full text-left px-2 py-1.5 rounded-tile border border-seam hover:bg-well font-code text-body-xs text-ink-secondary truncate">
                      {r.owner}/{r.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {panel === 'scm' && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="p-3 space-y-2 border-b border-seam">
                <textarea value={commitMsg} onChange={(e) => setCommitMsg(e.target.value)} rows={3} placeholder="Commit message (Ctrl+Enter to commit)"
                  onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') commit() }}
                  className="input w-full resize-none text-body-xs font-code" aria-label="Commit message" />
                <label className="flex items-center gap-2 input !py-1.5">
                  <GitBranch size={14} className="text-ink-muted shrink-0" />
                  <input value={commitBranch} onChange={(e) => setCommitBranch(e.target.value)}
                    placeholder={`onramp/${slugify(commitMsg) || 'changes'}-…`} aria-label="Target branch"
                    className="flex-1 min-w-0 bg-transparent outline-none border-none p-0 text-body-xs font-code text-ink placeholder:text-ink-disabled" />
                </label>
                <label className="flex items-center gap-2 text-caption text-ink-secondary">
                  <input type="checkbox" checked={openPr} onChange={(e) => setOpenPr(e.target.checked)} /> Open a pull request into <span className="font-code">{workspace?.ref ?? 'main'}</span>
                </label>
                <button onClick={commit} disabled={!workspace || !changedPaths.length || !commitMsg.trim() || busy}
                  className="btn w-full justify-center !py-1.5 disabled:opacity-40">
                  {committing ? <Spinner size={14} className="animate-spin" /> : <Check size={14} weight="bold" />}
                  {openPr ? 'Commit & open PR' : 'Commit to branch'}
                </button>
                {lastPr && (
                  <a href={lastPr.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-caption text-mission hover:text-mission-lit">
                    <GitPullRequest size={12} weight="fill" /> PR #{lastPr.number} <ArrowSquareOut size={11} />
                  </a>
                )}
              </div>
              <div className="flex-1 overflow-y-auto py-1">
                <div className="px-3 py-1 overline text-ink-muted/70">Changes · {changedPaths.length}</div>
                {changedPaths.length === 0 && <EmptyRow label="No changes. Edit files or ask the agent." />}
                {changedPaths.map((p) => (
                  <div key={p} className="group flex items-center gap-1 px-3 py-1 hover:bg-well">
                    <button onClick={() => openFile(p, changes[p] === 'M')} className="flex-1 min-w-0 text-left font-code text-body-xs truncate text-ink-secondary" title={p}>
                      {p.split('/').pop()} <span className="text-ink-muted">{p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''}</span>
                    </button>
                    <IconBtn title="Discard change" onClick={() => discard(p)} className="opacity-0 group-hover:opacity-100"><ArrowCounterClockwise size={12} /></IconBtn>
                    <span className={cn('font-code text-[10px] font-bold w-3 text-center', { M: 'text-caution', A: 'text-go', D: 'text-abort' }[changes[p]])}>{changes[p]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {panel === 'agent' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {linkedTaskId && (
                <div className={cn('px-2.5 py-2 rounded-tile border text-caption font-code', taskSubmitted ? 'bg-go/10 border-go/20 text-go' : 'bg-mission/10 border-mission/20 text-mission')}>
                  {taskSubmitted ? 'Linked task submitted for review' : 'Linked task — the PR auto-submits it'}
                </div>
              )}
              <p className="text-caption text-ink-secondary">Write the brief in <button className="font-code text-mission" onClick={() => setActive(BRIEF)}>ISSUE.md</button>, then:</p>
              <button onClick={proposeChanges} disabled={!workspace || !brief.trim() || busy} className="btn w-full justify-center !py-1.5 disabled:opacity-40">
                {agentBusy === 'propose' ? <Spinner size={14} className="animate-spin" /> : <GitDiff size={14} weight="bold" />}
                Propose changes (review diffs)
              </button>
              <button onClick={autoPr} disabled={!workspace || !brief.trim() || busy} className="btn btn-secondary w-full justify-center !py-1.5 disabled:opacity-40">
                {agentBusy === 'auto' ? <Spinner size={14} className="animate-spin" /> : <Play size={14} weight="fill" />}
                Auto-apply & open PR
              </button>
              {analysis && (
                <div className="rounded-tile border border-seam bg-well p-2 space-y-1">
                  <div className="overline text-ink-muted/70">Analysis · {Math.round((analysis.confidence ?? 0) * 100)}% confidence</div>
                  <p className="text-caption text-ink-secondary">{analysis.root_cause}</p>
                </div>
              )}
              {proposals.length > 0 && (
                <div className="space-y-1">
                  <div className="overline text-ink-muted/70">Proposed edits</div>
                  {proposals.map((p, i) => (
                    <button key={i} onClick={() => openFile(p.file_path, true)} className="w-full text-left rounded-tile border border-seam hover:bg-well p-2">
                      <div className="flex items-center gap-1.5">
                        {p.status === 'applied' ? <Check size={12} className="text-go" weight="bold" /> : <Warning size={12} className="text-caution" weight="fill" />}
                        <span className="font-code text-body-xs text-ink truncate">{p.file_path}</span>
                      </div>
                      <p className="text-caption text-ink-muted mt-0.5 line-clamp-2">{p.status === 'applied' ? p.reasoning : 'Search text not found in the file — edit it manually.'}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {panel === 'runs' && (
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {runs.length === 0 ? <EmptyRow label="No auto-apply runs yet this session." /> : runs.map((r) => (
                <div key={r.id} className="px-2 py-2 rounded-tile border border-seam">
                  <div className="flex items-center gap-2">
                    <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', r.result.success ? 'bg-go' : 'bg-abort')} />
                    <span className="text-body-xs font-code text-ink truncate">{r.repo}</span>
                    {r.result.pr_url && <a href={r.result.pr_url} target="_blank" rel="noreferrer" className="ml-auto text-mission"><ArrowSquareOut size={12} /></a>}
                  </div>
                  <p className="text-caption text-ink-muted truncate mt-0.5 pl-3.5">{r.issue}</p>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* ── Editor group ── */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-panel-raised">
          <div className="flex items-stretch h-9 bg-panel border-b border-seam shrink-0 overflow-x-auto" role="tablist">
            {tabs.map((t) => {
              const kind = t === BRIEF ? null : changes[t]
              return (
                <div key={t} role="tab" aria-selected={active === t}
                  className={cn('group flex items-center gap-2 pl-3 pr-1.5 border-r border-seam cursor-pointer shrink-0',
                    active === t ? 'bg-panel-raised' : 'hover:bg-well')}
                  onClick={() => setActive(t)} onAuxClick={(e) => { if (e.button === 1 && t !== BRIEF) closeTab(t) }} title={t === BRIEF ? 'ISSUE.md — agent brief' : t}>
                  {t === BRIEF ? <NotePencil size={14} weight="fill" className="text-go" /> : <FileCode size={14} className="text-ink-muted" />}
                  <span className={cn('text-body-xs font-code', kind === 'D' && 'line-through', kind ? 'text-caution' : 'text-ink')}>
                    {t === BRIEF ? 'ISSUE.md' : t.split('/').pop()}
                  </span>
                  {t !== BRIEF && diffTabs.has(t) && <GitDiff size={11} className="text-mission" />}
                  {t !== BRIEF ? (
                    <button onClick={(e) => { e.stopPropagation(); closeTab(t) }} aria-label={`Close ${t}`}
                      className="w-5 h-5 flex items-center justify-center rounded-tile text-ink-muted hover:bg-well hover:text-ink">
                      {kind && active !== t ? <span className="w-2 h-2 rounded-full bg-ink-disabled group-hover:hidden" /> : null}
                      <X size={11} className={cn(kind && active !== t && 'hidden group-hover:block')} />
                    </button>
                  ) : <span className="w-2" />}
                </div>
              )
            })}
            <div className="flex-1" />
          </div>

          {/* Breadcrumb + file actions */}
          {active !== BRIEF && (
            <div className="flex items-center gap-2 h-7 px-3 border-b border-seam bg-panel-raised shrink-0 text-caption font-code text-ink-muted">
              <span className="truncate">{active.split('/').join(' › ')}</span>
              <div className="ml-auto flex items-center gap-1">
                {activeFile && activeFile.original !== null && activeFile.content !== null && (
                  <IconBtn title={diffTabs.has(active) ? 'Show editor' : 'Show diff vs base'} onClick={() => setDiffTabs((s) => { const n = new Set(s); if (n.has(active)) n.delete(active); else n.add(active); return n })}>
                    <GitDiff size={13} className={diffTabs.has(active) ? 'text-mission' : ''} />
                  </IconBtn>
                )}
                {changes[active] && <IconBtn title="Discard changes" onClick={() => discard(active)}><ArrowCounterClockwise size={13} /></IconBtn>}
                {activeFile && activeFile.content !== null && <IconBtn title="Delete file" onClick={() => deleteFile(active)}><Trash size={13} /></IconBtn>}
              </div>
            </div>
          )}

          <div className="flex-1 min-h-0">
            {active === BRIEF ? (
              <IdeEditor path="ISSUE.md" language="markdown" value={brief} onChange={setBrief}
                onRun={proposeChanges} onCursor={(line, col) => setCursor({ line, col })} />
            ) : !activeFile ? (
              <div className="h-full flex items-center justify-center text-caption text-ink-muted gap-2"><Spinner size={14} className="animate-spin" /> Loading {active}…</div>
            ) : activeFile.binary || activeFile.tooLarge ? (
              <div className="h-full flex items-center justify-center text-caption text-ink-muted">{activeFile.binary ? 'Binary file — not shown.' : 'File larger than 1 MB — not shown.'}</div>
            ) : activeFile.content === null ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-caption text-ink-muted">
                <span>Deleted in the working copy.</span>
                <button className="btn btn-secondary !py-1 !px-2" onClick={() => discard(active)}>Restore</button>
              </div>
            ) : (
              <IdeEditor path={active} value={activeFile.content} original={showDiff ? activeFile.original ?? '' : undefined}
                onChange={(v) => updateFile(active, v)} onCursor={(line, col) => setCursor({ line, col })}
                onSave={() => { setPanel('scm'); say(`${active}: saved to working copy — commit from Source Control`, 'muted') }} />
            )}
          </div>

          {/* ── Output panel ── */}
          <div className={cn('border-t border-seam bg-panel shrink-0 flex flex-col', termOpen ? 'h-48' : 'h-8')}>
            <button type="button" onClick={() => setTermOpen((o) => !o)} aria-expanded={termOpen} aria-controls="ide-output"
              className="flex w-full items-center justify-between gap-3 border-b border-seam px-4 py-1.5 text-left">
              <span className="flex items-center gap-3">
                <span className="font-display text-[12px] font-semibold text-ink">Output</span>
                <span className="designator">{busy ? 'working' : `${log.length} lines`}</span>
              </span>
              <CaretDown size={14} className={cn('text-ink-muted transition-transform', termOpen ? '' : 'rotate-180')} aria-hidden />
            </button>
            {termOpen && (
              <div id="ide-output" className="flex-1 overflow-y-auto px-3 py-2 font-code text-body-xs space-y-0.5">
                {log.length === 0 && <div className="text-ink-muted">Open a repository to start. Ctrl+P opens files · Ctrl+S saves · Ctrl+Enter in ISSUE.md asks the agent.</div>}
                {log.map((l, i) => (
                  <div key={i} className={cn('leading-relaxed break-words', { go: 'text-go', abort: 'text-abort', mission: 'text-mission', muted: 'text-ink-muted' }[l.tone ?? 'muted'] ?? 'text-ink-secondary')}>
                    <span className="text-ink-disabled mr-2">{new Date(l.at).toLocaleTimeString([], { hour12: false })}</span>
                    {l.text}
                    {l.href && <a href={l.href} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-mission hover:text-mission-lit">open <ArrowSquareOut size={10} /></a>}
                  </div>
                ))}
                {busy && <div className="text-mission flex items-center gap-1.5"><Spinner size={11} className="animate-spin" /> {agentBusy === 'propose' ? 'agent is reading the codebase and drafting edits…' : agentBusy === 'auto' ? 'agent is patching and opening a PR…' : 'committing…'}</div>}
                <div ref={logEnd} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Status bar ── */}
      <footer className="h-6 shrink-0 bg-go text-panel-raised flex items-center justify-between px-3 text-[11px] font-code">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex items-center gap-1"><GitBranch size={12} weight="bold" /> {workspace?.ref ?? baseBranch}</span>
          <span className="flex items-center gap-1 opacity-90 truncate"><GithubLogo size={12} /> {workspace ? `${workspace.owner}/${workspace.repo}` : 'no repository'}</span>
          {changedPaths.length > 0 && <button onClick={() => setPanel('scm')} className="opacity-90 hover:opacity-100">● {changedPaths.length} change{changedPaths.length !== 1 ? 's' : ''}</button>}
        </div>
        <div className="flex items-center gap-3">
          {busy && <span className="flex items-center gap-1"><Spinner size={11} className="animate-spin" /> {agentBusy ? 'Agent' : 'Git'}</span>}
          {lastPr && <a href={lastPr.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:underline"><GitPullRequest size={11} weight="fill" /> PR #{lastPr.number}</a>}
          <span>Ln {cursor.line}, Col {cursor.col}</span>
          <span className="uppercase">{activeLang}</span>
        </div>
      </footer>
    </div>
  )
}

function IconBtn({ children, title, onClick, className }: { children: React.ReactNode; title: string; onClick: () => void; className?: string }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick}
      className={cn('w-6 h-6 flex items-center justify-center rounded-tile text-ink-muted hover:text-ink hover:bg-well transition-colors', className)}>
      {children}
    </button>
  )
}
