import { cn } from '../../lib/utils'

interface CodeWindowProps {
  children: React.ReactNode
  className?: string
  language?: string
}

export default function CodeWindow({ children, className, language = 'bash' }: CodeWindowProps) {
  return (
    <div className={cn('rounded-xl border border-white/[0.06] overflow-hidden bg-slate-950/80 backdrop-blur-sm', className)}>
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/[0.06] bg-slate-900/50">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
        {language && (
          <span className="ml-auto text-[10px] text-slate-600 font-mono uppercase tracking-wider">
            {language}
          </span>
        )}
      </div>
      <div className="px-4 py-3 overflow-x-auto">
        <pre className="text-xs leading-relaxed text-slate-400 font-mono">
          <code>{children}</code>
        </pre>
      </div>
    </div>
  )
}

export function CodeInline({ children, className }: { children: string; className?: string }) {
  return (
    <span className={cn('inline-block px-1.5 py-0.5 bg-slate-800/80 border border-white/[0.06] rounded text-[10px] font-mono text-accent-from', className)}>
      {children}
    </span>
  )
}
