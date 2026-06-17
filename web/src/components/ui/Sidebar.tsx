import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/utils'

function IconTerminal({ className }: { className?: string }) {
  return (
    <svg className={cn('w-[18px] h-[18px]', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M4 6h16v12H4z" />
    </svg>
  )
}

function IconAnalysis({ className }: { className?: string }) {
  return (
    <svg className={cn('w-[18px] h-[18px]', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13h2v7H3v-7zm6-4h2v11H9V9zm6 5h2v6h-2v-6zm6-8h2v14h-2V6z" />
    </svg>
  )
}

function IconProjects({ className }: { className?: string }) {
  return (
    <svg className={cn('w-[18px] h-[18px]', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  )
}

function IconPerformance({ className }: { className?: string }) {
  return (
    <svg className={cn('w-[18px] h-[18px]', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
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

// ── Navigation Data ──────────────────────────────────────────

const mainItems = [
  { to: '/learn', label: 'Terminal', Icon: IconTerminal },
  { to: '/explore', label: 'Analysis', Icon: IconAnalysis },
  { to: '/first-issue', label: 'Projects', Icon: IconProjects },
  { to: '/reports', label: 'Performance', Icon: IconPerformance },
  { to: '/settings', label: 'Settings', Icon: IconSettings },
]

const bottomItems = [
  { to: '/docs', label: 'Documentation', Icon: IconDocs },
  { to: '/support', label: 'Support', Icon: IconSupport },
]

// ── Sidebar Component ────────────────────────────────────────

export default function Sidebar() {
  return (
    <aside className="w-[260px] min-h-screen bg-[#110B08] border-r border-[#FDFBF8]/5 flex flex-col shrink-0 font-mono">
      {/* Brand */}
      <div className="px-6 py-8 flex flex-col gap-1">
        <h2 className="text-[#FF8C00] font-bold text-sm tracking-tight">CodeFlow Console</h2>
        <span className="text-[#FDFBF8]/40 text-xs">v2.0.4-stable</span>
      </div>

      {/* Main Nav */}
      <nav className="flex-1 px-4 space-y-2 font-mono">
        {mainItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-4 px-3 py-2.5 rounded-lg text-[13px] transition-colors group',
                isActive
                  ? 'bg-[#1A110D] text-[#FF8C00] font-medium'
                  : 'text-[#FDFBF8]/60 hover:text-[#FDFBF8] hover:bg-[#1A110D]/50'
              )
            }
          >
            <item.Icon className={cn("w-5 h-5 shrink-0 transition-colors")} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom Nav */}
      <div className="p-4 flex flex-col gap-4 font-mono">
        <button className="w-full bg-[#FFB347] hover:bg-[#FF8C00] text-[#3D1C00] text-sm py-2.5 rounded-sm flex items-center justify-center gap-2 transition-colors font-medium">
          <span>+</span> New Instance
        </button>
        <nav className="space-y-2">
          {bottomItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-4 px-3 py-2.5 rounded-lg text-[13px] transition-colors group',
                  isActive
                    ? 'bg-[#1A110D] text-[#FF8C00] font-medium'
                    : 'text-[#FDFBF8]/60 hover:text-[#FDFBF8] hover:bg-[#1A110D]/50'
                )
              }
            >
              <item.Icon className={cn("w-5 h-5 shrink-0 transition-colors")} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  )
}
