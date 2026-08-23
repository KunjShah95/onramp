import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  PaperPlaneRight,
  Spinner,
  Robot,
  User,
  Copy,
  Check,
  Trash,
  GitBranch,
} from '@phosphor-icons/react'
import { cn } from '../lib/utils'
import { useToast } from '../context/ToastContext'
import { useRoastMode } from '../context/RoastModeContext'
import { useAuth } from '../context/AuthContext'
import { indexRepo, askQuestionStream } from '../lib/api'
import RoastModeToggle from '../components/ui/RoastModeToggle'
import ModelPicker from '../components/ui/ModelPicker'
import RoutingModePicker, { type RoutingModeValue } from '../components/ui/RoutingModePicker'
import ConsolePanel from '../components/ui/console-panel'
import { PageHeader } from '../components/ui/page-header'

const fade = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
}

// The routing dial is persisted locally so a reload doesn't silently reset
// it to Auto mid-conversation. Only the named presets (or null = Auto) are
// accepted back out of storage.
const ROUTING_MODE_STORAGE_KEY = 'onramp:ask:routingMode'
const ROUTING_MODE_VALUES = new Set(['cost', 'balanced', 'intelligence'])

function readStoredRoutingMode(): RoutingModeValue {
  try {
    const raw = localStorage.getItem(ROUTING_MODE_STORAGE_KEY)
    if (raw && ROUTING_MODE_VALUES.has(raw)) return raw
  } catch {
    // storage unavailable (private mode / SSR) — fall back to Auto
  }
  return null
}

function writeStoredRoutingMode(value: RoutingModeValue): void {
  try {
    if (value === null) {
      localStorage.removeItem(ROUTING_MODE_STORAGE_KEY)
    } else {
      localStorage.setItem(ROUTING_MODE_STORAGE_KEY, String(value))
    }
  } catch {
    // storage unavailable — non-critical, skip
  }
}

const MAX_MESSAGES = 100
const MAX_CONTENT_CHARS = 50 * 1024 // 50KB per message

function sanitizeMarkdown(text: string): string {
  // Strip dangerous HTML/script that could execute if rendered as innerHTML elsewhere
  let out = text.replace(/<script[\s\S]*?<\/script>/gi, '')
  out = out.replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
  out = out.replace(/javascript\s*:/gi, '')
  out = out.replace(/\son\w+\s*=/gi, ' ')
  return out
}

function truncateContent(text: string): string {
  if (text.length <= MAX_CONTENT_CHARS) return text
  return text.slice(0, MAX_CONTENT_CHARS) + '\n\n[truncated — 50KB limit]'
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  /** Provider/model that actually served this answer ("groq/llama-3.3-70b-versatile"). */
  route?: string
}

const SUGGESTIONS = [
  'How does the query pipeline work?',
  'Explain the code health scoring algorithm',
  'What modules have the highest tech debt?',
  'Show me recent PRs that need review',
]

const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  role: 'assistant',
  content: "Hello! I'm your AI coding assistant. I can help you understand the codebase, answer questions about modules, review PRs, and more. What would you like to know?",
  timestamp: new Date(),
}

