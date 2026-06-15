import type { ReactNode } from 'react'

interface AppShellProps {
  /** Sidebar element (real or skeleton) */
  sidebar: ReactNode
  /** Top bar element (real or skeleton) */
  topbar: ReactNode
  /** Main content area */
  children: ReactNode
}

/**
 * Shared outer shell for the app layout.
 *
 * Both the real `<Layout />` and the `ProtectedRoute` loading skeleton
 * render through this component, so the shell structure is defined
 * in one place and any future changes (width, breakpoints, scroll
 * behaviour) are reflected everywhere automatically.
 */
export default function AppShell({ sidebar, topbar, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-transparent">
      {/* Sidebar */}
      {sidebar}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        {topbar}

        {/* Content */}
        <main className="flex-1 p-6 overflow-auto relative">
          {children}
        </main>
      </div>
    </div>
  )
}
