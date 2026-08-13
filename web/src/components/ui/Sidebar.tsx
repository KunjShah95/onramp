import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { useAuth } from '../../context/AuthContext'
import {
  House, Compass, ChatCircleDots, GraduationCap,
  GitPullRequest, ChartBar, ListChecks, BugBeetle, Gear,
  BookOpenText, Question, ShieldCheck, Heartbeat, Eye, Code,
  Star, Key, Rocket, FileCode, Bell, Flag, Storefront, Warning, Robot,
  Users, CaretLeft, CaretRight, TrendUp,
} from '@phosphor-icons/react'

const SIDEBAR_KEY = 'onramp-sidebar-collapsed'

/** Role-based portal pages — the "hub" for each persona. */
const portalItems = [
  { to: '/dev-space',      label: 'Dev Space',     Icon: Code,        roles: ['developer', 'tester', 'senior_dev', 'owner', 'ceo', 'cto'] },
  { to: '/executive',      label: 'Executive',     Icon: ChartBar,    roles: ['owner', 'ceo', 'cto'] },
  { to: '/senior-space',   label: 'Senior',        Icon: ShieldCheck, roles: ['senior_dev', 'senior', 'owner', 'ceo', 'cto'] },
  { to: '/onboarding-hub', label: 'Onboarding',    Icon: GraduationCap, roles: ['new_dev', 'member'] },
]

/** Daily workspace — things you open every day. */
const workspaceItems = [
  { to: '/dashboard',   label: 'Dashboard',   Icon: House,          roles: ['senior_dev', 'developer', 'tester', 'owner', 'ceo', 'cto', 'senior'] },
  { to: '/explore',     label: 'Explore',     Icon: Compass,        roles: ['new_dev', 'member', 'senior_dev', 'developer', 'tester', 'owner', 'ceo', 'cto', 'senior'] },
  { to: '/ask',         label: 'Ask Codebase', Icon: ChatCircleDots, roles: ['new_dev', 'member', 'senior_dev', 'developer', 'tester', 'owner', 'ceo', 'cto', 'senior'] },
  { to: '/learn',       label: 'Learn',        Icon: GraduationCap, roles: ['new_dev', 'member', 'senior_dev', 'developer', 'tester', 'owner', 'ceo', 'cto', 'senior'] },
  { to: '/tasks',       label: 'Tasks',        Icon: ListChecks,    roles: ['new_dev', 'member', 'senior_dev', 'developer', 'tester', 'owner', 'ceo', 'cto', 'senior'] },
  { to: '/notifications', label: 'Notifications', Icon: Bell,       roles: ['new_dev', 'member', 'senior_dev', 'developer', 'tester', 'owner', 'ceo', 'cto', 'senior', 'hr'] },
]

/** Build — focused coding & delivery tools. */
const buildItems = [
  { to: '/my-progress',   label: 'My Progress',   Icon: Star,         roles: ['new_dev', 'member'] },
  { to: '/first-issue',   label: 'First Issue',   Icon: BugBeetle,    roles: ['new_dev', 'member', 'senior_dev', 'developer', 'tester', 'owner', 'ceo', 'cto', 'senior'] },
  { to: '/pr-describe',   label: 'PR Describe',   Icon: GitPullRequest, roles: ['new_dev', 'member', 'senior_dev', 'developer', 'tester', 'owner', 'ceo', 'cto', 'senior'] },
  { to: '/autonomous',    label: 'Auto Coding',   Icon: Robot,        roles: ['senior_dev', 'owner', 'ceo', 'cto', 'senior'] },
  { to: '/onboarding-plan', label: 'Onboarding Plan', Icon: Rocket,   roles: ['new_dev', 'member', 'senior_dev', 'developer', 'tester', 'owner', 'ceo', 'cto', 'senior'] },
  { to: '/wiki',          label: 'Wiki',          Icon: FileCode,     roles: ['new_dev', 'member', 'senior_dev', 'developer', 'tester', 'owner', 'ceo', 'cto', 'senior'] },
  { to: '/marketplace',   label: 'Marketplace',   Icon: Storefront,   roles: ['senior_dev', 'senior', 'owner', 'ceo', 'cto'] },
]

/** HR — people & team operations. */
const hrItems = [
  { to: '/hr/people',    label: 'People',       Icon: Users,    roles: ['hr'] },
  { to: '/hr-dashboard', label: 'HR Dashboard', Icon: ChartBar, roles: ['hr'] },
]

/** Manage — reviews, quality and administration. */
const manageItems = [
  { to: '/ramp',             label: 'Ramp',            Icon: TrendUp,     roles: ['senior_dev', 'senior', 'owner', 'ceo', 'cto', 'hr'] },
  { to: '/reviews',          label: 'Reviews',         Icon: Eye,         roles: ['senior_dev', 'senior', 'owner', 'ceo', 'cto'] },
  { to: '/code-health',      label: 'Code Health',     Icon: Heartbeat,   roles: ['senior_dev', 'senior', 'owner', 'ceo', 'cto'] },
  { to: '/drift',            label: 'Drift Detect',    Icon: Warning,     roles: ['senior_dev', 'senior', 'owner', 'ceo', 'cto'] },
  { to: '/developer-portal', label: 'Developer Portal', Icon: Code,       roles: ['senior_dev', 'senior', 'owner', 'ceo', 'cto'] },
  { to: '/api-keys',         label: 'API Keys',        Icon: Key,         roles: ['senior_dev', 'senior', 'owner', 'ceo', 'cto'] },
  { to: '/admin',            label: 'Admin',           Icon: ShieldCheck, roles: ['owner', 'ceo', 'cto'] },
  { to: '/admin/feature-flags', label: 'Feature Flags', Icon: Flag,       roles: ['owner', 'ceo', 'cto'] },
]

