import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '../ui/Sidebar'
import TopBar from '../ui/TopBar'
import Seo from '../seo/Seo'
import TransitionOverlay from '../ui/TransitionOverlay'
import PageTransition from '../ui/page-transition'
import KeyboardShortcutHelp from '../ui/KeyboardShortcutHelp'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import AppShell from './AppShell'

export default function Layout() {
  const { showHelp, setShowHelp, getShortcuts, lastShortcut } = useKeyboardShortcuts()
  const { pathname } = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  return (
    <AppShell
      sidebar={<Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />}
      topbar={<TopBar lastShortcut={lastShortcut} onMenuClick={() => setSidebarOpen(true)} />}
    >
      {/* App shell is behind auth — keep it out of search indexes. */}
      <Seo title="Onramp" noindex />
      <TransitionOverlay />
      <PageTransition>
        <Outlet />
      </PageTransition>
      {showHelp && (
        <KeyboardShortcutHelp
          shortcuts={getShortcuts()}
          onClose={() => setShowHelp(false)}
        />
      )}
    </AppShell>
  )
}
