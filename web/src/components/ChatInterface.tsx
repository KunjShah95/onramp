import { useState, useRef, useEffect } from 'react'
import FeedbackWidget from './ui/FeedbackWidget'
import type { FeedbackFeature } from '../lib/api'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  onSend: (
    message: string,
    onToken: (token: string) => void,
    signal?: AbortSignal,
    mode?: string
  ) => Promise<void>
  mode?: string
  placeholder?: string
  /** Change this value to restore a historical conversation */
  restoreKey?: number
  /** When restoreKey changes, messages are replaced with these Q&A pairs */
  restoreMessages?: { question: string; answer: string }[]
  /** Change this value to append history turns to the current chat */
  appendKey?: number
  /** When appendKey changes, these messages are appended to the existing ones */
  appendMessages?: { question: string; answer: string }[]
  /** When set, each completed answer gets a thumbs up/down feedback widget */
  feedbackFeature?: FeedbackFeature
  /** Extra context attached to submitted feedback (e.g. index_id) */
  feedbackContext?: Record<string, unknown>
}

const EMPTY_MESSAGES: Message[] = []
const EXAMPLE_MESSAGES: Message[] = [
  {
    role: 'user',
    content: 'How does the routing strategy work in this Next.js project?',
  },
  {
    role: 'assistant',
    content: 'This project uses the Next.js App Router for routing. The primary layout is defined in `app/layout.tsx` which wraps all pages. Here is the root layout structure:\n\n```tsx\nexport default function RootLayout({\n  children,\n}: {\n  children: React.ReactNode\n}) {\n  return (\n    <html lang="en">\n      <body>\n        {children}\n      </body>\n    </html>\n  )\n}\n```\n\nRouting is entirely file-system based within the `app` directory. Each folder with a `page.tsx` file becomes a route segment.',
  },
]

