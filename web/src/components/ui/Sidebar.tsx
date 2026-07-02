import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { useAuth } from '../../context/AuthContext'

function IconHome({ className }: { className?: string }) {
  return (
    <svg className={cn('w-[18px] h-[18px]', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  )
}

function IconExplore({ className }: { className?: string }) {
  return (
    <svg className={cn('w-[18px] h-[18px]', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
    </svg>
  )
}

function IconChat({ className }: { className?: string }) {
  return (
    <svg className={cn('w-[18px] h-[18px]', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
    </svg>
  )
}

function IconLearn({ className }: { className?: string }) {
  return (
    <svg className={cn('w-[18px] h-[18px]', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
    </svg>
  )
}

function IconPR({ className }: { className?: string }) {
  return (
    <svg className={cn('w-[18px] h-[18px]', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h-.75A2.25 2.25 0 004.5 9.75v7.5a2.25 2.25 0 002.25 2.25h7.5a2.25 2.25 0 002.25-2.25v-7.5a2.25 2.25 0 00-2.25-2.25h-.75m-6 3.75l3 3m0 0l3-3m-3 3V1.5m6 9h.75a2.25 2.25 0 012.25 2.25v7.5a2.25 2.25 0 01-2.25 2.25h-7.5a2.25 2.25 0 01-2.25-2.25v-.75" />
    </svg>
  )
}

function IconProgress({ className }: { className?: string }) {
  return (
    <svg className={cn('w-[18px] h-[18px]', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  )
}

function IconTasks({ className }: { className?: string }) {
  return (
    <svg className={cn('w-[18px] h-[18px]', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  )
}

function IconFirstIssue({ className }: { className?: string }) {
  return (
    <svg className={cn('w-[18px] h-[18px]', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  )
}

function IconSettings({ className }: { className?: string }) {
  return (
    <svg className={cn('w-[18px] h-[18px]', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function IconDocs({ className }: { className?: string }) {
  return (
    <svg className={cn('w-[18px] h-[18px]', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

function IconSupport({ className }: { className?: string }) {
  return (
    <svg className={cn('w-[18px] h-[18px]', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function IconReview({ className }: { className?: string }) {
  return (
    <svg className={cn('w-[18px] h-[18px]', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function IconAdmin({ className }: { className?: string }) {
  return (
    <svg className={cn('w-[18px] h-[18px]', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  )
}

function IconHealth({ className }: { className?: string }) {
  return (
    <svg className={cn('w-[18px] h-[18px]', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
    </svg>
  )
}

// ── Nav sections ─────────────────────────────────────────────

const mainItems = [
  { to: '/dashboard',  label: 'Overview',     Icon: IconHome },
  { to: '/my-progress', label: 'My Progress',  Icon: IconProgress },
  { to: '/reviews',    label: 'Review Queue', Icon: IconReview },
  { to: '/code-health', label: 'Code Health', Icon: IconHealth },
  { to: '/admin',       label: 'Admin',       Icon: IconAdmin },
  { to: '/explore',    label: 'Explore',      Icon: IconExplore },
  { to: '/ask',        label: 'Ask Codebase', Icon: IconChat },
  { to: '/learn',      label: 'Learn',        Icon: IconLearn },
  { to: '/tasks',       label: 'Tasks',        Icon: IconTasks },
  { to: '/first-issue', label: 'First Issue',  Icon: IconFirstIssue },
  { to: '/pr-describe', label: 'PR Describe', Icon: IconPR },
  { to: '/settings',  label: 'Settings',    Icon: IconSettings },
]

const bottomItems = [
  { to: '/docs',    label: 'Documentation', Icon: IconDocs },
  { to: '/support', label: 'Support',       Icon: IconSupport },
]

// ── Sidebar ──────────────────────────────────────────────────

export default function Sidebar() {
  const { role } = useAuth()

  const filteredItems = mainItems.filter((item) => {
    // Hide CTO Dashboard/Overview from trainees
    if (item.to === '/dashboard' && role === 'member') {
      return false
    }
    // Hide Trainee Progress from seniors/owners
    if (item.to === '/my-progress' && role !== 'member' && role !== null) {
      return false
    }
    // Hide Review Queue from trainees
    if (item.to === '/reviews' && role === 'member') {
      return false
    }
    // Hide Code Health from trainees
    if (item.to === '/code-health' && role === 'member') {
      return false
    }
    // Hide Admin from seniors and members
    if (item.to === '/admin' && role !== 'owner') {
      return false
    }
    return true
  })

  return (
    <aside aria-label="Primary navigation" className="w-[260px] min-h-screen bg-[#110B08] border-r border-[#FDFBF8]/5 flex flex-col shrink-0 font-mono">
      {/* Brand */}
      <div className="px-6 py-7 flex flex-col gap-1">
        <h2 className="text-[#FF8C00] font-bold text-sm tracking-tight">CodeFlow Console</h2>
        <span className="text-[#FDFBF8]/30 text-xs">v2.0.4-stable</span>
      </div>

      {/* Section label */}
      <div className="px-7 mb-2">
        <span className="text-[10px] text-[#FDFBF8]/25 uppercase tracking-widest font-semibold">Workspace</span>
      </div>

      {/* Main Nav */}
      <nav aria-label="Main workspace" className="flex-1 px-4 space-y-0.5">
        {filteredItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-colors',
                isActive
                  ? 'bg-[#1A110D] text-[#FF8C00] font-medium'
                  : 'text-[#FDFBF8]/55 hover:text-[#FDFBF8] hover:bg-[#1A110D]/50'
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.Icon className={cn('w-[18px] h-[18px] shrink-0', isActive ? 'text-[#FF8C00]' : '')} />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="p-4 flex flex-col gap-3">
        <NavLink
          to="/explore"
          className="w-full bg-[#FFB347] hover:bg-[#FF8C00] text-[#3D1C00] text-sm py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors font-medium"
        >
          <span className="text-lg leading-none" aria-hidden="true">+</span> New Analysis
        </NavLink>
        <nav aria-label="Help and resources" className="space-y-0.5">
          {bottomItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-colors',
                  isActive
                    ? 'bg-[#1A110D] text-[#FF8C00] font-medium'
                    : 'text-[#FDFBF8]/55 hover:text-[#FDFBF8] hover:bg-[#1A110D]/50'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.Icon className={cn('w-[18px] h-[18px] shrink-0', isActive ? 'text-[#FF8C00]' : '')} />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  )
}
