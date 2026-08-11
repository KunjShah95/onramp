import { useCallback, useEffect, useRef, useState } from 'react'
import Editor, { loader } from '@monaco-editor/react'
import { useTheme } from '../../context/ThemeContext'
import { Copy, Check, WarningCircle } from '@phosphor-icons/react'
import { cn } from '../../lib/utils'

const MONACO_THEMES = {
  light: {
    base: 'vs',
    colors: {
      'editor.background': '#F6F7F4',
      'editor.foreground': '#181B18',
      'editor.lineHighlightBackground': '#EDEFEB',
      'editor.selectionBackground': '#14A34A33',
      'editor.inactiveSelectionBackground': '#14A34A22',
      'editorCursor.foreground': '#0E7A3C',
      'editorLineNumber.foreground': '#A7ABA4',
      'editorLineNumber.activeForeground': '#181B18',
      'editor.selectionHighlightBackground': '#14A34A15',
      'editorIndentGuide.background': '#E4E7E3',
      'editorIndentGuide.activeBackground': '#C5C9C2',
      'editorWidget.background': '#FFFFFF',
      'editorWidget.border': '#E4E7E3',
      'input.background': '#FFFFFF',
      'input.border': '#E4E7E3',
      'dropdown.background': '#FFFFFF',
      'list.hoverBackground': '#EDEFEB',
    },
  },
  himalayan: {
    base: 'vs-dark',
    colors: {
      'editor.background': '#0C1426',
      'editor.foreground': '#F1F5FB',
      'editor.lineHighlightBackground': '#0F1830',
      'editor.selectionBackground': '#60A5FA33',
      'editor.inactiveSelectionBackground': '#60A5FA22',
      'editorCursor.foreground': '#FBBF24',
      'editorLineNumber.foreground': '#46536E',
      'editorLineNumber.activeForeground': '#F1F5FB',
      'editor.selectionHighlightBackground': '#60A5FA15',
      'editorIndentGuide.background': '#0A1220',
      'editorIndentGuide.activeBackground': '#1A2547',
      'editorWidget.background': '#111D35',
      'editorWidget.border': '#1A2547',
      'input.background': '#111D35',
      'input.border': '#1A2547',
      'dropdown.background': '#111D35',
      'list.hoverBackground': '#0F1830',
    },
  },
  midnight: {
    base: 'vs-dark',
    colors: {
      'editor.background': '#141B33',
      'editor.foreground': '#EDF0FF',
      'editor.lineHighlightBackground': '#111938',
      'editor.selectionBackground': '#818CF833',
      'editor.inactiveSelectionBackground': '#818CF822',
      'editorCursor.foreground': '#C084FC',
      'editorLineNumber.foreground': '#4C557A',
      'editorLineNumber.activeForeground': '#EDF0FF',
      'editor.selectionHighlightBackground': '#818CF815',
      'editorIndentGuide.background': '#0C1126',
      'editorIndentGuide.activeBackground': '#1A2547',
      'editorWidget.background': '#1A2547',
      'editorWidget.border': '#1A2547',
      'input.background': '#1A2547',
      'input.border': '#1A2547',
      'dropdown.background': '#1A2547',
      'list.hoverBackground': '#111938',
    },
  },
  forest: {
    base: 'vs-dark',
    colors: {
      'editor.background': '#162613',
      'editor.foreground': '#F0FAF0',
      'editor.lineHighlightBackground': '#13240F',
      'editor.selectionBackground': '#4ADE8033',
      'editor.inactiveSelectionBackground': '#4ADE8022',
      'editorCursor.foreground': '#86EFAC',
      'editorLineNumber.foreground': '#4A6048',
      'editorLineNumber.activeForeground': '#F0FAF0',
      'editor.selectionHighlightBackground': '#4ADE8015',
      'editorIndentGuide.background': '#0C1709',
      'editorIndentGuide.activeBackground': '#1E341A',
      'editorWidget.background': '#1E341A',
      'editorWidget.border': '#1E341A',
      'input.background': '#1E341A',
      'input.border': '#1E341A',
      'dropdown.background': '#1E341A',
      'list.hoverBackground': '#13240F',
    },
  },
  purple: {
    base: 'vs-dark',
    colors: {
      'editor.background': '#1C1430',
      'editor.foreground': '#F5F0FF',
      'editor.lineHighlightBackground': '#1A1129',
      'editor.selectionBackground': '#C084FC33',
      'editor.inactiveSelectionBackground': '#C084FC22',
      'editorCursor.foreground': '#E879F9',
      'editorLineNumber.foreground': '#5C507A',
      'editorLineNumber.activeForeground': '#F5F0FF',
      'editor.selectionHighlightBackground': '#C084FC15',
      'editorIndentGuide.background': '#110A1E',
      'editorIndentGuide.activeBackground': '#251C3F',
      'editorWidget.background': '#251C3F',
      'editorWidget.border': '#251C3F',
      'input.background': '#251C3F',
      'input.border': '#251C3F',
      'dropdown.background': '#251C3F',
      'list.hoverBackground': '#1A1129',
    },
  },
  slate: {
    base: 'vs-dark',
    colors: {
      'editor.background': '#161A1F',
      'editor.foreground': '#F2F4F6',
      'editor.lineHighlightBackground': '#14181D',
      'editor.selectionBackground': '#2DD4BF33',
      'editor.inactiveSelectionBackground': '#2DD4BF22',
      'editorCursor.foreground': '#5EEAD4',
      'editorLineNumber.foreground': '#4A535E',
      'editorLineNumber.activeForeground': '#F2F4F6',
      'editor.selectionHighlightBackground': '#2DD4BF15',
      'editorIndentGuide.background': '#0E1114',
      'editorIndentGuide.activeBackground': '#1D2228',
      'editorWidget.background': '#1D2228',
      'editorWidget.border': '#1D2228',
      'input.background': '#1D2228',
      'input.border': '#1D2228',
      'dropdown.background': '#1D2228',
      'list.hoverBackground': '#14181D',
    },
  },
  ember: {
    base: 'vs-dark',
    colors: {
      'editor.background': '#221710',
      'editor.foreground': '#FFF4EA',
      'editor.lineHighlightBackground': '#1F150D',
      'editor.selectionBackground': '#F9731633',
      'editor.inactiveSelectionBackground': '#F9731622',
      'editorCursor.foreground': '#FB923C',
      'editorLineNumber.foreground': '#64503F',
      'editorLineNumber.activeForeground': '#FFF4EA',
      'editor.selectionHighlightBackground': '#F9731615',
      'editorIndentGuide.background': '#161009',
      'editorIndentGuide.activeBackground': '#2C1F15',
      'editorWidget.background': '#2C1F15',
      'editorWidget.border': '#2C1F15',
      'input.background': '#2C1F15',
      'input.border': '#2C1F15',
      'dropdown.background': '#2C1F15',
      'list.hoverBackground': '#1F150D',
    },
  },
  aurora: {
    base: 'vs-dark',
    colors: {
      'editor.background': '#10101C',
      'editor.foreground': '#F5F5FF',
      'editor.lineHighlightBackground': '#0D0D18',
      'editor.selectionBackground': '#A78BFA33',
      'editor.inactiveSelectionBackground': '#22D3EE22',
      'editorCursor.foreground': '#67E8F9',
      'editorLineNumber.foreground': '#4C4C66',
      'editorLineNumber.activeForeground': '#F5F5FF',
      'editor.selectionHighlightBackground': '#A78BFA15',
      'editorIndentGuide.background': '#080810',
      'editorIndentGuide.activeBackground': '#181827',
      'editorWidget.background': '#181827',
      'editorWidget.border': '#181827',
      'input.background': '#181827',
      'input.border': '#181827',
      'dropdown.background': '#181827',
      'list.hoverBackground': '#0D0D18',
    },
  },
  paper: {
    base: 'vs',
    colors: {
      'editor.background': '#FFFFFF',
      'editor.foreground': '#221F1A',
      'editor.lineHighlightBackground': '#F0EDE6',
      'editor.selectionBackground': '#0C8A5A33',
      'editor.inactiveSelectionBackground': '#0C8A5A22',
      'editorCursor.foreground': '#0C8A5A',
      'editorLineNumber.foreground': '#ABA69B',
      'editorLineNumber.activeForeground': '#221F1A',
      'editor.selectionHighlightBackground': '#0C8A5A15',
      'editorIndentGuide.background': '#EAE7DF',
      'editorIndentGuide.activeBackground': '#CDC8BE',
      'editorWidget.background': '#FFFFFF',
      'editorWidget.border': '#EAE7DF',
      'input.background': '#FFFFFF',
      'input.border': '#EAE7DF',
      'dropdown.background': '#FFFFFF',
      'list.hoverBackground': '#F0EDE6',
    },
  },
}

