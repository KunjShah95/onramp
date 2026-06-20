import { Outlet } from 'react-router-dom'
import Sidebar from '../ui/Sidebar'
import TopBar from '../ui/TopBar'
import TransitionOverlay from '../ui/TransitionOverlay'
import PageTransition from '../ui/page-transition'
import AppShell from './AppShell'

export default function Layout() {
  return (
    <AppShell sidebar={<Sidebar />} topbar={<TopBar />}>
      <TransitionOverlay />
      <PageTransition>
        <Outlet />
      </PageTransition>
    </AppShell>
  )
}
