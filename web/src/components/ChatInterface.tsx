import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  onSend: (message: string) => Promise<string>
  placeholder?: string
}

export default function ChatInterface({ onSend, placeholder = 'Ask a question...' }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'user',
      content: 'How does the routing strategy work in this Next.js project?',
    },
    {
      role: 'assistant',
      content: 'This project uses the Next.js App Router for routing. The primary layout is defined in `app/layout.tsx` which wraps all pages. Here is the root layout structure:\n\n```tsx\nexport default function RootLayout({\n  children,\n}: {\n  children: React.ReactNode\n}) {\n  return (\n    <html lang="en">\n      <body>\n        {children}\n      </body>\n    </html>\n  )\n}\n```\n\nRouting is entirely file-system based within the `app` directory. Each folder with a `page.tsx` file becomes a route segment.',
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const q = input.trim()
    if (!q || loading) return
    setInput('')
    setLoading(true)
    setMessages((prev) => [...prev, { role: 'user', content: q }])

    try {
      const answer = await onSend(q)
      setMessages((prev) => [...prev, { role: 'assistant', content: answer }])
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Error: Failed to get answer' },
      ])
    }
    setLoading(false)
  }

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
                </div>
              </div>
            )}
          </div>
        ))}
        {loading && (
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
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={placeholder}
            className="flex-1 bg-transparent border-none outline-none px-3 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/30"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="bg-[#FF8C00] hover:bg-[#FFB347] text-[#3D1C00] font-semibold p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-glow"
          >
            <span className="material-symbols-outlined text-sm">send</span>
          </button>
        </div>
        <div className="text-center mt-2">
           <span className="text-[10px] text-[#FDFBF8]/30">AI can make mistakes. Verify important information.</span>
        </div>
      </div>
    </div>
  )
}