export default function ChatInterface({ onSend, mode, placeholder = 'Ask a question...', restoreKey, restoreMessages, appendKey, appendMessages, feedbackFeature, feedbackContext }: Props) {
  const [messages, setMessages] = useState<Message[]>(EXAMPLE_MESSAGES)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Restore history when restoreKey changes (replaces messages)
  useEffect(() => {
    if (restoreKey !== undefined && restoreMessages && restoreMessages.length > 0) {
      const restored: Message[] = []
      for (const turn of restoreMessages) {
        restored.push({ role: 'user', content: turn.question })
        restored.push({ role: 'assistant', content: turn.answer })
      }
      setMessages(restored)
    } else if (restoreKey !== undefined) {
      // restoreKey changed but no messages — reset to empty
      setMessages(EMPTY_MESSAGES)
    }
  }, [restoreKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Append history turns when appendKey changes
  useEffect(() => {
    if (appendKey !== undefined && appendMessages && appendMessages.length > 0) {
      const toAppend: Message[] = []
      for (const turn of appendMessages) {
        toAppend.push({ role: 'user', content: turn.question })
        toAppend.push({ role: 'assistant', content: turn.answer })
      }
      setMessages((prev) => [...prev, ...toAppend])
    }
  }, [appendKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup in-flight request on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && loading) {
        handleStop()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [loading])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleStop() {
    abortRef.current?.abort()
    abortRef.current = null
    setLoading(false)
  }

  async function handleSend() {
    const q = input.trim()
    if (!q || loading) return
    setInput('')
    setLoading(true)

    // Add user message + an empty assistant placeholder that will receive tokens
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: q },
      { role: 'assistant', content: '' },
    ])

    // Track whether we received any tokens before error
    let hadTokens = false
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await onSend(q, (token) => {
        hadTokens = true
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last && last.role === 'assistant') {
            next[next.length - 1] = { ...last, content: last.content + token }
          }
          return next
        })
      }, controller.signal, mode)
    } catch (err) {
      // If the user intentionally stopped, leave partial content as-is
      if (err instanceof DOMException && err.name === 'AbortError') {
        // user clicked stop — no error message needed
      } else {
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last && last.role === 'assistant') {
            next[next.length - 1] = {
              ...last,
              content: hadTokens
                ? last.content + '\n\n[Stream interrupted — connection error]'
                : 'Error: Failed to get answer',
            }
          } else {
            next.push({ role: 'assistant', content: 'Error: Failed to get answer' })
          }
          return next
        })
      }
    }
    abortRef.current = null
    setLoading(false)
  }

  // Clean up empty assistant placeholder if stream produced no tokens at all
  useEffect(() => {
    if (loading) return
    setMessages((prev) => prev.filter((m) => !(m.role === 'assistant' && m.content === '')))
  }, [loading])

  return (
    <div className="flex flex-col h-full bg-[#1A1512] border border-[#FDFBF8]/5 rounded-2xl overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 && (
          <div className="text-[#FDFBF8]/40 text-center py-12 text-sm">
            Ask a question about your codebase
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'user' ? (
              <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-[#33281f] text-[#FDFBF8] px-5 py-3 text-sm shadow-sm border border-[#FDFBF8]/5">
                <pre className="whitespace-pre-wrap font-body">{msg.content}</pre>
              </div>
            ) : (
              <div className="max-w-[85%] flex gap-4">
                <div className="w-8 h-8 rounded bg-[#241912] border border-[#FDFBF8]/10 flex items-center justify-center shrink-0 mt-1">
                  <span className="material-symbols-outlined text-[#FDFBF8]/60 text-sm">robot_2</span>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-[#FDFBF8]/60">CodeFlow 2.0 Assistant</span>
                  <div className="text-sm text-[#FDFBF8]/90 leading-relaxed">
                    {msg.content.split('```').map((part, index) => {
                      if (index % 2 === 1) {
                        // Code block
                        const lines = part.split('\n')
                        const lang = lines[0]
                        const code = lines.slice(1).join('\n')
                        return (
                          <div key={index} className="my-3 rounded-lg overflow-hidden border border-[#FDFBF8]/10 bg-[#110D0A]">
                            <div className="flex items-center justify-between px-4 py-2 bg-[#1A1512] border-b border-[#FDFBF8]/5">
                              <span className="text-[10px] text-[#FDFBF8]/40 font-mono">{lang}</span>
                              <button className="text-[10px] text-[#FDFBF8]/40 hover:text-[#FDFBF8] flex items-center gap-1">
                                <span className="material-symbols-outlined text-[12px]">content_copy</span> Copy
                              </button>
                            </div>
                            <pre className="p-4 text-xs font-mono text-[#FDFBF8]/80 overflow-x-auto">
                              {code}
                            </pre>
                          </div>
                        )
                      }
                      return <span key={index} className="whitespace-pre-wrap">{part}</span>
                    })}
                  </div>
                  {feedbackFeature && msg.content && !(loading && i === messages.length - 1) && (
                    <FeedbackWidget
                      feature={feedbackFeature}
                      context={{
                        ...feedbackContext,
                        question: messages[i - 1]?.role === 'user' ? messages[i - 1].content.slice(0, 500) : undefined,
                        answer_preview: msg.content.slice(0, 300),
                      }}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        {loading && messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content === '' && (
          <div className="flex justify-start gap-4">
            <div className="w-8 h-8 rounded bg-[#241912] border border-[#FDFBF8]/10 flex items-center justify-center shrink-0 mt-1">
              <span className="material-symbols-outlined text-[#FDFBF8]/60 text-sm">robot_2</span>
            </div>
            <div className="flex items-center">
               <div className="text-sm text-[#FDFBF8]/40">Thinking...</div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-4 bg-[#1A1512] border-t border-[#FDFBF8]/5">
        <div className="flex items-center gap-2 bg-[#110D0A] border border-[#FDFBF8]/10 rounded-xl px-2 py-2 focus-within:border-[#FF8C00]/50 transition-colors">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                // Ctrl+Enter — send
                e.preventDefault()
                handleSend()
              } else if (e.key === 'Enter' && !e.shiftKey) {
                // Plain Enter — send
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder={placeholder}
            className="flex-1 bg-transparent border-none outline-none px-3 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/30"
          />
          {loading ? (
            <button
              onClick={handleStop}
              className="bg-red-500/80 hover:bg-red-500 text-white font-semibold p-2 rounded-lg transition-colors flex items-center justify-center shadow-glow"
              title="Stop generating"
            >
              <span className="material-symbols-outlined text-sm">stop</span>
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="bg-[#FF8C00] hover:bg-[#FFB347] text-[#3D1C00] font-semibold p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-glow"
            >
              <span className="material-symbols-outlined text-sm">send</span>
            </button>
          )}
        </div>
        <div className="text-center mt-2">
           <span className="text-[10px] text-[#FDFBF8]/30">AI can make mistakes. Verify important information.</span>
        </div>
      </div>
    </div>
  )
}
