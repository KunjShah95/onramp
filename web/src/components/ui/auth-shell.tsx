import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { TreeStructure } from '@phosphor-icons/react'
import ConsolePanel from './console-panel'

interface AuthShellProps {
  /** Console rail call-sign (e.g. "Access"). */
  rail: string
  /** Mono designator (e.g. "STEP 1 OF 2"). */
  designator: string
  /** Status LED colour. */
  status?: 'go' | 'standby' | 'caution' | 'abort' | 'idle'
  title: string
  subtitle?: ReactNode
  children: ReactNode
  /** Content rendered below the panel (links, cross-links). */
  footer?: ReactNode
}

/**
 * AuthShell — Mission Control frame for pre-auth pages (login, register,
 * password flows, verification). Seated instrument layout: ink brand bar,
 * a single ConsolePanel carrying the call-sign rail, and a footer slot.
 * No gradients, no glass, no decorative glows.
 */
export default function AuthShell({
  rail, designator, status = 'standby', title, subtitle, children, footer,
}: AuthShellProps) {
  return (
    <div className="min-h-screen bg-room text-ink antialiased font-body flex flex-col">
      <header className="h-16 shrink-0 border-b border-seam bg-panel flex items-center justify-center sm:justify-start sm:px-10">
        <Link to="/" className="group flex items-center gap-2.5" aria-label="Onramp home">
          <span className="flex h-8 w-8 items-center justify-center rounded-[3px] bg-ink text-panel-raised transition-colors group-hover:bg-go">
            <TreeStructure size={16} weight="bold" />
          </span>
          <span className="font-display text-sm font-bold tracking-tight text-ink">ONRAMP</span>
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md">
          <ConsolePanel rail={rail} designator={designator} status={status}>
            <div className="mb-6">
              <h1 className="font-display text-display-md font-bold text-ink tracking-tight">{title}</h1>
              {subtitle && <p className="text-body-sm text-ink-secondary mt-1.5">{subtitle}</p>}
            </div>
            {children}
          </ConsolePanel>
          {footer && (
            <div className="mt-6 flex justify-center text-caption text-ink-muted">
              {footer}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