/** System links (bottom section). */
const bottomItems = [
  { to: '/settings', label: 'Settings', Icon: Gear },
  { to: '/docs',     label: 'Docs',     Icon: BookOpenText },
  { to: '/support',  label: 'Support',  Icon: Question },
]

interface NavItemData {
  to: string
  label: string
  Icon: any
  roles?: string[]
}

function NavItem({ to, label, Icon, collapsed }: NavItemData & { collapsed: boolean }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      title={collapsed ? label : undefined}
      aria-label={label}
      className={({ isActive }) =>
        cn(
          'relative flex items-center text-[13px] transition-all duration-150',
          collapsed
            ? 'justify-center h-9 w-9 mx-auto rounded-btn'
            : 'gap-2.5 px-2.5 py-1.5 w-full rounded-btn',
          isActive
            ? 'text-text-primary font-medium bg-accent-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
            : 'text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary/40'
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && !collapsed && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-accent-from" />
          )}
          <Icon
            size={17}
            weight={isActive ? 'fill' : 'regular'}
            className={cn('shrink-0', isActive ? 'text-accent-from' : 'text-text-muted')}
          />
          {!collapsed && <span className="truncate">{label}</span>}
        </>
      )}
    </NavLink>
  )
}

function NavGroup({
  title,
  items,
  collapsed,
}: {
  title: string
  items: NavItemData[]
  collapsed: boolean
}) {
  const { role } = useAuth()
  const visible = items.filter((i) => !i.roles || i.roles.includes(role || ''))
  if (visible.length === 0) return null

  return (
    <div>
      {collapsed ? (
        <div className="mx-3.5 my-2 h-px bg-border-subtle" aria-hidden />
      ) : (
        <div className="px-2.5 pb-1 pt-1">
          <span className="overline text-text-muted/70">{title}</span>
        </div>
      )}
      <div className={cn(collapsed ? 'flex flex-col items-center space-y-1' : 'space-y-0.5')}>
        {visible.map((item) => (
          <NavItem key={item.to} {...item} collapsed={collapsed} />
        ))}
      </div>
    </div>
  )
}

export default function Sidebar() {
  const { role } = useAuth()
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(SIDEBAR_KEY) === '1'
  })

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  const showManage =
    role === 'senior' || role === 'senior_dev' || role === 'owner' || role === 'ceo' || role === 'cto'

  return (
    <aside
      aria-label="Primary navigation"
      className={cn(
        'sticky top-0 app-sidebar self-start h-full bg-bg-primary border-r border-border/50 flex flex-col shrink-0 transition-[width] duration-200 ease-out overflow-hidden',
        collapsed ? 'w-[64px]' : 'w-[220px]'
      )}
    >
      {/* Brand */}
      <div className={cn('pt-5 pb-4', collapsed ? 'flex justify-center px-0' : 'px-4')}>
        <NavLink
          to="/"
          className={cn('flex items-center gap-2.5 group', collapsed && 'justify-center')}
          title={collapsed ? 'Onramp' : undefined}
          aria-label="Onramp home"
        >
          <div className="relative w-7 h-7 rounded-tile bg-accent-from flex items-center justify-center shadow-lit transition-transform duration-200 group-hover:scale-105">
            <span className="absolute inset-0 rounded-tile bg-accent-to opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <span className="relative text-[11px] font-bold text-white font-display tracking-tight">OR</span>
          </div>
          {!collapsed && (
            <span className="font-display text-sm font-bold text-text-primary tracking-tight uppercase">
              Onramp
            </span>
          )}
        </NavLink>
      </div>

      {/* Navigation */}
      <div className={cn('flex-1 overflow-y-auto', collapsed ? 'px-1.5 space-y-1' : 'px-2 space-y-5')}>
        <NavGroup title="Portals" items={portalItems} collapsed={collapsed} />
        <NavGroup title="Workspace" items={workspaceItems} collapsed={collapsed} />
        <NavGroup title="Build" items={buildItems} collapsed={collapsed} />
        <NavGroup title="HR" items={hrItems} collapsed={collapsed} />
        {showManage && <NavGroup title="Manage" items={manageItems} collapsed={collapsed} />}
      </div>

      {/* Bottom section */}
      <div className={cn('py-3 border-t border-border/40 mt-2', collapsed ? 'px-1.5' : 'px-2')}>
        <div className={cn(collapsed ? 'flex flex-col items-center space-y-1' : 'space-y-0.5')}>
          {bottomItems.map((item) => (
            <NavItem key={item.to} {...item} collapsed={collapsed} />
          ))}

          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'relative flex items-center rounded-lg text-[13px] transition-all duration-150 text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary/40',
              collapsed ? 'justify-center h-9 w-9 mx-auto' : 'gap-2.5 px-2.5 py-1.5 w-full'
            )}
          >
            {collapsed ? (
              <CaretRight size={17} className="shrink-0 text-text-muted" />
            ) : (
              <>
                <CaretLeft size={17} className="shrink-0 text-text-muted" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  )
}
