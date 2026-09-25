import { useMemo } from 'react'
import { CaretRight, File, FolderSimple, FolderOpen } from '@phosphor-icons/react'
import { cn } from '../../lib/utils'
import type { IdeTreeEntry } from '../../lib/api'

export type ChangeKind = 'M' | 'A' | 'D'

interface Node {
  name: string
  path: string
  dir: boolean
  children: Node[]
}

function buildTree(entries: IdeTreeEntry[], extraFiles: string[]): Node {
  const root: Node = { name: '', path: '', dir: true, children: [] }
  const index = new Map<string, Node>([['', root]])
  const ensureDir = (path: string): Node => {
    const hit = index.get(path)
    if (hit) return hit
    const slash = path.lastIndexOf('/')
    const parent = ensureDir(slash === -1 ? '' : path.slice(0, slash))
    const node: Node = { name: path.slice(slash + 1), path, dir: true, children: [] }
    parent.children.push(node)
    index.set(path, node)
    return node
  }
  const addFile = (path: string) => {
    if (index.has(path)) return
    const slash = path.lastIndexOf('/')
    const parent = ensureDir(slash === -1 ? '' : path.slice(0, slash))
    const node: Node = { name: path.slice(slash + 1), path, dir: false, children: [] }
    parent.children.push(node)
    index.set(path, node)
  }
  for (const e of entries) (e.type === 'dir' ? ensureDir(e.path) : addFile(e.path))
  for (const p of extraFiles) addFile(p)
  const sort = (n: Node) => {
    n.children.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1))
    n.children.forEach(sort)
  }
  sort(root)
  return root
}

const CHANGE_TONE: Record<ChangeKind, string> = { M: 'text-caution', A: 'text-go', D: 'text-abort' }

interface Props {
  entries: IdeTreeEntry[]
  /** Files that exist only in the working copy (new files). */
  extraFiles: string[]
  changes: Record<string, ChangeKind>
  expanded: Set<string>
  onToggle: (dir: string) => void
  activePath: string | null
  onOpen: (path: string) => void
  filter: string
}

export default function FileTree({ entries, extraFiles, changes, expanded, onToggle, activePath, onOpen, filter }: Props) {
  const tree = useMemo(() => buildTree(entries, extraFiles), [entries, extraFiles])
  const q = filter.trim().toLowerCase()

  // Filter mode: flat list of matching file paths (quick-open style).
  const matches = useMemo(() => {
    if (!q) return []
    const all = [...entries.filter((e) => e.type === 'file').map((e) => e.path), ...extraFiles]
    return all.filter((p) => p.toLowerCase().includes(q)).slice(0, 200)
  }, [q, entries, extraFiles])

  // Directories containing a change get a dot so edits are findable when collapsed.
  const dirtyDirs = useMemo(() => {
    const s = new Set<string>()
    for (const p of Object.keys(changes)) {
      const parts = p.split('/')
      for (let i = 1; i < parts.length; i++) s.add(parts.slice(0, i).join('/'))
    }
    return s
  }, [changes])

  if (q) {
    return (
      <ul className="py-1" role="listbox" aria-label="Matching files">
        {matches.length === 0 && <li className="px-3 py-2 text-caption text-ink-muted">No files match “{filter}”.</li>}
        {matches.map((p) => (
          <li key={p}>
            <button
              onClick={() => onOpen(p)}
              className={cn('w-full text-left px-3 py-1 font-code text-body-xs truncate hover:bg-well', activePath === p ? 'bg-well text-ink' : 'text-ink-secondary')}
              title={p}
            >
              {p}
            </button>
          </li>
        ))}
      </ul>
    )
  }

  const render = (node: Node, depth: number): React.ReactNode =>
    node.children.map((child) => {
      const pad = { paddingLeft: 8 + depth * 12 }
      if (child.dir) {
        const open = expanded.has(child.path)
        return (
          <li key={child.path}>
            <button onClick={() => onToggle(child.path)} style={pad} aria-expanded={open}
              className="w-full flex items-center gap-1.5 pr-2 py-[3px] text-left hover:bg-well text-ink-secondary">
              <CaretRight size={10} weight="bold" className={cn('shrink-0 transition-transform', open && 'rotate-90')} />
              {open ? <FolderOpen size={14} className="shrink-0 text-mission" /> : <FolderSimple size={14} className="shrink-0 text-mission" />}
              <span className="font-code text-body-xs truncate">{child.name}</span>
              {dirtyDirs.has(child.path) && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-caution shrink-0" />}
            </button>
            {open && <ul>{render(child, depth + 1)}</ul>}
          </li>
        )
      }
      const change = changes[child.path]
      return (
        <li key={child.path}>
          <button onClick={() => onOpen(child.path)} style={{ paddingLeft: 8 + depth * 12 + 16 }} title={child.path}
            className={cn('w-full flex items-center gap-1.5 pr-2 py-[3px] text-left hover:bg-well',
              activePath === child.path ? 'bg-well text-ink' : 'text-ink-secondary', change === 'D' && 'line-through opacity-70')}>
            <File size={13} className="shrink-0 text-ink-muted" />
            <span className={cn('font-code text-body-xs truncate', change && CHANGE_TONE[change])}>{child.name}</span>
            {change && <span className={cn('ml-auto font-code text-[10px] font-bold shrink-0', CHANGE_TONE[change])}>{change}</span>}
          </button>
        </li>
      )
    })

  return <ul className="py-1 select-none" role="tree" aria-label="Repository files">{render(tree, 0)}</ul>
}
