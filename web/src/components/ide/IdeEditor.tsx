import { useEffect, useRef, useState } from 'react'
import Editor, { DiffEditor, loader } from '@monaco-editor/react'
import { WarningCircle } from '@phosphor-icons/react'
import { useTheme } from '../../context/ThemeContext'
import { applyOnrampMonacoTheme } from '../ui/monaco-editor'

const EXT_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', swift: 'swift',
  c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php', scala: 'scala',
  json: 'json', yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini', env: 'ini',
  md: 'markdown', mdx: 'markdown', html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
  sql: 'sql', sh: 'shell', bash: 'shell', zsh: 'shell', ps1: 'powershell', dockerfile: 'dockerfile',
  xml: 'xml', svg: 'xml', graphql: 'graphql', gql: 'graphql', vue: 'html', lua: 'lua', r: 'r',
}

export function languageForPath(path: string): string {
  const name = path.split('/').pop()?.toLowerCase() ?? ''
  if (name === 'dockerfile' || name.startsWith('dockerfile.')) return 'dockerfile'
  if (name === 'makefile') return 'makefile'
  const ext = name.includes('.') ? name.split('.').pop()! : ''
  return EXT_LANG[ext] ?? 'plaintext'
}

const OPTIONS = {
  minimap: { enabled: true, renderCharacters: false, maxColumn: 80 },
  fontSize: 13,
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  scrollBeyondLastLine: false,
  automaticLayout: true,
  padding: { top: 10, bottom: 10 },
  renderWhitespace: 'selection' as const,
  bracketPairColorization: { enabled: true },
  guides: { bracketPairs: true, indentation: true },
  smoothScrolling: true,
  stickyScroll: { enabled: true },
  fixedOverflowWidgets: true,
  tabSize: 2,
}

interface Props {
  /** Unique model key — keeps undo history / scroll per open file. */
  path: string
  value: string
  onChange?: (value: string) => void
  /** When set, render a side-by-side diff (original ⇄ value). */
  original?: string
  readOnly?: boolean
  language?: string
  onSave?: () => void
  onRun?: () => void
  onCursor?: (line: number, column: number) => void
}

export default function IdeEditor({ path, value, onChange, original, readOnly, language, onSave, onRun, onCursor }: Props) {
  const { theme } = useTheme()
  const [loadError, setLoadError] = useState(false)
  const monacoRef = useRef<any>(null)
  const handlers = useRef({ onSave, onRun, onCursor, onChange })
  handlers.current = { onSave, onRun, onCursor, onChange }

  useEffect(() => { loader.init().catch(() => setLoadError(true)) }, [])
  useEffect(() => { if (monacoRef.current) applyOnrampMonacoTheme(monacoRef.current, theme) }, [theme])

  const lang = language ?? languageForPath(path)

  function wire(editor: any, monaco: any) {
    monacoRef.current = monaco
    applyOnrampMonacoTheme(monaco, theme)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => handlers.current.onSave?.())
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => handlers.current.onRun?.())
    editor.onDidChangeCursorPosition((e: any) => handlers.current.onCursor?.(e.position.lineNumber, e.position.column))
  }

  if (loadError) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-6">
        <WarningCircle size={20} className="text-abort" weight="fill" />
        <p className="text-caption text-abort font-medium">Editor failed to load</p>
        <p className="text-caption text-ink-muted">The Monaco runtime is fetched from a CDN and could not be reached.</p>
        <button className="btn btn-secondary px-3 py-1.5 text-caption" onClick={() => { setLoadError(false); loader.init().catch(() => setLoadError(true)) }}>
          Retry
        </button>
      </div>
    )
  }

  const loading = <div className="h-full flex items-center justify-center text-caption text-ink-muted">Loading editor…</div>

  if (original !== undefined) {
    return (
      <DiffEditor
        key={`diff:${path}`}
        height="100%"
        language={lang}
        original={original}
        modified={value}
        originalModelPath={`original://${path}`}
        modifiedModelPath={`diff://${path}`}
        theme={'onramp-' + theme}
        loading={loading}
        options={{ ...OPTIONS, readOnly, renderSideBySide: true, originalEditable: false, minimap: { enabled: false } }}
        onMount={(editor: any, monaco: any) => {
          const modified = editor.getModifiedEditor()
          wire(modified, monaco)
          modified.onDidChangeModelContent(() => handlers.current.onChange?.(modified.getValue()))
        }}
      />
    )
  }

  return (
    <Editor
      height="100%"
      path={path}
      language={lang}
      value={value}
      onChange={(v?: string) => handlers.current.onChange?.(v ?? '')}
      theme={'onramp-' + theme}
      loading={loading}
      options={{ ...OPTIONS, readOnly }}
      onMount={wire}
    />
  )
}