export default function AskPage() {
  const [repoUrl, setRepoUrl] = useState('')
  const [indexId, setIndexId] = useState<string | null>(null)
  const [indexing, setIndexing] = useState(false)
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  // Explicit model pinned for this conversation (null = Auto routing).
  // Sent with every /ask request — see ModelPicker.
  const [model, setModel] = useState<string | null>(null)
  // Cost/quality routing dial for this conversation (null = Auto/team default).
  // Restored from localStorage so the choice survives page reloads.
  const [routingMode, setRoutingMode] = useState<RoutingModeValue>(readStoredRoutingMode)
  const { enabled: roastMode } = useRoastMode()
  // Active team scope for routing settings (BYOK keys + routing dial) —
  // sent with every /ask request; verified server-side.
  const { activeTeamId } = useAuth()
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const toast = useToast()

  useEffect(() => {
    if (messages.length > 1 && messages[messages.length - 1]?.content?.length < 5) return
    bottomRef.current?.scrollIntoView({ behavior: messages.length > 1 ? 'auto' : 'smooth' })
  }, [messages])

  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  // Keep the persisted routing dial in sync with the live picker.
  useEffect(() => {
    writeStoredRoutingMode(routingMode)
  }, [routingMode])

  const handleSend = async (explicitQuestion?: string) => {
    let question = (explicitQuestion ?? input).trim()
    if (!question || loading || indexing) return
    if (!repoUrl.trim()) {
      toast.error('Repository required', 'Enter a GitHub repo URL to index first.')
      return
    }
    question = sanitizeMarkdown(truncateContent(question))
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
      timestamp: new Date(),
    }
    const assistantId = `ai-${Date.now()}`
    setMessages((prev: Message[]) => {
      const next: Message[] = [
        ...prev,
        userMsg,
        { id: assistantId, role: 'assistant', content: '', timestamp: new Date() } as Message,
      ]
      // Cap unbounded growth — keep last MAX_MESSAGES
      return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next
    })
    setInput('')
    setLoading(true)

    try {
      let idx = indexId
      if (!idx) {
        setIndexing(true)
        const res = await indexRepo(repoUrl)
        idx = res.index_id
        setIndexId(idx)
        setIndexing(false)
      }
      const controller = new AbortController()
      abortRef.current = controller
       await askQuestionStream(
        idx,
        question,
        (token) => {
          const safeToken = sanitizeMarkdown(token)
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m
              let next = m.content + safeToken
              if (next.length > MAX_CONTENT_CHARS) next = next.slice(0, MAX_CONTENT_CHARS) + '\n\n[truncated]'
              return { ...m, content: next }
            })
          )
        },
        controller.signal,
        roastMode ? 'roast' : 'normal',
        model ?? undefined,
        routingMode,
        (served) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, route: served } : m))
          )
        },
        activeTeamId ?? null
      )
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: m.content || `Error: ${err.message || 'Failed to get an answer.'}` }
            : m
        )
      )
      toast.error('Ask failed', err.message)
    } finally {
      setLoading(false)
      setIndexing(false)
      abortRef.current = null
    }
  }

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleClear = () => {
    setMessages([WELCOME_MESSAGE])
  }

  return (
    <div className="w-full min-h-[calc(100vh-4rem)] bg-base">
      <div className="max-w-4xl mx-auto h-[calc(100vh-4rem)] flex flex-col">

        {/* Header */}
        <PageHeader
          flush
          eyebrow="Folio 02 · Ask"
          title="One anchor. One stream."
          subtitle="Pin a repo. Ask the code. The repo indexes on first question."
          actions={
            <>
              <RoastModeToggle />
              <ModelPicker value={model} onChange={setModel} />
              <RoutingModePicker value={routingMode} onChange={setRoutingMode} />
              {messages.length > 1 && (
                <button onClick={handleClear} className="btn-secondary">
                  <Trash className="w-3.5 h-3.5" weight="bold" />
                  Clear
                </button>
              )}
            </>
          }
        />

        {/* Anchor — repo input (status panel, not just a field) */}
        <motion.div initial="hidden" animate="show" variants={fade} className="mb-4 shrink-0">
          <ConsolePanel
            rail={indexId ? 'Indexed' : 'Anchor'}
            designator="REPO"
            status={indexId ? 'go' : 'standby'}
            live={!!indexId}
            pad="dense"
          >
            <div className="relative flex items-center gap-2">
              <GitBranch size={14} className="text-ink-tertiary shrink-0" weight="bold" />
              <label htmlFor="repo-url" className="sr-only">Repository URL</label>
              <input
                id="repo-url"
                aria-label="Repository URL"
                value={repoUrl}
                onChange={(e) => { setRepoUrl(e.target.value); setIndexId(null) }}
                placeholder="github.com/owner/repo"
                className="flex-1 bg-transparent text-[13.5px] font-code text-ink placeholder:text-ink-disabled outline-none"
              />
              {indexId && (
                <span className="font-code text-[10px] text-go uppercase tracking-wider shrink-0">
                  Ready
                </span>
              )}
            </div>
          </ConsolePanel>
        </motion.div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto rounded-[3px] border border-seam bg-panel">
          <div className="p-4 space-y-4">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    'flex items-start gap-3',
                    msg.role === 'user' ? 'justify-end' : ''
                  )}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-[3px] bg-go/10 border border-go/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Robot className="w-3.5 h-3.5 text-go" weight="fill" />
                    </div>
                  )}
                  <div className={cn('max-w-[80%]', msg.role === 'user' ? 'order-1' : '')}>
                    <div className={cn(
                      'rounded-[3px] px-4 py-3 border',
                      msg.role === 'user'
                        ? 'bg-go/10 border-go/20'
                        : 'bg-base border-seam',
                    )}>
                      {msg.role === 'assistant' ? (
                        <div className="font-body text-[13.5px] text-ink-secondary leading-relaxed space-y-1">
                          {msg.content.split('\n').map((line, i) => {
                            // Key by message id + index; existing lines keep their
                            // index as streaming appends tokens to the end.
                            const k = `${msg.id}-${i}`
                            if (line.startsWith('|')) return null
                            if (line.startsWith('```') || line.startsWith('``')) return null
                            if (line.startsWith('**')) {
                              return <p key={k} className="text-ink font-semibold mb-1">{line.replace(/\*\*/g, '')}</p>
                            }
                            if (line.startsWith('-') || line.startsWith('•')) {
                              return <p key={k} className="pl-3 text-ink-secondary">{line}</p>
                            }
                            if (line.match(/^\d+\./)) {
                              return <p key={k} className="ml-2 text-ink-secondary">{line}</p>
                            }
                            if (line.trim()) {
                              return <p key={k} className="text-ink-secondary">{line}</p>
                            }
                            return <br key={k} />
                          })}
                          {!msg.content && (
                            <p className="text-ink-tertiary italic">…</p>
                          )}
                        </div>
                      ) : (
                        <p className="font-body text-[13.5px] text-ink">{msg.content}</p>
                      )}
                    </div>
                    <div className={cn('flex items-center gap-2 mt-1', msg.role === 'user' ? 'justify-end' : '')}>
                      <span className="font-code text-[10px] text-ink-tertiary">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {msg.role === 'assistant' && msg.route && (
                        <span
                          className="font-code text-[9.5px] text-go/70 uppercase tracking-wider"
                          title="Provider/model that served this answer (via the model router)"
                        >
                          served by {msg.route}
                        </span>
                      )}
                      {msg.role === 'assistant' && msg.id !== 'welcome' && msg.content && (
                        <button
                          onClick={() => handleCopy(msg.id, msg.content)}
                          className="text-ink-tertiary hover:text-ink transition-colors"
                          aria-label="Copy message"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-3 h-3 text-go" weight="bold" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-7 h-7 rounded-[3px] bg-mission/10 border border-mission/20 flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-3.5 h-3.5 text-mission" weight="fill" />
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {loading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3"
              >
                <div className="w-7 h-7 rounded-[3px] bg-go/10 border border-go/20 flex items-center justify-center shrink-0">
                  <Robot className="w-3.5 h-3.5 text-go" weight="fill" />
                </div>
                <div className="rounded-[3px] bg-base border border-seam px-4 py-3 flex items-center gap-2">
                  <Spinner className="w-3.5 h-3.5 text-go animate-spin" />
                  <span className="font-code text-[12px] text-ink-tertiary">
                    {indexing ? 'Indexing repository…' : 'Thinking…'}
                  </span>
                </div>
              </motion.div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Suggestions — appear only when there's nothing asked yet */}
        {messages.length === 1 && (
          <div className="flex flex-wrap gap-1.5 mt-3 shrink-0">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => { setInput(s); handleSend(s) }}
                className="px-3 py-1.5 rounded-[3px] bg-base border border-seam text-[12px] font-body text-ink-secondary hover:text-ink hover:border-seam-strong transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="mt-3 shrink-0">
          <div className="flex items-center gap-2 bg-panel border border-seam rounded-[3px] px-3 py-2">
            <label htmlFor="ask-input" className="sr-only">Ask a question about the codebase</label>
            <input
              id="ask-input"
              aria-label="Ask a question about the codebase"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask a question about the codebase…"
              className="flex-1 bg-transparent font-body text-[13.5px] text-ink placeholder:text-ink-disabled outline-none px-1"
              disabled={loading}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
              className="shrink-0 w-8 h-8 rounded-[3px] bg-go text-white flex items-center justify-center transition-colors hover:bg-go-lit disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Send"
            >
              {loading ? (
                <Spinner className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <PaperPlaneRight className="w-3.5 h-3.5" weight="fill" />
              )}
            </button>
          </div>
          <p className="font-code text-[10px] text-ink-tertiary mt-1.5 text-center">
            {model
        ? `Model pinned: ${model} · every question uses it`
        : 'Auto routing · the router picks the best model per question'}
            {routingMode != null && (
              <>
                {' · '}routing mode: {String(routingMode)}
              </>
            )}
            {' · AI responses are generated based on codebase analysis'}
          </p>
        </div>
      </div>
    </div>
  )
}
