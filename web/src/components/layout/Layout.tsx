import { Outlet } from 'react-router-dom'
import Sidebar from '../ui/Sidebar'
import TopBar from '../ui/TopBar'
import TransitionOverlay from '../ui/TransitionOverlay'
import PageTransition from '../ui/page-transition'
import KeyboardShortcutHelp from '../ui/KeyboardShortcutHelp'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import AppShell from './AppShell'

export default function Layout() {
  const { showHelp, setShowHelp, getShortcuts } = useKeyboardShortcuts()

  return (
    <AppShell sidebar={<Sidebar />} topbar={<TopBar />}>
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