export interface CodeEditorProps {
  value: string
  onChange?: (value: string) => void
  language?: string
  readOnly?: boolean
  height?: string | number
  className?: string
  label?: string
  showLineNumbers?: boolean
  onRun?: () => void
}

export default function CodeEditor({
  value,
  onChange,
  language = 'typescript',
  readOnly = false,
  height = 400,
  className,
  label,
  showLineNumbers = true,
  onRun,
}: CodeEditorProps) {
  const { theme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const monacoRef = useRef<any>(null)
  const copyTimerRef = useRef<number | undefined>(undefined)
  const onRunRef = useRef(onRun)

  useEffect(() => {
    setMounted(true)
    onRunRef.current = onRun
    // Surface CDN/loader failures instead of hanging on "Loading editor..." forever.
    loader.init().catch(() => setLoadError(true))
    return () => {
      setMounted(false)
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
    }
  }, [onRun])

  const applyMonacoTheme = useCallback((monaco: any) => {
    const themeConfig = MONACO_THEMES[theme as keyof typeof MONACO_THEMES] || MONACO_THEMES.light
    monaco.editor.defineTheme('onramp-' + theme, {
      base: themeConfig.base,
      inherit: true,
      rules: [],
      colors: themeConfig.colors,
    })
    monaco.editor.setTheme('onramp-' + theme)
  }, [theme])

  const handleEditorDidMount = useCallback((editor: any, monaco: any) => {
    monacoRef.current = monaco
    applyMonacoTheme(monaco)
    if (onRunRef.current) {
      // Keep the handler fresh via ref so Ctrl+Enter always runs with latest state.
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onRunRef.current?.())
    }
  }, [applyMonacoTheme])

  useEffect(() => {
    if (!monacoRef.current || !mounted) return
    applyMonacoTheme(monacoRef.current)
  }, [theme, mounted, applyMonacoTheme])

  const handleCopy = useCallback(async () => {
    if (!value) return
    await navigator.clipboard.writeText(value)
    setCopied(true)
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
    copyTimerRef.current = window.setTimeout(() => setCopied(false), 1500)
  }, [value])

  if (loadError) {
    return (
      <div className={cn('border border-error/25 bg-error-muted flex flex-col items-center justify-center gap-2 text-center px-6', className)} style={{ height }}>
        <WarningCircle size={20} className="text-error" weight="fill" />
        <p className="text-caption text-error font-medium">Code editor failed to load</p>
        <p className="text-caption text-ink-muted">The editor runtime is fetched from a CDN and could not be reached. Check your network or CSP policy.</p>
        <button
          type="button"
          onClick={() => { setLoadError(false); loader.init().catch(() => setLoadError(true)) }}
          className="btn btn-secondary px-3 py-1.5 text-caption"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!mounted) {
    return (
      <div className={cn('border border-border bg-bg-secondary', className)} style={{ height }}>
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-bg-secondary/80">
          <div className="w-2 h-2 rounded-full bg-text-tertiary/40" />
          <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-wider">
            {label || language}
          </span>
        </div>
        <div className="flex items-center justify-center h-full">
          <div className="text-text-tertiary text-caption">Loading editor...</div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'border border-border bg-bg-secondary overflow-hidden flex flex-col',
        className
      )}
      style={{ height }}
    >
      {(label || readOnly) && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-bg-secondary/80 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-accent-primary/60" />
            <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-wider">
              {label || language}
            </span>
          </div>
          {readOnly && value && (
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-text-tertiary hover:text-text-primary transition-colors"
              title="Copy code"
            >
              {copied ? (
                <Check size={12} className="text-accent-primary" />
              ) : (
                <Copy size={12} />
              )}
              <span className="text-[10px] font-mono">{copied ? 'Copied' : 'Copy'}</span>
            </button>
          )}
        </div>
      )}
      <Editor
        height="100%"
        language={language}
        value={value}
        onChange={onChange ? (val: string | undefined) => onChange(val || '') : undefined}
        theme={'onramp-' + theme}
        loading={
          <div className="flex items-center justify-center h-full text-text-tertiary text-caption">
            Loading editor...
          </div>
        }
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          lineNumbers: showLineNumbers ? 'on' : 'off',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          automaticLayout: true,
          padding: { top: 12, bottom: 12 },
          renderLineHighlight: 'line',
          overviewRulerBorder: false,
          hideCursorInOverviewRuler: true,
          overviewRulerLanes: 0,
          scrollbar: {
            vertical: 'auto',
            horizontal: 'auto',
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
          },
          folding: true,
          showFoldingControls: 'mouseover',
          bracketPairColorization: { enabled: true },
          guides: {
            bracketPairs: true,
            indentation: true,
          },
          fixedOverflowWidgets: true,
        }}
        onMount={handleEditorDidMount}
      />
    </div>
  )
}
